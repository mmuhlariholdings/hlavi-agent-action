/**
 * Shared tool definitions and executor.
 *
 * Tool definitions are expressed in a provider-agnostic format so each
 * provider can convert them to the schema its API expects.
 * The executor is a single shared implementation used by all providers.
 */
import * as core from "@actions/core";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { Task, ToolParam } from "./types";

// ── Provider-agnostic tool schema ─────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParam>;
  required: string[];
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read the contents of a file in the project workspace.",
    parameters: {
      path: { type: "string", description: "File path relative to workspace root" },
    },
    required: ["path"],
  },
  {
    name: "write_file",
    description:
      "Write content to a file. Creates the file and any missing parent directories.",
    parameters: {
      path: { type: "string", description: "File path relative to workspace root" },
      content: { type: "string", description: "Full content to write to the file" },
    },
    required: ["path", "content"],
  },
  {
    name: "list_directory",
    description: "List the files and sub-directories inside a directory.",
    parameters: {
      path: { type: "string", description: "Directory path relative to workspace root" },
    },
    required: ["path"],
  },
  {
    name: "bash",
    description:
      "Run a bash command in the workspace root. Use for builds, tests, linters. Avoid interactive commands.",
    parameters: {
      command: { type: "string", description: "The bash command to execute" },
    },
    required: ["command"],
  },
  {
    name: "complete_criterion",
    description:
      "Mark a specific acceptance criterion as completed. Call this after implementing and verifying the criterion.",
    parameters: {
      criterion_id: {
        type: "number",
        description: "Numeric ID of the acceptance criterion to mark done",
      },
    },
    required: ["criterion_id"],
  },
  {
    name: "task_done",
    description:
      "Signal that all acceptance criteria are complete. Only call this once every criterion is checked off.",
    parameters: {
      summary: {
        type: "string",
        description: "Concise summary of what was implemented",
      },
    },
    required: ["summary"],
  },
];

// ── Tool executor ─────────────────────────────────────────────────────────

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  output: string;
  /** True when the agent called task_done — signals the loop to stop. */
  isDone: boolean;
}

/**
 * Creates a stateful tool executor bound to the current task and workspace.
 * All providers call this to get a uniform execution function.
 */
export function createToolExecutor(
  task: Task,
  workspaceDir: string,
  dryRun: boolean,
  onDone: () => void
): (call: ToolCall) => Promise<ToolResult> {
  const abs = (p: string) => path.join(workspaceDir, p);

  return async (call: ToolCall): Promise<ToolResult> => {
    const { name, input } = call;
    let output = "";
    let isDone = false;

    try {
      switch (name) {
        case "read_file": {
          const p = abs(input.path as string);
          output = fs.existsSync(p)
            ? fs.readFileSync(p, "utf-8")
            : `File not found: ${input.path}`;
          break;
        }

        case "write_file": {
          if (!dryRun) {
            fs.mkdirSync(path.dirname(abs(input.path as string)), {
              recursive: true,
            });
            fs.writeFileSync(abs(input.path as string), input.content as string);
          }
          output = dryRun
            ? `(dry-run) Would write: ${input.path}`
            : `Written: ${input.path}`;
          break;
        }

        case "list_directory": {
          const p = abs(input.path as string);
          output = fs.existsSync(p)
            ? fs
                .readdirSync(p, { withFileTypes: true })
                .map((e) => `${e.isDirectory() ? "d" : "f"} ${e.name}`)
                .join("\n")
            : `Directory not found: ${input.path}`;
          break;
        }

        case "bash": {
          if (dryRun) {
            output = `(dry-run) Would run: ${input.command}`;
          } else {
            try {
              output =
                execSync(input.command as string, {
                  cwd: workspaceDir,
                  encoding: "utf-8",
                  timeout: 120_000,
                  stdio: ["pipe", "pipe", "pipe"],
                }) || "(no output)";
            } catch (err: unknown) {
              const e = err as { stderr?: string; message: string };
              output = `Command failed:\n${e.stderr ?? e.message}`;
            }
          }
          break;
        }

        case "complete_criterion": {
          const ac = task.acceptance_criteria.find(
            (a) => a.id === (input.criterion_id as number)
          );
          if (!ac) {
            output = `Criterion ${input.criterion_id} not found.`;
          } else {
            ac.completed = true;
            ac.completed_at = new Date().toISOString();
            output = `Criterion ${input.criterion_id} checked: "${ac.description}"`;
          }
          break;
        }

        case "task_done": {
          onDone();
          isDone = true;
          output = `Task completion recorded: ${input.summary}`;
          break;
        }

        default:
          output = `Unknown tool: ${name}`;
      }
    } catch (err: unknown) {
      output = `Tool ${name} threw: ${(err as Error).message}`;
    }

    const preview = output.length > 120 ? output.slice(0, 117) + "..." : output;
    core.info(`    [${name}] -> ${preview}`);

    return { name, output, isDone };
  };
}
