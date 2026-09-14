# Game Model and Tools (PR 1 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the server side of `docs/superpowers/specs/2026-09-14-game-design-and-use-cases.md` (handles with tags, multi-invite lobby with expiry and cancel, automatic rematch with score, typed events, `cancel_invite` tool) and adapt the existing plain widget just enough to keep typecheck and build green.

**Architecture:** The in-memory `Lobby` class keeps its shape (injectable `genId`/`clock`, mutations return `string | null`, `viewFor` snapshots) and gains a third injectable `genTag`. Public view types move to `src/server/lobby/types.ts`, re-exported from `lobby.ts` so the widget's type-only import path is unchanged. Time-based transitions (presence, invite expiry, rematch) all live in `sweep()`, which every tool handler now calls after `touch()`. The widget reskin is PR 2; this PR only rewires the current components to the new `PlayerView`.

**Tech Stack:** TypeScript 5.9, Node 24, pnpm 10.28.1, Vitest 5, zod 4, `@modelcontextprotocol/ext-apps` 2.0, React 19, Biome.

## Global Constraints

- pnpm only (`packageManager` pin, `engineStrict`); run `corepack enable` once.
- `src/server/` is NodeNext: every relative import ends in `.js` (`./types.js`), even for `.ts` files.
- `src/app/lib/tools.ts` imports server types with `import type` only. Keep it type-only.
- Biome formats and lints (`pnpm lint`); 2-space, 120 cols, single quotes, JSX double quotes. Fix with `pnpm lint:fix`.
- Conventional Commits enforced by commitlint (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`, …). Each commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Lefthook pre-commit formats staged files with `stage_fixed`. Always stage whole files; never leave a tracked file half-staged.
- Constants from the spec, verbatim: `PRESENCE_TTL_MS = 10_000`, `INVITE_TTL_MS = 60_000`, `REMATCH_DELAY_MS = 3_000`, `MAX_NAME = 24`, tags are 4 random digits, error copy `"<name>#<tag> is in another match"`.
- Prerequisite: the docs pull request carrying the spec and this plan (branch `docs/game-design-spec`) is merged to `main`. Until then, branch from `docs/game-design-spec` and rebase onto `main` later.
- Work on branch `feat/game-model-and-tools`; CI runs on the pull request only.
- `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint` must all pass at the end of every task from Task 5 on. Tasks 2 to 4 leave the widget temporarily broken (it still reads `view.invite` / `view.notice`), so `pnpm typecheck` and `pnpm lint` fail until Task 5; `pnpm test` and `pnpm build` pass again from Task 4.

---

## File map

| File | Responsibility |
|---|---|
| `src/server/lobby/types.ts` (create) | Constants and the public view types (`PlayerView`, `GameView`, `InviteView`, `LobbyEvent`, `PublicPlayer`). No logic. |
| `src/server/lobby/lobby.ts` (rewrite) | `Lobby` class: players, invites, matches, presence, expiry, rematch. Re-exports `./types.js`. |
| `src/server/lobby/lobby.test.ts` (rewrite) | Behaviour tests with deterministic ids, tags and clock. |
| `src/server/tools/handlers.ts` (modify) | `touch → sweep → mutate → viewFor` for every tool; new `handleCancelInvite`. |
| `src/server/tools/handlers.test.ts` (rewrite) | Adapt to `invites.received`, add cancel and sweep tests. |
| `src/server/server.ts` (modify) | Register `cancel_invite`. |
| `src/server/server.test.ts` (modify) | Eight app-only tools, new `join_game` payload shape. |
| `src/app/lib/tools.ts` (modify) | `cancel_invite` in `ToolName`, re-export new types. |
| `src/app/lib/events.ts` (create) | `handle()` and `eventText(event)` copy for each `LobbyEvent`. |
| `src/app/App.tsx` (rewrite) | Events → banners, invites → lobby props, `onlineCount` → name screen. |
| `src/app/components/NameScreen.tsx` (rewrite) | Shows online count and inline error. |
| `src/app/components/LobbyScreen.tsx` (rewrite) | Players with handles; received and sent invite lists. |
| `src/app/components/GameBoard.tsx` (rewrite) | Score header, round, always-visible leave button. |
| `src/app/components/InviteBanner.tsx` (delete) | Superseded by the lobby invite lists. |
| `CLAUDE.md` (modify) | Tool table, lobby layer, handler shape, docs to trust. |

---

### Task 0: Branch

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git pull --ff-only
git checkout -b feat/game-model-and-tools
pnpm install
pnpm test
```

Expected: all existing tests pass (`game`, `lobby`, `handlers`, `server`).

---

### Task 1: View types module

**Files:**
- Create: `src/server/lobby/types.ts`

**Interfaces:**
- Produces: every exported name below; Task 2 imports them and re-exports them from `lobby.ts`.

- [ ] **Step 1: Write the types file**

```ts
// src/server/lobby/types.ts
import type { Board, GameResult, Mark } from '../game/game.js';

/** A player is dropped after this long without a tool call. */
export const PRESENCE_TTL_MS = 10_000;
/** Pending invites disappear after this long. */
export const INVITE_TTL_MS = 60_000;
/** A finished round stays visible this long before the next round starts. */
export const REMATCH_DELAY_MS = 3_000;
export const MAX_NAME = 24;

export type PlayerId = string;
export type Phase = 'name' | 'lobby' | 'game';

export interface PublicPlayer {
  id: PlayerId;
  name: string;
  /** Four digits; `name#tag` is unique among registered players. */
  tag: string;
  status: 'idle' | 'busy';
}

export interface InviteView {
  inviteId: string;
  /** The other party's handle: the sender for received invites, the target for sent ones. */
  name: string;
  tag: string;
  /** Milliseconds left, computed at view time; the client counts down locally. */
  expiresIn: number;
}

export interface GameView {
  /** 1-based; increments on every automatic rematch. */
  round: number;
  board: Board;
  yourMark: Mark;
  yourTurn: boolean;
  opponentName: string;
  opponentTag: string;
  yourScore: number;
  opponentScore: number;
  /** True during the pause between a finished round and the next one. */
  over: boolean;
  result: GameResult | null;
}

export type LobbyEvent =
  | { type: 'opponent-left' }
  | { type: 'invite-declined'; name: string; tag: string }
  | { type: 'invite-expired'; name: string; tag: string }
  | { type: 'invite-cancelled'; name: string; tag: string; reason: 'by-sender' | 'in-match' };

export interface PlayerView {
  phase: Phase;
  you: { id: PlayerId; name: string | null; tag: string | null };
  /** Registered players, including you. */
  onlineCount: number;
  players: PublicPlayer[];
  invites: { sent: InviteView[]; received: InviteView[] };
  game: GameView | null;
  /** Drained on every view: each event is delivered exactly once. */
  events: LobbyEvent[];
  /** Transient error of the mutation that produced this view; merged in by the handlers. */
  error: string | null;
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `pnpm typecheck`
Expected: no errors (the file is not imported yet).

```bash
git add src/server/lobby/types.ts
git commit -m "refactor(lobby): move public view types to types.ts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Lobby rewrite

**Files:**
- Rewrite: `src/server/lobby/lobby.ts`
- Rewrite: `src/server/lobby/lobby.test.ts`

**Interfaces:**
- Consumes: `src/server/lobby/types.ts` (Task 1); `applyMove`, `createBoard`, `getResult`, `InvalidMoveError`, `Mark`, `Board`, `GameResult` from `../game/game.js`.
- Produces: `class Lobby` with constructor `(genId?: () => string, clock?: () => number, genTag?: () => string)` and methods `connect(): PlayerId`, `touch(id)`, `sweep()`, `register(id, name): string | null`, `invite(fromId, targetId): string | null`, `cancelInvite(byId, inviteId): string | null`, `acceptInvite(byId, inviteId): string | null`, `declineInvite(byId, inviteId): string | null`, `makeMove(id, cell): string | null`, `leave(id): string | null`, `viewFor(id): PlayerView`. `lobby.ts` re-exports everything from `./types.js`.

After this task `handlers.test.ts`, `server.test.ts` and the widget no longer typecheck (they read `view.invite` / `view.notice`); Tasks 3 to 5 fix them. Use `pnpm vitest run <file>` for the lobby file only until then.

- [ ] **Step 1: Replace the test file with the identity, presence and invite tests**

Write `src/server/lobby/lobby.test.ts` with this content (the match and presence blocks are appended in Step 2):

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { INVITE_TTL_MS, Lobby, PRESENCE_TTL_MS, REMATCH_DELAY_MS } from './lobby.js';

// Deterministic ids (id1, id2, …), tags (0001, 0002, …) and a controllable clock.
function makeCounter(prefix = 'id') {
  let n = 0;
  return () => `${prefix}${++n}`;
}
function makeTagCounter() {
  let n = 0;
  return () => String(++n).padStart(4, '0');
}
function makeClock(start = 1000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('Lobby', () => {
  let clock: ReturnType<typeof makeClock>;
  let lobby: Lobby;
  beforeEach(() => {
    clock = makeClock();
    lobby = new Lobby(makeCounter(), clock.now, makeTagCounter());
  });

  // Registers a fresh named player and returns its id.
  function join(name: string): string {
    const id = lobby.connect();
    lobby.register(id, name);
    return id;
  }
  // Sends an invite from a to b and returns the invite id as b sees it.
  function inviteFrom(a: string, b: string): string {
    expect(lobby.invite(a, b)).toBeNull();
    return lobby.viewFor(b).invites.received.at(-1)!.inviteId;
  }
  // Puts a and b into a match (a is X).
  function startMatch(a: string, b: string): void {
    expect(lobby.acceptInvite(b, inviteFrom(a, b))).toBeNull();
  }

  describe('identity', () => {
    it('connect returns a fresh id and starts on the name phase', () => {
      const id = lobby.connect();
      expect(typeof id).toBe('string');
      expect(lobby.viewFor(id).phase).toBe('name');
    });

    it('register assigns a 4-digit tag and moves the player to the lobby', () => {
      const a = lobby.connect();
      expect(lobby.register(a, 'Alice')).toBeNull();
      const view = lobby.viewFor(a);
      expect(view.phase).toBe('lobby');
      expect(view.you).toEqual({ id: a, name: 'Alice', tag: '0001' });
    });

    it('the default tag generator yields 4 digits', () => {
      const real = new Lobby();
      const a = real.connect();
      real.register(a, 'Alice');
      expect(real.viewFor(a).you.tag).toMatch(/^\d{4}$/);
    });

    it('register rejects an empty name', () => {
      const a = lobby.connect();
      expect(lobby.register(a, '   ')).toMatch(/name/i);
    });

    it('register truncates names to 24 characters', () => {
      const a = lobby.connect();
      lobby.register(a, 'a'.repeat(30));
      expect(lobby.viewFor(a).you.name).toHaveLength(24);
    });

    it('two players may share a name but get different tags', () => {
      const tags = ['0007', '0007', '0042'];
      lobby = new Lobby(makeCounter(), clock.now, () => tags.shift() ?? '9999');
      const a = join('Alice');
      const b = join('Alice');
      expect(lobby.viewFor(a).you.tag).toBe('0007');
      expect(lobby.viewFor(b).you.tag).toBe('0042'); // 0007 was retried
    });

    it('a player sees other registered players with their tags, not themselves', () => {
      const a = join('Alice');
      join('Bob');
      lobby.connect(); // unregistered: invisible
      const view = lobby.viewFor(a);
      expect(view.players).toEqual([{ id: 'id2', name: 'Bob', tag: '0002', status: 'idle' }]);
    });

    it('onlineCount counts registered players, including you, even before you register', () => {
      join('Alice');
      join('Bob');
      const c = lobby.connect();
      expect(lobby.viewFor(c).onlineCount).toBe(2);
      lobby.register(c, 'Carol');
      expect(lobby.viewFor(c).onlineCount).toBe(3);
    });
  });

  describe('invites', () => {
    it('shows up under received for the target and sent for the sender, with the TTL', () => {
      const a = join('Alice');
      const b = join('Bob');
      const inviteId = inviteFrom(a, b);
      expect(lobby.viewFor(b).invites).toEqual({
        sent: [],
        received: [{ inviteId, name: 'Alice', tag: '0001', expiresIn: INVITE_TTL_MS }],
      });
      expect(lobby.viewFor(a).invites).toEqual({
        sent: [{ inviteId, name: 'Bob', tag: '0002', expiresIn: INVITE_TTL_MS }],
        received: [],
      });
    });

    it('expiresIn counts down with the clock', () => {
      const a = join('Alice');
      const b = join('Bob');
      inviteFrom(a, b);
      clock.advance(10_000);
      expect(lobby.viewFor(b).invites.received[0].expiresIn).toBe(INVITE_TTL_MS - 10_000);
    });

    it('rejects inviting yourself, an unregistered player, or a busy player', () => {
      const a = join('Alice');
      const b = join('Bob');
      const c = join('Carol');
      const ghost = lobby.connect();
      expect(lobby.invite(a, a)).toMatch(/yourself/i);
      expect(lobby.invite(a, ghost)).toMatch(/not available/i);
      startMatch(a, b);
      expect(lobby.invite(c, a)).toMatch(/busy/i);
    });

    it('rejects a second pending invite to the same player', () => {
      const a = join('Alice');
      const b = join('Bob');
      inviteFrom(a, b);
      expect(lobby.invite(a, b)).toMatch(/already pending/i);
    });

    it('allows several sent and received invites at once', () => {
      const a = join('Alice');
      const b = join('Bob');
      const c = join('Carol');
      inviteFrom(a, b);
      inviteFrom(a, c);
      inviteFrom(c, a);
      expect(lobby.viewFor(a).invites.sent.map((i) => i.name)).toEqual(['Bob', 'Carol']);
      expect(lobby.viewFor(a).invites.received.map((i) => i.name)).toEqual(['Carol']);
    });

    it('cancelInvite removes it and tells the target', () => {
      const a = join('Alice');
      const b = join('Bob');
      const inviteId = inviteFrom(a, b);
      expect(lobby.cancelInvite(a, inviteId)).toBeNull();
      expect(lobby.viewFor(a).invites.sent).toEqual([]);
      const bv = lobby.viewFor(b);
      expect(bv.invites.received).toEqual([]);
      expect(bv.events).toEqual([{ type: 'invite-cancelled', name: 'Alice', tag: '0001', reason: 'by-sender' }]);
    });

    it('only the sender can cancel', () => {
      const a = join('Alice');
      const b = join('Bob');
      const inviteId = inviteFrom(a, b);
      expect(lobby.cancelInvite(b, inviteId)).toMatch(/not found/i);
      expect(lobby.viewFor(b).invites.received).toHaveLength(1);
    });

    it('declineInvite removes it and tells the sender', () => {
      const a = join('Alice');
      const b = join('Bob');
      const inviteId = inviteFrom(a, b);
      expect(lobby.declineInvite(b, inviteId)).toBeNull();
      expect(lobby.viewFor(a).events).toEqual([{ type: 'invite-declined', name: 'Bob', tag: '0002' }]);
      expect(lobby.viewFor(b).invites.received).toEqual([]);
    });

    it('expires after INVITE_TTL_MS on sweep and tells the sender', () => {
      const a = join('Alice');
      const b = join('Bob');
      inviteFrom(a, b);
      clock.advance(INVITE_TTL_MS - 1);
      lobby.touch(a);
      lobby.touch(b);
      lobby.sweep();
      expect(lobby.viewFor(b).invites.received).toHaveLength(1);
      clock.advance(1);
      lobby.touch(a);
      lobby.touch(b);
      lobby.sweep();
      expect(lobby.viewFor(b).invites.received).toEqual([]);
      expect(lobby.viewFor(a).events).toEqual([{ type: 'invite-expired', name: 'Bob', tag: '0002' }]);
    });

    it('an expired invite cannot be accepted', () => {
      const a = join('Alice');
      const b = join('Bob');
      const inviteId = inviteFrom(a, b);
      clock.advance(INVITE_TTL_MS);
      lobby.touch(a);
      lobby.touch(b);
      lobby.sweep();
      expect(lobby.acceptInvite(b, inviteId)).toMatch(/not found/i);
    });

    it('events are delivered once', () => {
      const a = join('Alice');
      const b = join('Bob');
      lobby.declineInvite(b, inviteFrom(a, b));
      expect(lobby.viewFor(a).events).toHaveLength(1);
      expect(lobby.viewFor(a).events).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Append the match and presence tests**

Add these two `describe` blocks inside the outer `describe('Lobby', …)`, after the `invites` block (before the final `});`):

```ts
  describe('matches', () => {
    // X(a) wins the top row: a0 b3 a1 b4 a2
    function playXWin(a: string, b: string): void {
      lobby.makeMove(a, 0);
      lobby.makeMove(b, 3);
      lobby.makeMove(a, 1);
      lobby.makeMove(b, 4);
      expect(lobby.makeMove(a, 2)).toBeNull();
    }
    // Full board, nobody wins: X 0,2,3,7,8  O 1,4,5,6
    function playDraw(a: string, b: string): void {
      for (const [who, cell] of [
        [a, 0],
        [b, 1],
        [a, 2],
        [b, 4],
        [a, 3],
        [b, 5],
        [a, 7],
        [b, 6],
        [a, 8],
      ] as const) {
        expect(lobby.makeMove(who, cell)).toBeNull();
      }
    }

    it('accepting an invite starts round 1: inviter is X and moves first, scores are 0', () => {
      const a = join('Alice');
      const b = join('Bob');
      startMatch(a, b);
      const av = lobby.viewFor(a);
      const bv = lobby.viewFor(b);
      expect(av.phase).toBe('game');
      expect(av.game).toMatchObject({
        round: 1,
        yourMark: 'X',
        yourTurn: true,
        opponentName: 'Bob',
        opponentTag: '0002',
        yourScore: 0,
        opponentScore: 0,
        over: false,
        result: null,
      });
      expect(bv.game).toMatchObject({ yourMark: 'O', yourTurn: false, opponentName: 'Alice' });
      expect(lobby.viewFor(a).players[0].status).toBe('busy');
    });

    it('starting a match auto-cancels the other invites of both players and notifies the other parties', () => {
      const a = join('Alice');
      const b = join('Bob');
      const c = join('Carol');
      const d = join('Dave');
      const aToC = inviteFrom(a, c); // a's other sent invite
      inviteFrom(d, b); // b's other received invite
      startMatch(a, b);
      expect(lobby.viewFor(a).invites).toEqual({ sent: [], received: [] });
      expect(lobby.viewFor(b).invites).toEqual({ sent: [], received: [] });
      expect(lobby.viewFor(c).events).toEqual([
        { type: 'invite-cancelled', name: 'Alice', tag: '0001', reason: 'in-match' },
      ]);
      expect(lobby.viewFor(d).events).toEqual([
        { type: 'invite-cancelled', name: 'Bob', tag: '0002', reason: 'in-match' },
      ]);
      expect(lobby.viewFor(d).invites.sent).toEqual([]);
      // c's stale card (not yet refreshed by a poll) cannot be accepted any more
      expect(lobby.acceptInvite(c, aToC)).toMatch(/not found/i);
    });

    it('mutual invites: accepting either starts the match and silently drops the other', () => {
      const a = join('Alice');
      const b = join('Bob');
      inviteFrom(a, b);
      const fromB = inviteFrom(b, a);
      expect(lobby.acceptInvite(a, fromB)).toBeNull();
      expect(lobby.viewFor(a).phase).toBe('game');
      expect(lobby.viewFor(a).events).toEqual([]);
      expect(lobby.viewFor(b).events).toEqual([]);
      expect(lobby.viewFor(b).invites).toEqual({ sent: [], received: [] });
    });

    it('rejects a move out of turn, on an occupied cell, or when not in a game', () => {
      const a = join('Alice');
      const b = join('Bob');
      const c = join('Carol');
      startMatch(a, b);
      expect(lobby.makeMove(b, 0)).toMatch(/turn/i);
      expect(lobby.makeMove(a, 0)).toBeNull();
      expect(lobby.makeMove(b, 0)).toMatch(/taken/i);
      expect(lobby.makeMove(c, 0)).toMatch(/not in a game/i);
    });

    it('a win ends the round, increments the winner score and is visible to both', () => {
      const a = join('Alice');
      const b = join('Bob');
      startMatch(a, b);
      playXWin(a, b);
      const av = lobby.viewFor(a).game!;
      const bv = lobby.viewFor(b).game!;
      expect(av).toMatchObject({
        over: true,
        result: { status: 'won', winner: 'X' },
        yourScore: 1,
        opponentScore: 0,
        yourTurn: false,
      });
      expect(bv).toMatchObject({ over: true, yourScore: 0, opponentScore: 1, yourTurn: false });
      expect(lobby.makeMove(b, 5)).toMatch(/over/i);
    });

    it('a draw ends the round without changing the score', () => {
      const a = join('Alice');
      const b = join('Bob');
      startMatch(a, b);
      playDraw(a, b);
      expect(lobby.viewFor(a).game).toMatchObject({
        over: true,
        result: { status: 'draw' },
        yourScore: 0,
        opponentScore: 0,
      });
    });

    it('after REMATCH_DELAY_MS a sweep starts the next round with marks swapped and the score kept', () => {
      const a = join('Alice');
      const b = join('Bob');
      startMatch(a, b);
      playXWin(a, b);
      clock.advance(REMATCH_DELAY_MS - 1);
      lobby.sweep();
      expect(lobby.viewFor(a).game).toMatchObject({ round: 1, over: true });
      clock.advance(1);
      lobby.sweep();
      const av = lobby.viewFor(a).game!;
      const bv = lobby.viewFor(b).game!;
      expect(av).toMatchObject({ round: 2, over: false, result: null, yourMark: 'O', yourTurn: false, yourScore: 1 });
      expect(bv).toMatchObject({ round: 2, yourMark: 'X', yourTurn: true, opponentScore: 1 });
      expect(av.board).toEqual(Array(9).fill(null));
      expect(lobby.makeMove(b, 4)).toBeNull(); // b is X now and moves first
    });

    it('marks alternate every round', () => {
      const a = join('Alice');
      const b = join('Bob');
      startMatch(a, b);
      playXWin(a, b);
      clock.advance(REMATCH_DELAY_MS);
      lobby.sweep();
      playXWin(b, a); // b is X in round 2
      clock.advance(REMATCH_DELAY_MS);
      lobby.sweep();
      expect(lobby.viewFor(a).game).toMatchObject({ round: 3, yourMark: 'X', yourScore: 1, opponentScore: 1 });
    });

    it('leaving ends the match for both, whether or not the round is over', () => {
      const a = join('Alice');
      const b = join('Bob');
      startMatch(a, b);
      lobby.makeMove(a, 0);
      expect(lobby.leave(a)).toBeNull();
      expect(lobby.viewFor(a).phase).toBe('lobby');
      const bv = lobby.viewFor(b);
      expect(bv.phase).toBe('lobby');
      expect(bv.events).toEqual([{ type: 'opponent-left' }]);
      expect(lobby.viewFor(b).events).toEqual([]); // drained
      expect(lobby.viewFor(a).players[0].status).toBe('idle');
    });

    it('leaving during the rematch pause also ends the match', () => {
      const a = join('Alice');
      const b = join('Bob');
      startMatch(a, b);
      playXWin(a, b);
      lobby.leave(b);
      const av = lobby.viewFor(a);
      expect(av.phase).toBe('lobby');
      expect(av.events).toEqual([{ type: 'opponent-left' }]);
      clock.advance(REMATCH_DELAY_MS);
      lobby.sweep(); // nothing left to advance
      expect(lobby.viewFor(a).game).toBeNull();
    });

    it('leave when not in a match is a no-op', () => {
      const a = join('Alice');
      expect(lobby.leave(a)).toBeNull();
    });
  });

  describe('presence', () => {
    it('sweep removes a player idle past the TTL and ends their match', () => {
      const a = join('Alice');
      const b = join('Bob');
      join('Carol');
      startMatch(a, b);
      clock.advance(PRESENCE_TTL_MS + 1);
      lobby.touch(b);
      lobby.touch('id3');
      lobby.sweep();
      const bv = lobby.viewFor(b);
      expect(bv.phase).toBe('lobby');
      expect(bv.events).toEqual([{ type: 'opponent-left' }]);
      expect(lobby.viewFor(a).phase).toBe('name'); // a was removed entirely
      expect(lobby.viewFor(b).onlineCount).toBe(2);
    });

    it('sweep drops the pending invites of a removed player without an event', () => {
      const a = join('Alice');
      const c = join('Carol');
      inviteFrom(c, a);
      inviteFrom(a, c);
      clock.advance(PRESENCE_TTL_MS + 1);
      lobby.touch(c);
      lobby.sweep();
      const cv = lobby.viewFor(c);
      expect(cv.invites).toEqual({ sent: [], received: [] });
      expect(cv.events).toEqual([]);
    });
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/server/lobby/lobby.test.ts`
Expected: FAIL. Vitest does not typecheck, so the failures are runtime: `TypeError: Cannot read properties of undefined (reading 'received')` from `inviteFrom`, `REMATCH_DELAY_MS` undefined in the rematch tests, `lobby.cancelInvite is not a function`.

- [ ] **Step 4: Rewrite `src/server/lobby/lobby.ts`**

```ts
import {
  applyMove,
  type Board,
  createBoard,
  type GameResult,
  getResult,
  InvalidMoveError,
  type Mark,
} from '../game/game.js';
import {
  type GameView,
  INVITE_TTL_MS,
  type InviteView,
  type LobbyEvent,
  MAX_NAME,
  type Phase,
  type PlayerId,
  type PlayerView,
  PRESENCE_TTL_MS,
  type PublicPlayer,
  REMATCH_DELAY_MS,
} from './types.js';

export * from './types.js';

interface PlayerState {
  id: PlayerId;
  name: string | null;
  tag: string | null;
  matchId: string | null;
  lastSeen: number;
  events: LobbyEvent[];
}
interface Invite {
  id: string;
  fromId: PlayerId;
  toId: PlayerId;
  createdAt: number;
}
interface Match {
  id: string;
  players: [PlayerId, PlayerId];
  marks: Record<PlayerId, Mark>;
  score: Record<PlayerId, number>;
  round: number;
  board: Board;
  turn: Mark;
  over: boolean;
  result: GameResult | null;
  /** Set when a round ends; the next round starts REMATCH_DELAY_MS later. */
  endedAt: number | null;
}

function defaultGenId(): string {
  return Math.random().toString(36).slice(2, 10);
}
function defaultGenTag(): string {
  return String(Math.floor(Math.random() * 10_000)).padStart(4, '0');
}

/**
 * In-memory lobby: players, invites, matches and presence. Mutations return an error string or `null`;
 * `viewFor` snapshots the state for one player. Time-based transitions (presence, invite expiry, rematch)
 * happen in `sweep()`, which the tool handlers call on every request.
 */
export class Lobby {
  private players = new Map<PlayerId, PlayerState>();
  private invites = new Map<string, Invite>();
  private matches = new Map<string, Match>();

  constructor(
    private genId: () => string = defaultGenId,
    private clock: () => number = () => Date.now(),
    private genTag: () => string = defaultGenTag,
  ) {}

  connect(): PlayerId {
    const id = this.genId();
    this.players.set(id, { id, name: null, tag: null, matchId: null, lastSeen: this.clock(), events: [] });
    return id;
  }

  touch(id: PlayerId): void {
    const p = this.players.get(id);
    if (p) p.lastSeen = this.clock();
  }

  /** Presence removal, invite expiry and automatic rematches. Idempotent; safe to call on every request. */
  sweep(): void {
    const now = this.clock();
    for (const p of [...this.players.values()]) {
      if (p.lastSeen < now - PRESENCE_TTL_MS) this.removePlayer(p.id);
    }
    for (const [invId, inv] of [...this.invites]) {
      if (now - inv.createdAt >= INVITE_TTL_MS) {
        this.invites.delete(invId);
        this.pushEvent(inv.fromId, { type: 'invite-expired', ...this.handleOf(inv.toId) });
      }
    }
    for (const match of this.matches.values()) {
      if (match.endedAt !== null && now - match.endedAt >= REMATCH_DELAY_MS) this.startNextRound(match);
    }
  }

  register(id: PlayerId, name: string): string | null {
    const p = this.players.get(id);
    if (!p) return 'unknown player';
    const trimmed = name.trim().slice(0, MAX_NAME);
    if (!trimmed) return 'name required';
    p.name = trimmed;
    p.tag = this.uniqueTag(id, trimmed);
    return null;
  }

  invite(fromId: PlayerId, targetId: PlayerId): string | null {
    if (fromId === targetId) return 'cannot invite yourself';
    const from = this.players.get(fromId);
    const target = this.players.get(targetId);
    if (!from?.name) return 'register first';
    if (!target?.name) return 'player not available';
    if (from.matchId || target.matchId) return 'player is busy';
    for (const inv of this.invites.values()) {
      if (inv.fromId === fromId && inv.toId === targetId) return 'invite already pending';
    }
    const invite: Invite = { id: this.genId(), fromId, toId: targetId, createdAt: this.clock() };
    this.invites.set(invite.id, invite);
    return null;
  }

  cancelInvite(byId: PlayerId, inviteId: string): string | null {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.fromId !== byId) return 'invite not found';
    this.invites.delete(inviteId);
    this.pushEvent(invite.toId, { type: 'invite-cancelled', ...this.handleOf(byId), reason: 'by-sender' });
    return null;
  }

  declineInvite(byId: PlayerId, inviteId: string): string | null {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.toId !== byId) return null;
    this.invites.delete(inviteId);
    this.pushEvent(invite.fromId, { type: 'invite-declined', ...this.handleOf(byId) });
    return null;
  }

  acceptInvite(byId: PlayerId, inviteId: string): string | null {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.toId !== byId) return 'invite not found';
    this.invites.delete(inviteId);
    const a = this.players.get(invite.fromId);
    const b = this.players.get(byId);
    if (!a?.name) return 'player no longer available';
    // Defensive: invites of a player entering a match are auto-cancelled, so this is only reachable
    // if a future code path leaves one behind. The copy matches the spec.
    if (a.matchId) return `${a.name}#${a.tag} is in another match`;
    if (!b?.name) return 'register first';
    if (b.matchId) return 'you are already in a match';
    const match: Match = {
      id: this.genId(),
      players: [a.id, b.id],
      marks: { [a.id]: 'X', [b.id]: 'O' },
      score: { [a.id]: 0, [b.id]: 0 },
      round: 1,
      board: createBoard(),
      turn: 'X',
      over: false,
      result: null,
      endedAt: null,
    };
    this.matches.set(match.id, match);
    a.matchId = match.id;
    b.matchId = match.id;
    this.cancelInvitesOf(a.id, b.id);
    this.cancelInvitesOf(b.id, a.id);
    return null;
  }

  makeMove(id: PlayerId, cell: number): string | null {
    const p = this.players.get(id);
    if (!p?.matchId) return 'not in a game';
    const match = this.matches.get(p.matchId);
    if (!match) return 'game not found';
    if (match.over) return 'round is over';
    const mark = match.marks[id];
    if (match.turn !== mark) return 'not your turn';
    try {
      match.board = applyMove(match.board, cell, mark);
    } catch (err) {
      if (err instanceof InvalidMoveError) return err.message;
      throw err;
    }
    const result = getResult(match.board);
    if (result.status === 'ongoing') {
      match.turn = mark === 'X' ? 'O' : 'X';
      return null;
    }
    match.over = true;
    match.result = result;
    match.endedAt = this.clock();
    if (result.status === 'won') match.score[id] += 1;
    return null;
  }

  leave(id: PlayerId): string | null {
    const p = this.players.get(id);
    if (!p?.matchId) return null;
    this.endMatch(p.matchId, id);
    return null;
  }

  viewFor(id: PlayerId): PlayerView {
    const p = this.players.get(id);
    if (!p) {
      return {
        phase: 'name',
        you: { id, name: null, tag: null },
        onlineCount: this.onlineCount(),
        players: [],
        invites: { sent: [], received: [] },
        game: null,
        events: [],
        error: null,
      };
    }
    const events = p.events;
    p.events = [];
    const match = p.matchId ? (this.matches.get(p.matchId) ?? null) : null;
    const phase: Phase = !p.name ? 'name' : match ? 'game' : 'lobby';
    return {
      phase,
      you: { id: p.id, name: p.name, tag: p.tag },
      onlineCount: this.onlineCount(),
      players: this.publicPlayers(id),
      invites: this.invitesFor(id),
      game: match ? this.gameView(match, id) : null,
      events,
      error: null,
    };
  }

  // ---- internals ----

  private uniqueTag(selfId: PlayerId, name: string): string {
    let tag = this.genTag();
    while (this.handleTaken(selfId, name, tag)) tag = this.genTag();
    return tag;
  }

  private handleTaken(selfId: PlayerId, name: string, tag: string): boolean {
    for (const p of this.players.values()) {
      if (p.id !== selfId && p.name === name && p.tag === tag) return true;
    }
    return false;
  }

  private handleOf(id: PlayerId): { name: string; tag: string } {
    const p = this.players.get(id);
    return { name: p?.name ?? 'unknown', tag: p?.tag ?? '0000' };
  }

  private pushEvent(id: PlayerId, event: LobbyEvent): void {
    this.players.get(id)?.events.push(event);
  }

  /** Drops every pending invite involving `id` except those with `partnerId`, notifying the other party. */
  private cancelInvitesOf(id: PlayerId, partnerId: PlayerId): void {
    for (const [invId, inv] of [...this.invites]) {
      if (inv.fromId !== id && inv.toId !== id) continue;
      this.invites.delete(invId);
      const other = inv.fromId === id ? inv.toId : inv.fromId;
      if (other === partnerId) continue;
      this.pushEvent(other, { type: 'invite-cancelled', ...this.handleOf(id), reason: 'in-match' });
    }
  }

  private startNextRound(match: Match): void {
    const [a, b] = match.players;
    match.marks = { [a]: match.marks[b], [b]: match.marks[a] };
    match.board = createBoard();
    match.turn = 'X';
    match.round += 1;
    match.over = false;
    match.result = null;
    match.endedAt = null;
  }

  /** Ends the match for both players; everyone but `leaverId` gets an `opponent-left` event. */
  private endMatch(matchId: string, leaverId: PlayerId): void {
    const leaver = this.players.get(leaverId);
    if (leaver) leaver.matchId = null;
    const match = this.matches.get(matchId);
    if (!match) return;
    this.matches.delete(matchId);
    for (const pid of match.players) {
      if (pid === leaverId) continue;
      const opp = this.players.get(pid);
      if (opp && opp.matchId === matchId) {
        opp.matchId = null;
        opp.events.push({ type: 'opponent-left' });
      }
    }
  }

  private removePlayer(id: PlayerId): void {
    const p = this.players.get(id);
    if (!p) return;
    if (p.matchId) this.endMatch(p.matchId, id);
    for (const [invId, inv] of [...this.invites]) {
      if (inv.fromId === id || inv.toId === id) this.invites.delete(invId);
    }
    this.players.delete(id);
  }

  private onlineCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.name) n += 1;
    return n;
  }

  private publicPlayers(selfId: PlayerId): PublicPlayer[] {
    const out: PublicPlayer[] = [];
    for (const p of this.players.values()) {
      if (p.id === selfId || !p.name || !p.tag) continue;
      out.push({ id: p.id, name: p.name, tag: p.tag, status: p.matchId ? 'busy' : 'idle' });
    }
    return out;
  }

  private invitesFor(id: PlayerId): { sent: InviteView[]; received: InviteView[] } {
    const now = this.clock();
    const sent: InviteView[] = [];
    const received: InviteView[] = [];
    for (const inv of this.invites.values()) {
      const expiresIn = inv.createdAt + INVITE_TTL_MS - now;
      if (expiresIn <= 0) continue;
      if (inv.fromId === id) sent.push({ inviteId: inv.id, ...this.handleOf(inv.toId), expiresIn });
      else if (inv.toId === id) received.push({ inviteId: inv.id, ...this.handleOf(inv.fromId), expiresIn });
    }
    return { sent, received };
  }

  private gameView(match: Match, id: PlayerId): GameView {
    const oppId = match.players.find((x) => x !== id)!;
    const opp = this.handleOf(oppId);
    return {
      round: match.round,
      board: match.board,
      yourMark: match.marks[id],
      yourTurn: !match.over && match.turn === match.marks[id],
      opponentName: opp.name,
      opponentTag: opp.tag,
      yourScore: match.score[id],
      opponentScore: match.score[oppId],
      over: match.over,
      result: match.result,
    };
  }
}
```

- [ ] **Step 5: Run the lobby tests**

Run: `pnpm vitest run src/server/lobby/lobby.test.ts`
Expected: PASS, every test green.

- [ ] **Step 6: Lint, then commit**

Run: `pnpm biome check --write src/server/lobby && pnpm biome check src/server/lobby`
Expected: no diagnostics. (Whole-repo `pnpm lint` still reports the not-yet-updated files; that is expected until Task 5.)

```bash
git add src/server/lobby/lobby.ts src/server/lobby/lobby.test.ts
git commit -m "feat(lobby): handles with tags, multi-invite lobby with expiry and cancel, automatic rematch with score

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Handlers sweep on every call and gain cancel_invite

**Files:**
- Modify: `src/server/tools/handlers.ts`
- Rewrite: `src/server/tools/handlers.test.ts`

**Interfaces:**
- Consumes: `Lobby` from Task 2.
- Produces: `handleCancelInvite(lobby, { playerId, inviteId }): ToolReply`; every handler now calls `lobby.sweep()` right after `lobby.touch()`.

- [ ] **Step 1: Rewrite the handler tests**

Replace `src/server/tools/handlers.test.ts` with:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { PlayerView } from '../lobby/lobby.js';
import { Lobby, REMATCH_DELAY_MS } from '../lobby/lobby.js';
import {
  handleAcceptInvite,
  handleCancelInvite,
  handleGetState,
  handleInvite,
  handleJoin,
  handleMove,
  handleSetName,
  type JoinResult,
} from './handlers.js';

function makeCounter() {
  let n = 0;
  return () => `id${++n}`;
}

describe('tool handlers', () => {
  let now: number;
  let lobby: Lobby;
  beforeEach(() => {
    now = 1000;
    lobby = new Lobby(makeCounter(), () => now);
  });

  function joinAs(name: string): string {
    const { playerId } = handleJoin(lobby).structuredContent as unknown as JoinResult;
    handleSetName(lobby, { playerId, name });
    return playerId;
  }
  function stateOf(playerId: string): PlayerView {
    return handleGetState(lobby, { playerId }).structuredContent as unknown as PlayerView;
  }

  it('handleJoin allocates a playerId and returns an initial name-phase view', () => {
    const reply = handleJoin(lobby);
    const data = reply.structuredContent as unknown as JoinResult;
    expect(typeof data.playerId).toBe('string');
    expect(data.view.phase).toBe('name');
    expect(data.view.onlineCount).toBe(0);
    // text content mirrors structuredContent for non-UI hosts
    expect(JSON.parse(reply.content[0].text)).toEqual(data);
  });

  it('handleSetName registers and returns a lobby-phase view with a tag', () => {
    const { playerId } = handleJoin(lobby).structuredContent as unknown as JoinResult;
    const view = handleSetName(lobby, { playerId, name: 'Alice' }).structuredContent as unknown as PlayerView;
    expect(view.phase).toBe('lobby');
    expect(view.you.name).toBe('Alice');
    expect(view.you.tag).toMatch(/^\d{4}$/);
    expect(view.error).toBeNull();
  });

  it('handleGetState reflects another player joining', () => {
    const a = joinAs('Alice');
    joinAs('Bob');
    expect(stateOf(a).players.map((p) => p.name)).toEqual(['Bob']);
    expect(stateOf(a).onlineCount).toBe(2);
  });

  it('a full invite→accept→move flow drives both players into a game', () => {
    const a = joinAs('Alice');
    const b = joinAs('Bob');
    handleInvite(lobby, { playerId: a, targetId: b });
    handleAcceptInvite(lobby, { playerId: b, inviteId: stateOf(b).invites.received[0].inviteId });
    const moved = handleMove(lobby, { playerId: a, cell: 4 }).structuredContent as unknown as PlayerView;
    expect(moved.game!.board[4]).toBe('X');
  });

  it('handleCancelInvite withdraws a sent invite', () => {
    const a = joinAs('Alice');
    const b = joinAs('Bob');
    const sent = handleInvite(lobby, { playerId: a, targetId: b }).structuredContent as unknown as PlayerView;
    const view = handleCancelInvite(lobby, { playerId: a, inviteId: sent.invites.sent[0].inviteId })
      .structuredContent as unknown as PlayerView;
    expect(view.error).toBeNull();
    expect(view.invites.sent).toEqual([]);
    expect(stateOf(b).events).toEqual([
      { type: 'invite-cancelled', name: 'Alice', tag: expect.any(String), reason: 'by-sender' },
    ]);
  });

  it('every handler sweeps, so a rematch starts on any call after the delay', () => {
    const a = joinAs('Alice');
    const b = joinAs('Bob');
    handleInvite(lobby, { playerId: a, targetId: b });
    handleAcceptInvite(lobby, { playerId: b, inviteId: stateOf(b).invites.received[0].inviteId });
    for (const [who, cell] of [
      [a, 0],
      [b, 3],
      [a, 1],
      [b, 4],
      [a, 2],
    ] as const) {
      handleMove(lobby, { playerId: who, cell });
    }
    now += REMATCH_DELAY_MS;
    // A mutation, not get_state: the sweep inside it must advance the round first.
    const view = handleMove(lobby, { playerId: b, cell: 4 }).structuredContent as unknown as PlayerView;
    expect(view.error).toBeNull(); // b is X in round 2 and may move
    expect(view.game).toMatchObject({ round: 2 });
    expect(view.game!.board[4]).toBe('X');
  });

  it('an invalid move surfaces an error in the view without throwing', () => {
    const a = joinAs('Alice');
    const view = handleMove(lobby, { playerId: a, cell: 0 }).structuredContent as unknown as PlayerView;
    expect(view.error).toMatch(/not in a game/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/server/tools/handlers.test.ts`
Expected: FAIL: `TypeError: handleCancelInvite is not a function`, and the sweep test's `expect(view.error).toBeNull()` fails with `round is over`.

- [ ] **Step 3: Update `src/server/tools/handlers.ts`**

Replace the file with:

```ts
import type { Lobby, PlayerView } from '../lobby/lobby.js';

export interface ToolReply {
  // index signature so the reply satisfies the SDK's CallToolResult shape
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  structuredContent: Record<string, unknown>;
}

export interface JoinResult {
  playerId: string;
  view: PlayerView;
}

function reply(data: object): ToolReply {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    structuredContent: data as Record<string, unknown>,
  };
}

/** Heartbeat for the caller, then advance every time-based transition before the mutation runs. */
function tick(lobby: Lobby, playerId: string): void {
  lobby.touch(playerId);
  lobby.sweep();
}

/** view for `playerId` with the mutation's error (if any) merged in. */
function viewWithError(lobby: Lobby, playerId: string, error: string | null): ToolReply {
  return reply({ ...lobby.viewFor(playerId), error });
}

export function handleJoin(lobby: Lobby): ToolReply {
  lobby.sweep();
  const playerId = lobby.connect();
  return reply({ playerId, view: lobby.viewFor(playerId) });
}

export function handleSetName(lobby: Lobby, args: { playerId: string; name: string }): ToolReply {
  tick(lobby, args.playerId);
  const error = lobby.register(args.playerId, args.name);
  return viewWithError(lobby, args.playerId, error);
}

export function handleGetState(lobby: Lobby, args: { playerId: string }): ToolReply {
  tick(lobby, args.playerId);
  return reply(lobby.viewFor(args.playerId));
}

export function handleInvite(lobby: Lobby, args: { playerId: string; targetId: string }): ToolReply {
  tick(lobby, args.playerId);
  const error = lobby.invite(args.playerId, args.targetId);
  return viewWithError(lobby, args.playerId, error);
}

export function handleAcceptInvite(lobby: Lobby, args: { playerId: string; inviteId: string }): ToolReply {
  tick(lobby, args.playerId);
  const error = lobby.acceptInvite(args.playerId, args.inviteId);
  return viewWithError(lobby, args.playerId, error);
}

export function handleDeclineInvite(lobby: Lobby, args: { playerId: string; inviteId: string }): ToolReply {
  tick(lobby, args.playerId);
  const error = lobby.declineInvite(args.playerId, args.inviteId);
  return viewWithError(lobby, args.playerId, error);
}

export function handleCancelInvite(lobby: Lobby, args: { playerId: string; inviteId: string }): ToolReply {
  tick(lobby, args.playerId);
  const error = lobby.cancelInvite(args.playerId, args.inviteId);
  return viewWithError(lobby, args.playerId, error);
}

export function handleMove(lobby: Lobby, args: { playerId: string; cell: number }): ToolReply {
  tick(lobby, args.playerId);
  const error = lobby.makeMove(args.playerId, args.cell);
  return viewWithError(lobby, args.playerId, error);
}

export function handleLeave(lobby: Lobby, args: { playerId: string }): ToolReply {
  tick(lobby, args.playerId);
  const error = lobby.leave(args.playerId);
  return viewWithError(lobby, args.playerId, error);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/server/tools/handlers.test.ts src/server/lobby/lobby.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
pnpm biome check --write src/server/tools && pnpm biome check src/server/tools
git add src/server/tools/handlers.ts src/server/tools/handlers.test.ts
git commit -m "feat(tools): sweep on every call and add cancel_invite handler

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Register the cancel_invite tool

**Files:**
- Modify: `src/server/server.ts` (import list; new block after the `decline_invite` registration)
- Modify: `src/server/server.test.ts` (`APP_ONLY_TOOLS` constant and the `join_game` test)

**Interfaces:**
- Consumes: `handleCancelInvite` from Task 3.
- Produces: MCP tool `cancel_invite` with input `{ playerId: string; inviteId: string }`, app-only.

- [ ] **Step 1: Extend the contract test**

In `src/server/server.test.ts` replace the `APP_ONLY_TOOLS` line with:

```ts
const APP_ONLY_TOOLS = [
  'set_name',
  'get_state',
  'invite',
  'accept_invite',
  'decline_invite',
  'cancel_invite',
  'make_move',
  'leave',
];
```

Replace the `join_game returns a player id…` test with:

```ts
  it('join_game returns a player id and a view in structuredContent', async () => {
    const result = await client.callTool({ name: 'join_game', arguments: {} });
    const structured = result.structuredContent as {
      playerId: string;
      view: { phase: string; onlineCount: number; invites: { sent: unknown[]; received: unknown[] }; events: unknown[] };
    };
    expect(structured.playerId).toEqual(expect.any(String));
    expect(structured.view.phase).toBe('name');
    expect(structured.view.onlineCount).toBe(0);
    expect(structured.view.invites).toEqual({ sent: [], received: [] });
    expect(structured.view.events).toEqual([]);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/server/server.test.ts`
Expected: FAIL on "marks every other tool as app-only": `cancel_invite` undefined, tool count 8 vs 9.

- [ ] **Step 3: Register the tool**

In `src/server/server.ts`, add `handleCancelInvite` to the import from `./tools/handlers.js` (keep the list alphabetical for Biome's organize-imports), then insert after the `decline_invite` block:

```ts
  registerAppTool(
    server,
    'cancel_invite',
    {
      title: 'Cancel Invite',
      description: 'Withdraw an invite you sent.',
      inputSchema: z.object({ playerId: playerIdSchema, inviteId: z.string().min(1) }),
      _meta: appOnly,
    },
    async (args) => handleCancelInvite(lobby, args),
  );
```

- [ ] **Step 4: Run the whole server suite**

Run: `pnpm test`
Expected: PASS for all four files.

- [ ] **Step 5: Lint and commit**

```bash
pnpm biome check --write src/server && pnpm biome check src/server
git add src/server/server.ts src/server/server.test.ts
git commit -m "feat(server): expose cancel_invite app-only tool

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Widget adaptation to the new PlayerView

**Files:**
- Modify: `src/app/lib/tools.ts`
- Create: `src/app/lib/events.ts`
- Rewrite: `src/app/App.tsx`
- Rewrite: `src/app/components/NameScreen.tsx`
- Rewrite: `src/app/components/LobbyScreen.tsx`
- Rewrite: `src/app/components/GameBoard.tsx`
- Delete: `src/app/components/InviteBanner.tsx`

**Interfaces:**
- Consumes: `PlayerView`, `InviteView`, `LobbyEvent`, `GameView` from `src/server/lobby/lobby.js` (type-only), tool name `cancel_invite`.
- Produces: `handle(name, tag): string`, `eventText(event: LobbyEvent): string`; component props listed below. PR 2 replaces these components but keeps `App.tsx`'s `call` and `ingest` wiring.

There is no widget test runner yet (PR 2 adds jsdom), so this task is verified by `pnpm typecheck`, `pnpm build` and a manual run.

- [ ] **Step 1: Tool names and type re-exports**

In `src/app/lib/tools.ts` replace the `export type { … }` line with:

```ts
export type { GameView, InviteView, LobbyEvent, PlayerView, PublicPlayer } from '../../server/lobby/lobby.js';
```

and the `ToolName` type with:

```ts
export type ToolName =
  | 'set_name'
  | 'get_state'
  | 'invite'
  | 'accept_invite'
  | 'decline_invite'
  | 'cancel_invite'
  | 'make_move'
  | 'leave';
```

- [ ] **Step 2: Event copy**

Create `src/app/lib/events.ts`:

```ts
import type { LobbyEvent } from './tools';

export function handle(name: string, tag: string): string {
  return `${name}#${tag}`;
}

/** Human copy for each server event; rendered as a transient banner. */
export function eventText(event: LobbyEvent): string {
  switch (event.type) {
    case 'opponent-left':
      return 'Your opponent left the match.';
    case 'invite-declined':
      return `${handle(event.name, event.tag)} declined your invite.`;
    case 'invite-expired':
      return `Your invite to ${handle(event.name, event.tag)} expired.`;
    case 'invite-cancelled':
      return event.reason === 'in-match'
        ? `${handle(event.name, event.tag)} is in another match.`
        : `${handle(event.name, event.tag)} cancelled the invite.`;
  }
}
```

- [ ] **Step 3: Name screen shows the online count**

Replace `src/app/components/NameScreen.tsx`:

```tsx
import { type FormEvent, useState } from 'react';

interface Props {
  onlineCount: number;
  error: string | null;
  onSubmit: (name: string) => void;
}

export function NameScreen({ onlineCount, error, onSubmit }: Props) {
  const [name, setName] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <form onSubmit={submit}>
      <h2>Tic-Tac-Toe</h2>
      <p className="muted">
        {onlineCount} player{onlineCount === 1 ? '' : 's'} online
      </p>
      {error && <div className="banner">{error}</div>}
      <div className="row">
        <input placeholder="Your name" maxLength={24} value={name} onChange={(event) => setName(event.target.value)} />
        <button type="submit">Join Game</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Lobby screen with handles and both invite lists**

Replace `src/app/components/LobbyScreen.tsx`:

```tsx
import { handle } from '../lib/events';
import type { PlayerView } from '../lib/tools';

interface Props {
  view: PlayerView;
  onInvite: (targetId: string) => void;
  onAccept: (inviteId: string) => void;
  onDecline: (inviteId: string) => void;
  onCancel: (inviteId: string) => void;
}

function seconds(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 1000))}s`;
}

export function LobbyScreen({ view, onInvite, onAccept, onDecline, onCancel }: Props) {
  const you = view.you.name && view.you.tag ? handle(view.you.name, view.you.tag) : '…';
  return (
    <section>
      <h2>Lobby — you are {you}</h2>

      <h3>Players ({view.onlineCount} online)</h3>
      {view.players.length === 0 && <p className="muted">Waiting for other players…</p>}
      {view.players.map((player) => (
        <div className="row" key={player.id}>
          <span>
            {handle(player.name, player.tag)} ({player.status})
          </span>
          <button type="button" disabled={player.status !== 'idle'} onClick={() => onInvite(player.id)}>
            Invite
          </button>
        </div>
      ))}

      <h3>Received invites</h3>
      {view.invites.received.length === 0 && <p className="muted">No invites</p>}
      {view.invites.received.map((invite) => (
        <div className="row" key={invite.inviteId}>
          <span>
            {handle(invite.name, invite.tag)} · {seconds(invite.expiresIn)}
          </span>
          <button type="button" onClick={() => onAccept(invite.inviteId)}>
            Accept
          </button>
          <button type="button" className="secondary" onClick={() => onDecline(invite.inviteId)}>
            Deny
          </button>
        </div>
      ))}

      <h3>Sent invites</h3>
      {view.invites.sent.length === 0 && <p className="muted">No invites</p>}
      {view.invites.sent.map((invite) => (
        <div className="row" key={invite.inviteId}>
          <span>
            {handle(invite.name, invite.tag)} · {seconds(invite.expiresIn)}
          </span>
          <button type="button" className="secondary" onClick={() => onCancel(invite.inviteId)}>
            Cancel
          </button>
        </div>
      ))}
    </section>
  );
}
```

The countdown only refreshes on each poll (every 1.5 s); a local ticking countdown is part of the PR 2 reskin. Inviting a player twice is rejected by the server and surfaces as a banner.

- [ ] **Step 5: Game board with score header**

Replace `src/app/components/GameBoard.tsx`:

```tsx
import { handle } from '../lib/events';
import type { GameView } from '../lib/tools';

interface Props {
  you: { name: string | null; tag: string | null };
  game: GameView;
  onMove: (cell: number) => void;
  onLeave: () => void;
}

function statusLine(game: GameView): string {
  if (game.over) {
    if (game.result?.status === 'draw') return 'Draw. Next round starts in a moment…';
    const youWon = game.result?.status === 'won' && game.result.winner === game.yourMark;
    return youWon ? 'You win! Next round starts in a moment…' : 'You lose. Next round starts in a moment…';
  }
  return game.yourTurn ? 'Your turn' : "Opponent's turn";
}

export function GameBoard({ you, game, onMove, onLeave }: Props) {
  const yourHandle = you.name && you.tag ? handle(you.name, you.tag) : 'you';
  return (
    <section>
      <h2>
        [{game.yourScore}] {yourHandle} x {handle(game.opponentName, game.opponentTag)} [{game.opponentScore}]
      </h2>
      <p className="muted">
        Round {game.round} · you are {game.yourMark} · {statusLine(game)}
      </p>
      <div className="board">
        {game.board.map((mark, index) => (
          <button
            // Cells are positional and never reorder; the index is the identity.
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed 3x3 grid
            key={index}
            type="button"
            className="cell"
            aria-label={`Cell ${index + 1}${mark ? `, ${mark}` : ''}`}
            disabled={game.over || !game.yourTurn || mark !== null}
            onClick={() => onMove(index)}
          >
            {mark ?? ''}
          </button>
        ))}
      </div>
      <div className="row">
        <button type="button" className="secondary" onClick={onLeave}>
          Back to lobby
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: App wiring: banners from events, invite callbacks, online count**

Replace `src/app/App.tsx`:

```tsx
import { useApp } from '@modelcontextprotocol/ext-apps/react';
import { useCallback, useEffect, useState } from 'react';
import pkg from '../../package.json';
import { GameBoard } from './components/GameBoard';
import { LobbyScreen } from './components/LobbyScreen';
import { NameScreen } from './components/NameScreen';
import { useHostTheme } from './hooks/useHostTheme';
import { usePollView } from './hooks/usePollView';
import { eventText } from './lib/events';
import { callTool, isJoinResult, isPlayerView, type PlayerView, parseTextBlock, type ToolName } from './lib/tools';

const BANNER_MS = 4000;

interface Banner {
  id: number;
  text: string;
}

export function TicTacToeApp() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [theme, setTheme] = useState<string | undefined>(undefined);
  const [tornDown, setTornDown] = useState(false);

  const showBanner = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setBanners((current) => [...current, { id, text }]);
    window.setTimeout(() => setBanners((current) => current.filter((banner) => banner.id !== id)), BANNER_MS);
  }, []);

  // Every tool reply is either the join result ({ playerId, view }) or a bare PlayerView.
  const ingest = useCallback(
    (data: unknown) => {
      let next: PlayerView | null = null;
      if (isJoinResult(data)) {
        setPlayerId(data.playerId);
        next = data.view;
      } else if (isPlayerView(data)) {
        next = data;
      }
      if (!next) return;
      setView(next);
      for (const event of next.events) showBanner(eventText(event));
      // The name screen renders its error inline; everywhere else it is a banner.
      if (next.error && next.phase !== 'name') showBanner(next.error);
    },
    [showBanner],
  );

  const { app, error } = useApp({
    appInfo: { name: 'Tic-Tac-Toe', version: pkg.version },
    capabilities: {},
    onAppCreated: (created) => {
      created.ontoolresult = (result) => ingest(result.structuredContent ?? parseTextBlock(result.content));
      created.onhostcontextchanged = (context) => {
        if (context.theme) setTheme(context.theme);
      };
      created.onteardown = async () => {
        setTornDown(true);
        return {};
      };
      created.onerror = console.error;
    },
  });

  useEffect(() => {
    if (app) setTheme(app.getHostContext()?.theme);
  }, [app]);
  useHostTheme(app, theme);
  usePollView(app, tornDown ? null : playerId, ingest);

  const call = useCallback(
    async (name: ToolName, args: Record<string, unknown>) => {
      if (!app || !playerId) return;
      try {
        ingest(await callTool(app, name, { playerId, ...args }));
      } catch (err) {
        console.error(err);
      }
    },
    [app, playerId, ingest],
  );

  if (error) {
    return (
      <p className="banner">
        <strong>Error:</strong> {error.message}
      </p>
    );
  }
  if (!app) return <p className="muted">Connecting…</p>;
  if (!view) return <p className="muted">Loading…</p>;

  return (
    <main>
      {banners.map((banner) => (
        <div className="banner" key={banner.id}>
          {banner.text}
        </div>
      ))}
      {view.phase === 'name' && (
        <NameScreen onlineCount={view.onlineCount} error={view.error} onSubmit={(name) => call('set_name', { name })} />
      )}
      {view.phase === 'lobby' && (
        <LobbyScreen
          view={view}
          onInvite={(targetId) => call('invite', { targetId })}
          onAccept={(inviteId) => call('accept_invite', { inviteId })}
          onDecline={(inviteId) => call('decline_invite', { inviteId })}
          onCancel={(inviteId) => call('cancel_invite', { inviteId })}
        />
      )}
      {view.phase === 'game' && view.game && (
        <GameBoard
          you={view.you}
          game={view.game}
          onMove={(cell) => call('make_move', { cell })}
          onLeave={() => call('leave', {})}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 7: Delete the invite banner and verify everything**

```bash
git rm src/app/components/InviteBanner.tsx
pnpm lint:fix && pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Expected: all four commands succeed; `dist/mcp-app.html` and `dist/server/` are produced.

- [ ] **Step 8: Manual smoke test**

Run `pnpm dev`, then in a second terminal start the ext-apps `basic-host` example (see CLAUDE.md) pointed at `http://localhost:8765/mcp`. Open two host tabs, call `join_game` in each, register two names, and verify: online count on the name screen; handle with tag in the lobby; an invite appears on both sides with a countdown; Cancel and Deny produce a banner on the other side; Accept starts the game; a win shows the score and after about 3 s round 2 starts with swapped marks; "Back to lobby" returns both players to the lobby with a banner for the opponent.

- [ ] **Step 9: Commit**

```bash
git add src/app
git commit -m "feat(app): wire widget to handles, invite lists, events and score

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: CLAUDE.md and pull request

**Files:**
- Modify: `CLAUDE.md` (sections "Tool surface", "Layers on the server", "Docs: what to trust")

- [ ] **Step 1: Update the tool surface bullet**

Replace the bullet that starts with "The seven others" with:

```markdown
- The eight others (`set_name`, `get_state`, `invite`, `accept_invite`, `decline_invite`, `cancel_invite`, `make_move`, `leave`) are **app-only**: `_meta.ui.visibility: ['app']`. They are called by the widget, hidden from the model.
```

- [ ] **Step 2: Update the lobby and handler bullets**

Replace the `lobby/lobby.ts` bullet with these two:

```markdown
- `lobby/types.ts`: constants (`PRESENCE_TTL_MS = 10_000`, `INVITE_TTL_MS = 60_000`, `REMATCH_DELAY_MS = 3_000`) and the public view types (`PlayerView`, `GameView`, `InviteView`, `LobbyEvent`). Re-exported from `lobby.ts`.
- `lobby/lobby.ts`: in-memory `Lobby` (players, invites, matches, presence). Players get a `name#tag` handle (4 random digits, unique per name). Invites expire after 60 s and are auto-cancelled when a party enters a match. A match keeps a per-player score and restarts automatically 3 s after a round ends, with X and O swapped. All time-based transitions live in `sweep()`. The constructor takes injectable `genId`, `clock` and `genTag` so tests are deterministic. Mutations return an error string or `null`; `viewFor(playerId)` snapshots the `PlayerView` and drains that player's `events`.
```

Replace the `tools/handlers.ts` bullet with:

```markdown
- `tools/handlers.ts`: one pure function per tool. Uniform contract: `lobby.touch(playerId)` → `lobby.sweep()` → mutate → return `viewFor(playerId)` with the transient `error` merged in. Every reply duplicates the payload in both `structuredContent` and a JSON `content[0].text` block. New tools should follow this exact shape.
```

- [ ] **Step 3: Update "Docs: what to trust"**

Replace the paragraph under that heading with:

```markdown
`docs/superpowers/specs/2026-09-14-portfolio-restructure-design.md` (layout, tooling) and `docs/superpowers/specs/2026-09-14-game-design-and-use-cases.md` (game behaviour, `PlayerView`, visual system, Storybook) match the code; `docs/superpowers/plans/2026-09-14-game-model-and-tools.md` is the plan for the server half of the latter. The two `2026-06-18` specs and both `2026-06-18` plans predate the restructure (`packages/*`, npm workspaces, Node 20, `@modelcontextprotocol/sdk` v1, zod 3, a vanilla `widget.html`) and their game behaviour is superseded by the 2026-09-14 game spec; do not use them. The v1 spec (`…-mcp-game-design.md`, mcp-ui external URL + WebSocket) is fully retired.
```

- [ ] **Step 4: Commit and open the PR**

```bash
git add CLAUDE.md
git commit -m "docs: describe handles, invites, rematch and cancel_invite in CLAUDE.md

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin feat/game-model-and-tools
gh pr create --title "feat: game model with handles, multi-invite lobby and automatic rematch" --body "$(cat <<'EOF'
## Summary
- `name#tag` handles and `onlineCount`
- many invites per player, 60 s expiry, `cancel_invite`, auto-cancel when a match starts
- automatic rematch 3 s after a round, alternating X, per-match score
- typed `events` replace `notice`; handlers sweep on every call
- minimal widget rewiring so typecheck/build stay green (reskin is the next PR)

Spec: `docs/superpowers/specs/2026-09-14-game-design-and-use-cases.md`

## Test plan
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- [ ] two clients through basic-host: invite → cancel/deny/accept → win → rematch → leave

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: CI (lint, typecheck, test, build, docker) green on the PR.
