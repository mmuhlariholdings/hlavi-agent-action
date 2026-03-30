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
exports.TOOL_DEFINITIONS = void 0;
exports.createToolExecutor = createToolExecutor;
/**
 * Shared tool definitions and executor.
 *
 * Tool definitions are expressed in a provider-agnostic format so each
 * provider can convert them to the schema its API expects.
 * The executor is a single shared implementation used by all providers.
 */
const core = __importStar(require("@actions/core"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
exports.TOOL_DEFINITIONS = [
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
        description: "Write content to a file. Creates the file and any missing parent directories.",
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
        description: "Run a bash command in the workspace root. Use for builds, tests, linters. Avoid interactive commands.",
        parameters: {
            command: { type: "string", description: "The bash command to execute" },
        },
        required: ["command"],
    },
    {
        name: "complete_criterion",
        description: "Mark a specific acceptance criterion as completed. Call this after implementing and verifying the criterion.",
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
        description: "Signal that all acceptance criteria are complete. Only call this once every criterion is checked off.",
        parameters: {
            summary: {
                type: "string",
                description: "Concise summary of what was implemented",
            },
        },
        required: ["summary"],
    },
];
/**
 * Creates a stateful tool executor bound to the current task and workspace.
 * All providers call this to get a uniform execution function.
 */
function createToolExecutor(task, workspaceDir, dryRun, onDone) {
    const abs = (p) => path.join(workspaceDir, p);
    return async (call) => {
        const { name, input } = call;
        let output = "";
        let isDone = false;
        try {
            switch (name) {
                case "read_file": {
                    const p = abs(input.path);
                    output = fs.existsSync(p)
                        ? fs.readFileSync(p, "utf-8")
                        : `File not found: ${input.path}`;
                    break;
                }
                case "write_file": {
                    if (!dryRun) {
                        fs.mkdirSync(path.dirname(abs(input.path)), {
                            recursive: true,
                        });
                        fs.writeFileSync(abs(input.path), input.content);
                    }
                    output = dryRun
                        ? `(dry-run) Would write: ${input.path}`
                        : `Written: ${input.path}`;
                    break;
                }
                case "list_directory": {
                    const p = abs(input.path);
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
                    }
                    else {
                        try {
                            output =
                                (0, child_process_1.execSync)(input.command, {
                                    cwd: workspaceDir,
                                    encoding: "utf-8",
                                    timeout: 120000,
                                    stdio: ["pipe", "pipe", "pipe"],
                                }) || "(no output)";
                        }
                        catch (err) {
                            const e = err;
                            output = `Command failed:\n${e.stderr ?? e.message}`;
                        }
                    }
                    break;
                }
                case "complete_criterion": {
                    const ac = task.acceptance_criteria.find((a) => a.id === input.criterion_id);
                    if (!ac) {
                        output = `Criterion ${input.criterion_id} not found.`;
                    }
                    else {
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
        }
        catch (err) {
            output = `Tool ${name} threw: ${err.message}`;
        }
        const preview = output.length > 120 ? output.slice(0, 117) + "..." : output;
        core.info(`    [${name}] -> ${preview}`);
        return { name, output, isDone };
    };
}
