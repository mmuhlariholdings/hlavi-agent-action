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
exports.ClaudeAgentProvider = void 0;
/**
 * Claude Agent SDK provider.
 *
 * Uses @anthropic-ai/claude-agent-sdk (query) so Claude Code's native
 * Bash / Read / Write / Glob / Grep tools are available out of the box.
 * Custom hlavi tools (complete_criterion, task_done) are injected via an
 * in-process MCP server so Claude can check off criteria while it works.
 */
const core = __importStar(require("@actions/core"));
const claude_agent_sdk_1 = require("@anthropic-ai/claude-agent-sdk");
const zod_1 = require("zod");
const prompts_1 = require("../prompts");
class ClaudeAgentProvider {
    constructor(config) {
        this.config = config;
    }
    async executeTask(params) {
        const { task, workspaceDir, maxIterations, dryRun } = params;
        // Completion flag — set by the task_done tool
        let completed = false;
        // ── Custom MCP tools ──────────────────────────────────────────────────
        const completeCriterionTool = (0, claude_agent_sdk_1.tool)("complete_criterion", "Mark a specific acceptance criterion as completed. Call this after you have implemented and verified the criterion.", { criterion_id: zod_1.z.number().describe("Numeric ID of the criterion to mark done") }, async ({ criterion_id }) => {
            const ac = task.acceptance_criteria.find((a) => a.id === criterion_id);
            if (!ac) {
                return {
                    content: [{ type: "text", text: `Criterion ${criterion_id} not found.` }],
                    isError: true,
                };
            }
            ac.completed = true;
            ac.completed_at = new Date().toISOString();
            const msg = `Criterion ${criterion_id} ✓ "${ac.description}"`;
            core.info(`    ${msg}`);
            return { content: [{ type: "text", text: msg }] };
        });
        const taskDoneTool = (0, claude_agent_sdk_1.tool)("task_done", "Signal that all acceptance criteria have been met and the task is complete. Only call this once every criterion is checked off.", { summary: zod_1.z.string().describe("Concise summary of what was implemented") }, async ({ summary }) => {
            completed = true;
            core.info(`    task_done: ${summary}`);
            return {
                content: [{ type: "text", text: "Task completion recorded." }],
            };
        });
        const mcpServer = (0, claude_agent_sdk_1.createSdkMcpServer)({
            name: "hlavi",
            version: "1.0.0",
            tools: [completeCriterionTool, taskDoneTool],
        });
        // ── Run the agent ─────────────────────────────────────────────────────
        const agentQuery = (0, claude_agent_sdk_1.query)({
            prompt: (0, prompts_1.buildTaskPrompt)(task),
            options: {
                cwd: workspaceDir,
                model: this.config.model,
                maxTurns: maxIterations,
                systemPrompt: {
                    type: "preset",
                    preset: "claude_code",
                    append: (0, prompts_1.buildSystemPrompt)(dryRun),
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
                    core.warning(`  [${task.id}] Agent stopped with subtype "${message.subtype}": ${"errors" in message ? message.errors.join(", ") : ""}`);
                }
            }
        }
        return { completed, numTurns, costUsd };
    }
}
exports.ClaudeAgentProvider = ClaudeAgentProvider;
