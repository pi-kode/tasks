# Contributing to @pi-kode/tasks

Thank you for contributing to `@pi-kode/tasks`. This guide covers local setup, project layout, coding conventions, testing, and the release workflow.

## Prerequisites

- **Node.js 22+** (required for `--experimental-strip-types` and the built-in `node:test` runner)
- **npm**

## Setup

Clone the repository and install dependencies without generating a lockfile (this repository does not commit `package-lock.json`):

```sh
git clone https://github.com/pi-kode/tasks.git
cd tasks
npm install --no-package-lock
```

## Project Layout

```text
index.ts                     # Package entry point re-exporting the extension
lib/src/
  features/tasks.ts          # Extension registration, lifecycle hooks, and background job tools
  extensions/tasks.ts        # Task CRUD tools (TodoWrite, TaskCreate, TaskGet, TaskList, TaskUpdate) and DAG validation
  runtime/
    tasks.ts                 # TasksRuntime, session-branch persistence, status/widget updates, tool registration
    checklist.ts             # TUI checklist renderer
    schema.ts                # Strict TypeBox object schema helper
    utils.ts                 # Hashing, atomic file writes, text formatting
  backends/
    jobs.ts                  # Durable background job supervisor and crash reconciliation
    process.ts               # Detached child-process runner with timeout, abort, and output caps
tests/
  helper.ts                  # In-memory pi ExtensionAPI test harness
  tasks.test.ts              # Unit and integration tests
.github/workflows/
  publish.yaml               # Tag-triggered npm publish workflow (vX.X.X-release)
```

## Development & Verification

Run typechecking and the test suite locally before opening a pull request:

```sh
npm run typecheck
npm test
```

To try your changes interactively in pi, load the extension entry point directly:

```sh
pi -e ./index.ts
```

## Conventions

- **TypeScript & ESM**: Keep `tsconfig.json` strict settings passing (`ES2023`, `NodeNext`). Use explicit `.ts` extensions in relative imports (`allowImportingTsExtensions: true`).
- **Input validation**: Define tool parameters with TypeBox and `additionalProperties: false` (via `object()` in `lib/src/runtime/schema.ts` or `Type.Object(..., { additionalProperties: false })`).
- **Execution modes**: Mutating tools (`TodoWrite`, `TaskCreate`, `TaskUpdate`, `TaskRun`, `TaskStop`) use `executionMode: 'sequential'`; read-only tools (`TaskGet`, `TaskList`, `TaskOutput`) use `executionMode: 'parallel'`.
- **State & event compatibility**: Preserve existing persistence keys (`pk:tasks`, plus read compatibility for `cc:tasks` and `code-compat:state`), UI keys (`compat-tasks`, `compat-todos`), and the deduplication channel (`pi-ko:tasks:v1`) unless a breaking change is explicitly intended.
- **No lockfiles**: Do not commit `package-lock.json` or generated artifacts.

## Pull Requests

1. Keep changes focused and cover new behavior or bug fixes with tests in `tests/`.
2. Ensure both `npm run typecheck` and `npm test` pass cleanly.
3. Update `README.md` if you add, remove, or change user-facing tools or behavior.

## Releasing & publishing

Packages are published to the `@pi-kode` npm organization (`https://www.npmjs.com/settings/pi-kode/packages`) automatically by `.github/workflows/publish.yaml` using **npm OIDC Trusted Publishing** (no `NPM_TOKEN` secret required).

Publishing is triggered **only** when a tag matching `vX.X.X-release` (for example `v0.7.1-release`) is pushed to GitHub.

### Release steps

1. Bump `"version"` in `package.json`, e.g. `0.7.1`, and merge the version bump into `main`.
2. Create and push an annotated tag matching `v<version>-release`:

   ```sh
   git tag -a v0.7.1-release -m "Release v0.7.1"
   git push origin v0.7.1-release
   ```

3. The `Publish` workflow runs the `verify` job to validate that:
   - the tag strictly matches `^v[0-9]+\.[0-9]+\.[0-9]+-release$`,
   - the tag version matches `package.json` `"version"`,
   - the package name is scoped under `@pi-kode/`,
   - `npm test` and `npm run typecheck` pass.
4. Once `verify` passes, the `publish` job pauses at the `npm-publish` GitHub Actions environment. Open the workflow run in GitHub Actions and click **Review deployments** → **Approve and deploy** to run `npm publish --provenance --access public`.

### One-time release setup (maintainers)

1. **GitHub Actions environment** (in repository **Settings → Environments**):
   - Create an environment named `npm-publish`.
   - Enable **Required reviewers** and add the maintainer(s) authorized to approve releases.
2. **npm Trusted Publishing** (in package settings for `@pi-kode/tasks` under `https://www.npmjs.com/settings/pi-kode/packages`):
   - **Organization / user**: `pi-kode`
   - **Repository**: `tasks`
   - **Workflow filename**: `publish.yaml`
   - **Environment**: `npm-publish`
