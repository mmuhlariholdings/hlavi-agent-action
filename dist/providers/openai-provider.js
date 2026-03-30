"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIProvider = void 0;
/**
 * OpenAI provider.
 *
 * Uses the official `openai` npm package.
 * Implements a standard tool-use loop: call → execute tools → call again
 * until the model stops requesting tools or max turns is reached.
 */
const core = __importStar(require("@actions/core"));
const openai_1 = __importDefault(require("openai"));
const tools_1 = require("../tools");
const prompts_1 = require("../prompts");
class OpenAIProvider {
    constructor(config) {
        this.config = config;
        this.client = new openai_1.default({ apiKey: config.apiKey });
    }
    async executeTask(params) {
        const { task, workspaceDir, maxIterations, dryRun } = params;
        let completed = false;
        const execute = (0, tools_1.createToolExecutor)(task, workspaceDir, dryRun, () => {
            completed = true;
        });
        // Convert shared tool definitions to OpenAI function tool format
        const tools = tools_1.TOOL_DEFINITIONS.map((def) => ({
            type: "function",
            function: {
                name: def.name,
                description: def.description,
                parameters: {
                    type: "object",
                    properties: Object.fromEntries(Object.entries(def.parameters).map(([key, param]) => [
                        key,
                        { type: param.type, description: param.description },
                    ])),
                    required: def.required,
                },
            },
        }));
        const messages = [
            { role: "system", content: (0, prompts_1.buildSystemPrompt)(dryRun) },
            { role: "user", content: (0, prompts_1.buildTaskPrompt)(task) },
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
            if (choice.finish_reason === "stop" ||
                !choice.message.tool_calls?.length) {
                break;
            }
            // Execute all tool calls and collect results
            // Filter to standard function calls only (v6 adds a CustomToolCall variant)
            const functionCalls = choice.message.tool_calls.filter((tc) => tc.type === "function" && "function" in tc);
            for (const tc of functionCalls) {
                let inputObj;
                try {
                    inputObj = JSON.parse(tc.function.arguments);
                }
                catch {
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
exports.OpenAIProvider = OpenAIProvider;
