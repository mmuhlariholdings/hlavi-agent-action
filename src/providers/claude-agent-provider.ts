/**
 * Claude provider using the Anthropic Messages API directly.
 *
 * Runs a tool-use loop with built-in shell/file tools plus the custom
 * hlavi tools (complete_criterion, task_done). No claude CLI required.
 */
import Anthropic from "@anthropic-ai/sdk";
import * as core from "@actions/core";
import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";
import { Task, ProviderConfig } from "../types";
import { AgentProvider, AgentResult, TaskExecutionParams } from "./index";
import { buildSystemPrompt, buildTaskPrompt } from "../prompts";

const TOOLS: Anthropic.Tool[] = [
  {
    name: "bash",
    description:
      "Execute a bash command in the workspace root. Use for builds, tests, git, and any shell operations.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "Bash command to run" },
      },
      required: ["command"],
    },
  },
  {
    name: "read_file",
    description: "Read the full contents of a file.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Path relative to workspace root" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write (or overwrite) a file with the given content.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Path relative to workspace root" },
        content: { type: "string", description: "Full content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_directory",
    description: "List the immediate contents of a directory.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Directory path relative to workspace root (default: \".\")",
        },
      },
    },
  },
  {
    name: "complete_criterion",
    description:
      "Mark a specific acceptance criterion as completed. Call this after you have implemented and verified the criterion.",
    input_schema: {
      type: "object" as const,
      properties: {
        criterion_id: {
          type: "number",
          description: "Numeric ID of the criterion to mark done",
        },
      },
      required: ["criterion_id"],
    },
  },
  {
    name: "task_done",
    description:
      "Signal that all acceptance criteria have been met and the task is complete. Only call this once every criterion is checked off.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: {
          type: "string",
          description: "Concise summary of what was implemented",
        },
      },
      required: ["summary"],
    },
  },
];

export class ClaudeAgentProvider implements AgentProvider {
  private readonly client: Anthropic;

  constructor(private readonly config: ProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async executeTask(params: TaskExecutionParams): Promise<AgentResult> {
    const { task, workspaceDir, maxIterations, dryRun } = params;

    let completed = false;
    let numTurns = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: buildTaskPrompt(task) },
    ];

    for (let turn = 0; turn < maxIterations; turn++) {
      numTurns = turn + 1;

      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: 8192,
        system: buildSystemPrompt(dryRun),
        tools: TOOLS,
        messages,
      });

      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "end_turn" || response.stop_reason !== "tool_use") {
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        const input = block.input as Record<string, unknown>;
        let resultText: string;
        let isError = false;

        try {
          resultText = await this.executeTool(block.name, input, task, workspaceDir, dryRun);
        } catch (err) {
          resultText = `Error: ${err instanceof Error ? err.message : String(err)}`;
          isError = true;
          core.warning(`  Tool ${block.name} failed: ${resultText}`);
        }

        if (block.name === "task_done") {
          completed = true;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: resultText,
          ...(isError && { is_error: true }),
        });
      }

      messages.push({ role: "user", content: toolResults });

      if (completed) break;
    }

    // Rough cost estimate based on Claude Opus 4 pricing
    const costUsd = (inputTokens * 15 + outputTokens * 75) / 1_000_000;

    return { completed, numTurns, costUsd };
  }

  private async executeTool(
    name: string,
    input: Record<string, unknown>,
    task: Task,
    workspaceDir: string,
    dryRun: boolean
  ): Promise<string> {
    switch (name) {
      case "bash": {
        const command = input.command as string;
        if (dryRun) return `[dry run] would run: ${command}`;
        core.info(`    $ ${command}`);
        const { stdout, stderr } = await execShell(command, workspaceDir);
        return [stdout, stderr].filter(Boolean).join("\n") || "(no output)";
      }

      case "read_file": {
        const filePath = path.resolve(workspaceDir, input.path as string);
        return fs.readFileSync(filePath, "utf-8");
      }

      case "write_file": {
        if (dryRun) return `[dry run] would write to ${input.path}`;
        const filePath = path.resolve(workspaceDir, input.path as string);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, input.content as string);
        return `Wrote ${(input.content as string).length} chars to ${input.path}`;
      }

      case "list_directory": {
        const dirPath = path.resolve(workspaceDir, (input.path as string) || ".");
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        return entries.map((e) => (e.isDirectory() ? e.name + "/" : e.name)).join("\n");
      }

      case "complete_criterion": {
        const id = input.criterion_id as number;
        const ac = task.acceptance_criteria.find((a) => a.id === id);
        if (!ac) return `Criterion ${id} not found.`;
        ac.completed = true;
        ac.completed_at = new Date().toISOString();
        const msg = `Criterion ${id} ✓ "${ac.description}"`;
        core.info(`    ${msg}`);
        return msg;
      }

      case "task_done": {
        core.info(`    task_done: ${input.summary}`);
        return "Task completion recorded.";
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}

function execShell(
  command: string,
  cwd: string
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    child_process.exec(
      command,
      { cwd, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`exit ${err.code}: ${stderr || err.message}`));
        } else {
          resolve({ stdout, stderr });
        }
      }
    );
  });
}
