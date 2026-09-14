# Tic-Tac-Toe over MCP — v2 (MCP Apps, polling) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-deliver the two-player tic-tac-toe game as an **MCP Apps** widget that renders and plays inline in claude.ai, using the official `@modelcontextprotocol/ext-apps` extension with widget-side polling for real-time updates.

**Architecture:** A single stateful MCP server (Streamable HTTP) holds an in-memory `Lobby` singleton. `join_game` (linked to a `ui://` widget via `_meta.ui.resourceUri`) renders an inline, self-contained HTML widget. The widget bridges to the host over postMessage, calls app-only tools (`set_name`, `get_state`, `invite`, `accept_invite`, `decline_invite`, `make_move`, `leave`), and polls `get_state` every ~1.5s. The pure `game/` rules are reused unchanged; `lobby/` is rewritten from push (`Effect[]`) to pull (`viewFor` snapshot) with heartbeat presence and game-over retention.

**Tech Stack:** TypeScript 5.4+, Node 20, ESM, npm workspaces, Vitest, Express + `@modelcontextprotocol/sdk` `StreamableHTTPServerTransport`, `@modelcontextprotocol/ext-apps`, `zod`, Docker Compose.

**Design spec:** `docs/superpowers/specs/2026-06-18-tic-tac-toe-mcp-apps-v2-design.md`
**Research brief (exact APIs/skeletons):** `.git/sdd/mcp-apps-research.md`

## Global Constraints

- TypeScript, Node 20, ES modules (`"type": "module"`) in every package. Keep `.js` import extensions.
- **Single package** `packages/mcp-server` holds everything (domain co-located — no separate `core` package). Retire `packages/backend` and `packages/webview`.
- In-memory state only; **single replica** (no shared store, no persistence, no auth).
- UI resource mimeType MUST be exactly `text/html;profile=mcp-app` (the `RESOURCE_MIME_TYPE` constant).
- Tool→widget link is `_meta: { ui: { resourceUri } }`; app-only tools use `_meta: { ui: { visibility: ["app"] } }`. The deprecated flat key `_meta["ui/resourceUri"]` MUST NOT be used.
- Real-time is **polling only** (`get_state` every ~1.5s). No server→widget push. No direct widget WebSocket (out of scope).
- Presence TTL ~10s; poll interval ~1.5s.
- Library versions: `@modelcontextprotocol/ext-apps` `^1.7.0`, `@modelcontextprotocol/sdk` `^1.29.0`, `zod` `^3.23.0`. If the installed `ext-apps` API differs from this plan's sketch (helper names, `_meta` shape), the INSTALLED package is the source of truth — adapt imports/shapes to it and keep tests asserting the real emitted shape (see Task 5).
- Commit cadence: one commit per task (or per logical step where noted), Conventional Commits.

---

## File Structure (after v2)

```
tic-tac-toe-mcp-game/
├── package.json                 # workspaces root (one package now)
├── tsconfig.base.json
├── vitest.config.ts
├── docker-compose.yml           # single service
├── .env.example                 # MCP_PORT only
├── README.md                    # rewritten for MCP Apps
└── packages/
    └── mcp-server/
        ├── package.json
        ├── tsconfig.json
        ├── Dockerfile
        └── src/
            ├── game/
            │   ├── game.ts          # UNCHANGED (moved from v1 backend)
            │   └── game.test.ts     # UNCHANGED (moved)
            ├── lobby/
            │   ├── lobby.ts         # REWRITTEN: pull model
            │   └── lobby.test.ts    # REWRITTEN
            ├── tools/
            │   ├── handlers.ts      # pure tool handlers over a Lobby
            │   └── handlers.test.ts
            ├── widget/
            │   └── widget.html      # inline self-contained MCP App
            └── index.ts             # ext-apps wiring + Lobby singleton + Streamable HTTP
```

---

## Task 1: Restructure — single package, swap dependencies

**Files:**
- Move: `packages/backend/src/game/*` → `packages/mcp-server/src/game/*`
- Move: `packages/backend/src/lobby/*` → `packages/mcp-server/src/lobby/*`
- Delete: `packages/backend/`, `packages/webview/`, `packages/mcp-server/src/index.ts`, `packages/mcp-server/src/join-game.ts`, `packages/mcp-server/src/join-game.test.ts`
- Modify: `packages/mcp-server/package.json`, root `package.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: a single workspace package `@ttt/mcp-server` containing the (unchanged) `game/` and (still v1) `lobby/` modules with their passing tests; `@mcp-ui/server` removed; `@modelcontextprotocol/ext-apps` + `zod` added.

- [ ] **Step 1: Move domain modules into mcp-server**

```bash
git mv packages/backend/src/game packages/mcp-server/src/game
git mv packages/backend/src/lobby packages/mcp-server/src/lobby
```

- [ ] **Step 2: Delete retired packages and v1 mcp-server entry files**

```bash
git rm -r packages/webview
git rm -r packages/backend
git rm packages/mcp-server/src/index.ts packages/mcp-server/src/join-game.ts packages/mcp-server/src/join-game.test.ts
```

- [ ] **Step 3: Replace `packages/mcp-server/package.json`**

```json
{
  "name": "@ttt/mcp-server",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "@modelcontextprotocol/ext-apps": "^1.7.0",
    "express": "^4.19.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21"
  }
}
```

- [ ] **Step 4: Update root `package.json` scripts** (drop the removed packages)

Replace the `scripts` block with:

```json
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "vitest run",
    "dev": "npm run dev --workspace packages/mcp-server"
  },
```

- [ ] **Step 5: Install**

Run: `npm install`
Expected: completes; `@modelcontextprotocol/ext-apps` and `zod` resolve; `@mcp-ui/server` gone.

- [ ] **Step 6: Verify the moved tests still pass**

Run: `npm test`
Expected: PASS — `game/game.test.ts` (8) and the existing `lobby/lobby.test.ts` (8) run green from their new location; no webview/join-game tests remain.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: collapse to single mcp-server package, drop mcp-ui for ext-apps"
```

---

## Task 2: Lobby pull-model rewrite

Rewrite the lobby from push (`Effect[]`) to pull (`viewFor` snapshot) with heartbeat presence and game-over retention. The `game/` rules are reused unchanged. This task fully replaces `lobby.ts` and `lobby.test.ts` (the v1 protocol/effects types are removed).

**Files:**
- Replace: `packages/mcp-server/src/lobby/lobby.ts`
- Replace: `packages/mcp-server/src/lobby/lobby.test.ts`
- Delete: `packages/mcp-server/src/lobby/protocol.ts` (v1 effect/event types — no longer used)

**Interfaces:**
- Consumes: `game/game.ts` — `createBoard`, `applyMove` (throws `InvalidMoveError`), `getResult`, types `Board`, `Mark`, `GameResult`.
- Produces (`lobby.ts` exports):
  - `const PRESENCE_TTL_MS = 10000`
  - `type PlayerId = string`, `type Phase = 'name' | 'lobby' | 'game'`
  - `interface PublicPlayer { id: PlayerId; name: string; status: 'idle' | 'busy' }`
  - `interface GameView { board: Board; yourMark: Mark; yourTurn: boolean; opponentName: string; over: boolean; result: GameResult | null }`
  - `interface PlayerView { phase: Phase; you: { id: PlayerId; name: string | null }; players: PublicPlayer[]; invite: { inviteId: string; fromName: string } | null; game: GameView | null; notice: string | null; error: string | null }`
  - `class Lobby` with:
    - `constructor(genId?: () => string, clock?: () => number)`
    - `connect(): PlayerId`
    - `touch(id: PlayerId): void`
    - `sweep(): void`
    - `register(id, name): string | null` (returns an error message or null)
    - `invite(fromId, targetId): string | null`
    - `acceptInvite(byId, inviteId): string | null`
    - `declineInvite(byId, inviteId): string | null`
    - `makeMove(id, cell): string | null`
    - `leave(id): string | null`
    - `viewFor(id): PlayerView`

- [ ] **Step 1: Delete the obsolete v1 protocol types**

```bash
git rm packages/mcp-server/src/lobby/protocol.ts
```

- [ ] **Step 2: Write the failing tests** (replace the whole file)

```ts
// packages/mcp-server/src/lobby/lobby.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Lobby, PRESENCE_TTL_MS } from './lobby.js';

// Deterministic ids: id1, id2, ... ; controllable clock.
function makeCounter() { let n = 0; return () => `id${++n}`; }
function makeClock(start = 1000) { let t = start; return { now: () => t, advance: (ms: number) => { t += ms; } }; }

describe('Lobby (pull model)', () => {
  let genId: () => string;
  let clock: ReturnType<typeof makeClock>;
  let lobby: Lobby;
  beforeEach(() => {
    genId = makeCounter();
    clock = makeClock();
    lobby = new Lobby(genId, clock.now);
  });

  // helper: register a fresh named player, return its id
  function join(name: string): string {
    const id = lobby.connect();
    lobby.register(id, name);
    return id;
  }

  it('connect returns a fresh id and starts on the name phase', () => {
    const id = lobby.connect();
    expect(typeof id).toBe('string');
    expect(lobby.viewFor(id).phase).toBe('name');
  });

  it('register moves a player to the lobby phase', () => {
    const a = lobby.connect();
    expect(lobby.register(a, 'Alice')).toBeNull();
    expect(lobby.viewFor(a).phase).toBe('lobby');
    expect(lobby.viewFor(a).you.name).toBe('Alice');
  });

  it('register rejects an empty name', () => {
    const a = lobby.connect();
    expect(lobby.register(a, '   ')).toMatch(/name/i);
  });

  it('a player sees other registered players (not themselves)', () => {
    const a = join('Alice');
    join('Bob');
    const view = lobby.viewFor(a);
    expect(view.players.map((p) => p.name)).toEqual(['Bob']);
    expect(view.players[0].status).toBe('idle');
  });

  it('invite surfaces a pending invite to the target only', () => {
    const a = join('Alice');
    const b = join('Bob');
    expect(lobby.invite(a, b)).toBeNull();
    expect(lobby.viewFor(b).invite).toMatchObject({ fromName: 'Alice' });
    expect(lobby.viewFor(a).invite).toBeNull();
  });

  it('invite rejects a busy target', () => {
    const a = join('Alice');
    const b = join('Bob');
    const c = join('Carol');
    const inv = lobby.viewFor(b); // none yet
    expect(inv.invite).toBeNull();
    lobby.invite(a, b);
    const inviteId = lobby.viewFor(b).invite!.inviteId;
    lobby.acceptInvite(b, inviteId); // a & b now in a game
    expect(lobby.invite(c, a)).toMatch(/busy/i);
  });

  it('accepting an invite starts a game: inviter is X and moves first', () => {
    const a = join('Alice');
    const b = join('Bob');
    lobby.invite(a, b);
    const inviteId = lobby.viewFor(b).invite!.inviteId;
    expect(lobby.acceptInvite(b, inviteId)).toBeNull();
    const av = lobby.viewFor(a).game!;
    const bv = lobby.viewFor(b).game!;
    expect(av.yourMark).toBe('X');
    expect(bv.yourMark).toBe('O');
    expect(av.yourTurn).toBe(true);
    expect(bv.yourTurn).toBe(false);
    expect(av.opponentName).toBe('Bob');
  });

  it('rejects a move played out of turn', () => {
    const a = join('Alice');
    const b = join('Bob');
    lobby.invite(a, b);
    lobby.acceptInvite(b, lobby.viewFor(b).invite!.inviteId);
    expect(lobby.makeMove(b, 0)).toMatch(/turn/i); // O cannot move first
  });

  it('rejects a move on an occupied cell', () => {
    const a = join('Alice');
    const b = join('Bob');
    lobby.invite(a, b);
    lobby.acceptInvite(b, lobby.viewFor(b).invite!.inviteId);
    expect(lobby.makeMove(a, 0)).toBeNull();
    expect(lobby.makeMove(b, 0)).toMatch(/turn|taken|occupied/i);
  });

  it('a winning move ends the game and is RETAINED for both players to see', () => {
    const a = join('Alice');
    const b = join('Bob');
    lobby.invite(a, b);
    lobby.acceptInvite(b, lobby.viewFor(b).invite!.inviteId);
    // X(a): 0,1,2 ; O(b): 3,4
    lobby.makeMove(a, 0); lobby.makeMove(b, 3);
    lobby.makeMove(a, 1); lobby.makeMove(b, 4);
    expect(lobby.makeMove(a, 2)).toBeNull(); // X wins top row
    const av = lobby.viewFor(a).game!;
    const bv = lobby.viewFor(b).game!;
    expect(av.over).toBe(true);
    expect(av.result).toEqual({ status: 'won', winner: 'X' });
    expect(bv.over).toBe(true); // opponent still sees the finished game
    expect(av.yourTurn).toBe(false);
  });

  it('leaving a finished game returns the player to the lobby', () => {
    const a = join('Alice');
    const b = join('Bob');
    lobby.invite(a, b);
    lobby.acceptInvite(b, lobby.viewFor(b).invite!.inviteId);
    lobby.makeMove(a, 0); lobby.makeMove(b, 3);
    lobby.makeMove(a, 1); lobby.makeMove(b, 4);
    lobby.makeMove(a, 2); // over
    expect(lobby.leave(a)).toBeNull();
    expect(lobby.viewFor(a).phase).toBe('lobby');
  });

  it('leaving an ACTIVE game notifies the opponent via a one-shot notice', () => {
    const a = join('Alice');
    const b = join('Bob');
    lobby.invite(a, b);
    lobby.acceptInvite(b, lobby.viewFor(b).invite!.inviteId);
    lobby.leave(a);
    const first = lobby.viewFor(b);
    expect(first.phase).toBe('lobby');
    expect(first.notice).toMatch(/left/i);
    // notice is one-shot: cleared after it is read once
    expect(lobby.viewFor(b).notice).toBeNull();
  });

  it('declineInvite notifies the inviter once', () => {
    const a = join('Alice');
    const b = join('Bob');
    lobby.invite(a, b);
    lobby.declineInvite(b, lobby.viewFor(b).invite!.inviteId);
    expect(lobby.viewFor(a).notice).toMatch(/declined/i);
  });

  it('sweep removes a player idle past the TTL and ends their active game', () => {
    const a = join('Alice');
    const b = join('Bob');
    lobby.invite(a, b);
    lobby.acceptInvite(b, lobby.viewFor(b).invite!.inviteId);
    clock.advance(PRESENCE_TTL_MS + 1);
    lobby.touch(b);   // b is still active; a is now stale
    lobby.sweep();
    const bv = lobby.viewFor(b);
    expect(bv.phase).toBe('lobby');          // game ended
    expect(bv.notice).toMatch(/left/i);
    expect(lobby.viewFor(a).phase).toBe('name'); // a was removed entirely
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/mcp-server/src/lobby/lobby.test.ts`
Expected: FAIL — the new `Lobby` API (`connect()` returning an id, `viewFor`, etc.) does not exist yet.

- [ ] **Step 4: Write the implementation** (replace the whole file)

```ts
// packages/mcp-server/src/lobby/lobby.ts
import {
  applyMove, createBoard, getResult, InvalidMoveError,
  type Board, type Mark, type GameResult,
} from '../game/game.js';

export const PRESENCE_TTL_MS = 10000;
const MAX_NAME = 24;

export type PlayerId = string;
export type Phase = 'name' | 'lobby' | 'game';

export interface PublicPlayer { id: PlayerId; name: string; status: 'idle' | 'busy'; }

export interface GameView {
  board: Board;
  yourMark: Mark;
  yourTurn: boolean;
  opponentName: string;
  over: boolean;
  result: GameResult | null;
}

export interface PlayerView {
  phase: Phase;
  you: { id: PlayerId; name: string | null };
  players: PublicPlayer[];
  invite: { inviteId: string; fromName: string } | null;
  game: GameView | null;
  notice: string | null;
  error: string | null;
}

interface PlayerState {
  id: PlayerId;
  name: string | null;
  gameId: string | null;
  lastSeen: number;
  notice: string | null;
}
interface Invite { id: string; fromId: PlayerId; toId: PlayerId; }
interface Game {
  id: string;
  board: Board;
  turn: Mark;
  marks: Record<PlayerId, Mark>;
  players: [PlayerId, PlayerId];
  over: boolean;
  result: GameResult | null;
}

function defaultGenId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class Lobby {
  private players = new Map<PlayerId, PlayerState>();
  private invites = new Map<string, Invite>();
  private games = new Map<string, Game>();

  constructor(
    private genId: () => string = defaultGenId,
    private clock: () => number = () => Date.now(),
  ) {}

  connect(): PlayerId {
    const id = this.genId();
    this.players.set(id, { id, name: null, gameId: null, lastSeen: this.clock(), notice: null });
    return id;
  }

  touch(id: PlayerId): void {
    const p = this.players.get(id);
    if (p) p.lastSeen = this.clock();
  }

  sweep(): void {
    const cutoff = this.clock() - PRESENCE_TTL_MS;
    for (const p of [...this.players.values()]) {
      if (p.lastSeen < cutoff) this.removePlayer(p.id, 'Your opponent left the game.');
    }
  }

  register(id: PlayerId, name: string): string | null {
    const p = this.players.get(id);
    if (!p) return 'unknown player';
    const trimmed = name.trim().slice(0, MAX_NAME);
    if (!trimmed) return 'name required';
    p.name = trimmed;
    return null;
  }

  invite(fromId: PlayerId, targetId: PlayerId): string | null {
    if (fromId === targetId) return 'cannot invite yourself';
    const from = this.players.get(fromId);
    const target = this.players.get(targetId);
    if (!from || !from.name) return 'register first';
    if (!target || !target.name) return 'player not available';
    if (from.gameId || target.gameId) return 'player is busy';
    const invite: Invite = { id: this.genId(), fromId, toId: targetId };
    this.invites.set(invite.id, invite);
    return null;
  }

  acceptInvite(byId: PlayerId, inviteId: string): string | null {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.toId !== byId) return 'invite not found';
    this.invites.delete(inviteId);
    const a = this.players.get(invite.fromId);
    const b = this.players.get(invite.toId);
    if (!a || !a.name || a.gameId || !b || !b.name || b.gameId) return 'player no longer available';
    const game: Game = {
      id: this.genId(),
      board: createBoard(),
      turn: 'X',
      marks: { [a.id]: 'X', [b.id]: 'O' },
      players: [a.id, b.id],
      over: false,
      result: null,
    };
    this.games.set(game.id, game);
    a.gameId = game.id;
    b.gameId = game.id;
    return null;
  }

  declineInvite(byId: PlayerId, inviteId: string): string | null {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.toId !== byId) return null;
    this.invites.delete(inviteId);
    const from = this.players.get(invite.fromId);
    if (from) from.notice = 'Your invite was declined.';
    return null;
  }

  makeMove(id: PlayerId, cell: number): string | null {
    const p = this.players.get(id);
    if (!p || !p.gameId) return 'not in a game';
    const game = this.games.get(p.gameId);
    if (!game) return 'game not found';
    if (game.over) return 'game is over';
    const mark = game.marks[id];
    if (game.turn !== mark) return 'not your turn';
    try {
      game.board = applyMove(game.board, cell, mark);
    } catch (err) {
      if (err instanceof InvalidMoveError) return err.message;
      throw err;
    }
    const result = getResult(game.board);
    if (result.status !== 'ongoing') {
      game.over = true;
      game.result = result;
    } else {
      game.turn = mark === 'X' ? 'O' : 'X';
    }
    return null;
  }

  leave(id: PlayerId): string | null {
    const p = this.players.get(id);
    if (!p || !p.gameId) return null;
    const game = this.games.get(p.gameId);
    p.gameId = null;
    if (!game) return null;
    if (!game.over) {
      const oppId = game.players.find((x) => x !== id);
      const opp = oppId ? this.players.get(oppId) : undefined;
      if (opp && opp.gameId === game.id) {
        opp.notice = 'Your opponent left the game.';
        opp.gameId = null;
      }
      this.games.delete(game.id);
    } else if (game.players.every((pid) => this.players.get(pid)?.gameId !== game.id)) {
      this.games.delete(game.id);
    }
    return null;
  }

  viewFor(id: PlayerId): PlayerView {
    const p = this.players.get(id);
    if (!p) {
      return { phase: 'name', you: { id, name: null }, players: [], invite: null, game: null, notice: null, error: null };
    }
    const notice = p.notice;
    p.notice = null;
    const game = p.gameId ? this.games.get(p.gameId) ?? null : null;
    const phase: Phase = !p.name ? 'name' : game ? 'game' : 'lobby';
    return {
      phase,
      you: { id: p.id, name: p.name },
      players: this.publicPlayers(id),
      invite: this.inviteFor(id),
      game: game ? this.gameView(game, id) : null,
      notice,
      error: null,
    };
  }

  private removePlayer(id: PlayerId, opponentNotice: string): void {
    const p = this.players.get(id);
    if (!p) return;
    if (p.gameId) {
      const game = this.games.get(p.gameId);
      if (game && !game.over) {
        const oppId = game.players.find((x) => x !== id);
        const opp = oppId ? this.players.get(oppId) : undefined;
        if (opp && opp.gameId === game.id) {
          opp.notice = opponentNotice;
          opp.gameId = null;
        }
        this.games.delete(game.id);
      } else if (game && game.over &&
        game.players.every((pid) => pid === id || this.players.get(pid)?.gameId !== game.id)) {
        this.games.delete(game.id);
      }
    }
    for (const [invId, inv] of this.invites) {
      if (inv.fromId === id || inv.toId === id) this.invites.delete(invId);
    }
    this.players.delete(id);
  }

  private publicPlayers(selfId: PlayerId): PublicPlayer[] {
    const out: PublicPlayer[] = [];
    for (const p of this.players.values()) {
      if (p.id === selfId || !p.name) continue;
      out.push({ id: p.id, name: p.name, status: p.gameId ? 'busy' : 'idle' });
    }
    return out;
  }

  private inviteFor(id: PlayerId): { inviteId: string; fromName: string } | null {
    for (const inv of this.invites.values()) {
      if (inv.toId === id) {
        const from = this.players.get(inv.fromId);
        if (from && from.name) return { inviteId: inv.id, fromName: from.name };
      }
    }
    return null;
  }

  private gameView(game: Game, id: PlayerId): GameView {
    const oppId = game.players.find((x) => x !== id)!;
    const opp = this.players.get(oppId);
    return {
      board: game.board,
      yourMark: game.marks[id],
      yourTurn: !game.over && game.turn === game.marks[id],
      opponentName: opp?.name ?? 'opponent',
      over: game.over,
      result: game.result,
    };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/mcp-server/src/lobby/lobby.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 6: Confirm the package still type-checks**

Run: `npm run build --workspace packages/mcp-server`
Expected: tsc exit 0. (No `index.ts` yet — `tsc` compiles the library modules; that's fine.)

- [ ] **Step 7: Commit**

```bash
git add packages/mcp-server/src/lobby
git commit -m "feat(lobby): pull-model rewrite with viewFor, heartbeat presence, game-over retention"
```

---

## Task 3: Tool handlers

Pure functions that wrap the `Lobby` for the MCP tool layer: each touches presence, applies a mutation, and returns a `CallToolResult`-shaped reply whose `structuredContent` is the player's `PlayerView` (with any mutation error surfaced in `view.error`). `join_game` additionally allocates the `playerId`. Keeping these as pure functions makes the tool surface unit-testable without the MCP transport.

**Files:**
- Create: `packages/mcp-server/src/tools/handlers.ts`
- Test: `packages/mcp-server/src/tools/handlers.test.ts`

**Interfaces:**
- Consumes: `Lobby`, `PlayerView` from `../lobby/lobby.js`.
- Produces:
  - `interface ToolReply { content: { type: 'text'; text: string }[]; structuredContent: unknown }`
  - `interface JoinResult { playerId: string; view: PlayerView }`
  - `function handleJoin(lobby: Lobby): ToolReply` — structuredContent is `JoinResult`
  - `function handleSetName(lobby, args: { playerId: string; name: string }): ToolReply`
  - `function handleGetState(lobby, args: { playerId: string }): ToolReply`
  - `function handleInvite(lobby, args: { playerId: string; targetId: string }): ToolReply`
  - `function handleAcceptInvite(lobby, args: { playerId: string; inviteId: string }): ToolReply`
  - `function handleDeclineInvite(lobby, args: { playerId: string; inviteId: string }): ToolReply`
  - `function handleMove(lobby, args: { playerId: string; cell: number }): ToolReply`
  - `function handleLeave(lobby, args: { playerId: string }): ToolReply`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/mcp-server/src/tools/handlers.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Lobby } from '../lobby/lobby.js';
import {
  handleJoin, handleSetName, handleGetState, handleInvite,
  handleAcceptInvite, handleMove, type JoinResult,
} from './handlers.js';
import type { PlayerView } from '../lobby/lobby.js';

function makeCounter() { let n = 0; return () => `id${++n}`; }

describe('tool handlers', () => {
  let lobby: Lobby;
  beforeEach(() => { lobby = new Lobby(makeCounter()); });

  it('handleJoin allocates a playerId and returns an initial name-phase view', () => {
    const reply = handleJoin(lobby);
    const data = reply.structuredContent as JoinResult;
    expect(typeof data.playerId).toBe('string');
    expect(data.view.phase).toBe('name');
    // text content mirrors structuredContent for non-UI hosts
    expect(JSON.parse(reply.content[0].text)).toEqual(data);
  });

  it('handleSetName registers and returns a lobby-phase view', () => {
    const { playerId } = handleJoin(lobby).structuredContent as JoinResult;
    const view = handleSetName(lobby, { playerId, name: 'Alice' }).structuredContent as PlayerView;
    expect(view.phase).toBe('lobby');
    expect(view.you.name).toBe('Alice');
    expect(view.error).toBeNull();
  });

  it('handleGetState reflects another player joining', () => {
    const a = (handleJoin(lobby).structuredContent as JoinResult).playerId;
    handleSetName(lobby, { playerId: a, name: 'Alice' });
    const b = (handleJoin(lobby).structuredContent as JoinResult).playerId;
    handleSetName(lobby, { playerId: b, name: 'Bob' });
    const view = handleGetState(lobby, { playerId: a }).structuredContent as PlayerView;
    expect(view.players.map((p) => p.name)).toEqual(['Bob']);
  });

  it('a full invite→accept→move flow drives both players into a game', () => {
    const a = (handleJoin(lobby).structuredContent as JoinResult).playerId;
    handleSetName(lobby, { playerId: a, name: 'Alice' });
    const b = (handleJoin(lobby).structuredContent as JoinResult).playerId;
    handleSetName(lobby, { playerId: b, name: 'Bob' });
    handleInvite(lobby, { playerId: a, targetId: b });
    const bView = handleGetState(lobby, { playerId: b }).structuredContent as PlayerView;
    handleAcceptInvite(lobby, { playerId: b, inviteId: bView.invite!.inviteId });
    const moved = handleMove(lobby, { playerId: a, cell: 4 }).structuredContent as PlayerView;
    expect(moved.game!.board[4]).toBe('X');
  });

  it('an invalid move surfaces an error in the view without throwing', () => {
    const a = (handleJoin(lobby).structuredContent as JoinResult).playerId;
    handleSetName(lobby, { playerId: a, name: 'Alice' });
    const view = handleMove(lobby, { playerId: a, cell: 0 }).structuredContent as PlayerView;
    expect(view.error).toMatch(/not in a game/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/mcp-server/src/tools/handlers.test.ts`
Expected: FAIL — `Cannot find module './handlers.js'`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/mcp-server/src/tools/handlers.ts
import type { Lobby, PlayerView } from '../lobby/lobby.js';

export interface ToolReply {
  content: { type: 'text'; text: string }[];
  structuredContent: unknown;
}

export interface JoinResult {
  playerId: string;
  view: PlayerView;
}

function reply(data: unknown): ToolReply {
  return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
}

/** view for `playerId` with the mutation's error (if any) merged in. */
function viewWithError(lobby: Lobby, playerId: string, error: string | null): ToolReply {
  return reply({ ...lobby.viewFor(playerId), error });
}

export function handleJoin(lobby: Lobby): ToolReply {
  const playerId = lobby.connect();
  return reply({ playerId, view: lobby.viewFor(playerId) });
}

export function handleSetName(lobby: Lobby, args: { playerId: string; name: string }): ToolReply {
  lobby.touch(args.playerId);
  const error = lobby.register(args.playerId, args.name);
  return viewWithError(lobby, args.playerId, error);
}

export function handleGetState(lobby: Lobby, args: { playerId: string }): ToolReply {
  lobby.touch(args.playerId);
  lobby.sweep();
  return reply(lobby.viewFor(args.playerId));
}

export function handleInvite(lobby: Lobby, args: { playerId: string; targetId: string }): ToolReply {
  lobby.touch(args.playerId);
  const error = lobby.invite(args.playerId, args.targetId);
  return viewWithError(lobby, args.playerId, error);
}

export function handleAcceptInvite(lobby: Lobby, args: { playerId: string; inviteId: string }): ToolReply {
  lobby.touch(args.playerId);
  const error = lobby.acceptInvite(args.playerId, args.inviteId);
  return viewWithError(lobby, args.playerId, error);
}

export function handleDeclineInvite(lobby: Lobby, args: { playerId: string; inviteId: string }): ToolReply {
  lobby.touch(args.playerId);
  const error = lobby.declineInvite(args.playerId, args.inviteId);
  return viewWithError(lobby, args.playerId, error);
}

export function handleMove(lobby: Lobby, args: { playerId: string; cell: number }): ToolReply {
  lobby.touch(args.playerId);
  const error = lobby.makeMove(args.playerId, args.cell);
  return viewWithError(lobby, args.playerId, error);
}

export function handleLeave(lobby: Lobby, args: { playerId: string }): ToolReply {
  lobby.touch(args.playerId);
  const error = lobby.leave(args.playerId);
  return viewWithError(lobby, args.playerId, error);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/mcp-server/src/tools/handlers.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/tools
git commit -m "feat(tools): pure tool handlers returning PlayerView snapshots"
```

---

## Task 4: The MCP App widget (inline HTML)

A single self-contained `widget.html` — the sandboxed iframe the host renders. It bridges to the host over `postMessage` (JSON-RPC), reads its `playerId` from `join_game`'s pushed result, renders the three screens, calls the app-only tools on user actions, and polls `get_state` every 1.5s. No build step.

**Files:**
- Create: `packages/mcp-server/src/widget/widget.html`
- Test: `packages/mcp-server/src/widget/widget.structure.test.ts`

**Interfaces:**
- Consumes (at runtime, via the host bridge): the `join_game` result shape `{ playerId, view }` (pushed via `ui/notifications/tool-result`), and the `PlayerView` returned by `tools/call` to `get_state`/`set_name`/`invite`/`accept_invite`/`decline_invite`/`make_move`/`leave`.
- Produces: a static HTML asset the server registers as the `ui://` resource. The structure test asserts the contract markers exist.

- [ ] **Step 1: Write the failing structure test**

This test guards the bridge/polling contract so a future edit can't silently drop the handshake, the poller, or a tool call.

```ts
// packages/mcp-server/src/widget/widget.structure.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const html = readFileSync(fileURLToPath(new URL('./widget.html', import.meta.url)), 'utf8');

describe('widget.html contract', () => {
  it('performs the ui/initialize handshake and signals initialized', () => {
    expect(html).toContain('ui/initialize');
    expect(html).toContain('ui/notifications/initialized');
    expect(html).toContain('2026-01-26');
  });

  it('handles the host tool-result push and answers ping', () => {
    expect(html).toContain('ui/notifications/tool-result');
    expect(html).toContain('"ping"');
  });

  it('calls every app tool it needs and polls get_state', () => {
    for (const tool of ['set_name', 'get_state', 'invite', 'accept_invite', 'decline_invite', 'make_move', 'leave']) {
      expect(html).toContain(tool);
    }
    expect(html).toMatch(/setInterval/);
    expect(html).toContain('tools/call');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/mcp-server/src/widget/widget.structure.test.ts`
Expected: FAIL — `widget.html` does not exist (ENOENT).

- [ ] **Step 3: Write the widget**

```html
<!-- packages/mcp-server/src/widget/widget.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <title>Tic-Tac-Toe</title>
  <style>
    :root { --bg: #ffffff; --fg: #111111; --muted: #666; --line: #ccc; --accent: #2d6cdf; }
    :root[data-theme="dark"] { --bg: #1a1a1a; --fg: #f0f0f0; --muted: #999; --line: #444; --accent: #5b8def; }
    body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg);
           font-family: system-ui, sans-serif; }
    h2 { margin: 0 0 12px; font-size: 1.1rem; }
    .muted { color: var(--muted); }
    .banner { background: color-mix(in srgb, var(--accent) 15%, transparent);
              padding: 8px 10px; border-radius: 6px; margin-bottom: 12px; }
    input, button { font: inherit; padding: 6px 10px; border-radius: 6px; }
    input { border: 1px solid var(--line); background: var(--bg); color: var(--fg); }
    button { border: 1px solid var(--accent); background: var(--accent); color: #fff; cursor: pointer; }
    button.secondary { background: transparent; color: var(--accent); }
    .row { display: flex; gap: 8px; align-items: center; margin: 6px 0; }
    .board { display: grid; grid-template-columns: repeat(3, 64px); gap: 4px; margin-top: 8px; }
    .cell { width: 64px; height: 64px; font-size: 1.8rem; display: flex; align-items: center;
            justify-content: center; border: 1px solid var(--line); border-radius: 8px;
            background: var(--bg); color: var(--fg); cursor: pointer; }
    .cell:disabled { cursor: default; opacity: 0.9; }
  </style>
</head>
<body>
  <div id="app" class="muted">Connecting…</div>
  <script type="module">
    const PROTOCOL_VERSION = '2026-01-26';
    const POLL_MS = 1500;
    const root = document.getElementById('app');

    let nextId = 1;
    const pending = new Map();
    let playerId = null;
    let view = null;
    let polling = null;

    function send(msg) { window.parent.postMessage({ jsonrpc: '2.0', ...msg }, '*'); }
    function request(method, params) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        send({ id, method, params });
      });
    }
    async function callTool(name, args) {
      const result = await request('tools/call', { name, arguments: args });
      if (result && result.isError) throw new Error('tool error: ' + name);
      const sc = result && result.structuredContent;
      if (sc !== undefined && sc !== null) return sc;
      const text = result && result.content && result.content[0] && result.content[0].text;
      return text ? JSON.parse(text) : {};
    }

    function applyTheme(theme) {
      if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
    }

    // A tool reply is either the join result { playerId, view } or a bare PlayerView.
    function ingest(data) {
      if (!data) return;
      if (data.playerId && data.view) { playerId = data.playerId; view = data.view; }
      else if (data.phase) { view = data; }
      render();
    }

    window.addEventListener('message', (event) => {
      if (event.source !== window.parent) return;
      const msg = event.data;
      if (!msg || msg.jsonrpc !== '2.0') return;
      if (msg.id !== undefined && msg.method === undefined) {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message || 'request failed'));
        else p.resolve(msg.result);
        return;
      }
      if (msg.method === 'ui/notifications/tool-result') {
        ingest(msg.params && msg.params.structuredContent);
      } else if (msg.method === 'ui/notifications/host-context-changed') {
        applyTheme(msg.params && msg.params.theme);
      } else if (msg.method === 'ping' && msg.id !== undefined) {
        send({ id: msg.id, result: {} });
      }
    });

    function startPolling() {
      if (polling) return;
      polling = setInterval(async () => {
        if (!playerId) return;
        try { ingest(await callTool('get_state', { playerId })); } catch { /* ignore */ }
      }, POLL_MS);
    }

    // ---- rendering ----
    function el(tag, props = {}, ...kids) {
      const node = document.createElement(tag);
      Object.assign(node, props);
      for (const k of kids) node.append(k);
      return node;
    }

    function render() {
      root.className = '';
      root.innerHTML = '';
      if (!view) { root.textContent = 'Loading…'; return; }
      if (view.notice) root.append(el('div', { className: 'banner', textContent: view.notice }));
      if (view.error) root.append(el('div', { className: 'banner', textContent: view.error }));
      if (view.invite) renderInvite();
      if (view.phase === 'name') renderName();
      else if (view.phase === 'lobby') renderLobby();
      else if (view.phase === 'game') renderGame();
    }

    function renderName() {
      const input = el('input', { placeholder: 'Your name' });
      const join = el('button', { textContent: 'Join lobby' });
      join.onclick = async () => {
        const name = input.value.trim();
        if (name) ingest(await callTool('set_name', { playerId, name }));
      };
      root.append(el('h2', { textContent: 'Pick a name' }), el('div', { className: 'row' }, input, join));
    }

    function renderLobby() {
      root.append(el('h2', { textContent: `Lobby — you are ${view.you.name}` }));
      const others = view.players;
      if (others.length === 0) {
        root.append(el('p', { className: 'muted', textContent: 'Waiting for other players…' }));
      }
      for (const p of others) {
        const row = el('div', { className: 'row' }, el('span', { textContent: `${p.name} (${p.status})` }));
        if (p.status === 'idle') {
          const btn = el('button', { textContent: 'Invite' });
          btn.onclick = async () => ingest(await callTool('invite', { playerId, targetId: p.id }));
          row.append(btn);
        }
        root.append(row);
      }
    }

    function renderInvite() {
      const wrap = el('div', { className: 'banner' }, el('span', { textContent: `${view.invite.fromName} invited you. ` }));
      const accept = el('button', { textContent: 'Accept' });
      accept.onclick = async () => ingest(await callTool('accept_invite', { playerId, inviteId: view.invite.inviteId }));
      const decline = el('button', { className: 'secondary', textContent: 'Decline' });
      decline.onclick = async () => ingest(await callTool('decline_invite', { playerId, inviteId: view.invite.inviteId }));
      wrap.append(accept, decline);
      root.append(wrap);
    }

    function renderGame() {
      const g = view.game;
      root.append(el('h2', { textContent: `vs ${g.opponentName} — you are ${g.yourMark}` }));
      let status;
      if (g.over) {
        status = g.result && g.result.status === 'won'
          ? `${g.result.winner} wins!`
          : "It's a draw.";
      } else {
        status = g.yourTurn ? 'Your turn' : "Opponent's turn";
      }
      root.append(el('p', { className: 'muted', textContent: status }));
      const board = el('div', { className: 'board' });
      g.board.forEach((cell, pos) => {
        const c = el('button', { className: 'cell', textContent: cell || '' });
        c.disabled = g.over || !g.yourTurn || cell !== null;
        c.onclick = async () => ingest(await callTool('make_move', { playerId, cell: pos }));
        board.append(c);
      });
      root.append(board);
      if (g.over) {
        const back = el('button', { className: 'secondary', textContent: 'Back to lobby' });
        back.onclick = async () => ingest(await callTool('leave', { playerId }));
        root.append(el('div', { className: 'row' }, back));
      }
    }

    // ---- handshake ----
    const init = await request('ui/initialize', {
      appInfo: { name: 'Tic-Tac-Toe', version: '1.0.0' },
      appCapabilities: {},
      protocolVersion: PROTOCOL_VERSION,
    });
    applyTheme(init && init.hostContext && init.hostContext.theme);
    send({ method: 'ui/notifications/initialized', params: {} });
    startPolling();
  </script>
</body>
</html>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/mcp-server/src/widget/widget.structure.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/widget
git commit -m "feat(widget): inline MCP App with host bridge, screens, and get_state polling"
```

---

## Task 5: MCP Apps server wiring (Streamable HTTP)

Wire the handlers + widget into an MCP Apps server: register `join_game` (model-facing, `_meta.ui.resourceUri`) and the seven app-only tools (`_meta.ui.visibility: ["app"]`), plus the `ui://` widget resource (mimeType `text/html;profile=mcp-app`). All tool handlers close over a single process-level `Lobby`. Serve over stateless Streamable HTTP at `POST /mcp`, with `GET /healthz`.

**Files:**
- Create: `packages/mcp-server/src/index.ts`

**Interfaces:**
- Consumes: handlers from `./tools/handlers.js`; `Lobby` from `./lobby/lobby.js`; the widget HTML file at `./widget/widget.html`.
- Produces: a runnable server. `GET /healthz` → `200 "ok"`. `POST /mcp` → MCP Streamable HTTP. Listens on `MCP_PORT` (default 8765). The `ui://tic-tac-toe/game.html` resource and the eight tools are registered on every per-request server instance, all sharing the module-level `Lobby`.

**Interface note (verify against the installed `@modelcontextprotocol/ext-apps`):** this task uses `registerAppTool`, `registerAppResource`, and `RESOURCE_MIME_TYPE` from `@modelcontextprotocol/ext-apps/server`, and `_meta: { ui: { resourceUri } }` / `_meta: { ui: { visibility: ['app'] } }`. If the installed package exposes these under different names or shapes, adapt to the installed API (the research brief `.git/sdd/mcp-apps-research.md` documents the expected shape; the installed package wins). Tool input schemas are zod raw shapes.

- [ ] **Step 1: Write the server**

```ts
// packages/mcp-server/src/index.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from '@modelcontextprotocol/ext-apps/server';
import { Lobby } from './lobby/lobby.js';
import {
  handleJoin, handleSetName, handleGetState, handleInvite,
  handleAcceptInvite, handleDeclineInvite, handleMove, handleLeave,
} from './tools/handlers.js';

const PORT = Number(process.env.MCP_PORT ?? 8765);
const RESOURCE_URI = 'ui://tic-tac-toe/game.html';
const WIDGET_HTML = readFileSync(fileURLToPath(new URL('./widget/widget.html', import.meta.url)), 'utf8');

// Single shared brain for the whole process (single replica — see design §4).
const lobby = new Lobby();

function buildServer(): McpServer {
  const server = new McpServer({ name: 'tic-tac-toe', version: '2.0.0' });

  // Model-facing entry tool; links to the widget so the host renders it on call.
  registerAppTool(server, 'join_game', {
    title: 'Join Tic-Tac-Toe',
    description: 'Open the tic-tac-toe lobby to find an opponent and play.',
    inputSchema: {},
    _meta: { ui: { resourceUri: RESOURCE_URI } },
  }, () => handleJoin(lobby));

  // App-only tools (hidden from the model); the widget calls these.
  const appOnly = { ui: { visibility: ['app'] as Array<'app'> } };

  registerAppTool(server, 'set_name', {
    title: 'Set Name', description: 'Register a display name.',
    inputSchema: { playerId: z.string(), name: z.string() }, _meta: appOnly,
  }, (args) => handleSetName(lobby, args));

  registerAppTool(server, 'get_state', {
    title: 'Get State', description: 'Return the current view for polling.',
    inputSchema: { playerId: z.string() }, _meta: appOnly,
  }, (args) => handleGetState(lobby, args));

  registerAppTool(server, 'invite', {
    title: 'Invite', description: 'Invite another player.',
    inputSchema: { playerId: z.string(), targetId: z.string() }, _meta: appOnly,
  }, (args) => handleInvite(lobby, args));

  registerAppTool(server, 'accept_invite', {
    title: 'Accept Invite', description: 'Accept a pending invite.',
    inputSchema: { playerId: z.string(), inviteId: z.string() }, _meta: appOnly,
  }, (args) => handleAcceptInvite(lobby, args));

  registerAppTool(server, 'decline_invite', {
    title: 'Decline Invite', description: 'Decline a pending invite.',
    inputSchema: { playerId: z.string(), inviteId: z.string() }, _meta: appOnly,
  }, (args) => handleDeclineInvite(lobby, args));

  registerAppTool(server, 'make_move', {
    title: 'Make Move', description: 'Place your mark on a cell (0-8).',
    inputSchema: { playerId: z.string(), cell: z.number().int().min(0).max(8) }, _meta: appOnly,
  }, (args) => handleMove(lobby, args));

  registerAppTool(server, 'leave', {
    title: 'Leave', description: 'Leave the current game and return to the lobby.',
    inputSchema: { playerId: z.string() }, _meta: appOnly,
  }, (args) => handleLeave(lobby, args));

  // The widget resource the host fetches and sandboxes.
  registerAppResource(server, RESOURCE_URI, RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE, description: 'Tic-Tac-Toe game widget' },
    async () => ({
      contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: WIDGET_HTML }],
    }),
  );

  return server;
}

const app = express();
app.use(express.json());
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.post('/mcp', async (req, res, next) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    next(err);
  }
});

app.listen(PORT, () => {
  console.log(`[mcp-server] tic-tac-toe MCP App on :${PORT} (POST /mcp)`);
});
```

- [ ] **Step 2: Type-check the package**

Run: `npm run build --workspace packages/mcp-server`
Expected: tsc exit 0. If the build fails because `registerAppTool`/`registerAppResource`/`RESOURCE_MIME_TYPE` or the `_meta` shape differ in the installed `@modelcontextprotocol/ext-apps`, inspect `node_modules/@modelcontextprotocol/ext-apps` (its `package.json` `exports` and `dist` `.d.ts`) and adapt the imports/usage to the real API, then re-run. Keep the registered tool/resource semantics identical (one model-facing `join_game` with the resource link; seven app-only tools; one `text/html;profile=mcp-app` resource).

- [ ] **Step 3: Smoke-test health + that the server builds and the widget loads**

Run:
```bash
MCP_PORT=8799 node packages/mcp-server/dist/index.js &
sleep 1 && curl -s localhost:8799/healthz && echo && kill %1
```
Expected: prints `ok`. (If 8799 is busy, pick another free port.)

- [ ] **Step 4: Full suite**

Run: `npm test`
Expected: PASS — `game` (8) + `lobby` (15) + `handlers` (5) + `widget.structure` (3).

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/index.ts
git commit -m "feat(mcp-server): MCP Apps server wiring join_game + app tools + widget resource"
```

---

## Task 6: Docker, Compose & docs (single service)

Collapse to one image/service. Remove the v1 backend service, the SPA build, and `PUBLIC_BACKEND_URL`. Rewrite the README for the MCP Apps flow (one cloudflared host, add-the-MCP-URL, inline play).

**Files:**
- Replace: `packages/mcp-server/Dockerfile`
- Replace: `docker-compose.yml`
- Replace: `.env.example`
- Replace: `README.md`
- Delete: `packages/backend/Dockerfile` (already gone with the package in Task 1 — confirm it's absent)

**Interfaces:**
- Consumes: the built `mcp-server`.
- Produces: `docker compose up` runs one service serving `/mcp` and `/healthz` on `MCP_PORT`.

- [ ] **Step 1: Replace `packages/mcp-server/Dockerfile`** (build from repo root so the workspace resolves)

```dockerfile
# packages/mcp-server/Dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/mcp-server/package.json packages/mcp-server/
RUN npm install
COPY packages/mcp-server packages/mcp-server
RUN npm run build --workspace packages/mcp-server

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/packages/mcp-server/package.json packages/mcp-server/package.json
COPY --from=build /app/packages/mcp-server/dist packages/mcp-server/dist
# the widget HTML is read at runtime from src; ship it alongside dist
COPY --from=build /app/packages/mcp-server/src/widget/widget.html packages/mcp-server/dist/widget/widget.html
EXPOSE 8765
CMD ["node", "packages/mcp-server/dist/index.js"]
```

**Note for the implementer:** `index.ts` reads `widget.html` via `new URL('./widget/widget.html', import.meta.url)` — at runtime that resolves to `dist/widget/widget.html`. `tsc` does not copy `.html` files, so the Dockerfile copies it into `dist/widget/`. For local `npm start` after `npm run build`, also copy it: add a `postbuild` step OR document running `mkdir -p packages/mcp-server/dist/widget && cp packages/mcp-server/src/widget/widget.html packages/mcp-server/dist/widget/`. **Implement this by adding a `build` script that copies the asset:** change `packages/mcp-server/package.json` `"build"` to `"tsc -p tsconfig.json && mkdir -p dist/widget && cp src/widget/widget.html dist/widget/widget.html"`. Update Task 5's build expectation accordingly (the copy makes `dist/widget/widget.html` exist for local `npm start`).

- [ ] **Step 2: Update the `build` script to copy the widget asset**

In `packages/mcp-server/package.json`, set:

```json
    "build": "tsc -p tsconfig.json && mkdir -p dist/widget && cp src/widget/widget.html dist/widget/widget.html",
```

- [ ] **Step 3: Replace `docker-compose.yml`**

```yaml
services:
  mcp-server:
    build:
      context: .
      dockerfile: packages/mcp-server/Dockerfile
    environment:
      - MCP_PORT=8765
    ports:
      - "${MCP_PORT:-8765}:8765"
```

- [ ] **Step 4: Replace `.env.example`**

```
# Port the cloudflared tunnel maps to the MCP server.
MCP_PORT=8765
```

- [ ] **Step 5: Replace `README.md`**

````markdown
# Tic-Tac-Toe over MCP — MCP Apps (v2)

Two players, each in their own MCP-enabled client (claude.ai), call the
`join_game` tool. It renders an **interactive MCP App widget** inline in the
chat where they find each other, invite, and play tic-tac-toe in real time.

## How it works

- A single **MCP server** (Streamable HTTP) holds all lobby/game state in
  memory and serves an inline HTML widget via the **MCP Apps** extension
  (`text/html;profile=mcp-app`, linked from `join_game` via `_meta.ui.resourceUri`).
- The widget is a sandboxed iframe that talks to the host over postMessage and
  **polls `get_state` every ~1.5s** for opponent moves and invites (MCP Apps has
  no server→widget push).
- Single replica: state is in-memory in one process.

## Run locally

```bash
npm install
npm test
docker compose up --build      # serves /mcp and /healthz on :8765
```

## Expose with cloudflared (one hostname)

```yaml
# ~/.cloudflared/config.yml
ingress:
  - hostname: ttt-mcp.example.com
    service: http://localhost:8765
  - service: http_status:404
```

Add `https://ttt-mcp.example.com/mcp` as a Streamable-HTTP MCP server in your
client. There is no separate web app and no `PUBLIC_BACKEND_URL` — the widget is
delivered inline through MCP.

## Manual end-to-end test

1. You and a friend each add `https://ttt-mcp.example.com/mcp` to your MCP client.
2. Both call **join_game** — the game board widget renders inline in each chat.
3. Both enter a display name — you see each other in the lobby (updates within ~1.5s).
4. One invites the other — the invite appears — the other accepts — the board appears.
5. Alternate moves to a win or draw — both widgets show the result.
6. Use **Back to lobby** to return; leaving mid-game shows the opponent a notice.

## Tests

```bash
npm test
```
````

- [ ] **Step 6: Build the image**

Run: `docker compose build`
Expected: builds with no error.

- [ ] **Step 7: Bring it up and smoke-test, then tear down**

Run:
```bash
docker compose up -d
sleep 3
curl -s localhost:8765/healthz && echo
docker compose down
```
Expected: prints `ok`. (If host port 8765 is busy, use `MCP_PORT=8799 docker compose up -d` and curl 8799.)

- [ ] **Step 8: Final full-suite verification**

Run: `npm test`
Expected: all `game` / `lobby` / `handlers` / `widget.structure` tests PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/mcp-server/Dockerfile packages/mcp-server/package.json docker-compose.yml .env.example README.md
git commit -m "chore: single-service docker, compose, and MCP Apps README for v2"
```

---

## Manual validation (the real spike test)

After `docker compose up` and the tunnel is live, two people add `https://<host>/mcp` in claude.ai, both call **join_game**, and confirm the board renders **inline** and a full game plays through (lobby → invite → moves → result), with opponent actions appearing within ~1.5s.

---

## Self-Review Notes

- **Spec coverage:** single stateful server (Task 5), ext-apps wiring with `text/html;profile=mcp-app` + `_meta.ui.resourceUri` + app-only `visibility` (Task 5), tool surface (Tasks 3+5), pull-model lobby with `viewFor`/heartbeat presence/game-over retention (Task 2), inline polling widget (Task 4), retire WS+SPA and drop `PUBLIC_BACKEND_URL` (Tasks 1+6), single-service Docker + one cloudflared host + MCP Apps README + manual e2e (Task 6). Each maps to a task.
- **Reused vs rewritten:** `game/` is moved unchanged (Task 1) and its tests carry over; `lobby/` is fully rewritten (Task 2); v1 `protocol.ts`/effects and the webview/WS backend are deleted.
- **Version caveat:** the exact `@modelcontextprotocol/ext-apps` API (helper names, `_meta` shape, capability negotiation) can vary by version; Tasks 5.2 instructs verifying against the installed package and adapting while preserving semantics. The widget structure test (Task 4) and handler tests (Task 3) pin the behavior that does not depend on the SDK surface.
- **Runtime asset:** `widget.html` is not compiled by `tsc`; Task 6.2 adds a build-step copy into `dist/widget/` and the Dockerfile copies it too, so both `npm start` and the container can read it.
