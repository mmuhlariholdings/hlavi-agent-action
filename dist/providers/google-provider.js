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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleProvider = void 0;
/**
 * Google Generative AI provider.
 *
 * Uses the official `@google/generative-ai` npm package.
 * Implements a function-calling loop using the Gemini chat API.
 */
const core = __importStar(require("@actions/core"));
const generative_ai_1 = require("@google/generative-ai");
const tools_1 = require("../tools");
const prompts_1 = require("../prompts");
// Map our generic param types to Google SchemaType
function toGoogleType(type) {
    switch (type) {
        case "number":
            return generative_ai_1.SchemaType.NUMBER;
        case "boolean":
            return generative_ai_1.SchemaType.BOOLEAN;
        default:
            return generative_ai_1.SchemaType.STRING;
    }
}
class GoogleProvider {
    constructor(config) {
        this.config = config;
    }
    async executeTask(params) {
        const { task, workspaceDir, maxIterations, dryRun } = params;
        let completed = false;
        const execute = (0, tools_1.createToolExecutor)(task, workspaceDir, dryRun, () => {
            completed = true;
        });
        const genAI = new generative_ai_1.GoogleGenerativeAI(this.config.apiKey);
        const model = genAI.getGenerativeModel({
            model: this.config.model,
            systemInstruction: (0, prompts_1.buildSystemPrompt)(dryRun),
            tools: [
                {
                    functionDeclarations: tools_1.TOOL_DEFINITIONS.map((def) => ({
                        name: def.name,
                        description: def.description,
                        parameters: {
                            type: generative_ai_1.SchemaType.OBJECT,
                            properties: Object.fromEntries(Object.entries(def.parameters).map(([key, param]) => [
                                key,
                                { type: toGoogleType(param.type), description: param.description },
                            ])),
                            required: def.required,
                        },
                    })),
                },
            ],
            toolConfig: {
                functionCallingConfig: { mode: generative_ai_1.FunctionCallingMode.AUTO },
            },
        });
        const chat = model.startChat({ history: [] });
        let turns = 0;
        let currentMessage = (0, prompts_1.buildTaskPrompt)(task);
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
            const responseParts = [];
            for (const call of calls) {
                const result = await execute({
                    name: call.name,
                    input: call.args,
                });
                responseParts.push({
                    functionResponse: {
                        name: call.name,
                        response: { output: result.output },
                    },
                });
            }
            // Feed all function results back as the next message
            currentMessage = responseParts;
        }
        return { completed, numTurns: turns };
    }
}
exports.GoogleProvider = GoogleProvider;
