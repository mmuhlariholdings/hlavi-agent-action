import { Task } from "./types";

/**
 * System-level instructions appended to whatever base system prompt the
 * provider uses. Kept short so it doesn't crowd out the provider's own prompt.
 */
export function buildSystemPrompt(dryRun: boolean): string {
  return [
    "You are an autonomous software engineering agent completing a Hlavi task.",
    "Work through each acceptance criterion methodically:",
    "  1. Explore the codebase to understand existing structure and conventions.",
    "  2. Implement the criterion with minimal, focused changes.",
    "  3. Verify your work (run tests / build if applicable).",
    "  4. Call complete_criterion with its ID once it is satisfied.",
    "  5. Call task_done with a summary when ALL criteria are complete.",
    "",
    "Guidelines:",
    "  - Match the project's existing code style and patterns.",
    "  - Do not modify .hlavi/ task files directly.",
    "  - Fix any failing tests before moving to the next criterion.",
    dryRun
      ? "  - DRY RUN MODE: explain planned changes but do not write any files."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The per-task user prompt that describes what the agent must accomplish.
 */
export function buildTaskPrompt(task: Task): string {
  const criteria = task.acceptance_criteria
    .map(
      (ac) =>
        `  [${ac.completed ? "x" : " "}] #${ac.id}: ${ac.description}`
    )
    .join("\n");

  const pending = task.acceptance_criteria.filter((ac) => !ac.completed).length;

  return [
    `## Task ${task.id}: ${task.title}`,
    "",
    task.description ? `${task.description}\n` : "",
    "### Acceptance Criteria",
    criteria,
    "",
    `${pending} criterion${pending === 1 ? "" : "s"} still to complete.`,
    "Start by exploring the project structure, then work through each pending criterion.",
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}
