# Tic-Tac-Toe over MCP — v2: MCP Apps (polling) Design

**Date:** 2026-06-18
**Status:** Approved direction, ready for implementation planning
**Supersedes:** the delivery layer of `2026-06-18-tic-tac-toe-mcp-game-design.md` (v1). The v1 game rules and lobby matchmaking logic are reused; the WebSocket gateway and Vite SPA are retired.

## 1. Why v2

v1 delivered the UI as an `mcp-ui` external-URL `UIResource`. **claude.ai does not render that** — it falls back to showing the iframe URL as a plain link. claude.ai (and the broader MCP Apps client set) renders the **MCP Apps extension** (SEP-1865, 2026-01-26): a tool linked via `_meta.ui.resourceUri` to a `ui://` resource whose mimeType is `text/html;profile=mcp-app`, rendered as a sandboxed iframe that talks to the host over a JSON-RPC-over-postMessage bridge.

Research brief with exact APIs and code skeletons: `.git/sdd/mcp-apps-research.md`.

## 2. Confirmed mechanism

- **UI wiring:** `registerAppResource`/`registerAppTool` from `@modelcontextprotocol/ext-apps/server` (on top of `@modelcontextprotocol/sdk`). Resource mimeType MUST be `text/html;profile=mcp-app`. Tool carries `_meta: { ui: { resourceUri } }`. App-only tools carry `_meta: { ui: { visibility: ["app"] } }` (hidden from the model).
- **Runtime:** the widget is a sandboxed iframe. It handshakes with `ui/initialize`, receives the launching tool's result via `ui/notifications/tool-result`, and calls server tools via `tools/call` over postMessage.
- **Live updates = widget polls an app-only tool on a timer** (confirmed pattern from the official `system-monitor-server`; ~1.5s interval). There is **no server→widget push** in the spec — opponents' actions reach a player only when their widget polls.
- A direct WebSocket from the widget is allowed by spec (declare `wss://` in the resource's `_meta.ui.csp.connectDomains`) but is **untested in claude.ai** and explicitly **out of scope** for v2 (see §9).

## 3. Decisions (locked)

- **Real-time:** polling (`get_state` every ~1.5s). Confirmed-working; ~1.5s latency is imperceptible for turn-based 3×3.
- **Scope:** replace the v1 WS/SPA path; one codebase aimed at MCP Apps clients (claude.ai first).
- **Identity:** `join_game` assigns a `playerId`; the widget stores it and passes it in every subsequent tool call. (Simple, transport-agnostic; acceptable for a spike — no auth.)

## 4. Architecture

A **single stateful MCP server process** (Streamable HTTP) holds the lobby/game state in an in-memory singleton. Both players connect their MCP client to the same server, so both players' tool calls reach the same process and the same `Lobby`. The v1 "stateless MCP + separate WS backend" split existed only to share a WebSocket brain; with polling, the MCP server itself is the brain.

**Spike constraint (documented, not solved):** state is in-memory in one process → run a **single replica**. Horizontal scaling/persistence is out of scope.

### Package layout

```
packages/
├── core/                 # pure domain — reused from v1, no transport
│   ├── game/             # tic-tac-toe rules — UNCHANGED from v1
│   │   └── game.ts
│   └── lobby/            # refactored for polling (see §6)
│       ├── lobby.ts
│       └── view.ts       # PlayerView type + viewFor()
└── mcp-server/           # the stateful MCP Apps server
    ├── src/
    │   ├── tools.ts      # join_game + app-only tools, wired to the Lobby singleton
    │   ├── widget.html   # inline self-contained widget (vanilla, no build)
    │   └── index.ts      # Streamable HTTP server, holds the Lobby singleton
    └── ...
```

Retired: `packages/backend/src/server` (WS gateway) and `packages/webview` (Vite SPA). The v1 `game/` and `lobby/` move into `packages/core`.

## 5. Tool surface

| Tool | Visibility | Args | Returns (structuredContent) |
|---|---|---|---|
| `join_game` | model + app (carries `_meta.ui.resourceUri`) | — | `{ playerId, view: PlayerView }` |
| `set_name` | app-only | `{ playerId, name }` | `PlayerView` |
| `get_state` | app-only | `{ playerId }` | `PlayerView` (polled ~1.5s) |
| `invite` | app-only | `{ playerId, targetId }` | `PlayerView` |
| `accept_invite` | app-only | `{ playerId, inviteId }` | `PlayerView` |
| `decline_invite` | app-only | `{ playerId, inviteId }` | `PlayerView` |
| `make_move` | app-only | `{ playerId, cell }` | `PlayerView` |
| `leave` | app-only | `{ playerId }` | `PlayerView` |

Every tool handler: `touch(playerId)` → apply the mutation via the existing `Lobby` logic → return `viewFor(playerId)` (with any transient `error` surfaced). `join_game` additionally allocates the `playerId`.

## 6. Lobby refactor (the real work)

The v1 `Lobby` is push-oriented (mutations return `Effect[]` for WebSocket dispatch). v2 makes it pull-oriented. **Reused unchanged:** matchmaking, invite handling, inviter=X/turn order, win/draw detection (via `game/`). **Changed:**

1. **Pull snapshot — `viewFor(playerId): PlayerView`.** Assembles the player's whole view from the internal maps:
   ```ts
   type Phase = 'name' | 'lobby' | 'game';
   interface PlayerView {
     phase: Phase;
     you: { id: string; name: string | null };
     players: { id: string; name: string; status: 'idle' | 'busy' }[]; // others, registered
     invite: { inviteId: string; fromName: string } | null;             // pending incoming
     game: {
       board: (string | null)[]; yourMark: 'X' | 'O'; yourTurn: boolean;
       opponentName: string; over: boolean; result: GameResult | null;
     } | null;
     error: string | null; // transient, from the just-applied mutation
   }
   ```
2. **Presence by heartbeat.** Each player has `lastSeen`. `touch(playerId)` refreshes it on every tool call. A `sweep(now)` (run at the start of each `get_state`) removes players idle longer than `PRESENCE_TTL_MS` (~10s) and ends any game they were in (the opponent's next poll shows them returned to the lobby with an `opponent_left`-style notice). This replaces v1's WebSocket connect/disconnect.
3. **Game-over retention.** On a winning/drawing move, the game is **not deleted**; it is marked `over: true` with its `result`. `viewFor` surfaces the finished board + result so both players see the outcome on their next poll. The game (and the players' association with it) is cleaned up when a player calls `leave` or is swept.
4. **Identity allocation.** `connect()` returns a fresh `playerId` (used by `join_game`); there is no socket to bind it to.

The existing `game/` rules and the lobby's decision logic (who may invite, turn validation, win/draw) carry over. The `Effect`/dispatch machinery is removed.

## 7. Widget (inline HTML, vanilla, no build step)

A single self-contained `widget.html` (mirrors the `system-monitor` example bridge pattern):

- **Bridge:** `ui/initialize` handshake; a `request()`/`callTool()` helper over `window.parent.postMessage`; a message dispatcher for responses + `ui/notifications/tool-result` / `host-context-changed` / `ping`.
- **Bootstrap:** reads `playerId` from `join_game`'s pushed `tool-result`, then drives the three screens — **name → lobby (players + invite prompt) → game board** — the same UX as v1.
- **Actions:** user interactions call `set_name` / `invite` / `accept_invite` / `decline_invite` / `make_move` / `leave`; each response re-renders from the returned `PlayerView`.
- **Polling:** a `setInterval` (~1.5s) calls `get_state` and re-renders, so lobby changes, incoming invites, and opponent moves appear without user action.
- **Theme:** apply the host theme from `hostContext` and `host-context-changed`.

No CSP block is needed — all communication is via the host bridge (no external origins).

## 8. Testing

- **`core/game`** — unchanged v1 tests.
- **`core/lobby`** — `viewFor` snapshots for each phase; presence sweep removes stale players and ends their games; game-over retention (winner visible to both before cleanup); invite/accept/make_move/win exercised through `viewFor`; out-of-turn / occupied-cell surface `error`.
- **`mcp-server`** — `join_game` registered with `_meta.ui.resourceUri`; app-only tools registered with `visibility:["app"]`; the `ui://` resource returns mimeType `text/html;profile=mcp-app`; a tool call returns a well-formed `PlayerView`.
- **Manual e2e (the real validation)** — two users add the MCP server in claude.ai, each calls `join_game`, both see the **inline widget**, find each other, invite, and play a full game.

## 9. Out of scope (v2)

- Direct WebSocket from the widget (the `connectDomains` path) — a possible future enhancement once polling is proven in claude.ai.
- Multi-replica / shared state / persistence / auth.
- Server→widget push (not in the spec).
- Reconnect/resume of an in-progress game beyond the heartbeat TTL.

## 10. Deployment

- A **single `mcp-server` container** over Streamable HTTP. `docker compose` runs just this one service.
- **One** cloudflared hostname → the MCP endpoint (`https://<host>/mcp`). Friends add that one URL to their MCP client.
- `PUBLIC_BACKEND_URL` is **removed** — there is no externally-loaded iframe URL anymore; the widget HTML is delivered inline through MCP.
