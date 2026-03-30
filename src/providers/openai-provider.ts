/**
 * OpenAI provider.
 *
 * Uses the official `openai` npm package.
 * Implements a standard tool-use loop: call → execute tools → call again
 * until the model stops requesting tools or max turns is reached.
 */
import * as core from "@actions/core";
import OpenAI from "openai";
import { ProviderConfig } from "../types";
import { AgentProvider, AgentResult, TaskExecutionParams } from "./index";
import { TOOL_DEFINITIONS, createToolExecutor } from "../tools";
import { buildSystemPrompt, buildTaskPrompt } from "../prompts";

export class OpenAIProvider implements AgentProvider {
  private readonly client: OpenAI;

  constructor(private readonly config: ProviderConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
  }

  async executeTask(params: TaskExecutionParams): Promise<AgentResult> {
    const { task, workspaceDir, maxIterations, dryRun } = params;

    let completed = false;
    const execute = createToolExecutor(task, workspaceDir, dryRun, () => {
      completed = true;
    });

    // Convert shared tool definitions to OpenAI function tool format
    const tools: OpenAI.Chat.ChatCompletionTool[] = TOOL_DEFINITIONS.map(
      (def) => ({
        type: "function" as const,
        function: {
          name: def.name,
          description: def.description,
          parameters: {
            type: "object" as const,
            properties: Object.fromEntries(
              Object.entries(def.parameters).map(([key, param]) => [
                key,
                { type: param.type, description: param.description },
              ])
            ),
            required: def.required,
          },
        },
      })
    );

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: buildSystemPrompt(dryRun) },
      { role: "user", content: buildTaskPrompt(task) },
    ];

    let turns = 0;

    while (turns < maxIterations && !completed) {
      turns++;
      core.info(`  [${task.id}] Turn ${turns}/${maxIterations}`);

      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        tools,
        tool_choice: "auto",
      });

      const choice = response.choices[0];

      // Add assistant message to history
      messages.push({
        role: "assistant",
        content: choice.message.content,
        tool_calls: choice.message.tool_calls,
      });

      if (
        choice.finish_reason === "stop" ||
        !choice.message.tool_calls?.length
      ) {
        break;
      }

      // Execute all tool calls and collect results
      // Filter to standard function calls only (v6 adds a CustomToolCall variant)
      const functionCalls = choice.message.tool_calls.filter(
        (tc): tc is OpenAI.Chat.ChatCompletionMessageFunctionToolCall =>
          tc.type === "function" && "function" in tc
      );

      for (const tc of functionCalls) {
        let inputObj: Record<string, unknown>;
        try {
          inputObj = JSON.parse(tc.function.arguments);
        } catch {
          inputObj = {};
        }

        const result = await execute({
          name: tc.function.name,
          input: inputObj,
        });

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result.output,
        });
      }
    }

    return { completed, numTurns: turns };
  }
}
