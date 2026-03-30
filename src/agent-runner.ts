import * as core from "@actions/core";
import { Task } from "./types";
import { TaskStore } from "./task-store";
import { AgentProvider } from "./providers/index";

export class AgentRunner {
  constructor(
    private readonly provider: AgentProvider,
    private readonly dryRun: boolean,
    private readonly workspaceDir: string,
    private readonly maxIterations: number
  ) {}

  async executeTask(task: Task, store: TaskStore): Promise<boolean> {
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
