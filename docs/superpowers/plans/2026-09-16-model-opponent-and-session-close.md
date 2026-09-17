# Model Opponent and Session Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player close their widget session for good, and let a player play tic-tac-toe against the assistant hosting the widget, with the server only arbitrating.

**Architecture:** The model opponent is a hidden lobby player (`kind: 'model'`, handle `Model#AI`) in an ordinary match, moved by a model-visible tool `model_move`. The widget posts a `ui/message` into the chat whenever it is the model's turn and shows "Ask again" after 10 s. Session close records a tombstone so `reconnect` never re-creates the id and the widget shows a closed screen and stops polling.

**Tech Stack:** TypeScript, Node 24, pnpm, `@modelcontextprotocol/server` 2.x, `@modelcontextprotocol/ext-apps` 2.0, zod 4, React 19, Vite, Vitest (node + jsdom projects), Testing Library, Storybook 10, Biome.

Spec: `docs/superpowers/specs/2026-09-16-model-opponent-and-session-close-design.md`.

## Global Constraints

- pnpm only; run `corepack enable` once. Node 24.
- Server imports end in `.js` (`../lobby/lobby.js`). App imports have no extension. `src/app/lib/tools.ts` imports server types type-only.
- Biome: 2 spaces, 120 cols, single quotes, JSX double quotes. Check with `pnpm lint`, fix with `pnpm lint:fix`.
- Screens and `ui/` primitives never import `@modelcontextprotocol/ext-apps`. Host boundary: `App.tsx`, `lib/tools.ts`, `hooks/usePollView.ts`, `hooks/useHostTheme.ts`, and the new `hooks/useModelTurn.ts`.
- Tool handlers follow `reconnect → sweep → mutate → viewFor + error`, except `model_move` (see Task 5).
- Conventional Commits; lefthook runs Biome on staged files and commitlint. Stage whole files. After any hook failure run `git status` and `git diff`.
- Commit trailer on every commit: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Copy (verbatim): `Model#AI`, "Play vs model", "Waiting for the model…", "Ask again", "Close session" (aria-label), "Close this session?", "This widget will stop working. Ask the assistant to open the game again to play.", "Your opponent will return to the lobby.", "Session closed", "Ask the assistant to open the game again to play.", errors `not a model player`, `you are already in a match`, `register first`, `player not available`.
- Constants: `CLOSED_TTL_MS = 24 * 60 * 60 * 1000`, `MODEL_STALE_MS = 10_000`.
- Branch: `feat/model-opponent-and-session-close` (already exists with the spec committed).

## File map

| File | Change |
|---|---|
| `src/server/lobby/types.ts` | `CLOSED_TTL_MS`, `MODEL_NAME`, `MODEL_TAG`, `Phase` + `'closed'`, `PlayerKind`, `GameView.opponentKind`, `GameView.modelPlayerId` |
| `src/server/lobby/lobby.ts` | `closed` map, `close`, tombstone-aware `reconnect`/`viewFor`/`sweep`; `kind`/`ownerId` on players, `startModelMatch`, `isModelPlayer`, `createMatch` helper, model exemptions |
| `src/server/lobby/lobby.test.ts` | new tests |
| `src/server/tools/handlers.ts` | `handleCloseSession`, `handlePlayVsModel`, `handleModelMove` |
| `src/server/tools/handlers.test.ts` | new tests |
| `src/server/server.ts` | tools `close_session`, `play_vs_model` (app-only), `model_move` (model-visible), `join_game` description |
| `src/server/server.test.ts` | visibility + end-to-end |
| `src/app/lib/tools.ts` | `ToolName` + `'close_session' \| 'play_vs_model'` |
| `src/app/lib/modelMessage.ts` (+test) | `buildModelMessage(game)` |
| `src/app/hooks/useModelTurn.ts` (+test) | `useModelTurn(app, game)` |
| `src/app/ui/CloseButton.tsx` (+test, +stories) | corner "X" with confirm modal |
| `src/app/screens/ClosedScreen.tsx` (+test, +stories) | closed panel |
| `src/app/screens/LobbyScreen.tsx` (+test, +stories) | `canPlayModel`, `onPlayModel` |
| `src/app/screens/GameScreen.tsx` (+test, +stories) | `modelTurn` |
| `src/app/fixtures/views.ts` | new `GameView` fields, `gameVsModelWaiting` |
| `src/app/App.tsx` | wiring |
| `src/app/styles/base.css` | `main`, `.close`, `.closed`, `.lobby__model` |
| `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `docs/superpowers/specs/2026-09-14-game-design-and-use-cases.md` | docs |

---

### Task 1: Lobby session close

**Files:**
- Modify: `src/server/lobby/types.ts`
- Modify: `src/server/lobby/lobby.ts`
- Test: `src/server/lobby/lobby.test.ts`

**Interfaces:**
- Produces: `CLOSED_TTL_MS: number`; `Phase` includes `'closed'`; `Lobby.close(id: PlayerId): null`; `Lobby.reconnect(id)` returns `false` and creates nothing for a closed id; `Lobby.viewFor(id)` returns `phase: 'closed'` for a closed unknown id.

- [ ] **Step 1: Write the failing tests**

Append inside the top-level `describe('Lobby', …)` in `src/server/lobby/lobby.test.ts`, after the `describe('matches', …)` block, and add `CLOSED_TTL_MS` to the import line:

```ts
import { CLOSED_TTL_MS, INVITE_TTL_MS, Lobby, PRESENCE_TTL_MS, REMATCH_DELAY_MS } from './lobby.js';
```

```ts
  describe('session close', () => {
    it('close ends the match for the opponent, removes the player and reports the closed phase', () => {
      const a = join('Alice');
      const b = join('Bob');
      startMatch(a, b);
      expect(lobby.close(a)).toBeNull();
      expect(lobby.viewFor(a).phase).toBe('closed');
      const bv = lobby.viewFor(b);
      expect(bv.phase).toBe('lobby');
      expect(bv.events).toEqual([{ type: 'opponent-left' }]);
      expect(bv.onlineCount).toBe(1);
    });

    it('close drops the pending invites of the player', () => {
      const a = join('Alice');
      const b = join('Bob');
      inviteFrom(a, b);
      lobby.close(a);
      expect(lobby.viewFor(b).invites.received).toEqual([]);
    });

    it('a closed id is never re-created by reconnect', () => {
      const a = join('Alice');
      lobby.close(a);
      expect(lobby.reconnect(a)).toBe(false);
      expect(lobby.viewFor(a).phase).toBe('closed');
      expect(lobby.register(a, 'Alice')).toMatch(/unknown player/i);
      expect(lobby.viewFor(a).onlineCount).toBe(0);
    });

    it('close on an unknown id still records it', () => {
      expect(lobby.close('ghost')).toBeNull();
      expect(lobby.reconnect('ghost')).toBe(false);
      expect(lobby.viewFor('ghost').phase).toBe('closed');
    });

    it('closed ids are forgotten after CLOSED_TTL_MS', () => {
      const a = join('Alice');
      lobby.close(a);
      clock.advance(CLOSED_TTL_MS - 1);
      lobby.sweep();
      expect(lobby.viewFor(a).phase).toBe('closed');
      clock.advance(1);
      lobby.sweep();
      expect(lobby.viewFor(a).phase).toBe('name');
      expect(lobby.reconnect(a)).toBe(true);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/server/lobby/lobby.test.ts`
Expected: FAIL, `CLOSED_TTL_MS` undefined / `lobby.close is not a function`.

- [ ] **Step 3: Implement**

In `src/server/lobby/types.ts` add after `MAX_NAME`:

```ts
/** A closed player id is remembered this long so a stale widget can never re-create it. */
export const CLOSED_TTL_MS = 24 * 60 * 60 * 1000;
```

and change `Phase`:

```ts
export type Phase = 'name' | 'lobby' | 'game' | 'closed';
```

In `src/server/lobby/lobby.ts`:

Add `CLOSED_TTL_MS` to the `./types.js` import list.

Add a field after `matches`:

```ts
  /** Ids closed by the player, with the close time. `reconnect` refuses them until `CLOSED_TTL_MS` passes. */
  private closed = new Map<PlayerId, number>();
```

Replace `reconnect`:

```ts
  reconnect(id: PlayerId): boolean {
    if (this.players.has(id)) {
      this.touch(id);
      return false;
    }
    if (this.closed.has(id)) return false;
    this.players.set(id, { id, name: null, tag: null, matchId: null, lastSeen: this.clock(), events: [] });
    return true;
  }
```

In `sweep()`, add at the end of the method:

```ts
    for (const [id, closedAt] of [...this.closed]) {
      if (now - closedAt >= CLOSED_TTL_MS) this.closed.delete(id);
    }
```

Add after `leave`:

```ts
  /**
   * Ends the session for good: any match ends (the opponent gets `opponent-left`), invites are dropped,
   * the player is removed and the id is remembered so a stale widget replaying it stays closed.
   */
  close(id: PlayerId): null {
    this.removePlayer(id);
    this.closed.set(id, this.clock());
    return null;
  }
```

In `viewFor`, change the unknown-player branch's `phase`:

```ts
    if (!p) {
      return {
        phase: this.closed.has(id) ? 'closed' : 'name',
        // ...rest unchanged
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/server/lobby/lobby.test.ts`
Expected: PASS (all, including the new five).

- [ ] **Step 5: Commit**

```bash
git add src/server/lobby/types.ts src/server/lobby/lobby.ts src/server/lobby/lobby.test.ts
git commit -m "feat(lobby): close a session and refuse to re-create a closed id

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `close_session` handler and tool

**Files:**
- Modify: `src/server/tools/handlers.ts`
- Modify: `src/server/server.ts`
- Test: `src/server/tools/handlers.test.ts`, `src/server/server.test.ts`

**Interfaces:**
- Consumes: `Lobby.close(id)` from Task 1.
- Produces: `handleCloseSession(lobby, { playerId }): ToolReply`; app-only tool `close_session({ playerId })`.

- [ ] **Step 1: Write the failing tests**

`src/server/tools/handlers.test.ts`: add `handleCloseSession` to the import from `./handlers.js`, then append inside the `describe`:

```ts
  it('handleCloseSession returns the closed phase and keeps it on later polls', () => {
    const a = joinAs('Alice');
    const b = joinAs('Bob');
    const view = handleCloseSession(lobby, { playerId: a }).structuredContent as unknown as PlayerView;
    expect(view.phase).toBe('closed');
    expect(view.error).toBeNull();
    expect(stateOf(a).phase).toBe('closed');
    expect(stateOf(b).onlineCount).toBe(1);
    const again = handleSetName(lobby, { playerId: a, name: 'Alice' }).structuredContent as unknown as PlayerView;
    expect(again.phase).toBe('closed');
  });
```

`src/server/server.test.ts`: add `'close_session'` to `APP_ONLY_TOOLS`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run --project server`
Expected: FAIL, `handleCloseSession` not exported; server test `close_session` undefined.

- [ ] **Step 3: Implement**

`src/server/tools/handlers.ts`, append:

```ts
export function handleCloseSession(lobby: Lobby, args: { playerId: string }): ToolReply {
  tick(lobby, args.playerId);
  const error = lobby.close(args.playerId);
  return viewWithError(lobby, args.playerId, error);
}
```

`src/server/server.ts`: import `handleCloseSession`; after the `leave` registration add:

```ts
  registerAppTool(
    server,
    'close_session',
    {
      title: 'Close Session',
      description: 'End this player session for good; the widget stops working until the game is opened again.',
      inputSchema: z.object({ playerId: playerIdSchema }),
      _meta: appOnly,
    },
    async (args) => handleCloseSession(lobby, args),
  );
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run --project server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/tools/handlers.ts src/server/tools/handlers.test.ts src/server/server.ts src/server/server.test.ts
git commit -m "feat(server): close_session app-only tool

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Widget close button and closed screen

**Files:**
- Modify: `src/app/lib/tools.ts`
- Create: `src/app/ui/CloseButton.tsx`, `src/app/ui/CloseButton.test.tsx`, `src/app/ui/CloseButton.stories.tsx`
- Create: `src/app/screens/ClosedScreen.tsx`, `src/app/screens/ClosedScreen.test.tsx`, `src/app/screens/ClosedScreen.stories.tsx`
- Modify: `src/app/App.tsx`, `src/app/styles/base.css`

**Interfaces:**
- Consumes: tool `close_session` (Task 2); `Phase` `'closed'` (Task 1).
- Produces: `CloseButton({ inMatch: boolean; onClose: () => void })`; `ClosedScreen()`.

- [ ] **Step 1: Write the failing tests**

`src/app/ui/CloseButton.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CloseButton } from './CloseButton';

describe('CloseButton', () => {
  it('asks for confirmation and only closes on confirm', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CloseButton inMatch={false} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Close session' }));
    const dialog = screen.getByRole('dialog', { name: 'Close this session?' });
    expect(dialog).toHaveTextContent('This widget will stop working. Ask the assistant to open the game again to play.');
    expect(dialog).not.toHaveTextContent('Your opponent will return to the lobby.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close session' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('warns about the opponent while in a match', async () => {
    const user = userEvent.setup();
    render(<CloseButton inMatch onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Close session' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Your opponent will return to the lobby.');
  });
});
```

`src/app/screens/ClosedScreen.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClosedScreen } from './ClosedScreen';

describe('ClosedScreen', () => {
  it('tells the player to ask the assistant again', () => {
    render(<ClosedScreen />);
    expect(screen.getByText('Session closed')).toBeInTheDocument();
    expect(screen.getByText('Ask the assistant to open the game again to play.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run --project app src/app/ui/CloseButton.test.tsx src/app/screens/ClosedScreen.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the components**

`src/app/ui/CloseButton.tsx`:

```tsx
import { useState } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

interface Props {
  /** Adds the opponent warning to the confirmation. */
  inMatch: boolean;
  onClose: () => void;
}

/** Corner "X" that ends the session for good, behind an in-widget confirmation. */
export function CloseButton({ inMatch, onClose }: Props) {
  const [open, setOpen] = useState(false);

  const confirm = () => {
    setOpen(false);
    onClose();
  };

  return (
    <>
      <Button variant="secondary" className="close" aria-label="Close session" onClick={() => setOpen(true)}>
        ×
      </Button>
      {open && (
        <Modal title="Close this session?" confirmLabel="Close" danger onConfirm={confirm} onCancel={() => setOpen(false)}>
          <p>This widget will stop working. Ask the assistant to open the game again to play.</p>
          {inMatch && <p>Your opponent will return to the lobby.</p>}
        </Modal>
      )}
    </>
  );
}
```

`src/app/screens/ClosedScreen.tsx`:

```tsx
import { Panel } from '../ui/Panel';
import { Ribbon } from '../ui/Ribbon';

/** Terminal screen: the id was closed on the server and this widget will not be revived. */
export function ClosedScreen() {
  return (
    <Panel className="closed">
      <Ribbon>Session closed</Ribbon>
      <p className="muted">Ask the assistant to open the game again to play.</p>
    </Panel>
  );
}
```

`src/app/ui/CloseButton.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { CloseButton } from './CloseButton';

const meta = {
  title: 'UI/CloseButton',
  component: CloseButton,
  args: { inMatch: false, onClose: fn() },
} satisfies Meta<typeof CloseButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};
export const ConfirmOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Close session' }));
    await expect(canvas.getByRole('dialog')).toBeInTheDocument();
  },
};
export const ConfirmOpenInMatch: Story = { ...ConfirmOpen, args: { inMatch: true } };
```

`src/app/screens/ClosedScreen.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClosedScreen } from './ClosedScreen';

const meta = { title: 'Screens/Closed', component: ClosedScreen } satisfies Meta<typeof ClosedScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Dark: Story = { globals: { theme: 'dark' } };
```

`src/app/styles/base.css`: after the `#root` rule add:

```css
main {
  position: relative;
  padding-top: 28px;
}
```

and after the `.btn--danger:active` rule add:

```css
.close {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 10;
  padding: 2px 4px;
}
```

and in the Screens section add:

```css
.closed {
  max-width: 360px;
  margin: 44px auto 0;
  text-align: center;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run --project app src/app/ui/CloseButton.test.tsx src/app/screens/ClosedScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire `App.tsx`**

`src/app/lib/tools.ts`: extend `ToolName`:

```ts
export type ToolName =
  | 'set_name'
  | 'get_state'
  | 'invite'
  | 'accept_invite'
  | 'decline_invite'
  | 'cancel_invite'
  | 'make_move'
  | 'leave'
  | 'close_session';
```

`src/app/App.tsx`:

Add imports:

```tsx
import { ClosedScreen } from './screens/ClosedScreen';
import { CloseButton } from './ui/CloseButton';
```

Replace the `usePollView` line:

```tsx
  usePollView(app, tornDown || view?.phase === 'closed' ? null : playerId, ingest);
```

Inside `<main>` right after `<ToastStack …/>` add:

```tsx
      {view.phase !== 'closed' && (
        <CloseButton inMatch={view.phase === 'game'} onClose={() => call('close_session', {})} />
      )}
      {view.phase === 'closed' && <ClosedScreen />}
```

- [ ] **Step 6: Typecheck, lint, full app tests**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run --project app`
Expected: all green. If Biome reports formatting, run `pnpm lint:fix` and re-run.

- [ ] **Step 7: Commit**

```bash
git add src/app/lib/tools.ts src/app/ui/CloseButton.tsx src/app/ui/CloseButton.test.tsx src/app/ui/CloseButton.stories.tsx src/app/screens/ClosedScreen.tsx src/app/screens/ClosedScreen.test.tsx src/app/screens/ClosedScreen.stories.tsx src/app/App.tsx src/app/styles/base.css
git commit -m "feat(app): close-session button and closed screen

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Lobby model player

**Files:**
- Modify: `src/server/lobby/types.ts`
- Modify: `src/server/lobby/lobby.ts`
- Modify: `src/app/fixtures/views.ts` (root `tsconfig.json` typechecks both trees, so the fixtures must gain the new fields in the same commit)
- Test: `src/server/lobby/lobby.test.ts`

**Interfaces:**
- Produces: `PlayerKind`, `MODEL_NAME = 'Model'`, `MODEL_TAG = 'AI'`; `GameView.opponentKind: PlayerKind`, `GameView.modelPlayerId: PlayerId | null`; `Lobby.startModelMatch(humanId): string | null`; `Lobby.isModelPlayer(id): boolean`; fixture `gameVsModelWaiting`.

- [ ] **Step 1: Write the failing tests**

Inside `describe('matches', …)` in `src/server/lobby/lobby.test.ts`, after the last `it(...)` of that block (so `playXWin` is in scope), add:

```ts
    describe('model opponent', () => {
      it('startModelMatch puts the player in a game against Model#AI as X', () => {
        const a = join('Alice');
        expect(lobby.startModelMatch(a)).toBeNull();
        const av = lobby.viewFor(a);
        expect(av.phase).toBe('game');
        expect(av.game).toMatchObject({
          round: 1,
          yourMark: 'X',
          yourTurn: true,
          opponentName: 'Model',
          opponentTag: 'AI',
          opponentKind: 'model',
          yourScore: 0,
          opponentScore: 0,
        });
        expect(av.game!.modelPlayerId).toEqual(expect.any(String));
        expect(lobby.isModelPlayer(av.game!.modelPlayerId!)).toBe(true);
        expect(lobby.isModelPlayer(a)).toBe(false);
      });

      it('requires a registered player who is not in a match', () => {
        const c = lobby.connect();
        expect(lobby.startModelMatch(c)).toMatch(/register first/i);
        const a = join('Alice');
        lobby.startModelMatch(a);
        expect(lobby.startModelMatch(a)).toMatch(/already in a match/i);
      });

      it('the model player is hidden from the lobby and cannot be invited', () => {
        const a = join('Alice');
        const b = join('Bob');
        lobby.startModelMatch(a);
        const modelId = lobby.viewFor(a).game!.modelPlayerId!;
        const bv = lobby.viewFor(b);
        expect(bv.onlineCount).toBe(2);
        expect(bv.players).toEqual([{ id: a, name: 'Alice', tag: '0001', status: 'busy' }]);
        expect(lobby.invite(b, modelId)).toMatch(/not available/i);
      });

      it('starting a model match auto-cancels pending invites like a human match', () => {
        const a = join('Alice');
        const b = join('Bob');
        inviteFrom(a, b);
        lobby.startModelMatch(a);
        expect(lobby.viewFor(b).invites.received).toEqual([]);
        expect(lobby.viewFor(b).events).toEqual([
          { type: 'invite-cancelled', name: 'Alice', tag: '0001', reason: 'in-match' },
        ]);
      });

      it('the model moves through makeMove with its own id; rounds, score and rematch work as usual', () => {
        const a = join('Alice');
        lobby.startModelMatch(a);
        const m = lobby.viewFor(a).game!.modelPlayerId!;
        expect(lobby.makeMove(m, 0)).toMatch(/turn/i);
        playXWin(a, m);
        expect(lobby.viewFor(a).game).toMatchObject({ over: true, yourScore: 1, opponentScore: 0 });
        expect(lobby.viewFor(m).game).toMatchObject({
          yourScore: 0,
          opponentScore: 1,
          opponentName: 'Alice',
          opponentKind: 'human',
          modelPlayerId: null,
        });
        clock.advance(REMATCH_DELAY_MS);
        lobby.sweep();
        expect(lobby.viewFor(a).game).toMatchObject({ round: 2, yourMark: 'O', yourTurn: false });
        expect(lobby.makeMove(m, 4)).toBeNull();
      });

      it('the model player is exempt from presence but dies with the match', () => {
        const a = join('Alice');
        lobby.startModelMatch(a);
        const m = lobby.viewFor(a).game!.modelPlayerId!;
        clock.advance(PRESENCE_TTL_MS - 1);
        lobby.touch(a);
        clock.advance(2);
        lobby.sweep();
        expect(lobby.viewFor(a).phase).toBe('game');
        expect(lobby.makeMove(m, 0)).toMatch(/turn/i);
        lobby.leave(a);
        expect(lobby.viewFor(a).phase).toBe('lobby');
        expect(lobby.isModelPlayer(m)).toBe(false);
        expect(lobby.makeMove(m, 0)).toMatch(/not in a game/i);
      });

      it('sweeping the owner removes the model player too', () => {
        const a = join('Alice');
        lobby.startModelMatch(a);
        const m = lobby.viewFor(a).game!.modelPlayerId!;
        clock.advance(PRESENCE_TTL_MS + 1);
        lobby.sweep();
        expect(lobby.viewFor('nobody').onlineCount).toBe(0);
        expect(lobby.isModelPlayer(m)).toBe(false);
      });
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/server/lobby/lobby.test.ts`
Expected: FAIL, `startModelMatch is not a function`.

- [ ] **Step 3: Implement types**

`src/server/lobby/types.ts`: add after `MAX_NAME`:

```ts
/** Handle of the assistant-driven opponent. */
export const MODEL_NAME = 'Model';
export const MODEL_TAG = 'AI';

export type PlayerKind = 'human' | 'model';
```

Extend `GameView` (after `result`):

```ts
  opponentKind: PlayerKind;
  /** Id the widget hands to the model so it can call `model_move`; null in human matches. */
  modelPlayerId: PlayerId | null;
```

- [ ] **Step 4: Implement the lobby**

`src/server/lobby/lobby.ts`:

Import `MODEL_NAME`, `MODEL_TAG`, `type PlayerKind` from `./types.js`.

`PlayerState` gains:

```ts
  kind: PlayerKind;
  /** For model players: the human that started the match. */
  ownerId: PlayerId | null;
```

Every place that builds a `PlayerState` for a human (`connect`, `reconnect`) gets `kind: 'human', ownerId: null`. Extract a helper and use it in both:

```ts
  private newHuman(id: PlayerId): PlayerState {
    return { id, name: null, tag: null, kind: 'human', ownerId: null, matchId: null, lastSeen: this.clock(), events: [] };
  }
```

`connect`: `this.players.set(id, this.newHuman(id));` — `reconnect`: same.

Extract match creation from `acceptInvite` into a private helper and call it there:

```ts
  /** Starts round 1 with `a` as X, then drops every other pending invite of both players. */
  private createMatch(a: PlayerState, b: PlayerState): void {
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
  }
```

In `acceptInvite`, replace everything from `const match: Match = {` to the second `cancelInvitesOf` with `this.createMatch(a, b);`.

Add after `acceptInvite`:

```ts
  /** Starts a match against a hidden model player owned by `humanId`. The human is X in round 1. */
  startModelMatch(humanId: PlayerId): string | null {
    const human = this.players.get(humanId);
    if (!human?.name) return 'register first';
    if (human.matchId) return 'you are already in a match';
    const model: PlayerState = {
      id: this.genId(),
      name: MODEL_NAME,
      tag: MODEL_TAG,
      kind: 'model',
      ownerId: humanId,
      matchId: null,
      lastSeen: this.clock(),
      events: [],
    };
    this.players.set(model.id, model);
    this.createMatch(human, model);
    return null;
  }

  isModelPlayer(id: PlayerId): boolean {
    return this.players.get(id)?.kind === 'model';
  }
```

`invite`: change the target check to

```ts
    if (!target?.name || target.kind === 'model') return 'player not available';
```

`sweep()`: presence only for humans:

```ts
    for (const p of [...this.players.values()]) {
      if (p.kind === 'human' && p.lastSeen < now - PRESENCE_TTL_MS) this.removePlayer(p.id);
    }
```

`endMatch`: after the `for (const pid of match.players)` loop add:

```ts
    for (const pid of match.players) {
      if (this.players.get(pid)?.kind === 'model') this.players.delete(pid);
    }
```

`onlineCount`: `if (p.name && p.kind === 'human') n += 1;`

`publicPlayers`: `if (p.id === selfId || !p.name || !p.tag || p.kind === 'model') continue;`

`gameView`: build the opponent once and add the two fields:

```ts
  private gameView(match: Match, id: PlayerId): GameView {
    const oppId = match.players.find((x) => x !== id)!;
    const opp = this.handleOf(oppId);
    const oppKind: PlayerKind = this.players.get(oppId)?.kind ?? 'human';
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
      opponentKind: oppKind,
      modelPlayerId: oppKind === 'model' ? oppId : null,
    };
  }
```

- [ ] **Step 5: Update the widget fixtures**

`src/app/fixtures/views.ts`: add to `gameYourTurn` after `result: null,`:

```ts
  opponentKind: 'human',
  modelPlayerId: null,
```

and add after `gameDraw`:

```ts
/** Round 1 against the assistant: you played the centre and the model has not answered yet. */
export const gameVsModelWaiting: GameView = {
  ...gameYourTurn,
  yourTurn: false,
  board: [null, null, null, null, 'X', null, null, null, null],
  opponentName: 'Model',
  opponentTag: 'AI',
  opponentKind: 'model',
  modelPlayerId: 'bot1',
};
```

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `pnpm vitest run && pnpm typecheck && pnpm lint`
Expected: all PASS (the new lobby tests included), no type errors in `src/app` (fixtures updated).

- [ ] **Step 7: Commit**

```bash
git add src/server/lobby/types.ts src/server/lobby/lobby.ts src/server/lobby/lobby.test.ts src/app/fixtures/views.ts
git commit -m "feat(lobby): hidden model player and startModelMatch

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `play_vs_model` and `model_move` tools

**Files:**
- Modify: `src/server/tools/handlers.ts`
- Modify: `src/server/server.ts`
- Test: `src/server/tools/handlers.test.ts`, `src/server/server.test.ts`

**Interfaces:**
- Consumes: `Lobby.startModelMatch`, `Lobby.isModelPlayer` (Task 4).
- Produces: `handlePlayVsModel(lobby, { playerId })`, `handleModelMove(lobby, { playerId, cell })`; app-only tool `play_vs_model`; model-visible tool `model_move`.

Note: `handleModelMove` must not call `tick` (which calls `reconnect`): an unknown id passed by the model would otherwise be re-created as a human player. It sweeps, guards, then moves.

- [ ] **Step 1: Write the failing tests**

`src/server/tools/handlers.test.ts`: add `handleModelMove`, `handlePlayVsModel` to the import; append:

```ts
  it('handlePlayVsModel starts a game and handleModelMove answers with the model id', () => {
    const a = joinAs('Alice');
    const started = handlePlayVsModel(lobby, { playerId: a }).structuredContent as unknown as PlayerView;
    expect(started.phase).toBe('game');
    const modelId = started.game!.modelPlayerId!;
    handleMove(lobby, { playerId: a, cell: 4 });
    const reply = handleModelMove(lobby, { playerId: modelId, cell: 0 }).structuredContent as unknown as PlayerView;
    expect(reply.error).toBeNull();
    expect(reply.game).toMatchObject({ yourMark: 'O', yourTurn: false, opponentName: 'Alice' });
    expect(stateOf(a).game!.board).toEqual(['O', null, null, null, 'X', null, null, null, null]);
  });

  it('handleModelMove reports a taken cell so the model can retry', () => {
    const a = joinAs('Alice');
    const modelId = (handlePlayVsModel(lobby, { playerId: a }).structuredContent as unknown as PlayerView).game!
      .modelPlayerId!;
    handleMove(lobby, { playerId: a, cell: 4 });
    const reply = handleModelMove(lobby, { playerId: modelId, cell: 4 }).structuredContent as unknown as PlayerView;
    expect(reply.error).toMatch(/taken/i);
    expect(reply.game!.yourTurn).toBe(true);
  });

  it('handleModelMove refuses a human id and does not create a player for an unknown id', () => {
    const a = joinAs('Alice');
    handlePlayVsModel(lobby, { playerId: a });
    const human = handleModelMove(lobby, { playerId: a, cell: 0 }).structuredContent as unknown as PlayerView;
    expect(human.error).toBe('not a model player');
    const ghost = handleModelMove(lobby, { playerId: 'ghost', cell: 0 }).structuredContent as unknown as PlayerView;
    expect(ghost.error).toBe('not a model player');
    expect(ghost.phase).toBe('name');
    expect(lobby.isModelPlayer('ghost')).toBe(false);
    expect(stateOf(a).onlineCount).toBe(1);
  });
```

`src/server/server.test.ts`: change the constants and the visibility test:

```ts
const MODEL_TOOLS = ['join_game', 'model_move'];
const APP_ONLY_TOOLS = [
  'set_name',
  'get_state',
  'invite',
  'accept_invite',
  'decline_invite',
  'cancel_invite',
  'make_move',
  'leave',
  'close_session',
  'play_vs_model',
];
```

Replace `it('marks every other tool as app-only', …)` with:

```ts
  it('exposes model_move to the model without opening a widget', async () => {
    const { tools } = await client.listTools();
    const move = tools.find((t) => t.name === 'model_move');
    expect(move).toBeDefined();
    expect(move?._meta?.ui).toBeUndefined();
    expect(move?.description).toMatch(/only call this when the game widget asks/i);
  });

  it('marks every other tool as app-only', async () => {
    const { tools } = await client.listTools();
    for (const name of APP_ONLY_TOOLS) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, name).toBeDefined();
      expect(tool?._meta?.ui, name).toMatchObject({ visibility: ['app'] });
    }
    for (const name of MODEL_TOOLS) {
      expect(tools.find((t) => t.name === name)?._meta?.ui, name).not.toHaveProperty('visibility');
    }
    expect(tools).toHaveLength(APP_ONLY_TOOLS.length + MODEL_TOOLS.length);
  });

  it('plays a round against the model end to end', async () => {
    const joined = (await client.callTool({ name: 'join_game', arguments: {} })).structuredContent as {
      playerId: string;
    };
    const playerId = joined.playerId;
    await client.callTool({ name: 'set_name', arguments: { playerId, name: 'Alice' } });
    const started = (await client.callTool({ name: 'play_vs_model', arguments: { playerId } })).structuredContent as {
      phase: string;
      game: { modelPlayerId: string; opponentName: string; opponentTag: string };
    };
    expect(started.phase).toBe('game');
    expect(started.game).toMatchObject({ opponentName: 'Model', opponentTag: 'AI' });
    await client.callTool({ name: 'make_move', arguments: { playerId, cell: 4 } });
    const moved = (
      await client.callTool({ name: 'model_move', arguments: { playerId: started.game.modelPlayerId, cell: 0 } })
    ).structuredContent as { error: string | null; game: { board: (string | null)[] } };
    expect(moved.error).toBeNull();
    const state = (await client.callTool({ name: 'get_state', arguments: { playerId } })).structuredContent as {
      game: { board: (string | null)[]; yourTurn: boolean };
    };
    expect(state.game.board[0]).toBe('O');
    expect(state.game.yourTurn).toBe(true);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run --project server`
Expected: FAIL on the new handler and server tests.

- [ ] **Step 3: Implement the handlers**

`src/server/tools/handlers.ts`, append:

```ts
export function handlePlayVsModel(lobby: Lobby, args: { playerId: string }): ToolReply {
  tick(lobby, args.playerId);
  const error = lobby.startModelMatch(args.playerId);
  return viewWithError(lobby, args.playerId, error);
}

/**
 * Called by the model, not the widget. No `reconnect`: an unknown id must not be re-created as a human,
 * and only a model player may move through here.
 */
export function handleModelMove(lobby: Lobby, args: { playerId: string; cell: number }): ToolReply {
  lobby.sweep();
  if (!lobby.isModelPlayer(args.playerId)) return viewWithError(lobby, args.playerId, 'not a model player');
  const error = lobby.makeMove(args.playerId, args.cell);
  return viewWithError(lobby, args.playerId, error);
}
```

- [ ] **Step 4: Register the tools**

`src/server/server.ts`: import `handleModelMove`, `handlePlayVsModel`.

Change the `join_game` description to:

```ts
      description:
        'Open the tic-tac-toe lobby inside the chat. The user can invite another player or play against you, the assistant.',
```

After `join_game`, before the app-only block, add the model-visible tool through the plain SDK API (no `_meta.ui`, so it neither opens a widget nor is hidden):

```ts
  // Second model-facing tool: how the assistant plays when the user chose "Play vs model".
  server.registerTool(
    'model_move',
    {
      title: 'Model Move',
      description:
        'Play your move in a tic-tac-toe match against the user. Only call this when the game widget asks you to; use the playerId it gives you. Cells are 0-8, left to right, top to bottom.',
      inputSchema: z.object({ playerId: playerIdSchema, cell: z.number().int().min(0).max(8) }),
    },
    async (args) => handleModelMove(lobby, args),
  );
```

After `close_session` add:

```ts
  registerAppTool(
    server,
    'play_vs_model',
    {
      title: 'Play vs Model',
      description: 'Start a match against the assistant hosting the widget.',
      inputSchema: z.object({ playerId: playerIdSchema }),
      _meta: appOnly,
    },
    async (args) => handlePlayVsModel(lobby, args),
  );
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run --project server && pnpm typecheck && pnpm lint`
Expected: PASS. If `server.registerTool` complains about the zod object type, use the same `z.object(...)` form the other tools use; the SDK accepts Standard Schema objects.

- [ ] **Step 6: Commit**

```bash
git add src/server/tools/handlers.ts src/server/tools/handlers.test.ts src/server/server.ts src/server/server.test.ts
git commit -m "feat(server): play_vs_model and model-visible model_move tools

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `buildModelMessage`

**Files:**
- Create: `src/app/lib/modelMessage.ts`, `src/app/lib/modelMessage.test.ts`

**Interfaces:**
- Consumes: `GameView` with `modelPlayerId` (Task 4), fixture `gameVsModelWaiting`.
- Produces: `buildModelMessage(game: GameView): string`.

- [ ] **Step 1: Write the failing test**

`src/app/lib/modelMessage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { gameVsModelWaiting } from '../fixtures/views';
import { buildModelMessage } from './modelMessage';

describe('buildModelMessage', () => {
  it('describes the board from the model side and names the tool and id', () => {
    expect(buildModelMessage(gameVsModelWaiting)).toBe(
      [
        'Your move in tic-tac-toe (round 1, you are O, score: you 0, opponent 0).',
        'Board, cells 0-8 left to right, top to bottom (. = empty):',
        '. . .',
        '. X .',
        '. . .',
        'Call the model_move tool with playerId "bot1" and the cell you choose.',
      ].join('\n'),
    );
  });

  it('flips marks and scores when the human is O', () => {
    const text = buildModelMessage({
      ...gameVsModelWaiting,
      round: 2,
      yourMark: 'O',
      yourScore: 1,
      opponentScore: 2,
      board: ['X', 'O', null, null, null, null, null, null, null],
    });
    expect(text).toContain('round 2, you are X, score: you 2, opponent 1');
    expect(text).toContain('X O .\n. . .\n. . .');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run --project app src/app/lib/modelMessage.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/app/lib/modelMessage.ts`:

```ts
import type { GameView } from './tools';

/** The chat message the widget posts as the user when it is the model's turn. Pure; see the spec's "Message format". */
export function buildModelMessage(game: GameView): string {
  const modelMark = game.yourMark === 'X' ? 'O' : 'X';
  const rows = [0, 3, 6].map((start) =>
    game.board
      .slice(start, start + 3)
      .map((cell) => cell ?? '.')
      .join(' '),
  );
  return [
    `Your move in tic-tac-toe (round ${game.round}, you are ${modelMark}, score: you ${game.opponentScore}, opponent ${game.yourScore}).`,
    'Board, cells 0-8 left to right, top to bottom (. = empty):',
    ...rows,
    `Call the model_move tool with playerId "${game.modelPlayerId}" and the cell you choose.`,
  ].join('\n');
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run --project app src/app/lib/modelMessage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/lib/modelMessage.ts src/app/lib/modelMessage.test.ts
git commit -m "feat(app): build the model-turn chat message

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `useModelTurn` hook

**Files:**
- Create: `src/app/hooks/useModelTurn.ts`, `src/app/hooks/useModelTurn.test.tsx`

**Interfaces:**
- Consumes: `buildModelMessage` (Task 6); `App.sendMessage` from ext-apps.
- Produces: `useModelTurn(app: App | null, game: GameView | null, staleMs = MODEL_STALE_MS): { stale: boolean; resend: () => Promise<void> }`; `MODEL_STALE_MS = 10_000`.

- [ ] **Step 1: Write the failing tests**

`src/app/hooks/useModelTurn.test.tsx`:

```tsx
import type { App } from '@modelcontextprotocol/ext-apps';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameVsModelWaiting, gameYourTurn } from '../fixtures/views';
import { buildModelMessage } from '../lib/modelMessage';
import type { GameView } from '../lib/tools';
import { MODEL_STALE_MS, useModelTurn } from './useModelTurn';

function fakeApp(result: { isError?: boolean } = {}) {
  const sendMessage = vi.fn().mockResolvedValue(result);
  return { app: { sendMessage } as unknown as App, sendMessage };
}

describe('useModelTurn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('posts the message once per board state, not on re-renders with the same board', async () => {
    const { app, sendMessage } = fakeApp();
    const { rerender } = renderHook(({ game }) => useModelTurn(app, game), {
      initialProps: { game: gameVsModelWaiting as GameView | null },
    });
    await act(async () => {});
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      role: 'user',
      content: [{ type: 'text', text: buildModelMessage(gameVsModelWaiting) }],
    });
    rerender({ game: { ...gameVsModelWaiting } });
    await act(async () => {});
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('does nothing on your turn, after the round, or against a human', async () => {
    const { app, sendMessage } = fakeApp();
    const { rerender } = renderHook(({ game }) => useModelTurn(app, game), {
      initialProps: { game: gameYourTurn as GameView | null },
    });
    rerender({ game: { ...gameVsModelWaiting, yourTurn: true } });
    rerender({ game: { ...gameVsModelWaiting, over: true } });
    rerender({ game: { ...gameYourTurn, yourTurn: false } });
    rerender({ game: null });
    await act(async () => {});
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('turns stale after MODEL_STALE_MS, resend posts again and resets it', async () => {
    const { app, sendMessage } = fakeApp();
    const { result } = renderHook(() => useModelTurn(app, gameVsModelWaiting));
    await act(async () => {});
    expect(result.current.stale).toBe(false);
    act(() => vi.advanceTimersByTime(MODEL_STALE_MS));
    expect(result.current.stale).toBe(true);
    await act(async () => {
      await result.current.resend();
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(result.current.stale).toBe(false);
    act(() => vi.advanceTimersByTime(MODEL_STALE_MS));
    expect(result.current.stale).toBe(true);
  });

  it('a new board resets stale and posts the new message', async () => {
    const { app, sendMessage } = fakeApp();
    const { result, rerender } = renderHook(({ game }) => useModelTurn(app, game), {
      initialProps: { game: gameVsModelWaiting as GameView | null },
    });
    await act(async () => {});
    act(() => vi.advanceTimersByTime(MODEL_STALE_MS));
    expect(result.current.stale).toBe(true);
    const next: GameView = { ...gameVsModelWaiting, board: ['O', null, null, null, 'X', null, null, null, 'X'] };
    rerender({ game: next });
    await act(async () => {});
    expect(result.current.stale).toBe(false);
    expect(sendMessage).toHaveBeenLastCalledWith({
      role: 'user',
      content: [{ type: 'text', text: buildModelMessage(next) }],
    });
  });

  it('a host rejection marks the turn stale at once', async () => {
    const { app } = fakeApp({ isError: true });
    const { result } = renderHook(() => useModelTurn(app, gameVsModelWaiting));
    await act(async () => {});
    expect(result.current.stale).toBe(true);
  });

  it('clears its timer on unmount', async () => {
    const { app } = fakeApp();
    const { unmount } = renderHook(() => useModelTurn(app, gameVsModelWaiting));
    await act(async () => {});
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run --project app src/app/hooks/useModelTurn.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/app/hooks/useModelTurn.ts`:

```ts
import type { App } from '@modelcontextprotocol/ext-apps';
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildModelMessage } from '../lib/modelMessage';
import type { GameView } from '../lib/tools';

/** How long without a board change before the game screen offers "Ask again". */
export const MODEL_STALE_MS = 10_000;

/**
 * Asks the host's model for its move. MCP Apps has no channel from the widget to the model except a
 * chat message (`ui/message`), so whenever it is the model's turn this posts one message as the user,
 * once per board state. `stale` turns true after `staleMs` without a board change (or at once if the
 * host rejects the message); `resend` posts the same message again.
 */
export function useModelTurn(
  app: App | null,
  game: GameView | null,
  staleMs = MODEL_STALE_MS,
): { stale: boolean; resend: () => Promise<void> } {
  const [stale, setStale] = useState(false);
  const timer = useRef<number | null>(null);
  const active = game !== null && game.opponentKind === 'model' && !game.yourTurn && !game.over;
  // A string, so identical boards from successive polls do not re-trigger the effect.
  const text = active ? buildModelMessage(game) : null;

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const send = useCallback(async () => {
    if (!app || text === null) return;
    setStale(false);
    clearTimer();
    timer.current = window.setTimeout(() => setStale(true), staleMs);
    try {
      const result = await app.sendMessage({ role: 'user', content: [{ type: 'text', text }] });
      if (result.isError) setStale(true);
    } catch (err) {
      console.error(err);
      setStale(true);
    }
  }, [app, text, staleMs]);

  useEffect(() => {
    if (text === null) {
      setStale(false);
      return;
    }
    void send();
    return clearTimer;
  }, [text, send]);

  return { stale, resend: send };
}
```

If Biome's `useExhaustiveDependencies` flags `clearTimer` (a plain function declared in the component body), move `clearTimer` inside a `useCallback` with `[]` deps and add it to both dependency arrays.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run --project app src/app/hooks/useModelTurn.test.tsx && pnpm lint`
Expected: PASS, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/hooks/useModelTurn.ts src/app/hooks/useModelTurn.test.tsx
git commit -m "feat(app): useModelTurn posts the model-turn message and tracks staleness

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Lobby and Game screens

**Files:**
- Modify: `src/app/screens/LobbyScreen.tsx`, `src/app/screens/LobbyScreen.test.tsx`, `src/app/screens/LobbyScreen.stories.tsx`
- Modify: `src/app/screens/GameScreen.tsx`, `src/app/screens/GameScreen.test.tsx`, `src/app/screens/GameScreen.stories.tsx`
- Modify: `src/app/styles/base.css`

**Interfaces:**
- Consumes: fixture `gameVsModelWaiting` (Task 4).
- Produces: `LobbyScreen` props `canPlayModel: boolean`, `onPlayModel: () => void`; `GameScreen` prop `modelTurn?: { stale: boolean; onResend: () => void }`.

- [ ] **Step 1: Write the failing tests**

`src/app/screens/LobbyScreen.test.tsx`: in `renderLobby`, add `onPlayModel: vi.fn()` to `handlers` and `canPlayModel={false}` to the JSX before `{...handlers}`. Append:

```tsx
  it('offers Play vs model only when the host supports it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderLobby();
    expect(screen.queryByRole('button', { name: 'Play vs model' })).not.toBeInTheDocument();
    cleanup();
    const handlers = renderLobby({ canPlayModel: true });
    await user.click(screen.getByRole('button', { name: 'Play vs model' }));
    expect(handlers.onPlayModel).toHaveBeenCalledTimes(1);
  });
```

Add `cleanup` to the `@testing-library/react` import.

`src/app/screens/GameScreen.test.tsx`: add `gameVsModelWaiting` to the fixtures import; append:

```tsx
  it('shows the model wait state and offers Ask again once stale', async () => {
    const user = userEvent.setup();
    const onResend = vi.fn();
    const { rerender } = render(
      <GameScreen you={you} game={gameVsModelWaiting} onMove={vi.fn()} onLeave={vi.fn()} modelTurn={{ stale: false, onResend }} />,
    );
    expect(screen.getByText('Round 1 · you are X · Waiting for the model…')).toBeInTheDocument();
    expect(screen.getByText(/Model#AI/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask again' })).not.toBeInTheDocument();
    rerender(
      <GameScreen you={you} game={gameVsModelWaiting} onMove={vi.fn()} onLeave={vi.fn()} modelTurn={{ stale: true, onResend }} />,
    );
    await user.click(screen.getByRole('button', { name: 'Ask again' }));
    expect(onResend).toHaveBeenCalledTimes(1);
  });

  it('never shows Ask again on your turn or after the round', () => {
    const modelTurn = { stale: true, onResend: vi.fn() };
    const { rerender } = render(
      <GameScreen you={you} game={{ ...gameVsModelWaiting, yourTurn: true }} onMove={vi.fn()} onLeave={vi.fn()} modelTurn={modelTurn} />,
    );
    expect(screen.queryByRole('button', { name: 'Ask again' })).not.toBeInTheDocument();
    rerender(
      <GameScreen you={you} game={{ ...gameVsModelWaiting, over: true, yourTurn: false }} onMove={vi.fn()} onLeave={vi.fn()} modelTurn={modelTurn} />,
    );
    expect(screen.queryByRole('button', { name: 'Ask again' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run --project app src/app/screens`
Expected: FAIL (missing button / text; TypeScript prop errors are reported by `pnpm typecheck`, Vitest still runs).

- [ ] **Step 3: Implement the Lobby screen**

`src/app/screens/LobbyScreen.tsx`: extend `Props`:

```ts
  /** True when the host accepts `ui/message`, which the model opponent needs. */
  canPlayModel: boolean;
  onPlayModel: () => void;
```

Destructure them in the component signature and render, right after the `You are … · N online` paragraph:

```tsx
        {canPlayModel && (
          <Button className="lobby__model" onClick={onPlayModel}>
            Play vs model
          </Button>
        )}
```

`src/app/screens/LobbyScreen.stories.tsx`: add `canPlayModel: false, onPlayModel: fn()` to `meta.args`; add:

```tsx
export const WithModelButton: Story = { args: { canPlayModel: true } };
```

`src/app/styles/base.css`, in the Screens section after `.lobby__search`:

```css
.lobby__model {
  margin-bottom: 8px;
}
```

- [ ] **Step 4: Implement the Game screen**

`src/app/screens/GameScreen.tsx`: extend `Props`:

```ts
  /** Present in matches against the model: staleness of the last request and how to repeat it. */
  modelTurn?: { stale: boolean; onResend: () => void };
```

Replace `turnLine`:

```ts
function turnLine(game: GameView, waitingForModel: boolean): string {
  if (game.over) return 'Next round starts in a moment…';
  if (game.yourTurn) return 'Your turn';
  return waitingForModel ? 'Waiting for the model…' : "Opponent's turn";
}
```

In the component, destructure `modelTurn`, compute:

```ts
  const modelPending = modelTurn !== undefined && !game.yourTurn && !game.over;
```

Use `turnLine(game, modelPending)` in the status line, and right after the status `<p>` add:

```tsx
      {modelPending && modelTurn.stale && (
        <Button variant="secondary" className="game__resend" onClick={modelTurn.onResend}>
          Ask again
        </Button>
      )}
```

`src/app/styles/base.css`, after `.game__status`:

```css
.game__resend {
  margin-bottom: 12px;
}
```

`src/app/screens/GameScreen.stories.tsx`: add `gameVsModelWaiting` to the fixtures import and:

```tsx
export const VsModelWaiting: Story = { args: { game: gameVsModelWaiting, modelTurn: { stale: false, onResend: fn() } } };
export const VsModelStale: Story = { args: { game: gameVsModelWaiting, modelTurn: { stale: true, onResend: fn() } } };
```

- [ ] **Step 5: Run the tests, typecheck, lint**

Run: `pnpm vitest run --project app && pnpm typecheck && pnpm lint`
Expected: app tests PASS; typecheck fails only in `App.tsx` (missing `canPlayModel`/`onPlayModel`), which Task 9 fixes. If Biome reformats the long JSX lines in the tests, run `pnpm lint:fix`.

- [ ] **Step 6: Commit**

```bash
git add src/app/screens/LobbyScreen.tsx src/app/screens/LobbyScreen.test.tsx src/app/screens/LobbyScreen.stories.tsx src/app/screens/GameScreen.tsx src/app/screens/GameScreen.test.tsx src/app/screens/GameScreen.stories.tsx src/app/styles/base.css
git commit -m "feat(app): Play vs model button and model wait state on the board

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: App wiring and build

**Files:**
- Modify: `src/app/lib/tools.ts`, `src/app/App.tsx`

**Interfaces:**
- Consumes: `useModelTurn` (Task 7), screen props (Task 8), tool `play_vs_model` (Task 5).

- [ ] **Step 1: Add the tool name**

`src/app/lib/tools.ts`: add `| 'play_vs_model'` to `ToolName`.

- [ ] **Step 2: Wire the app**

`src/app/App.tsx`:

Import `useModelTurn` from `./hooks/useModelTurn`.

After `usePollView(...)` add:

```tsx
  const { stale, resend } = useModelTurn(app, view?.game ?? null);
  const canPlayModel = Boolean(app?.getHostCapabilities()?.message);
```

`LobbyScreen` gets:

```tsx
          canPlayModel={canPlayModel}
          onPlayModel={() => call('play_vs_model', {})}
```

`GameScreen` gets:

```tsx
          modelTurn={view.game.opponentKind === 'model' ? { stale, onResend: resend } : undefined}
```

- [ ] **Step 3: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm build-storybook`
Expected: all green; `dist/mcp-app.html` and `dist/server` rebuilt; `storybook-static/` built.

- [ ] **Step 4: Commit**

```bash
git add src/app/lib/tools.ts src/app/App.tsx
git commit -m "feat(app): wire the model opponent into the widget

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Docs, manual smoke test and PR

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `docs/superpowers/specs/2026-09-14-game-design-and-use-cases.md`

- [ ] **Step 1: CLAUDE.md**

In "Tool surface" replace the first two bullets with:

```md
- Two tools are **model-visible**. `join_game` carries `_meta: { ui: { resourceUri: RESOURCE_URI } }` so the host renders the widget. `model_move` is registered with the plain `server.registerTool` (no `_meta.ui`): it is how the assistant plays when the user picked "Play vs model", and it must never open a widget.
- The ten others (`set_name`, `get_state`, `invite`, `accept_invite`, `decline_invite`, `cancel_invite`, `make_move`, `leave`, `close_session`, `play_vs_model`) are **app-only**: `_meta.ui.visibility: ['app']`. They are called by the widget, hidden from the model.
```

In "Layers on the server", `lobby/types.ts` bullet: add `CLOSED_TTL_MS = 24 h`, `MODEL_NAME`/`MODEL_TAG`, `PlayerKind`, and `Phase` includes `closed`. `lobby/lobby.ts` bullet: append "A model opponent is a hidden player (`kind: 'model'`, `Model#AI`) created by `startModelMatch`; it is exempt from presence and deleted with its match. `close(id)` removes the player and tombstones the id so `reconnect` never re-creates it." `tools/handlers.ts` bullet: append "`handleModelMove` is the one exception: it sweeps and guards with `isModelPlayer` but never `reconnect`s, so an id the model made up is not re-created."

In "Widget": add `closed → screens/ClosedScreen` to the phase list; add a paragraph:

```md
**Model opponent.** `hooks/useModelTurn.ts` posts one `app.sendMessage` (`ui/message`, role `user`) per board state while it is the model's turn, built by `lib/modelMessage.ts`, and flips `stale` after `MODEL_STALE_MS = 10_000` so `GameScreen` can show "Ask again". The "Play vs model" button is only rendered when `app.getHostCapabilities()?.message` is set. `ui/CloseButton.tsx` ends the session through `close_session`; a `closed` view stops polling.
```

In "Conventions", host boundary line: add `useModelTurn` to the hook list.

In "Docs: what to trust": add `docs/superpowers/specs/2026-09-16-model-opponent-and-session-close-design.md` (and this plan) to the trusted list.

- [ ] **Step 2: README.md**

After step 5 in "Play now" add:

```md
**Play against your assistant.** Alone? Hit *Play vs model* in the lobby. After each of your moves the widget posts a short message in the chat asking the assistant for its move, and the assistant answers by calling the `model_move` tool. The server only checks the rules; how well the assistant plays is entirely up to the model. If it goes quiet, *Ask again* re-sends the request. This needs a client that lets widgets post messages (Claude, ChatGPT and VS Code do).

**Done for now?** The × in the corner closes your session for good. Reopening the game in that chat needs a fresh `join_game`, which prevents a stale card from lingering as a second player.
```

In "How does it work?": change the first bullet to "**Two tools the assistant sees.** `join_game` opens the widget; `model_move` lets the assistant play when you asked it to." and the third bullet's count to "Ten tools the widget uses".

- [ ] **Step 3: CONTRIBUTING.md**

Layout table: `src/app/screens/         Pages (Join, Lobby, Game, Closed)`.

- [ ] **Step 4: Old spec status line**

`docs/superpowers/specs/2026-09-14-game-design-and-use-cases.md`, line 4: append " Extended by `2026-09-16-model-opponent-and-session-close-design.md` (model opponent, session close)."

- [ ] **Step 5: Commit docs**

```bash
git add CLAUDE.md README.md CONTRIBUTING.md docs/superpowers/specs/2026-09-14-game-design-and-use-cases.md
git commit -m "docs: model opponent and session close

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 6: Manual smoke test**

Follow the memory note `reference-basic-host-smoke-test` (tsx instead of bun, ports 8090/8091, `SERVERS='["http://localhost:8765/mcp"]'`). Check whether the scratch `examples/basic-host/src` handles `ui/message` (`grep -rn "MESSAGE_METHOD\|ui/message" src`). If it does: open one tab, `join_game`, name, "Play vs model", play a cell, confirm the host shows the posted message; the basic-host has no model, so click "Ask again" after 10 s and confirm a second message. Then click × and confirm the closed screen; reload the tab and confirm the closed screen returns. If the basic-host lacks `ui/message`, confirm the button is hidden and test the model flow in Claude with the public server after the release. Record which case applied in the PR body.

- [ ] **Step 7: Push and open the PR**

```bash
git push -u origin feat/model-opponent-and-session-close
gh pr create --title "feat: play against the assistant and close the session" --body "$(cat <<'EOF'
## Summary
- Play vs model: a hidden `Model#AI` lobby player moved by the new model-visible `model_move` tool; the widget posts a `ui/message` per turn and offers "Ask again" after 10 s.
- Close session: a corner × calls `close_session`; the id is tombstoned for 24 h so a stale widget can never re-create it. New `closed` phase and screen.
- Spec: docs/superpowers/specs/2026-09-16-model-opponent-and-session-close-design.md

## Test plan
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm build-storybook`
- [ ] Manual: <basic-host result from Task 10 step 6>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

- Spec coverage: server model (Tasks 1, 4), tools (2, 5), widget model mode (6, 7, 8, 9), session close widget (3), docs and delivery (10). `CLOSED_TTL_MS` sweep, `close` on unknown ids, `reconnect` refusal, hidden model player, presence exemption, invite rejection, `model_move` guard, host capability gate, 10 s stale, no auto-retry, no close on teardown: all present.
- Deviation from the spec, deliberate: `handleModelMove` does not call `tick` (spec said `tick` then guard) because `tick` would re-create an unknown id as a human. Spec wording "tick, then guard" is superseded by Task 5's note; the guard outcome is identical.
- `model_move` uses `server.registerTool` because `registerAppTool` requires `_meta.ui`.
- Types used across tasks: `opponentKind`, `modelPlayerId`, `gameVsModelWaiting`, `canPlayModel`, `onPlayModel`, `modelTurn`, `MODEL_STALE_MS`, `handleCloseSession`, `handlePlayVsModel`, `handleModelMove`, `startModelMatch`, `isModelPlayer`, `close` are spelled the same everywhere.
