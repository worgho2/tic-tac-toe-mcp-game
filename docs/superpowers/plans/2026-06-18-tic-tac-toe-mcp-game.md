# Tic-Tac-Toe over MCP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a spike where two users, each in their own MCP-enabled AI chat client, call a `join_game` MCP tool that returns an interactive webview in which they find each other, invite, and play a full game of tic-tac-toe in real time.

**Architecture:** Approach A — a stateless MCP server whose single tool returns an `mcp-ui` UIResource (an iframe pointing at a shared backend), plus an always-on game backend (HTTP + WebSocket) that holds all lobby/game state in memory and serves the webview SPA. Two friends reach it over a cloudflared tunnel.

**Tech Stack:** TypeScript 5.4+, Node 20, npm workspaces, Vitest (tests), `ws` (WebSocket), Express (HTTP), `@modelcontextprotocol/sdk` + `@mcp-ui/server` (MCP), Vite + vanilla TS (webview), Docker Compose.

## Global Constraints

- **Language/runtime:** TypeScript, Node 20, ES modules (`"type": "module"`) in every package.
- **Package manager:** npm workspaces. Root `package.json` declares `"workspaces": ["packages/*"]`.
- **Test runner:** Vitest. Every package with logic has a `test` script; root `npm test` runs all.
- **No persistence:** all state in in-memory `Map`s; nothing survives a restart.
- **No auth, no DB.** Display name only.
- **External config:** `PUBLIC_BACKEND_URL` (e.g. `https://ttt.example.com`) is the only required runtime env var; the webview derives its WebSocket URL from `window.location`.
- **Commit cadence:** one commit per completed task (or per logical step where noted). Commit messages: Conventional Commits.

---

## File Structure

```
tic-tac-toe-mcp-game/
├── package.json                       # workspaces root, scripts
├── tsconfig.base.json                 # shared compiler options
├── docker-compose.yml
├── .env.example
├── README.md
├── packages/
│   ├── backend/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── game/
│   │       │   ├── game.ts            # pure rules
│   │       │   └── game.test.ts
│   │       ├── lobby/
│   │       │   ├── protocol.ts        # ClientMessage / ServerEvent / Effect types
│   │       │   ├── lobby.ts           # orchestration, emits Effects
│   │       │   └── lobby.test.ts
│   │       └── server/
│   │           └── index.ts           # HTTP + WS gateway, serves SPA
│   ├── mcp-server/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── join-game.ts           # builds the UIResource
│   │       ├── join-game.test.ts
│   │       └── index.ts               # Streamable HTTP MCP server
│   └── webview/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── protocol.ts            # mirror of server message types
│           ├── state.ts               # pure reducer (state, event) -> state
│           ├── state.test.ts
│           ├── ws.ts                  # WebSocket client
│           └── main.ts                # DOM rendering, wires ws -> reducer -> view
```

---

## Task 1: Monorepo scaffolding & tooling

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`
- Create: `packages/backend/package.json`, `packages/backend/tsconfig.json`
- Create: `packages/mcp-server/package.json`, `packages/mcp-server/tsconfig.json`

**Interfaces:**
- Consumes: nothing.
- Produces: working npm workspaces; `npm test` and `npm run build` resolve across packages; ESM + Vitest configured.

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
dist/
*.log
.env
packages/webview/dist/
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "tic-tac-toe-mcp-game",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "vitest run",
    "dev:backend": "npm run dev --workspace packages/backend",
    "dev:mcp": "npm run dev --workspace packages/mcp-server",
    "dev:webview": "npm run dev --workspace packages/webview"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "tsx": "^4.7.0",
    "@types/node": "^20.11.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

- [ ] **Step 4: Create `packages/backend/package.json`**

```json
{
  "name": "@ttt/backend",
  "private": true,
  "type": "module",
  "main": "dist/server/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/server/index.ts",
    "start": "node dist/server/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "express": "^4.19.0",
    "ws": "^8.17.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/ws": "^8.5.10"
  }
}
```

- [ ] **Step 5: Create `packages/backend/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 6: Create `packages/mcp-server/package.json`**

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
    "@modelcontextprotocol/sdk": "^1.12.0",
    "@mcp-ui/server": "^5.0.0",
    "express": "^4.19.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21"
  }
}
```

- [ ] **Step 7: Create `packages/mcp-server/tsconfig.json`** (identical shape to backend's)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 8: Create `.env.example`**

```
# Public URL the cloudflared tunnel maps to the backend service.
PUBLIC_BACKEND_URL=https://ttt.example.com
# Ports (host-side); the tunnel points at these.
BACKEND_PORT=8080
MCP_PORT=8765
```

- [ ] **Step 9: Install and verify workspaces resolve**

Run: `npm install`
Expected: completes; `node_modules` created; no peer-dependency errors that abort install.

- [ ] **Step 10: Verify the test runner is wired (no tests yet is OK)**

Run: `npx vitest run`
Expected: Vitest reports "No test files found" and exits 0 (acceptable at this stage).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold npm workspaces for ttt mcp spike"
```

---

## Task 2: Pure tic-tac-toe rules (`game/`)

**Files:**
- Create: `packages/backend/src/game/game.ts`
- Test: `packages/backend/src/game/game.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Mark = 'X' | 'O'`
  - `type Cell = Mark | null`
  - `type Board = Cell[]` (length 9, index 0..8 row-major)
  - `type GameResult = { status: 'won'; winner: Mark } | { status: 'draw' } | { status: 'ongoing' }`
  - `class InvalidMoveError extends Error`
  - `function createBoard(): Board`
  - `function applyMove(board: Board, pos: number, mark: Mark): Board` — returns a NEW board; throws `InvalidMoveError` if `pos` out of 0..8 or cell occupied.
  - `function getResult(board: Board): GameResult`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/backend/src/game/game.test.ts
import { describe, it, expect } from 'vitest';
import {
  createBoard, applyMove, getResult, InvalidMoveError, type Board,
} from './game.js';

describe('game rules', () => {
  it('createBoard returns 9 empty cells', () => {
    expect(createBoard()).toEqual(Array(9).fill(null));
  });

  it('applyMove places a mark without mutating the input', () => {
    const b = createBoard();
    const next = applyMove(b, 4, 'X');
    expect(next[4]).toBe('X');
    expect(b[4]).toBeNull(); // immutability
  });

  it('applyMove rejects an occupied cell', () => {
    const b = applyMove(createBoard(), 0, 'X');
    expect(() => applyMove(b, 0, 'O')).toThrow(InvalidMoveError);
  });

  it('applyMove rejects an out-of-range position', () => {
    expect(() => applyMove(createBoard(), 9, 'X')).toThrow(InvalidMoveError);
    expect(() => applyMove(createBoard(), -1, 'X')).toThrow(InvalidMoveError);
  });

  it('getResult detects a row win', () => {
    const b: Board = ['X', 'X', 'X', null, null, null, null, null, null];
    expect(getResult(b)).toEqual({ status: 'won', winner: 'X' });
  });

  it('getResult detects a diagonal win', () => {
    const b: Board = ['O', null, null, null, 'O', null, null, null, 'O'];
    expect(getResult(b)).toEqual({ status: 'won', winner: 'O' });
  });

  it('getResult detects a draw on a full board with no line', () => {
    const b: Board = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'];
    expect(getResult(b)).toEqual({ status: 'draw' });
  });

  it('getResult reports ongoing for an unfinished board', () => {
    const b: Board = ['X', null, null, null, null, null, null, null, null];
    expect(getResult(b)).toEqual({ status: 'ongoing' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/backend/src/game/game.test.ts`
Expected: FAIL — `Cannot find module './game.js'`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/backend/src/game/game.ts
export type Mark = 'X' | 'O';
export type Cell = Mark | null;
export type Board = Cell[]; // length 9, row-major
export type GameResult =
  | { status: 'won'; winner: Mark }
  | { status: 'draw' }
  | { status: 'ongoing' };

export class InvalidMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMoveError';
  }
}

const LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],            // diagonals
];

export function createBoard(): Board {
  return Array(9).fill(null);
}

export function applyMove(board: Board, pos: number, mark: Mark): Board {
  if (!Number.isInteger(pos) || pos < 0 || pos > 8) {
    throw new InvalidMoveError(`position ${pos} is out of range`);
  }
  if (board[pos] !== null) {
    throw new InvalidMoveError(`cell ${pos} is already taken`);
  }
  const next = board.slice();
  next[pos] = mark;
  return next;
}

export function getResult(board: Board): GameResult {
  for (const [a, b, c] of LINES) {
    const v = board[a];
    if (v !== null && v === board[b] && v === board[c]) {
      return { status: 'won', winner: v };
    }
  }
  if (board.every((cell) => cell !== null)) {
    return { status: 'draw' };
  }
  return { status: 'ongoing' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/backend/src/game/game.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/game
git commit -m "feat(game): pure tic-tac-toe rules with win/draw detection"
```

---

## Task 3: Lobby & game orchestration (`lobby/`)

The lobby owns all state and is pure with respect to I/O: every method mutates internal `Map`s and **returns an array of `Effect`** (`{ to: PlayerId; event: ServerEvent }`). The server layer (Task 4) is the only thing that turns Effects into WebSocket sends. This makes the orchestration fully unit-testable without sockets.

**Files:**
- Create: `packages/backend/src/lobby/protocol.ts`
- Create: `packages/backend/src/lobby/lobby.ts`
- Test: `packages/backend/src/lobby/lobby.test.ts`

**Interfaces:**
- Consumes: everything from `game/` (Task 2).
- Produces:
  - `protocol.ts`:
    - `type PlayerId = string`
    - `interface PublicPlayer { id: PlayerId; name: string; status: 'idle' | 'busy' }`
    - `type ClientMessage =`
      `{ type: 'register'; name: string }`
      `| { type: 'invite'; targetId: PlayerId }`
      `| { type: 'accept_invite'; inviteId: string }`
      `| { type: 'decline_invite'; inviteId: string }`
      `| { type: 'move'; pos: number }`
      `| { type: 'leave' }`
    - `type ServerEvent =`
      `{ type: 'lobby_updated'; players: PublicPlayer[] }`
      `| { type: 'invite_received'; inviteId: string; fromId: PlayerId; fromName: string }`
      `| { type: 'invite_declined'; byId: PlayerId }`
      `| { type: 'game_started'; gameId: string; board: Board; yourMark: Mark; yourTurn: boolean; opponentName: string }`
      `| { type: 'game_updated'; board: Board; yourTurn: boolean }`
      `| { type: 'game_over'; result: GameResult; board: Board }`
      `| { type: 'opponent_left' }`
      `| { type: 'error'; message: string }`
    - `interface Effect { to: PlayerId; event: ServerEvent }`
  - `lobby.ts`: `class Lobby` with an injectable id generator:
    - `constructor(genId: () => string = defaultGenId)`
    - `connect(id: PlayerId): void`
    - `register(id: PlayerId, name: string): Effect[]`
    - `invite(fromId: PlayerId, targetId: PlayerId): Effect[]`
    - `acceptInvite(byId: PlayerId, inviteId: string): Effect[]`
    - `declineInvite(byId: PlayerId, inviteId: string): Effect[]`
    - `move(playerId: PlayerId, pos: number): Effect[]`
    - `disconnect(id: PlayerId): Effect[]`
    - `handle(id: PlayerId, msg: ClientMessage): Effect[]` (dispatch helper used by the server)

- [ ] **Step 1: Create `protocol.ts`**

```ts
// packages/backend/src/lobby/protocol.ts
import type { Board, Mark, GameResult } from '../game/game.js';

export type PlayerId = string;

export interface PublicPlayer {
  id: PlayerId;
  name: string;
  status: 'idle' | 'busy';
}

export type ClientMessage =
  | { type: 'register'; name: string }
  | { type: 'invite'; targetId: PlayerId }
  | { type: 'accept_invite'; inviteId: string }
  | { type: 'decline_invite'; inviteId: string }
  | { type: 'move'; pos: number }
  | { type: 'leave' };

export type ServerEvent =
  | { type: 'lobby_updated'; players: PublicPlayer[] }
  | { type: 'invite_received'; inviteId: string; fromId: PlayerId; fromName: string }
  | { type: 'invite_declined'; byId: PlayerId }
  | {
      type: 'game_started';
      gameId: string;
      board: Board;
      yourMark: Mark;
      yourTurn: boolean;
      opponentName: string;
    }
  | { type: 'game_updated'; board: Board; yourTurn: boolean }
  | { type: 'game_over'; result: GameResult; board: Board }
  | { type: 'opponent_left' }
  | { type: 'error'; message: string };

export interface Effect {
  to: PlayerId;
  event: ServerEvent;
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// packages/backend/src/lobby/lobby.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Lobby } from './lobby.js';
import type { Effect, ServerEvent } from './protocol.js';

// Deterministic id generator: inv1, inv2, ... / game1, game2, ...
function makeCounter() {
  let n = 0;
  return () => `id${++n}`;
}

function eventsFor(effects: Effect[], to: string): ServerEvent[] {
  return effects.filter((e) => e.to === to).map((e) => e.event);
}

describe('Lobby', () => {
  let lobby: Lobby;
  beforeEach(() => {
    lobby = new Lobby(makeCounter());
  });

  it('register broadcasts the lobby to every connected player', () => {
    lobby.connect('a');
    lobby.connect('b');
    const effects = lobby.register('a', 'Alice');
    const toB = eventsFor(effects, 'b');
    expect(toB[0]).toMatchObject({ type: 'lobby_updated' });
    const lobbyEvent = toB[0] as Extract<ServerEvent, { type: 'lobby_updated' }>;
    expect(lobbyEvent.players).toEqual([{ id: 'a', name: 'Alice', status: 'idle' }]);
  });

  it('invite notifies only the target', () => {
    lobby.connect('a'); lobby.register('a', 'Alice');
    lobby.connect('b'); lobby.register('b', 'Bob');
    const effects = lobby.invite('a', 'b');
    expect(eventsFor(effects, 'a')).toEqual([]);
    expect(eventsFor(effects, 'b')[0]).toMatchObject({
      type: 'invite_received', fromId: 'a', fromName: 'Alice',
    });
  });

  it('accepting an invite starts a game for both players', () => {
    lobby.connect('a'); lobby.register('a', 'Alice');
    lobby.connect('b'); lobby.register('b', 'Bob');
    const inv = lobby.invite('a', 'b');
    const inviteId = (eventsFor(inv, 'b')[0] as any).inviteId as string;
    const started = lobby.acceptInvite('b', inviteId);
    const aStart = eventsFor(started, 'a').find((e) => e.type === 'game_started') as any;
    const bStart = eventsFor(started, 'b').find((e) => e.type === 'game_started') as any;
    expect(aStart).toBeTruthy();
    expect(bStart).toBeTruthy();
    // exactly one of them holds X and the first turn
    expect(aStart.yourMark !== bStart.yourMark).toBe(true);
    expect(aStart.yourTurn !== bStart.yourTurn).toBe(true);
  });

  it('rejects a move played out of turn', () => {
    lobby.connect('a'); lobby.register('a', 'Alice');
    lobby.connect('b'); lobby.register('b', 'Bob');
    const inv = lobby.invite('a', 'b');
    const inviteId = (eventsFor(inv, 'b')[0] as any).inviteId as string;
    const started = lobby.acceptInvite('b', inviteId);
    const aStart = eventsFor(started, 'a').find((e) => e.type === 'game_started') as any;
    const second = aStart.yourTurn ? 'b' : 'a'; // the player who does NOT move first
    const effects = lobby.move(second, 0);
    expect(eventsFor(effects, second)[0]).toMatchObject({ type: 'error' });
  });

  it('a winning move ends the game for both players', () => {
    lobby.connect('a'); lobby.register('a', 'Alice');
    lobby.connect('b'); lobby.register('b', 'Bob');
    const inv = lobby.invite('a', 'b');
    const inviteId = (eventsFor(inv, 'b')[0] as any).inviteId as string;
    const started = lobby.acceptInvite('b', inviteId);
    const aStart = eventsFor(started, 'a').find((e) => e.type === 'game_started') as any;
    const first = aStart.yourTurn ? 'a' : 'b';
    const second = first === 'a' ? 'b' : 'a';
    // first: 0, second: 3, first: 1, second: 4, first: 2 -> top row win
    lobby.move(first, 0);
    lobby.move(second, 3);
    lobby.move(first, 1);
    lobby.move(second, 4);
    const last = lobby.move(first, 2);
    const over = eventsFor(last, 'a').find((e) => e.type === 'game_over') as any;
    expect(over).toBeTruthy();
    expect(over.result.status).toBe('won');
  });

  it('disconnecting mid-game notifies the opponent', () => {
    lobby.connect('a'); lobby.register('a', 'Alice');
    lobby.connect('b'); lobby.register('b', 'Bob');
    const inv = lobby.invite('a', 'b');
    const inviteId = (eventsFor(inv, 'b')[0] as any).inviteId as string;
    lobby.acceptInvite('b', inviteId);
    const effects = lobby.disconnect('a');
    expect(eventsFor(effects, 'b').some((e) => e.type === 'opponent_left')).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/backend/src/lobby/lobby.test.ts`
Expected: FAIL — `Cannot find module './lobby.js'`.

- [ ] **Step 4: Write the implementation**

```ts
// packages/backend/src/lobby/lobby.ts
import { applyMove, createBoard, getResult, InvalidMoveError, type Board, type Mark } from '../game/game.js';
import type { ClientMessage, Effect, PlayerId, PublicPlayer, ServerEvent } from './protocol.js';

interface PlayerState {
  id: PlayerId;
  name: string | null;
  gameId: string | null;
}

interface Invite {
  id: string;
  fromId: PlayerId;
  toId: PlayerId;
}

interface Game {
  id: string;
  board: Board;
  turn: Mark;
  marks: Record<PlayerId, Mark>; // each player's mark
  players: [PlayerId, PlayerId];
}

function defaultGenId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class Lobby {
  private players = new Map<PlayerId, PlayerState>();
  private invites = new Map<string, Invite>();
  private games = new Map<string, Game>();

  constructor(private genId: () => string = defaultGenId) {}

  connect(id: PlayerId): void {
    this.players.set(id, { id, name: null, gameId: null });
  }

  handle(id: PlayerId, msg: ClientMessage): Effect[] {
    switch (msg.type) {
      case 'register': return this.register(id, msg.name);
      case 'invite': return this.invite(id, msg.targetId);
      case 'accept_invite': return this.acceptInvite(id, msg.inviteId);
      case 'decline_invite': return this.declineInvite(id, msg.inviteId);
      case 'move': return this.move(id, msg.pos);
      case 'leave': return this.leaveGame(id);
      default: return [{ to: id, event: { type: 'error', message: 'unknown message' } }];
    }
  }

  register(id: PlayerId, name: string): Effect[] {
    const p = this.players.get(id);
    if (!p) return [];
    const trimmed = name.trim().slice(0, 24);
    if (!trimmed) return [{ to: id, event: { type: 'error', message: 'name required' } }];
    p.name = trimmed;
    return this.broadcastLobby();
  }

  invite(fromId: PlayerId, targetId: PlayerId): Effect[] {
    const from = this.players.get(fromId);
    const target = this.players.get(targetId);
    if (!from || !from.name) return [{ to: fromId, event: { type: 'error', message: 'register first' } }];
    if (!target || !target.name) return [{ to: fromId, event: { type: 'error', message: 'player not available' } }];
    if (target.gameId || from.gameId) return [{ to: fromId, event: { type: 'error', message: 'player is busy' } }];
    const invite: Invite = { id: this.genId(), fromId, toId: targetId };
    this.invites.set(invite.id, invite);
    return [{
      to: targetId,
      event: { type: 'invite_received', inviteId: invite.id, fromId, fromName: from.name },
    }];
  }

  acceptInvite(byId: PlayerId, inviteId: string): Effect[] {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.toId !== byId) {
      return [{ to: byId, event: { type: 'error', message: 'invite not found' } }];
    }
    this.invites.delete(inviteId);
    const a = this.players.get(invite.fromId);
    const b = this.players.get(invite.toId);
    if (!a || !a.name || a.gameId || !b || !b.name || b.gameId) {
      return [{ to: byId, event: { type: 'error', message: 'player no longer available' } }];
    }
    // inviter is X (moves first), accepter is O
    const game: Game = {
      id: this.genId(),
      board: createBoard(),
      turn: 'X',
      marks: { [a.id]: 'X', [b.id]: 'O' },
      players: [a.id, b.id],
    };
    this.games.set(game.id, game);
    a.gameId = game.id;
    b.gameId = game.id;
    const startFor = (self: PlayerState, opp: PlayerState): Effect => ({
      to: self.id,
      event: {
        type: 'game_started',
        gameId: game.id,
        board: game.board,
        yourMark: game.marks[self.id],
        yourTurn: game.turn === game.marks[self.id],
        opponentName: opp.name!,
      },
    });
    return [startFor(a, b), startFor(b, a)];
  }

  declineInvite(byId: PlayerId, inviteId: string): Effect[] {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.toId !== byId) return [];
    this.invites.delete(inviteId);
    return [{ to: invite.fromId, event: { type: 'invite_declined', byId } }];
  }

  move(playerId: PlayerId, pos: number): Effect[] {
    const p = this.players.get(playerId);
    if (!p || !p.gameId) return [{ to: playerId, event: { type: 'error', message: 'not in a game' } }];
    const game = this.games.get(p.gameId);
    if (!game) return [{ to: playerId, event: { type: 'error', message: 'game not found' } }];
    const mark = game.marks[playerId];
    if (game.turn !== mark) return [{ to: playerId, event: { type: 'error', message: 'not your turn' } }];
    try {
      game.board = applyMove(game.board, pos, mark);
    } catch (err) {
      if (err instanceof InvalidMoveError) {
        return [{ to: playerId, event: { type: 'error', message: err.message } }];
      }
      throw err;
    }
    const result = getResult(game.board);
    if (result.status !== 'ongoing') {
      const effects = game.players.map<Effect>((id) => ({
        to: id, event: { type: 'game_over', result, board: game.board },
      }));
      this.endGame(game);
      return effects;
    }
    game.turn = mark === 'X' ? 'O' : 'X';
    return game.players.map<Effect>((id) => ({
      to: id,
      event: { type: 'game_updated', board: game.board, yourTurn: game.turn === game.marks[id] },
    }));
  }

  leaveGame(id: PlayerId): Effect[] {
    const p = this.players.get(id);
    if (!p || !p.gameId) return [];
    const game = this.games.get(p.gameId);
    if (!game) return [];
    const opponentId = game.players.find((x) => x !== id)!;
    this.endGame(game);
    const effects: Effect[] = [{ to: opponentId, event: { type: 'opponent_left' } }];
    return [...effects, ...this.broadcastLobby()];
  }

  disconnect(id: PlayerId): Effect[] {
    const p = this.players.get(id);
    if (!p) return [];
    const effects: Effect[] = [];
    if (p.gameId) {
      const game = this.games.get(p.gameId);
      if (game) {
        const opponentId = game.players.find((x) => x !== id)!;
        effects.push({ to: opponentId, event: { type: 'opponent_left' } });
        this.endGame(game);
      }
    }
    // drop any invites involving this player
    for (const [invId, inv] of this.invites) {
      if (inv.fromId === id || inv.toId === id) this.invites.delete(invId);
    }
    this.players.delete(id);
    return [...effects, ...this.broadcastLobby()];
  }

  private endGame(game: Game): void {
    for (const pid of game.players) {
      const ps = this.players.get(pid);
      if (ps) ps.gameId = null;
    }
    this.games.delete(game.id);
  }

  private publicPlayers(): PublicPlayer[] {
    const out: PublicPlayer[] = [];
    for (const p of this.players.values()) {
      if (p.name) out.push({ id: p.id, name: p.name, status: p.gameId ? 'busy' : 'idle' });
    }
    return out;
  }

  private broadcastLobby(): Effect[] {
    const players = this.publicPlayers();
    const event: ServerEvent = { type: 'lobby_updated', players };
    const effects: Effect[] = [];
    for (const p of this.players.values()) {
      if (p.name) effects.push({ to: p.id, event });
    }
    return effects;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/backend/src/lobby/lobby.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/lobby
git commit -m "feat(lobby): in-memory matchmaking and game orchestration via effects"
```

---

## Task 4: Backend server — HTTP + WebSocket gateway (`server/`)

Wires the `Lobby` to real WebSocket connections and serves the built webview SPA. Each WS connection is a player; its `playerId` is generated on connect. Inbound JSON → `lobby.handle` → Effects fanned out to the addressed sockets.

**Files:**
- Create: `packages/backend/src/server/index.ts`

**Interfaces:**
- Consumes: `Lobby`, `ClientMessage`, `Effect` from Task 3.
- Produces: a runnable HTTP server. `GET /healthz` → `200 "ok"`. `GET /*` → SPA. WebSocket endpoint at path `/ws`. Listens on `process.env.BACKEND_PORT ?? 8080`.

- [ ] **Step 1: Write the server**

```ts
// packages/backend/src/server/index.ts
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { Lobby } from '../lobby/lobby.js';
import type { ClientMessage, Effect, PlayerId } from '../lobby/protocol.js';

const PORT = Number(process.env.BACKEND_PORT ?? 8080);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// webview build is copied next to the backend dist in Docker; in dev it sits in the workspace.
const SPA_DIR = process.env.SPA_DIR ?? path.resolve(__dirname, '../../../webview/dist');

const app = express();
app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.use(express.static(SPA_DIR));
app.get('*', (_req, res) => res.sendFile(path.join(SPA_DIR, 'index.html')));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

const lobby = new Lobby();
const sockets = new Map<PlayerId, WebSocket>();

function dispatch(effects: Effect[]): void {
  for (const { to, event } of effects) {
    const ws = sockets.get(to);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }
}

wss.on('connection', (ws) => {
  const playerId = randomUUID();
  sockets.set(playerId, ws);
  lobby.connect(playerId);

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'invalid JSON' }));
      return;
    }
    dispatch(lobby.handle(playerId, msg));
  });

  ws.on('close', () => {
    dispatch(lobby.disconnect(playerId));
    sockets.delete(playerId);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[backend] http+ws listening on :${PORT}`);
});
```

- [ ] **Step 2: Type-check the backend**

Run: `npm run build --workspace packages/backend`
Expected: PASS — `dist/` emitted, no TypeScript errors. (The `webview/dist` path is resolved at runtime, not compile time, so its absence here is fine.)

- [ ] **Step 3: Smoke-test the health endpoint**

Run (two commands):
```bash
SPA_DIR=/tmp BACKEND_PORT=8080 node packages/backend/dist/server/index.js &
sleep 1 && curl -s localhost:8080/healthz && echo && kill %1
```
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/server
git commit -m "feat(backend): websocket gateway and SPA host wiring lobby effects"
```

---

## Task 5: Webview SPA (`webview/`)

The SPA has three screens (name entry → lobby → game). Screen-selection and data are derived by a **pure reducer** `reduce(state, event)` that is unit-tested; DOM rendering and the WebSocket client are thin and manually verified.

**Files:**
- Create: `packages/webview/package.json`, `packages/webview/tsconfig.json`, `packages/webview/vite.config.ts`, `packages/webview/index.html`
- Create: `packages/webview/src/protocol.ts` (mirror of server types)
- Create: `packages/webview/src/state.ts`
- Test: `packages/webview/src/state.test.ts`
- Create: `packages/webview/src/ws.ts`, `packages/webview/src/main.ts`

**Interfaces:**
- Consumes: the JSON `ServerEvent` shapes emitted by the backend (Task 3 protocol).
- Produces:
  - `state.ts`:
    - `type Screen = 'name' | 'lobby' | 'game'`
    - `interface UiState { screen: Screen; me: { name: string | null }; players: PublicPlayer[]; invite: { inviteId: string; fromName: string } | null; game: { board: Cell[]; yourMark: Mark; yourTurn: boolean; opponentName: string } | null; banner: string | null }`
    - `function initialState(): UiState`
    - `function reduce(state: UiState, event: ServerEvent): UiState`

- [ ] **Step 1: Create `packages/webview/package.json`**

```json
{
  "name": "@ttt/webview",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "devDependencies": {
    "vite": "^5.2.0"
  }
}
```

- [ ] **Step 2: Create `packages/webview/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "rootDir": "src", "lib": ["ES2022", "DOM"] },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/webview/vite.config.ts`**

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  // Served inside an MCP host iframe; relative asset paths keep it origin-agnostic.
  base: './',
  build: { outDir: 'dist' },
});
```

- [ ] **Step 4: Create `packages/webview/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tic-Tac-Toe over MCP</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; padding: 1.5rem; }
      .board { display: grid; grid-template-columns: repeat(3, 4rem); gap: 4px; }
      .cell { width: 4rem; height: 4rem; font-size: 2rem; cursor: pointer; }
      .cell:disabled { cursor: default; }
      .player { display: flex; gap: .5rem; align-items: center; margin: .25rem 0; }
      .banner { background: #fffae6; padding: .5rem; border-radius: 4px; margin-bottom: 1rem; }
      button { padding: .4rem .8rem; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `packages/webview/src/protocol.ts`** (mirror of the server's `protocol.ts` shapes — kept independent so the SPA package has no cross-package import)

```ts
// packages/webview/src/protocol.ts
export type Mark = 'X' | 'O';
export type Cell = Mark | null;
export type Board = Cell[];
export type GameResult =
  | { status: 'won'; winner: Mark }
  | { status: 'draw' }
  | { status: 'ongoing' };

export interface PublicPlayer { id: string; name: string; status: 'idle' | 'busy'; }

export type ClientMessage =
  | { type: 'register'; name: string }
  | { type: 'invite'; targetId: string }
  | { type: 'accept_invite'; inviteId: string }
  | { type: 'decline_invite'; inviteId: string }
  | { type: 'move'; pos: number }
  | { type: 'leave' };

export type ServerEvent =
  | { type: 'lobby_updated'; players: PublicPlayer[] }
  | { type: 'invite_received'; inviteId: string; fromId: string; fromName: string }
  | { type: 'invite_declined'; byId: string }
  | { type: 'game_started'; gameId: string; board: Board; yourMark: Mark; yourTurn: boolean; opponentName: string }
  | { type: 'game_updated'; board: Board; yourTurn: boolean }
  | { type: 'game_over'; result: GameResult; board: Board }
  | { type: 'opponent_left' }
  | { type: 'error'; message: string };
```

- [ ] **Step 6: Write the failing reducer tests**

```ts
// packages/webview/src/state.test.ts
import { describe, it, expect } from 'vitest';
import { initialState, reduce } from './state.js';

describe('reduce', () => {
  it('starts on the name screen', () => {
    expect(initialState().screen).toBe('name');
  });

  it('lobby_updated moves to the lobby screen and stores players', () => {
    const s = reduce(initialState(), {
      type: 'lobby_updated',
      players: [{ id: 'a', name: 'Alice', status: 'idle' }],
    });
    expect(s.screen).toBe('lobby');
    expect(s.players).toHaveLength(1);
  });

  it('invite_received stores the pending invite', () => {
    const s = reduce(initialState(), {
      type: 'invite_received', inviteId: 'i1', fromId: 'a', fromName: 'Alice',
    });
    expect(s.invite).toEqual({ inviteId: 'i1', fromName: 'Alice' });
  });

  it('game_started switches to the game screen', () => {
    const s = reduce(initialState(), {
      type: 'game_started', gameId: 'g1', board: Array(9).fill(null),
      yourMark: 'X', yourTurn: true, opponentName: 'Bob',
    });
    expect(s.screen).toBe('game');
    expect(s.game?.yourTurn).toBe(true);
    expect(s.invite).toBeNull();
  });

  it('game_over keeps the board visible and sets a banner', () => {
    const mid = reduce(initialState(), {
      type: 'game_started', gameId: 'g1', board: Array(9).fill(null),
      yourMark: 'X', yourTurn: true, opponentName: 'Bob',
    });
    const s = reduce(mid, {
      type: 'game_over', result: { status: 'draw' }, board: Array(9).fill('X'),
    });
    expect(s.screen).toBe('game');
    expect(s.banner).toMatch(/draw/i);
  });

  it('opponent_left returns to the lobby with a banner', () => {
    const mid = reduce(initialState(), {
      type: 'game_started', gameId: 'g1', board: Array(9).fill(null),
      yourMark: 'X', yourTurn: true, opponentName: 'Bob',
    });
    const s = reduce(mid, { type: 'opponent_left' });
    expect(s.screen).toBe('lobby');
    expect(s.game).toBeNull();
    expect(s.banner).toMatch(/left/i);
  });

  it('error sets a banner without changing screen', () => {
    const s = reduce(initialState(), { type: 'error', message: 'nope' });
    expect(s.screen).toBe('name');
    expect(s.banner).toBe('nope');
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `npx vitest run packages/webview/src/state.test.ts`
Expected: FAIL — `Cannot find module './state.js'`.

- [ ] **Step 8: Write the reducer**

```ts
// packages/webview/src/state.ts
import type { Board, Mark, PublicPlayer, ServerEvent } from './protocol.js';

export type Screen = 'name' | 'lobby' | 'game';

export interface UiState {
  screen: Screen;
  me: { name: string | null };
  players: PublicPlayer[];
  invite: { inviteId: string; fromName: string } | null;
  game: { board: Board; yourMark: Mark; yourTurn: boolean; opponentName: string } | null;
  banner: string | null;
}

export function initialState(): UiState {
  return { screen: 'name', me: { name: null }, players: [], invite: null, game: null, banner: null };
}

export function reduce(state: UiState, event: ServerEvent): UiState {
  switch (event.type) {
    case 'lobby_updated':
      return { ...state, screen: state.screen === 'game' ? 'game' : 'lobby', players: event.players };
    case 'invite_received':
      return { ...state, invite: { inviteId: event.inviteId, fromName: event.fromName } };
    case 'invite_declined':
      return { ...state, banner: 'Your invite was declined.' };
    case 'game_started':
      return {
        ...state,
        screen: 'game',
        invite: null,
        banner: null,
        game: {
          board: event.board,
          yourMark: event.yourMark,
          yourTurn: event.yourTurn,
          opponentName: event.opponentName,
        },
      };
    case 'game_updated':
      return state.game
        ? { ...state, game: { ...state.game, board: event.board, yourTurn: event.yourTurn } }
        : state;
    case 'game_over': {
      const banner =
        event.result.status === 'draw'
          ? "It's a draw."
          : event.result.status === 'won'
            ? `${event.result.winner} wins!`
            : '';
      const game = state.game ? { ...state.game, board: event.board, yourTurn: false } : null;
      return { ...state, screen: 'game', game, banner };
    }
    case 'opponent_left':
      return { ...state, screen: 'lobby', game: null, banner: 'Your opponent left the game.' };
    case 'error':
      return { ...state, banner: event.message };
    default:
      return state;
  }
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run packages/webview/src/state.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 10: Write the WebSocket client**

```ts
// packages/webview/src/ws.ts
import type { ClientMessage, ServerEvent } from './protocol.js';

export interface Connection {
  send: (msg: ClientMessage) => void;
}

export function connect(onEvent: (e: ServerEvent) => void, onStatus: (s: string) => void): Connection {
  // Derive the WS URL from the page origin so it works behind the cloudflared tunnel.
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.addEventListener('open', () => onStatus('connected'));
  ws.addEventListener('close', () => onStatus('disconnected'));
  ws.addEventListener('message', (ev) => {
    try {
      onEvent(JSON.parse(ev.data as string) as ServerEvent);
    } catch {
      /* ignore malformed frames */
    }
  });
  return {
    send: (msg) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
  };
}
```

- [ ] **Step 11: Write the DOM rendering / app wiring**

```ts
// packages/webview/src/main.ts
import { connect, type Connection } from './ws.js';
import { initialState, reduce, type UiState } from './state.js';

const root = document.getElementById('app')!;
let state: UiState = initialState();
let conn: Connection;

function render(): void {
  root.innerHTML = '';
  if (state.banner) {
    const b = document.createElement('div');
    b.className = 'banner';
    b.textContent = state.banner;
    root.appendChild(b);
  }
  if (state.invite) renderInvite();
  if (state.screen === 'name') renderName();
  else if (state.screen === 'lobby') renderLobby();
  else if (state.screen === 'game') renderGame();
}

function renderName(): void {
  const h = document.createElement('h2');
  h.textContent = 'Pick a name';
  const input = document.createElement('input');
  input.placeholder = 'Your name';
  const btn = document.createElement('button');
  btn.textContent = 'Join lobby';
  btn.onclick = () => {
    const name = input.value.trim();
    if (name) { state = { ...state, me: { name } }; conn.send({ type: 'register', name }); }
  };
  root.append(h, input, btn);
}

function renderLobby(): void {
  const h = document.createElement('h2');
  h.textContent = `Lobby — you are ${state.me.name ?? '?'}`;
  root.append(h);
  const others = state.players.filter((p) => p.name !== state.me.name);
  if (others.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'Waiting for other players to join…';
    root.append(p);
  }
  for (const player of others) {
    const row = document.createElement('div');
    row.className = 'player';
    const label = document.createElement('span');
    label.textContent = `${player.name} (${player.status})`;
    row.append(label);
    if (player.status === 'idle') {
      const btn = document.createElement('button');
      btn.textContent = 'Invite';
      btn.onclick = () => conn.send({ type: 'invite', targetId: player.id });
      row.append(btn);
    }
    root.append(row);
  }
}

function renderInvite(): void {
  const wrap = document.createElement('div');
  wrap.className = 'banner';
  wrap.textContent = `${state.invite!.fromName} invited you. `;
  const accept = document.createElement('button');
  accept.textContent = 'Accept';
  accept.onclick = () => conn.send({ type: 'accept_invite', inviteId: state.invite!.inviteId });
  const decline = document.createElement('button');
  decline.textContent = 'Decline';
  decline.onclick = () => conn.send({ type: 'decline_invite', inviteId: state.invite!.inviteId });
  wrap.append(accept, decline);
  root.append(wrap);
}

function renderGame(): void {
  const g = state.game!;
  const h = document.createElement('h2');
  h.textContent = `vs ${g.opponentName} — you are ${g.yourMark}`;
  const turn = document.createElement('p');
  turn.textContent = g.yourTurn ? 'Your turn' : "Opponent's turn";
  const board = document.createElement('div');
  board.className = 'board';
  g.board.forEach((cell, pos) => {
    const c = document.createElement('button');
    c.className = 'cell';
    c.textContent = cell ?? '';
    c.disabled = !g.yourTurn || cell !== null;
    c.onclick = () => conn.send({ type: 'move', pos });
    board.append(c);
  });
  root.append(h, turn, board);
}

conn = connect(
  (event) => { state = reduce(state, event); render(); },
  (status) => { if (status === 'disconnected') { state = { ...state, banner: 'Disconnected.' }; render(); } },
);
render();
```

- [ ] **Step 12: Build the webview to confirm it compiles and bundles**

Run: `npm run build --workspace packages/webview`
Expected: PASS — `packages/webview/dist/index.html` and assets emitted.

- [ ] **Step 13: Commit**

```bash
git add packages/webview
git commit -m "feat(webview): SPA with pure reducer, lobby, invite and game screens"
```

---

## Task 6: Stateless MCP server (`mcp-server/`)

Exposes one tool, `join_game`, that returns an `mcp-ui` UIResource — an iframe pointing at `PUBLIC_BACKEND_URL` with a fresh session id. Served over Streamable HTTP (stateless) so remote friends can add the server by URL.

**Files:**
- Create: `packages/mcp-server/src/join-game.ts`
- Test: `packages/mcp-server/src/join-game.test.ts`
- Create: `packages/mcp-server/src/index.ts`

**Interfaces:**
- Consumes: `PUBLIC_BACKEND_URL` env var.
- Produces:
  - `join-game.ts`: `function buildJoinGameResource(publicBackendUrl: string, sessionId: string): UIResource` where the returned object is the `@mcp-ui/server` resource block with `content.type === 'externalUrl'` and `iframeUrl === \`${publicBackendUrl}/?session=${sessionId}\``.
  - `index.ts`: Express app exposing `POST /mcp` (Streamable HTTP) and `GET /healthz`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/mcp-server/src/join-game.test.ts
import { describe, it, expect } from 'vitest';
import { buildJoinGameResource } from './join-game.js';

describe('buildJoinGameResource', () => {
  it('produces an mcp-ui externalUrl resource pointing at the backend with a session', () => {
    const res = buildJoinGameResource('https://ttt.example.com', 'sess-123');
    expect(res.type).toBe('resource');
    expect(res.resource.uri).toMatch(/^ui:\/\//);
    // @mcp-ui encodes externalUrl as the resource text payload
    const text = res.resource.text as string;
    expect(text).toContain('https://ttt.example.com/?session=sess-123');
  });

  it('strips a trailing slash on the backend URL', () => {
    const res = buildJoinGameResource('https://ttt.example.com/', 'abc');
    const text = res.resource.text as string;
    expect(text).toContain('https://ttt.example.com/?session=abc');
    expect(text).not.toContain('.com//?');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/mcp-server/src/join-game.test.ts`
Expected: FAIL — `Cannot find module './join-game.js'`.

- [ ] **Step 3: Write `join-game.ts`**

```ts
// packages/mcp-server/src/join-game.ts
import { createUIResource } from '@mcp-ui/server';

export type UIResource = ReturnType<typeof createUIResource>;

export function buildJoinGameResource(publicBackendUrl: string, sessionId: string): UIResource {
  const base = publicBackendUrl.replace(/\/+$/, '');
  const iframeUrl = `${base}/?session=${sessionId}`;
  return createUIResource({
    uri: `ui://tic-tac-toe/${sessionId}`,
    content: { type: 'externalUrl', iframeUrl },
    encoding: 'text',
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/mcp-server/src/join-game.test.ts`
Expected: PASS (2 tests). If the `uri` scheme assertion fails, adjust the regex in the test to the scheme `@mcp-ui/server` actually emits (`ui://`) — confirm against the installed version and keep the test asserting the real shape.

- [ ] **Step 5: Write the MCP HTTP server**

```ts
// packages/mcp-server/src/index.ts
import { randomUUID } from 'node:crypto';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildJoinGameResource } from './join-game.js';

const PORT = Number(process.env.MCP_PORT ?? 8765);
const PUBLIC_BACKEND_URL = process.env.PUBLIC_BACKEND_URL ?? 'http://localhost:8080';

function buildServer(): McpServer {
  const server = new McpServer({ name: 'tic-tac-toe', version: '0.1.0' });
  server.registerTool(
    'join_game',
    {
      title: 'Join Tic-Tac-Toe',
      description: 'Open the tic-tac-toe lobby to find an opponent and play.',
      inputSchema: {},
    },
    async () => {
      const sessionId = randomUUID();
      const resource = buildJoinGameResource(PUBLIC_BACKEND_URL, sessionId);
      return {
        content: [
          { type: 'text', text: 'Opening the tic-tac-toe lobby…' },
          resource,
        ],
      };
    },
  );
  return server;
}

const app = express();
app.use(express.json());
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// Stateless Streamable HTTP: a fresh server+transport per request (server holds no state).
app.post('/mcp', async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`[mcp-server] streamable-http on :${PORT}, backend=${PUBLIC_BACKEND_URL}`);
});
```

- [ ] **Step 6: Type-check the mcp-server**

Run: `npm run build --workspace packages/mcp-server`
Expected: PASS — `dist/` emitted, no TypeScript errors. If the SDK's import subpaths differ in the installed version, fix the import paths to match the installed `@modelcontextprotocol/sdk` and re-run.

- [ ] **Step 7: Commit**

```bash
git add packages/mcp-server
git commit -m "feat(mcp-server): stateless join_game tool returning mcp-ui webview"
```

---

## Task 7: Dockerization, Compose & docs

Two images (`backend`, `mcp-server`) built from the repo root so npm workspaces resolve. The backend image bakes the built webview SPA. Compose runs both; the host cloudflared tunnel points at the published ports.

**Files:**
- Create: `packages/backend/Dockerfile`, `packages/mcp-server/Dockerfile`
- Create: `docker-compose.yml`, `README.md`

**Interfaces:**
- Consumes: all prior tasks (built artifacts).
- Produces: `docker compose up` serving backend on `BACKEND_PORT` and mcp-server on `MCP_PORT`.

- [ ] **Step 1: Create `packages/backend/Dockerfile`** (build context = repo root)

```dockerfile
# packages/backend/Dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/backend/package.json packages/backend/
COPY packages/webview/package.json packages/webview/
RUN npm install
COPY packages/backend packages/backend
COPY packages/webview packages/webview
RUN npm run build --workspace packages/webview \
 && npm run build --workspace packages/backend

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/packages/backend/package.json packages/backend/package.json
COPY --from=build /app/packages/backend/dist packages/backend/dist
COPY --from=build /app/packages/webview/dist packages/webview/dist
EXPOSE 8080
CMD ["node", "packages/backend/dist/server/index.js"]
```

- [ ] **Step 2: Create `packages/mcp-server/Dockerfile`**

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
EXPOSE 8765
CMD ["node", "packages/mcp-server/dist/index.js"]
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
services:
  backend:
    build:
      context: .
      dockerfile: packages/backend/Dockerfile
    environment:
      - BACKEND_PORT=8080
    ports:
      - "${BACKEND_PORT:-8080}:8080"

  mcp-server:
    build:
      context: .
      dockerfile: packages/mcp-server/Dockerfile
    environment:
      - MCP_PORT=8765
      - PUBLIC_BACKEND_URL=${PUBLIC_BACKEND_URL}
    ports:
      - "${MCP_PORT:-8765}:8765"
    depends_on:
      - backend
```

- [ ] **Step 4: Create `README.md`**

````markdown
# Tic-Tac-Toe over MCP (spike)

Two players, each in their own MCP-enabled AI chat client, call the `join_game`
tool. It returns an interactive webview (via `mcp-ui`) where they find each
other, invite, and play tic-tac-toe in real time.

## Architecture

- **backend** — HTTP + WebSocket, holds all lobby/game state in memory, serves
  the webview SPA. The single source of truth.
- **mcp-server** — stateless Streamable-HTTP MCP server; `join_game` returns an
  `mcp-ui` iframe pointing at the backend.
- **webview** — the SPA the iframe loads.

## Run locally

```bash
npm install
npm test           # runs all package tests
cp .env.example .env   # set PUBLIC_BACKEND_URL to your cloudflared hostname
docker compose up --build
```

- Backend: http://localhost:8080
- MCP endpoint: http://localhost:8765/mcp

## Expose with cloudflared

Point your existing tunnel at the two services, e.g. in `~/.cloudflared/config.yml`:

```yaml
ingress:
  - hostname: ttt.example.com        # PUBLIC_BACKEND_URL
    service: http://localhost:8080
  - hostname: ttt-mcp.example.com    # MCP endpoint
    service: http://localhost:8765
  - service: http_status:404
```

Set `PUBLIC_BACKEND_URL=https://ttt.example.com` in `.env` so the webview iframe
URL is publicly reachable. Each friend adds `https://ttt-mcp.example.com/mcp` as
a Streamable-HTTP MCP server in their client, then calls **join_game**.

## Tests

```bash
npm test
```
````

- [ ] **Step 5: Build the images**

Run: `docker compose build`
Expected: both images build with no error.

- [ ] **Step 6: Bring the stack up and smoke-test both services**

Run:
```bash
PUBLIC_BACKEND_URL=http://localhost:8080 docker compose up -d
sleep 3
curl -s localhost:8080/healthz && echo
curl -s localhost:8765/healthz && echo
docker compose down
```
Expected: prints `ok` twice.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/Dockerfile packages/mcp-server/Dockerfile docker-compose.yml README.md
git commit -m "chore: dockerize backend and mcp-server with compose and docs"
```

- [ ] **Step 8: Final full-suite verification**

Run: `npm test`
Expected: all tests across `game`, `lobby`, `webview`, and `mcp-server` PASS.

---

## Manual end-to-end validation (the real spike test)

After `docker compose up` and the tunnel is live:

1. You and a friend each add the MCP server URL (`https://<mcp-host>/mcp`) to your MCP client.
2. Both call **join_game** → each gets the webview.
3. Both enter names → see each other in the lobby.
4. One invites the other → invite appears → accept → board appears.
5. Alternate moves to a win/draw → `game_over` banner shows for both.
6. Disconnect one mid-game → the other sees "opponent left" and returns to the lobby.

---

## Self-Review Notes

- **Spec coverage:** UI delivery (Task 6), standard rules (Task 2), display-name/in-memory identity (Task 3), single-TS-app stack (Task 1), Approach A split (Tasks 4 & 6), Docker Compose + cloudflared + `PUBLIC_BACKEND_URL` (Task 7), full WebSocket protocol (Task 3), all error-handling cases (Task 3 `error`/`opponent_left` + reducer in Task 5), and the testing strategy (game/lobby/mcp unit tests + manual e2e) are each implemented by a named task.
- **Version caveat:** exact import subpaths/option names for `@modelcontextprotocol/sdk` and the `createUIResource` output shape can vary by version; Tasks 6.4 and 6.6 tell the implementer to confirm against the installed version and keep tests asserting the real emitted shape.
