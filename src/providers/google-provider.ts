/**
 * Google Generative AI provider.
 *
 * Uses the official `@google/generative-ai` npm package.
 * Implements a function-calling loop using the Gemini chat API.
 */
import * as core from "@actions/core";
import {
  GoogleGenerativeAI,
  SchemaType,
  FunctionCallingMode,
  FunctionDeclarationSchemaProperty,
  Content,
} from "@google/generative-ai";
import { ProviderConfig, ToolParam } from "../types";
import { AgentProvider, AgentResult, TaskExecutionParams } from "./index";
import { TOOL_DEFINITIONS, createToolExecutor } from "../tools";
import { buildSystemPrompt, buildTaskPrompt } from "../prompts";

// Map our generic param types to Google SchemaType
function toGoogleType(type: ToolParam["type"]): SchemaType {
  switch (type) {
    case "number":
      return SchemaType.NUMBER;
    case "boolean":
      return SchemaType.BOOLEAN;
    default:
      return SchemaType.STRING;
  }
}

export class GoogleProvider implements AgentProvider {
  constructor(private readonly config: ProviderConfig) {}

  async executeTask(params: TaskExecutionParams): Promise<AgentResult> {
    const { task, workspaceDir, maxIterations, dryRun } = params;

    let completed = false;
    const execute = createToolExecutor(task, workspaceDir, dryRun, () => {
      completed = true;
    });

    const genAI = new GoogleGenerativeAI(this.config.apiKey);

    const model = genAI.getGenerativeModel({
      model: this.config.model,
      systemInstruction: buildSystemPrompt(dryRun),
      tools: [
        {
          functionDeclarations: TOOL_DEFINITIONS.map((def) => ({
            name: def.name,
            description: def.description,
            parameters: {
              type: SchemaType.OBJECT,
              properties: Object.fromEntries(
                Object.entries(def.parameters).map(([key, param]) => [
                  key,
                  { type: toGoogleType(param.type), description: param.description } as FunctionDeclarationSchemaProperty,
                ])
              ) as Record<string, FunctionDeclarationSchemaProperty>,
              required: def.required,
            },
          })),
        },
      ],
      toolConfig: {
        functionCallingConfig: { mode: FunctionCallingMode.AUTO },
      },
    });

    const chat = model.startChat({ history: [] });

    let turns = 0;
    let currentMessage = buildTaskPrompt(task);

    while (turns < maxIterations && !completed) {
      turns++;
      core.info(`  [${task.id}] Turn ${turns}/${maxIterations}`);

      const response = await chat.sendMessage(currentMessage);
      const calls = response.response.functionCalls();

      if (!calls?.length) {
        // Model stopped calling functions — done
        break;
      }

      // Execute all function calls and build function response parts
      const responseParts: Content["parts"] = [];

      for (const call of calls) {
        const result = await execute({
          name: call.name,
          input: call.args as Record<string, unknown>,
        });

        responseParts.push({
          functionResponse: {
            name: call.name,
            response: { output: result.output },
          },
        });
      }

      // Feed all function results back as the next message
      currentMessage = responseParts as unknown as string;
    }

    return { completed, numTurns: turns };
  }
}
