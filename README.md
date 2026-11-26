# @pi-kode/tasks

Standalone [pi](https://github.com/badlogic/pi-mono) extension providing durable session-branch task tracking, a live TUI checklist widget, and supervised background shell jobs.

## Capabilities

### Task Management & Dependency Graph

Work items are persisted in the active pi session branch (`pk:tasks` entries, with backward-compatible restoration for `cc:tasks` and `code-compat:state`) and automatically restored on `session_start` and `session_tree` navigation. When tasks exist, the extension also injects active task state into the agent context on `before_agent_start`.

Registered tools:

| Tool | Mode | Description |
| --- | --- | --- |
| `TodoWrite` | sequential | Replaces the current task list with up to 100 durable items renumbered from `#1` (clears existing dependency edges). |
| `TaskCreate` | sequential | Creates a durable work item with `subject`, `description`, optional `activeForm`, and optional `metadata`. |
| `TaskGet` | parallel | Returns a single task by ID, including status and dependencies. |
| `TaskList` | parallel | Lists all work items in the active session branch. |
| `TaskUpdate` | sequential | Updates fields (`subject`, `description`, `activeForm`, `status`, `owner`, merged `metadata`), adds `addBlockedBy` / `addBlocks` dependencies, or deletes a task (`status: "deleted"`). |

Dependency rules enforced by `TaskUpdate`:
- Referenced dependencies must exist.
- Cycles are rejected before state is mutated.
- Tasks with incomplete `blockedBy` dependencies cannot transition to `in_progress` or `completed`.
- Deleting a task removes it from other tasks' `blocks` and `blockedBy` lists.

### Checklist UI & Status Indicator

- **Status bar (`compat-tasks`)**: Shows the count of open tasks (cleared when no tasks remain).
- **TUI widget (`compat-todos`)**: Renders up to 8 tasks ordered `in_progress` → `pending` → `completed`, with status markers (`▶`, `○`, `✔`), optional owner, and dependency badges.
- **Custom tool rendering**: `TodoWrite`, `TaskCreate`, `TaskUpdate`, `TaskList`, and `TaskGet` provide compact call headers and checklist-formatted results.

### Background Shell Jobs

Background jobs run detached via `/bin/bash -c` in the session working directory, with durable job records and log files stored under `~/.local/share/pi-code-compat/<cwd-hash>/<session-hash>/jobs/`.

Registered tools:

| Tool | Mode | Description |
| --- | --- | --- |
| `TaskRun` | sequential | Starts a background shell job with an optional `timeout` (`1`–`3600000` ms, default `600000` ms) and returns its UUID job ID. |
| `TaskOutput` | parallel | Returns job status and the retained log tail (up to 64 KB). Supports `block: true` polling up to `timeout` (`1`–`30000` ms, default `1000` ms) and abort signals. |
| `TaskStop` | sequential | Stops a running job (`SIGTERM`, then `SIGKILL` fallback) and retains its output. |

Lifecycle & safety:
- Jobs are stopped cleanly on `session_shutdown`.
- On `session_start`, `reconcile()` marks any orphaned `running` job records left behind by a crash as `interrupted`.
- Job completion emits a status message to the session.
- Output written to disk is capped at 16 MB per job.

## Installation

Install the package through pi's package manager or npm using the scoped package name:

```sh
pi install npm:@pi-kode/tasks
```

The committed `.npmrc` routes `@pi-kode` packages to the public npm registry (`https://registry.npmjs.org`). Packages are published with public access and require no authentication to install.

## Contributing & Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local setup, running tests and type checks, architecture guidelines, and the release process.
