# Tic-Tac-Toe over MCP — Design Spec

**Date:** 2026-06-18
**Status:** Approved design, ready for implementation planning
**Type:** Spike

## 1. Purpose

A spike proving that a two-player game can be played **through MCP clients**. Two users, each in their own AI chat app with MCP support, call an MCP tool to "join" a game. The MCP server returns an interactive webview (via the `mcp-ui` UIResource pattern). Inside the webview a player sees a lobby of available players, invites one, and on acceptance the two play a standard game of tic-tac-toe in real time.

This is exploratory: in-memory state, no persistence, no accounts. Success = two friends on separate MCP clients, reaching the game over a public (cloudflared) URL, can complete a full game.

## 2. Confirmed decisions

- **UI delivery:** MCP-UI / Apps SDK interactive pattern — the tool returns an `mcp-ui` UIResource rendered inline by supporting hosts.
- **Game rules:** standard tic-tac-toe (3×3, up to 9 moves, ends on win or draw). "3 turns" was loose wording; ignore it.
- **Identity:** player enters a display name in the webview. All state in-memory, no auth, no DB.
- **Stack:** single TypeScript / Node project.
- **Architecture:** Approach A — stateless MCP server + a shared always-on game backend.
- **Deployment:** Docker Compose; backend exposed externally via the user's existing cloudflared tunnel so remote friends can play.

## 3. Architecture (Approach A)

Shared game state cannot live in a per-client MCP process: MCP over `stdio` spawns one server process per client, so two players would get isolated memories. Therefore:

- The **game backend** is the single source of truth. One always-on Node process holds all lobby + game state in memory and serves the webview over HTTP + WebSocket.
- The **MCP server** is *stateless*. Its single tool, `join_game`, returns an `mcp-ui` `externalUrl` UIResource pointing at the backend. It holds no game state and works under any MCP transport because it is only a launcher.
- The **webview** (the SPA the iframe loads) does the real work over a WebSocket to the backend.

### Repo layout

```
tic-tac-toe-mcp-game/
├── packages/
│   ├── backend/        # shared "brain": HTTP + WebSocket, in-memory state
│   │   ├── game/       # pure tic-tac-toe rules (board, win/draw)
│   │   ├── lobby/      # players, presence, invites, matchmaking, active games
│   │   └── server/     # HTTP (serves SPA) + WS gateway
│   ├── mcp-server/     # stateless MCP server: join_game tool → mcp-ui UIResource
│   └── webview/        # SPA: name → lobby → invite → board
└── package.json        # npm workspaces; one `npm run dev` starts everything
```

### Unit responsibilities & boundaries

- **`game/`** — pure functions, zero I/O. `makeMove(board, pos, mark) → board | error`, `getResult(board) → win | draw | ongoing`. Independently testable.
- **`lobby/`** — owns in-memory maps: connected players, pending invites, active games. Takes commands, emits events. No HTML, no sockets.
- **`server/`** — thin transport layer. WebSocket message in → lobby/game command → broadcast events out. Serves the built `webview` SPA statically.
- **`mcp-server/`** — one tool, `join_game`. Returns an `mcp-ui` `externalUrl` UIResource pointing at `PUBLIC_BACKEND_URL/?session=<uuid>`. Stateless.
- **`webview/`** — small SPA (plain TS + Vite, no heavy framework for the spike). Connects to backend WebSocket; renders three screens (name entry, lobby, game board).

## 4. Data flow

1. Player A calls the **`join_game`** MCP tool → MCP server returns a UIResource iframe → host renders `PUBLIC_BACKEND_URL/?session=<uuidA>`.
2. SPA loads, opens a **WebSocket**, A enters a display name → `register`. Backend adds A to the lobby and broadcasts the updated list.
3. Player B does the same → both now see each other in the **available players** list (live).
4. A clicks B → `invite` → backend sends `invite_received` to B only.
5. B clicks Accept → `accept_invite` → backend creates a game (random who's X), sends `game_started` to both with initial board and whose turn it is.
6. Players alternate `move` messages → backend validates via `game/`, broadcasts `game_updated` (new board, next turn) → on win/draw broadcasts `game_over`.
7. Either can `leave` / disconnect → opponent notified, game ends, players return to lobby.

## 5. WebSocket protocol

**Client → server:** `register{name}`, `invite{targetId}`, `accept_invite{inviteId}`, `decline_invite{inviteId}`, `move{pos}`, `leave`.

**Server → client:** `lobby_updated{players[]}`, `invite_received{from}`, `invite_declined`, `game_started{gameId, board, yourMark, yourTurn}`, `game_updated{board, yourTurn}`, `game_over{result, board}`, `opponent_left`, `error{message}`.

State is keyed by a per-connection `playerId` generated on WS connect. The `session` query param ties a webview instance to its launch. All state lives in in-memory `Map`s in `lobby/`; nothing persists across restart.

## 6. Deployment & configuration

- `docker-compose.yml` runs two services: **`backend`** (HTTP + WS, with the built SPA baked in) and **`mcp-server`**. `docker compose up` brings everything up.
- **`PUBLIC_BACKEND_URL`** env var (the cloudflared hostname, e.g. `https://ttt.example.com`) is used by `mcp-server` to build the iframe URL in the UIResource.
- The **webview derives its WebSocket URL from `window.location`** (`wss://` when served over https), so it works behind the tunnel with no hardcoding.
- The existing host-level cloudflared tunnel points at the `backend` container's exposed port. WebSocket upgrades pass through cloudflared as `wss://`.
- The MCP host must reach the public URL to render the iframe — satisfied by the real cloudflared URL.

## 7. Error handling

- Invalid move (occupied cell, not your turn, game over) → `error` message, board unchanged.
- Invite to a player who is gone / already in a game → `error`, lobby refreshed.
- Opponent disconnects mid-game → `opponent_left`, surviving player returned to lobby, game discarded.
- Duplicate/stale sessions, malformed messages → rejected with `error`, connection kept alive.

## 8. Testing

- **`game/`** — unit tests for move validation and win/draw detection (pure, fast). TDD here.
- **`lobby/`** — unit tests driving commands and asserting emitted events (register → invite → accept → move → game_over), no real sockets.
- **`mcp-server/`** — a test asserting `join_game` returns a well-formed `mcp-ui` UIResource with the correct iframe URL.
- **Manual end-to-end** — two MCP clients over the cloudflared tunnel completing a full game (the real spike validation).

## 9. Out of scope (YAGNI for the spike)

- Persistence / database / accounts.
- Authentication and authorization.
- Reconnection / resume of an in-progress game after disconnect.
- Spectators, chat, matchmaking ranking, multiple concurrent rooms beyond what the in-memory lobby naturally supports.
- Best-of-N matches or rule variants.
