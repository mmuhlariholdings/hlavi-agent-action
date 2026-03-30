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
exports.createProvider = createProvider;
const core = __importStar(require("@actions/core"));
const claude_agent_provider_1 = require("./claude-agent-provider");
const openai_provider_1 = require("./openai-provider");
const google_provider_1 = require("./google-provider");
/**
 * Return the correct provider for the given config.
 *
 * - anthropic → Claude Agent SDK (native Claude Code tools + custom MCP tools)
 * - openai    → Official OpenAI SDK (chat completions with tool use)
 * - google    → Official Google Generative AI SDK (Gemini function calling)
 */
function createProvider(config) {
    switch (config.provider) {
        case "anthropic":
            core.info(`  provider: Claude Agent SDK (${config.model})`);
            return new claude_agent_provider_1.ClaudeAgentProvider(config);
        case "openai":
            core.info(`  provider: OpenAI (${config.model})`);
            return new openai_provider_1.OpenAIProvider(config);
        case "google":
            core.info(`  provider: Google Generative AI (${config.model})`);
            return new google_provider_1.GoogleProvider(config);
    }
}
