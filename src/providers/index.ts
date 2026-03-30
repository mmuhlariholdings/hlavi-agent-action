import * as core from "@actions/core";
import { Task, ProviderConfig } from "../types";
import { ClaudeAgentProvider } from "./claude-agent-provider";
import { OpenAIProvider } from "./openai-provider";
import { GoogleProvider } from "./google-provider";

export interface TaskExecutionParams {
  task: Task;
  workspaceDir: string;
  maxIterations: number;
  dryRun: boolean;
}

export interface AgentResult {
  completed: boolean;
  numTurns?: number;
  costUsd?: number;
}

/** Common interface every provider must implement. */
export interface AgentProvider {
  executeTask(params: TaskExecutionParams): Promise<AgentResult>;
}

/**
 * Return the correct provider for the given config.
 *
 * - anthropic → Claude Agent SDK (native Claude Code tools + custom MCP tools)
 * - openai    → Official OpenAI SDK (chat completions with tool use)
 * - google    → Official Google Generative AI SDK (Gemini function calling)
 */
export function createProvider(config: ProviderConfig): AgentProvider {
  switch (config.provider) {
    case "anthropic":
      core.info(`  provider: Claude Agent SDK (${config.model})`);
      return new ClaudeAgentProvider(config);

    case "openai":
      core.info(`  provider: OpenAI (${config.model})`);
      return new OpenAIProvider(config);

    case "google":
      core.info(`  provider: Google Generative AI (${config.model})`);
      return new GoogleProvider(config);
  }
}
