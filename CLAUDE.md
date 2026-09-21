# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A two-player tic-tac-toe game rendered as an **MCP App** (`@modelcontextprotocol/ext-apps` 2.0, SEP-1865) inside an AI chat client. One Express server exposes a Streamable HTTP MCP endpoint (`/mcp`) plus a `GET /healthz`, and serves a self-contained React widget as a `ui://` resource. Deployed as a Docker image to GHCR; public instance at `https://tic-tac-toe-mcp-game.obfsoft.party/mcp`.

**This is a single package at the repo root.** Ignore the "npm workspaces" wording in the scaffold commit message: `pnpm-workspace.yaml` only carries pnpm settings (`engineStrict`, `onlyBuiltDependencies`) and declares no workspace globs. There is no `packages/` or `apps/` directory.

Human-facing contributor docs (layout table, hooks, CI/release flow, secrets) live in `CONTRIBUTING.md`. The README is deliberately demo-first and non-developer facing; keep developer details in `CONTRIBUTING.md`.

## Commands

pnpm only (`packageManager` pin, `engineStrict`), Node 24 (`.nvmrc`). Use `corepack enable` to get the pinned pnpm.

| Command | Notes |
|---|---|
| `pnpm install` | Also installs lefthook git hooks via `prepare` |
| `pnpm dev` | Runs `vite build --watch` and `tsx watch src/server/main.ts` concurrently on port 8765 |
| `pnpm build` | `vite build` (widget → `dist/mcp-app.html`) then `tsc -p tsconfig.server.json` (server → `dist/server`) |
| `pnpm start` | `node dist/server/main.js` |
| `pnpm typecheck` | `tsc --noEmit` over `src`, both server and app, plus `.storybook` |
| `pnpm lint` / `pnpm lint:fix` | `biome check` (lint + format in one; this is what CI gates on) |
| `pnpm format` / `pnpm format:check` | Biome formatter only |
| `pnpm test` / `pnpm test:watch` | Vitest with two projects: server (node, src/server/**/*.test.ts) and app (jsdom + Testing Library, src/app/**/*.test.{ts,tsx}) |
| `pnpm storybook` / `pnpm build-storybook` | Storybook 10 (`@storybook/react-vite`) on port 6006; static build to `storybook-static/` (git-ignored) |

Single test file: `pnpm vitest run src/server/lobby/lobby.test.ts`
One project only: `pnpm vitest run --project app`
Single test by name: `pnpm vitest run -t "applyMove rejects an occupied cell"`

Run the server over stdio instead of HTTP: `tsx src/server/main.ts --stdio`. Env vars: `PORT` (default 8765) and `APP_VERSION` (optional). The version is a build-time constant: `vite.config.ts` defines `__APP_VERSION__` from `APP_VERSION`, falling back to `package.json` (never import `package.json` into `src/app`, it would ship the whole manifest in the widget). The Dockerfile takes `APP_VERSION` as a build arg for the widget build and keeps it in the runtime env, where the server uses it for `serverInfo.version`; `release.yml` passes the release version.

**Build-order trap:** `server.ts` reads `dist/mcp-app.html` at request time. Running the server from source without a prior `vite build` makes the `ui://` resource read fail. `pnpm dev` avoids this by running both watchers. `vite.config.ts` sets `emptyOutDir: false` on purpose so the Vite output and the `tsc` output coexist in `dist/`; do not change that.

For manual testing, point an MCP client at `http://localhost:8765/mcp`. The ext-apps `basic-host` example is a convenient local host.

## Architecture

Two trees under `src/`, built by different toolchains:

- `src/server/` is compiled by `tsconfig.server.json` (**NodeNext**). Every relative import there must end in `.js` (`./lobby/lobby.js`). Tests are excluded from that build.
- `src/app/` is bundled by Vite (`@vitejs/plugin-react` + `vite-plugin-singlefile`) from the root `mcp-app.html` into one HTML file. Imports use bundler resolution, no extension needed.
- The root `tsconfig.json` (`moduleResolution: bundler`, `noEmit`) spans both trees and is what `typecheck` uses. That is why `src/app/lib/tools.ts` can do a type-only import of `PlayerView` from `../../server/lobby/lobby.js`; this cross-boundary type import is intentional. Keep it type-only.

### Server request model

`main.ts` creates a **fresh `McpServer` and transport per HTTP request** (stateless Streamable HTTP, `sessionIdGenerator: undefined`). Therefore all game state lives outside the server object: `server.ts` holds a module-scope `sharedLobby`. This makes the deployment **single replica by design**; horizontal scaling, persistence and auth are explicitly out of scope. `createServer({ lobby, readHtml })` accepts injectable overrides purely for tests.

`main.ts` binds `createMcpExpressApp({ host: '0.0.0.0' })`, which disables the SDK's localhost DNS-rebinding guard; that is wanted because the server sits behind a reverse proxy.

### Tool surface

Registered in `server.ts` via `registerAppTool` / `registerAppResource` from `@modelcontextprotocol/ext-apps/server`, with zod 4 `z.object` schemas.

- Two tools are **model-visible**. `join_game` carries `_meta: { ui: { resourceUri: RESOURCE_URI } }` so the host renders the widget. `model_move` is registered with the plain `server.registerTool` (no `_meta.ui`): it is how the assistant plays when the user picked "Play vs model", and it must never open a widget.
- The ten others (`set_name`, `get_state`, `invite`, `accept_invite`, `decline_invite`, `cancel_invite`, `make_move`, `leave`, `close_session`, `play_vs_model`) are **app-only**: `_meta.ui.visibility: ['app']`. They are called by the widget, hidden from the model.
- Always use the nested `_meta.ui` shape, never the deprecated flat `_meta["ui/resourceUri"]`. The resource mime type must be `RESOURCE_MIME_TYPE` from ext-apps (`text/html;profile=mcp-app`). `src/server/server.test.ts` asserts all of this with an in-memory `Client` + `InMemoryTransport` pair; extend it when adding tools.

### Layers on the server

- `game/game.ts`: pure rules (`createBoard`, `applyMove` immutable, `getResult`). No lobby knowledge.
- `lobby/types.ts`: constants (`PRESENCE_TTL_MS = 30_000`, `INVITE_TTL_MS = 60_000`, `REMATCH_DELAY_MS = 3_000`, `MAX_NAME = 24`, `CLOSED_TTL_MS = 24 h`, `MAX_CLOSED_IDS = 10_000`) and the public view types (`PlayerView`, `GameView`, `InviteView`, `LobbyEvent`), plus `MODEL_NAME`/`MODEL_TAG` and `PlayerKind`; `Phase` includes `closed`. Re-exported from `lobby.ts`.
- `lobby/lobby.ts`: in-memory `Lobby` (players, invites, matches, presence). Players get a `name#tag` handle (4 random digits, unique per name). Invites expire after 60 s and are auto-cancelled when a party enters a match. A match keeps a per-player score and restarts automatically 3 s after a round ends, with X and O swapped. All time-based transitions live in `sweep()`. The constructor takes injectable `genId`, `clock` and `genTag` so tests are deterministic. Mutations return an error string or `null`; `viewFor(playerId)` snapshots the `PlayerView` and drains that player's `events`. A model opponent is a hidden player (`kind: 'model'`, `Model#AI`) created by `startModelMatch`; it is exempt from presence and deleted with its match. `close(id)` removes the player and tombstones the id so `reconnect` never re-creates it.
- `tools/handlers.ts`: one pure function per tool. Uniform contract: `lobby.reconnect(playerId)` (touch, or re-create a swept id in the name phase so a reloaded widget can register again) → `lobby.sweep()` → mutate → return `viewFor(playerId)` with the transient `error` merged in. Every reply duplicates the payload in both `structuredContent` and a JSON `content[0].text` block. New tools should follow this exact shape. `handleModelMove` is the one exception: it sweeps and guards with `isModelPlayer` but never `reconnect`s, so an id the model made up is not re-created; the guard replies with only the error (`{ error: 'not a model player' }`) and never builds a view, since the id could belong to a human and `viewFor` would leak that human's private view and drain their pending events.

### Widget

`src/app/App.tsx` uses `useApp` from `@modelcontextprotocol/ext-apps/react`, polls, calls tools, and switches screens on `view.phase` (`name` → `screens/JoinScreen`, `lobby` → `screens/LobbyScreen`, `game` → `screens/GameScreen`, `closed` → `screens/ClosedScreen`). Screens and the primitives in `src/app/ui/` are pure (props in, callbacks out) and never import ext-apps; that is what makes them testable in jsdom and renderable in Storybook. `App.tsx` turns every `view.events` entry and any mutation `error` outside the name phase into a toast (`hooks/useToasts`, 4 s, timers cleared on unmount), except a `not in a game` error that arrives together with an `opponent-left` event. `lib/tools.ts` wraps `callTool`, preferring `structuredContent` and falling back to parsing the text block.

**Model opponent.** `hooks/useModelTurn.ts` posts one `app.sendMessage` (`ui/message`, role `user`) per board state while it is the model's turn, built by `lib/modelMessage.ts`, and flips `stale` after `MODEL_STALE_MS = 10_000` so `GameScreen` can show "Ask again". The "Play vs model" button is only rendered when `app.getHostCapabilities()?.message` is set. `ui/CloseButton.tsx` ends the session through `close_session`; a `closed` view stops polling. Every screen but the closed one renders it in its header (`ScreenFrame`). External links (`ui/Link.tsx`, URLs in `lib/project.ts`) go through an `onOpenLink` callback that `App.tsx` routes to `app.openLink` when the host advertises `openLinks`, else `window.open`.

**Polling, not push.** MCP Apps has no server→widget push, so `hooks/usePollView.ts` calls `get_state` once immediately, then every `POLL_INTERVAL_MS = 1500`, and again whenever the tab becomes visible. Keep the poll interval well under the presence TTL. Invite countdowns tick locally from `expiresIn` (`hooks/useCountdown`) and resync on every poll.

**Visual system.** Every surface is Kenney "UI Pack - Adventure" (CC0): "Double" PNGs in `src/app/assets/kenney-adventure/` drawn at half size as `border-image` 9-slices (slice 36 → 18px window / 12px inset and cell borders; slice 16 → 8px buttons, inputs, toasts; `border-image-repeat: stretch`, smooth art, no `image-rendering: pixelated`). `panel_red_dark.png` is `panel_brown_dark` recoloured for the danger button; the curtain banner is split into caps and a stretched middle; box title bars use `pattern_diagonal_transparent_small` at half opacity. The font is Press Start 2P (OFL). Everything is inlined by `vite-plugin-singlefile`; never reference an external URL. The full pack sits in the git-ignored `ui-pack/`; copy only the tiles you use. `styles/tokens.css` holds the palette and one `--tile-<role>` per surface, overridden under `:root[data-theme='dark']`; `styles/base.css` styles the primitives; `styles/animations.css` holds the round-end overlay (CSS confetti, bobbing 🦆, `prefers-reduced-motion` off switch). Building blocks in `src/app/ui/`: `Box` (panel, `surface` `window` or `inset`, optional `title` drawn as a striped title bar, like Kenney's "Warning" sample), `Window` (a `window` Box with the curtain `Banner` title, a header band with `header` on the left and `headerAction` on the right, content, `actions` in an `ActionRow`, footer band), `ActionRow` (every button group: centred, secondary first, primary/danger last), `StatusDot` (green idle / yellow busy, bordered so list clipping never cuts it, status word kept in `.sr-only`), `Handle` (name in `--fg`, `#tag` in the lighter `--tag`; only the name truncates, so the tag always shows; use it wherever a handle is shown, except plain-string places like dialog titles and aria-labels), `Icon` (`check`/`cross` SVGs; the font has no such glyphs; icon-only buttons carry an aria-label), `Scoreboard` (two titled plates, the player to move gets the framed `--tile-window` plate), plus `Button`, `Input`, `Cell`, `Modal` (a Window), `Toast`, `Link`, `CloseButton`, `Overlay`, `Banner`. Lists are `.list` rows with dividers and the pack's scrollbar (`::-webkit-scrollbar-thumb` border-image; `scrollbar-color` only under `@supports not selector(::-webkit-scrollbar)`, since Chrome ignores the pseudo-elements once it is set). Every screen renders through `screens/ScreenFrame.tsx`: a Window with the screen title on the banner; a header whose left side is context or controls (Join: tagline; Lobby: your status dot and handle; Game: Back to lobby and Ask again) and whose right side is `headerActions` then the close button (Lobby: Play vs model); content in a 12px vertical rhythm (inset Boxes, two `.columns` when the window is at least 480px wide, a container query); an optional action row; and a footer with version, players online and author (centred when the window is under 480px; the `.screen` window is itself a size container); screens take a `meta: ScreenMeta` (`version`, `onlineCount`, `onOpenLink`) built in `App.tsx`. Host sizing is automatic (`useApp` enables `autoResize`).

Widget tests use Testing Library with `src/app/test-setup.ts` (jest-dom matchers, cleanup) and the fixtures in `src/app/fixtures/views.ts`; the same fixtures feed the `*.stories.tsx` files next to each component. Storybook lives in `.storybook/` (`main.ts` drops `vite-plugin-singlefile` in `viteFinal`; `preview.tsx` imports the stylesheets and adds the light/dark toolbar). `storybook-addon-pseudo-states` forces `:hover`/`:active`/`:focus-visible` via the `pseudo` parameter (see the Button `States` story). Stories are CSF3 with `Meta`/`StoryObj` from `@storybook/react-vite` and `fn`/`userEvent` from `storybook/test`. `src/app/styles/contrast.test.ts` fails the build if a token drops below WCAG AA against its tile fill (fills sampled from the PNGs and listed in the test; it only reads `#rrggbb` tokens, so add a row for every new text or indicator colour).

## Conventions

- **Biome** replaces both ESLint and Prettier (`biome.json`: 2-space, 120 cols, single quotes, JSX double quotes). Suppress with `// biome-ignore lint/<rule>: <reason>`.
- **Split MCP SDK 2.x** packages (`@modelcontextprotocol/server`, `/node`, `/express`, `/client`), not `@modelcontextprotocol/sdk`. zod 4.
- **Conventional Commits, enforced by commitlint** on `commit-msg`. Allowed types: `feat fix perf revert docs style chore refactor test build ci wip`. release-please derives version and changelog from them, so `feat` and `fix` have release consequences. Keep `commitlint.config.mjs` `type-enum` in sync with `changelog-sections` in `release-please-config.json`.
- **pre-commit** runs Biome format on staged files with `stage_fixed`. Do not leave a tracked file with both staged and unstaged edits when committing: if the hook fails, lefthook's stash restore can silently revert the unstaged part. After any hook failure, check `git status` and diff.
- **CI runs only on pull requests** (`ci.yml`: lint, typecheck, test, build, no-push Docker build, Storybook build). Work goes through PRs.
- Dockerfile's corepack `pnpm@…` pin must match `packageManager` in `package.json`.
- The host boundary is `App.tsx` (`useApp`), `lib/tools.ts` (`callTool` wraps `app.callServerTool`) and the hooks `usePollView`, `useHostTheme` and `useModelTurn`; nothing else references `@modelcontextprotocol/ext-apps`. Screens and primitives take a view slice and callbacks only.

## Docs: what to trust

`docs/superpowers/specs/2026-09-14-portfolio-restructure-design.md` (layout, tooling) and `docs/superpowers/specs/2026-09-14-game-design-and-use-cases.md` (its "Decisions", "Use cases", "Server model", "Tools", "Widget", "Visual system" and "Storybook" sections) match the code; `docs/superpowers/plans/2026-09-14-game-model-and-tools.md`, `docs/superpowers/plans/2026-09-14-widget-reskin.md` and `docs/superpowers/plans/2026-09-14-storybook-and-a11y.md` are the plans that implemented the latter. `docs/superpowers/specs/2026-09-16-model-opponent-and-session-close-design.md` (model opponent, session close) and `docs/superpowers/plans/2026-09-16-model-opponent-and-session-close.md`, the plan that implemented it, also match the code and are trusted. The two `2026-06-18` specs and both `2026-06-18` plans predate the restructure (`packages/*`, npm workspaces, Node 20, `@modelcontextprotocol/sdk` v1, zod 3, a vanilla `widget.html`) and their game behaviour is superseded by the 2026-09-14 game spec; do not use them. The v1 spec (`…-mcp-game-design.md`, mcp-ui external URL + WebSocket) is fully retired. The widget's look changed on 2026-09-21 (Kenney "UI Pack - Adventure" everywhere, `Box`/`Window`/`Banner`/`ActionRow`/`StatusDot`/`Scoreboard`, `ScreenFrame`, no spec yet): the "Visual system" and screen-layout parts of the 2026-09-14 and 2026-09-16 specs and plans (pixel tiles, `Panel`, `Ribbon`, `Badge`, the corner close button) are superseded by the "Visual system" paragraph above; their behaviour sections still hold.

Reference implementations for MCP Apps patterns: the `ext-apps` repo examples `basic-server-react` (starter) and `system-monitor-server` (polling pattern).
