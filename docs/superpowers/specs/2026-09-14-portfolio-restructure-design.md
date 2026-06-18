# Portfolio restructure — design

Date: 2026-09-14

## Goal

Turn the MCP Apps tic-tac-toe PoC into a presentable portfolio repository at `github.com/worgho2/tic-tac-toe-mcp-game`, hosted at `https://tic-tac-toe-mcp-game.baziewi.cz/mcp`, without changing game behaviour. Game rules, design and use cases are a separate follow-up.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| SDK | ext-apps 2.0 + split MCP SDK 2.x (`@modelcontextprotocol/server`, `/node`, `/express`, `/client`, zod 4) | Matches the `ext-apps` examples; `registerAppTool` with `z.object` removes the TS2589 casts |
| Widget | React 19 via `useApp` from `@modelcontextprotocol/ext-apps/react`, Vite + `vite-plugin-singlefile` | `basic-server-react` is the designated starter; same screens as the vanilla widget |
| Layout | Single package at the repo root (`src/server`, `src/app`, `mcp-app.html`) | One deployable; simpler Dockerfile, CI and release-please (`packages: {".": {}}`) |
| Package manager | pnpm 10.28.1 (pinned via `packageManager`), Node 24 | Consistent, fast installs; lockfile-driven Docker builds |
| Quality | Biome format + lint (recommended preset), lefthook `pre-commit` (format staged) and `commit-msg` (commitlint), conventional commits | Requested; commit types mirror release-please changelog sections |
| CI | `ci.yml` on pull requests: lint, typecheck, test, build, no-push docker build | Quality gateway |
| Release | `release.yml` on push to `main`: release-please (manifest mode) then, when a release is created, build and push `ghcr.io/worgho2/tic-tac-toe-mcp-game` (`latest`, `X.Y.Z`, `X.Y`, `X`) | Requested |
| Docker | Multi-stage `node:24-alpine`, corepack-pinned pnpm, cache mounts, prod-only deps, non-root `node`, node-based healthcheck | Optimised image, no dev deps or tests shipped |
| License | MIT | Aligned with the MCP SDK (MIT), ext-apps (MIT → Apache-2.0) and React (MIT) |

## Reference examples from `ext-apps`

- `examples/basic-server-react`: layout, build chain, `useApp` wiring, `DIST_DIR` resolution.
- `examples/system-monitor-server` and `docs/patterns.md` "Polling for live data": app-only poll tool + `setInterval` with cleanup.
- `examples/scenario-modeler-server`: `components/`, `hooks/`, `lib/` folder structure.
- `examples/lazy-auth-server`: many tools on one server, `app.all('/mcp')` boilerplate.

## Architecture (unchanged behaviour)

- Stateless Streamable HTTP: a fresh `McpServer` per request; the `Lobby` lives at module scope in `server.ts` (single replica).
- `join_game` is the only model-visible tool and links to `ui://tic-tac-toe/mcp-app.html`. The seven other tools carry `_meta.ui.visibility: ['app']`.
- The widget polls `get_state` every 1.5 s; there is no server → widget push in MCP Apps.

## Testing

- Pure unit tests for `game`, `lobby`, `handlers` (kept).
- `server.test.ts`: in-memory client/server contract test (tool visibility metadata, resource MIME type, `join_game` payload, input validation).
- Manual: two clients against a local server (or the ext-apps `basic-host`), full invite → play → back-to-lobby flow.
- Docker: image builds, runs as `node`, `/healthz` ok, no `*.test.js` in `dist`.
