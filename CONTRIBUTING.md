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
src/app/ui/          9-slice primitives (Panel, Button, Modal, Toast, ...)
src/app/screens/     Pages (Join, Lobby, Game)
src/app/styles/      Tokens (palette per theme), base styles, animations
src/app/assets/      Kenney tiles and the Press Start 2P font
src/server/main.ts   Express + Streamable HTTP transport (or --stdio)
src/server/server.ts createServer(): tools + the ui:// resource
src/server/game/     Pure tic-tac-toe rules
src/server/lobby/    In-memory lobby: players, invites, games, presence
src/server/tools/    Pure tool handlers returning PlayerView snapshots
```

## Assets and credits

- UI tiles: [Kenney "UI Pack - Pixel Adventure"](https://kenney.nl/assets/ui-pack-pixel-adventure) (CC0). Only the tiles the widget uses are committed under `src/app/assets/kenney/` with Kenney's `License.txt`. To add one, copy it from `Tiles/Large tiles/Thick outline/` of the pack, add a `--tile-<role>` custom property in `src/app/styles/tokens.css` (both themes), and use it as `border-image-source`.
- Font: [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) (SIL OFL 1.1), `src/app/assets/fonts/`.

All assets are inlined into `dist/mcp-app.html`; the widget must not reference external URLs (MCP hosts sandbox it with a CSP).

## Widget tests

`pnpm test` runs two Vitest projects. Widget tests (`src/app/**/*.test.{ts,tsx}`) run in jsdom with Testing Library; render screens from the fixtures in `src/app/fixtures/views.ts`, query by role or label, and drive them with `@testing-library/user-event`. Run just that project with `pnpm vitest run --project app`.

## Storybook

`pnpm storybook` serves every primitive and screen state at http://localhost:6006 (light/dark toolbar, 320px "Small mobile" viewport on the narrow stories, a11y panel from `@storybook/addon-a11y`). `pnpm build-storybook` writes `storybook-static/`, which CI builds on every pull request. Stories live next to their components as `*.stories.tsx` and reuse `src/app/fixtures/views.ts`; add a story whenever you add a state a reviewer should be able to see without an MCP host.

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
