export interface AcceptanceCriteria {
  id: number;
  description: string;
  completed: boolean;
  created_at: string;
  completed_at?: string | null;
}

export interface TaskComment {
  id: string;
  author: string;
  author_type: "user" | "agent";
  body: string;
  created_at: string;
  model?: string;
}

export type TaskStatus =
  | "new"
  | "open"
  | "in_progress"
  | "review"
  | "done"
  | "blocked";

export interface Task {
  hlavi_spec_version: string;
  kind: "task";
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  acceptance_criteria: AcceptanceCriteria[];
  created_at: string;
  updated_at: string;
  agent_assigned: boolean;
  autonomous: boolean;
  rejection_reason: string | null;
  start_date: string | null;
  end_date: string | null;
  parent: string | null;
  blocks: string[];
  effort: number | null;
  rank: number;
  /** AI model override for this task. Overrides board config model when set. */
  model?: string | null;
  /** Comments from users and agents */
  comments?: TaskComment[];
}

export interface BoardConfig {
  name: string;
  /** Default AI model for all autonomous tasks on this board */
  model?: string | null;
  columns: Array<{
    name: string;
    status: string;
    agent_enabled: boolean;
    agent_mode: string | null;
  }>;
}

export interface Board {
  config: BoardConfig;
  tasks: Record<string, string>;
  next_task_number: number;
}

export type ModelProvider = "anthropic" | "openai" | "google";

export type ToolParamType = "string" | "number" | "boolean";

export interface ToolParam {
  type: ToolParamType;
  description: string;
}

export interface ProviderConfig {
  provider: ModelProvider;
  model: string;
  apiKey: string;
}

/** Detect the provider from a model name prefix. */
export function detectProvider(model: string): ModelProvider {
  if (/^claude/i.test(model)) return "anthropic";
  if (/^gpt|^o\d|^chatgpt/i.test(model)) return "openai";
  if (/^gemini/i.test(model)) return "google";
  throw new Error(
    `Cannot detect provider from model name "${model}". ` +
      `Expected a name starting with claude-, gpt-, o1/o3/o4, or gemini-.`
  );
}
