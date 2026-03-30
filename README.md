# hlavi-agent-action

A GitHub Action that autonomously completes [Hlavi](https://hlavi.app) tasks using AI. Any task with `autonomous: true` and `status: "open"` is picked up, worked on by an AI agent, and moved to `review` when done.

Supports **Anthropic Claude**, **OpenAI GPT / o-series**, and **Google Gemini** — you bring your own API key.

---

## How it works

1. The action reads all tasks from `.hlavi/tasks/*.json` in your repository
2. It filters tasks where `autonomous: true` and `status: "open"`
3. For each task, an AI agent is given the task description and acceptance criteria
4. The agent uses file/shell tools to implement the task directly in your repo
5. Once all criteria are marked complete, the task is moved to `review` and changes are committed back

---

## Quick start

### 1. Add a workflow file

Create `.github/workflows/hlavi-agent.yml` in your repository:

```yaml
name: Hlavi Agent

on:
  schedule:
    - cron: '*/30 * * * *'   # run every 30 minutes
  workflow_dispatch:           # allow manual trigger

permissions:
  contents: write              # needed to commit task updates and code changes

jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: mmuhlariholdings/hlavi-agent-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### 2. Add your API key as a repository secret

Go to **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |

### 3. Mark a task as autonomous

In any Hlavi task JSON (or via the Hlavi web UI), set:

```json
{
  "autonomous": true,
  "status": "open"
}
```

The agent will pick it up on the next workflow run.

---

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `model` | No | `claude-opus-4-6` | Model name. Provider is auto-detected from prefix. |
| `anthropic_api_key` | Conditional | — | Required for Claude models |
| `openai_api_key` | Conditional | — | Required for GPT / o-series models |
| `google_api_key` | Conditional | — | Required for Gemini models |
| `hlavi_dir` | No | `.hlavi` | Path to `.hlavi` directory relative to workspace root |
| `max_iterations` | No | `50` | Maximum agentic turns per task before giving up |
| `dry_run` | No | `false` | Log planned actions without writing files or committing |
| `git_user_name` | No | `Hlavi Agent` | Git author name for agent commits |
| `git_user_email` | No | `agent@hlavi.app` | Git author email for agent commits |

## Outputs

| Output | Description |
|---|---|
| `tasks_processed` | Number of autonomous tasks found and attempted |
| `tasks_completed` | Number of tasks successfully moved to review |

---

## Providers

The provider is **auto-detected from the model name** — you only need to specify the model and its corresponding API key.

### Anthropic (Claude)

Uses the [Claude Agent SDK](https://github.com/anthropic-ai/claude-agent-sdk) which gives Claude native access to file and shell tools, making it the most capable provider for code tasks.

**Supported models:** `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`

```yaml
- uses: mmuhlariholdings/hlavi-agent-action@v1
  with:
    model: claude-opus-4-6
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

**Secret to add:** `ANTHROPIC_API_KEY`
Get your key at: https://console.anthropic.com/settings/keys

---

### OpenAI (GPT / o-series)

Uses the official [OpenAI Node.js SDK](https://github.com/openai/openai-node) with a standard tool-use loop.

**Supported models:** `gpt-4o`, `gpt-4o-mini`, `o3`, `o4-mini`

```yaml
- uses: mmuhlariholdings/hlavi-agent-action@v1
  with:
    model: gpt-4o
    openai_api_key: ${{ secrets.OPENAI_API_KEY }}
```

**Secret to add:** `OPENAI_API_KEY`
Get your key at: https://platform.openai.com/api-keys

---

### Google (Gemini)

Uses the official [Google Generative AI SDK](https://github.com/google-gemini/generative-ai-js) with Gemini's function-calling API.

**Supported models:** `gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-1.5-pro`, `gemini-1.5-flash`

```yaml
- uses: mmuhlariholdings/hlavi-agent-action@v1
  with:
    model: gemini-2.0-flash
    google_api_key: ${{ secrets.GOOGLE_API_KEY }}
```

**Secret to add:** `GOOGLE_API_KEY`
Get your key at: https://aistudio.google.com/app/apikey

---

## Example workflows

### Run on schedule with Claude (recommended)

```yaml
name: Hlavi Agent

on:
  schedule:
    - cron: '*/30 * * * *'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: mmuhlariholdings/hlavi-agent-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          model: claude-opus-4-6
          max_iterations: '50'
```

### Dry run for testing

Use `dry_run: 'true'` to see what the agent would do without making any changes:

```yaml
- uses: mmuhlariholdings/hlavi-agent-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    dry_run: 'true'
```

### Use a faster / cheaper model for simple tasks

```yaml
- uses: mmuhlariholdings/hlavi-agent-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    model: claude-haiku-4-5
    max_iterations: '20'
```

### Use OpenAI instead of Anthropic

```yaml
- uses: mmuhlariholdings/hlavi-agent-action@v1
  with:
    openai_api_key: ${{ secrets.OPENAI_API_KEY }}
    model: gpt-4o
```

---

## Agent tools

All providers have access to the following tools:

| Tool | Description |
|---|---|
| `read_file` | Read a file from the workspace |
| `write_file` | Write or create a file in the workspace |
| `list_directory` | List files and directories |
| `bash` | Run shell commands (builds, tests, linters, git) |
| `complete_criterion` | Mark an acceptance criterion as done |
| `task_done` | Signal task completion with a summary |

The Anthropic/Claude provider additionally leverages Claude's native built-in tools (file read/write, bash, web search, etc.) via the Claude Agent SDK.

---

## Task lifecycle

```
open  →  in_progress  →  review
```

When the agent picks up a task it moves it to `in_progress`. If it completes all acceptance criteria it calls `task_done` and the task is moved to `review` for a human to approve. If the agent hits `max_iterations` without completing, the task stays `in_progress` and the run exits — you can re-run later.

---

## Tips for writing autonomous tasks

- Write clear, concrete acceptance criteria — the agent works through them one by one
- Keep tasks focused and small — one concern per task works best
- Include relevant context in the description (e.g. "use the existing `parseDate` utility in `src/utils.ts`")
- For tasks that touch tests, include a criterion like "all existing tests pass"

---

## License

MIT
