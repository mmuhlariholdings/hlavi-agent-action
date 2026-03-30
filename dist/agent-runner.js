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
exports.AgentRunner = void 0;
const core = __importStar(require("@actions/core"));
class AgentRunner {
    constructor(provider, dryRun, workspaceDir, maxIterations) {
        this.provider = provider;
        this.dryRun = dryRun;
        this.workspaceDir = workspaceDir;
        this.maxIterations = maxIterations;
    }
    async executeTask(task, store) {
        const pending = task.acceptance_criteria.filter((ac) => !ac.completed);
        if (pending.length === 0) {
            core.info(`  [${task.id}] All criteria already complete.`);
            return true;
        }
        const result = await this.provider.executeTask({
            task,
            workspaceDir: this.workspaceDir,
            maxIterations: this.maxIterations,
            dryRun: this.dryRun,
        });
        if (result.numTurns !== undefined) {
            core.info(`  [${task.id}] Turns used: ${result.numTurns}`);
        }
        if (result.costUsd !== undefined) {
            core.info(`  [${task.id}] Cost: $${result.costUsd.toFixed(4)}`);
        }
        // Persist criterion completions to disk regardless of overall success
        if (!this.dryRun) {
            store.save(task);
        }
        return result.completed;
    }
}
exports.AgentRunner = AgentRunner;
