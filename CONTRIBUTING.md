# Contributing

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- [pnpm](https://pnpm.io/) 10 (see `packageManager` in `package.json`; `corepack enable` installs it)
- Docker, only if you want to build the image locally

## Setup

```bash
pnpm install
```

This also installs the git hooks via [Lefthook](https://lefthook.dev/).

## Project layout

```
mcp-app.html         Vite entry for the widget
src/app/             React widget rendered inside the chat (useApp from @modelcontextprotocol/ext-apps/react)
src/server/main.ts   Express + Streamable HTTP transport (or --stdio)
src/server/server.ts createServer(): tools + the ui:// resource
src/server/game/     Pure tic-tac-toe rules
src/server/lobby/    In-memory lobby: players, invites, games, presence
src/server/tools/    Pure tool handlers returning PlayerView snapshots
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Rebuilds the widget on change and restarts the server on change (port 8765) |
| `pnpm build` | Bundles the widget into `dist/mcp-app.html` and compiles the server into `dist/server` |
| `pnpm start` | Runs the compiled server |
| `pnpm test` | Runs the vitest suite |
| `pnpm lint` / `pnpm lint:fix` | Biome format + lint check / auto-fix |
| `pnpm typecheck` | `tsc --noEmit` over the whole project |

Point an MCP client at `http://localhost:8765/mcp` to try the widget. The [ext-apps basic host](https://github.com/modelcontextprotocol/ext-apps/tree/main/examples/basic-host) is a handy local host for development.

## Git hooks

- **pre-commit** formats staged files with Biome.
- **commit-msg** validates the message with commitlint.

## Commit convention

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). Allowed types:

`feat` · `fix` · `perf` · `revert` · `docs` · `style` · `chore` · `refactor` · `test` · `build` · `ci` · `wip`

The type drives the changelog and the version bump (`feat` → minor, `fix` → patch, `!` or `BREAKING CHANGE` → major).

## CI and releases

- `ci.yml` runs on every pull request: lint, typecheck, tests, build and a no-push Docker build.
- `release.yml` runs on every push to `main`. [release-please](https://github.com/googleapis/release-please) keeps a release PR up to date with the pending changelog. Merging that PR creates a GitHub release and tag, and publishes a multi-arch Docker image (`linux/amd64`, `linux/arm64`) to `ghcr.io/worgho2/tic-tac-toe-mcp-game` tagged `X.Y.Z` and `latest`. The repository uses immutable releases: every release gets a fresh `vX.Y.Z` git tag that is never moved, and no floating `vX` / `vX.Y` tags are created.

### Repository secrets

| Secret | Purpose |
|---|---|
| `RELEASE_PLEASE_TOKEN` | A fine-grained PAT with *Contents*, *Issues* and *Pull requests* set to write on this repo. Without it the workflow falls back to `GITHUB_TOKEN`, which still opens the release PR but cannot trigger `ci.yml` on it. |

After the first publish, set the GHCR package visibility to public in the package settings.
