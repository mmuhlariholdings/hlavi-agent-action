import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as path from "path";
import { randomUUID } from "crypto";
import { TaskStore } from "./task-store";
import { AgentRunner } from "./agent-runner";
import { createProvider } from "./providers/index";
import { detectProvider } from "./types";

const API_KEY_INPUT: Record<string, string> = {
  anthropic: "anthropic_api_key",
  openai: "openai_api_key",
  google: "google_api_key",
};

const API_KEY_SECRET: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
};

async function run(): Promise<void> {
  const workflowModel = core.getInput("model") || "claude-opus-4-6";
  const hlaviDir = core.getInput("hlavi_dir") || ".hlavi";
  const maxIterations = parseInt(core.getInput("max_iterations") || "50", 10);
  const dryRun = core.getInput("dry_run") === "true";
  const gitUserName = core.getInput("git_user_name") || "Hlavi Agent";
  const gitUserEmail = core.getInput("git_user_email") || "agent@hlavi.app";

  const workspaceDir = process.env.GITHUB_WORKSPACE || process.cwd();
  const resolvedHlaviDir = path.join(workspaceDir, hlaviDir);

  const store = new TaskStore(resolvedHlaviDir);

  // Board-level model fallback (sits between workflow input and task-level override)
  const boardModel = store.getBoardModel();

  const autonomousTasks = store.getAutonomousOpenTasks();

  if (autonomousTasks.length === 0) {
    core.info("No autonomous tasks in open status. Nothing to do.");
    core.setOutput("tasks_processed", "0");
    core.setOutput("tasks_completed", "0");
    return;
  }

  core.info(`Found ${autonomousTasks.length} autonomous task(s) to process.`);

  if (!dryRun) {
    await exec.exec("git", ["config", "user.name", gitUserName], { cwd: workspaceDir });
    await exec.exec("git", ["config", "user.email", gitUserEmail], { cwd: workspaceDir });
  }

  let processed = 0;
  let completed = 0;

  for (const task of autonomousTasks) {
    core.info(`\nProcessing: [${task.id}] ${task.title}`);
    processed++;

    // Model resolution priority: task-level > board-level > workflow input > default
    const resolvedModel = task.model || boardModel || workflowModel;

    // Validate the model name maps to a known provider
    let providerName: ReturnType<typeof detectProvider>;
    try {
      providerName = detectProvider(resolvedModel);
    } catch {
      const msg =
        `Task ${task.id} specifies model "${resolvedModel}" which cannot be mapped to a provider. ` +
        `Expected a name starting with claude-, gpt-, o1/o3/o4, or gemini-. Skipping task.`;
      core.warning(msg);
      task.comments = [
        ...(task.comments ?? []),
        {
          id: randomUUID(),
          author: gitUserName,
          author_type: "agent" as const,
          body: `⚠️ **Agent skipped this task**: ${msg}`,
          created_at: new Date().toISOString(),
          model: resolvedModel,
        },
      ];
      if (!dryRun) store.save(task);
      continue;
    }

    // Validate the API key for the resolved provider is available
    const apiKey = core.getInput(API_KEY_INPUT[providerName]);
    if (!apiKey) {
      const secretName = API_KEY_SECRET[providerName];
      const skipMsg =
        `Task ${task.id} requires provider "${providerName}" (model: ${resolvedModel}) ` +
        `but no API key was provided.`;
      core.warning(skipMsg);
      task.comments = [
        ...(task.comments ?? []),
        {
          id: randomUUID(),
          author: gitUserName,
          author_type: "agent" as const,
          body:
            `⚠️ **Agent skipped this task**: Missing API key for provider \`${providerName}\`.\n\n` +
            `To fix: add \`${secretName}\` as a repository secret and pass it via ` +
            `\`${API_KEY_INPUT[providerName]}\` in your workflow file.`,
          created_at: new Date().toISOString(),
          model: resolvedModel,
        },
      ];
      if (!dryRun) store.save(task);
      continue;
    }

    core.info(`  Hlavi Agent starting`);
    core.info(`  workspace: ${workspaceDir}`);
    core.info(`  model:     ${providerName}/${resolvedModel}`);
    core.info(`  dry run:   ${dryRun}`);

    const provider = createProvider({ provider: providerName, model: resolvedModel, apiKey });

    task.status = "in_progress";
    task.agent_assigned = true;

    if (!dryRun) {
      store.save(task);
      await commitAndPush(`hlavi(agent): start ${task.id} - ${task.title}`, workspaceDir);
    }

    const runner = new AgentRunner(provider, dryRun, workspaceDir, maxIterations);
    const success = await runner.executeTask(task, store);

    if (success) {
      task.status = "review";
      task.agent_assigned = false;
      task.comments = [
        ...(task.comments ?? []),
        {
          id: randomUUID(),
          author: gitUserName,
          author_type: "agent" as const,
          body:
            `✅ **Task completed** by \`${resolvedModel}\`.\n\n` +
            `All acceptance criteria have been marked complete. Please review the changes.`,
          created_at: new Date().toISOString(),
          model: resolvedModel,
        },
      ];

      if (!dryRun) {
        store.save(task);
        await commitAndPush(`hlavi(agent): complete ${task.id} - ${task.title}`, workspaceDir);
      }

      core.info(`  [${task.id}] Done — moved to review`);
      completed++;
    } else {
      task.comments = [
        ...(task.comments ?? []),
        {
          id: randomUUID(),
          author: gitUserName,
          author_type: "agent" as const,
          body:
            `⏸️ **Agent run ended** without completing all criteria ` +
            `(model: \`${resolvedModel}\`, max iterations: ${maxIterations}).\n\n` +
            `The task has been left in \`in_progress\`. You can re-run the workflow or ` +
            `add context via a comment to guide the next run.`,
          created_at: new Date().toISOString(),
          model: resolvedModel,
        },
      ];
      if (!dryRun) store.save(task);
      core.warning(`  [${task.id}] Not fully completed — left in in_progress for manual follow-up`);
    }
  }

  core.setOutput("tasks_processed", String(processed));
  core.setOutput("tasks_completed", String(completed));
  core.info(`\nAgent finished. Processed: ${processed}, Completed: ${completed}`);
}

async function commitAndPush(message: string, cwd: string): Promise<void> {
  await exec.exec("git", ["add", "-A"], { cwd });

  const exitCode = await exec.exec("git", ["diff", "--cached", "--quiet"], {
    cwd,
    ignoreReturnCode: true,
  });

  if (exitCode === 0) {
    core.info("  No changes to commit.");
    return;
  }

  await exec.exec("git", ["commit", "-m", message], { cwd });
  await exec.exec("git", ["push"], { cwd });
}

run().catch((err: Error) => {
  core.setFailed(err.message);
});
