/**
 * Claude Agent SDK provider.
 *
 * Uses @anthropic-ai/claude-agent-sdk (query) so Claude Code's native
 * Bash / Read / Write / Glob / Grep tools are available out of the box.
 * Custom hlavi tools (complete_criterion, task_done) are injected via an
 * in-process MCP server so Claude can check off criteria while it works.
 */
import * as core from "@actions/core";
import {
  query,
  tool,
  createSdkMcpServer,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { Task, ProviderConfig } from "../types";
import { AgentProvider, AgentResult, TaskExecutionParams } from "./index";
import { buildSystemPrompt, buildTaskPrompt } from "../prompts";

export class ClaudeAgentProvider implements AgentProvider {
  constructor(private readonly config: ProviderConfig) {}

  async executeTask(params: TaskExecutionParams): Promise<AgentResult> {
    const { task, workspaceDir, maxIterations, dryRun } = params;

    // Completion flag — set by the task_done tool
    let completed = false;

    // ── Custom MCP tools ──────────────────────────────────────────────────
    const completeCriterionTool = tool(
      "complete_criterion",
      "Mark a specific acceptance criterion as completed. Call this after you have implemented and verified the criterion.",
      { criterion_id: z.number().describe("Numeric ID of the criterion to mark done") },
      async ({ criterion_id }: { criterion_id: number }) => {
        const ac = task.acceptance_criteria.find((a) => a.id === criterion_id);
        if (!ac) {
          return {
            content: [{ type: "text" as const, text: `Criterion ${criterion_id} not found.` }],
            isError: true,
          };
        }
        ac.completed = true;
        ac.completed_at = new Date().toISOString();
        const msg = `Criterion ${criterion_id} ✓ "${ac.description}"`;
        core.info(`    ${msg}`);
        return { content: [{ type: "text" as const, text: msg }] };
      }
    );

    const taskDoneTool = tool(
      "task_done",
      "Signal that all acceptance criteria have been met and the task is complete. Only call this once every criterion is checked off.",
      { summary: z.string().describe("Concise summary of what was implemented") },
      async ({ summary }: { summary: string }) => {
        completed = true;
        core.info(`    task_done: ${summary}`);
        return {
          content: [{ type: "text" as const, text: "Task completion recorded." }],
        };
      }
    );

    const mcpServer = createSdkMcpServer({
      name: "hlavi",
      version: "1.0.0",
      tools: [completeCriterionTool, taskDoneTool],
    });

    // ── Run the agent ─────────────────────────────────────────────────────
    const agentQuery = query({
      prompt: buildTaskPrompt(task),
      options: {
        cwd: workspaceDir,
        model: this.config.model,
        maxTurns: maxIterations,
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append: buildSystemPrompt(dryRun),
        },
        // Allow all built-in Claude Code tools; hlavi tools come via MCP
        permissionMode: "bypassPermissions",
        // createSdkMcpServer already returns McpSdkServerConfigWithInstance
        mcpServers: { hlavi: mcpServer },
      },
    });

    let numTurns = 0;
    let costUsd = 0;

    for await (const message of agentQuery) {
      if (message.type === "result") {
        numTurns = message.num_turns;
        costUsd = message.total_cost_usd;

        if (message.subtype !== "success") {
          core.warning(
            `  [${task.id}] Agent stopped with subtype "${message.subtype}": ${
              "errors" in message ? message.errors.join(", ") : ""
            }`
          );
        }
      }
    }

    return { completed, numTurns, costUsd };
  }
}
