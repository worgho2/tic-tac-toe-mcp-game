# Widget Reskin (PR 2 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain widget with the pixel-art UI from `docs/superpowers/specs/2026-09-14-game-design-and-use-cases.md` (sections "Widget" and "Visual system"): Kenney-tile primitives, the Join / Lobby / Game screens with search, countdowns, confirm modals, toasts and the round-end overlay, plus a jsdom test project for the widget.

**Architecture:** Screens and primitives are pure React components (props in, callbacks out); only `App.tsx` and `hooks/usePollView.ts` touch the MCP host. Styling is plain CSS: every surface is a `border-image` 9-slice cut from a Kenney 32px tile, selected per theme through CSS custom properties in `tokens.css`, and every asset (17 PNG tiles, one woff2) is inlined into the single-file bundle by `vite-plugin-singlefile`. Vitest gains a second project (`jsdom` + Testing Library) for `src/app/**`.

**Tech Stack:** React 19, Vite 8 + `vite-plugin-singlefile`, Vitest 5 projects, jsdom 30, `@testing-library/react` 16, `@testing-library/user-event` 14, `@testing-library/jest-dom` 7, Biome, Kenney "UI Pack - Pixel Adventure" (CC0), Press Start 2P (OFL).

## Global Constraints

- pnpm only (`packageManager` pin, `engineStrict`); `corepack enable` once. Add dev dependencies with `pnpm add -D`.
- `src/app/` uses bundler resolution: relative imports have no extension. `src/app/lib/tools.ts` imports server types with `import type` / `export type` only; keep it type-only.
- Only `src/app/App.tsx` and `src/app/hooks/usePollView.ts` may import from `@modelcontextprotocol/ext-apps`. Screens and primitives never do.
- Assets: only the tiles listed in Task 2 are copied (from `Tiles/Large tiles/Thick outline/` of the Kenney pack), plus Kenney's `License.txt`. Font: `PressStart2P.woff2` plus `OFL.txt`. No external URLs anywhere in the bundle; `vite-plugin-singlefile` already forces `assetsInlineLimit` to always inline, so no Vite config change.
- Copy from the spec, verbatim: modal text `Invite <handle> to a match?`; leave modal `Leave the match?` with body `Your opponent will return to the lobby too.`; empty states `No one else is online yet` and `No invites`; overlay labels `You win!`, `You lose`, `Draw`; toast lifetime 4000 ms; lobby two columns at `min-width: 560px`; content max width 720px; usable at 320px; 40 confetti pieces; `prefers-reduced-motion` disables all animations.
- Behaviour: Invite button (and its card) disabled when the player is busy **or** when a sent invite to that handle is pending; search is a case-insensitive substring match on `name#tag`; the countdown ticks locally once a second from `expiresIn` and resyncs on every poll; the overlay renders while `game.over` is true and is keyed on `game.round`; the widget polls once immediately, then every 1.5 s; an error `not in a game` is not toasted when the same reply carries an `opponent-left` event.
- Host sizing: ext-apps `useApp` enables `autoResize` by default (a `ResizeObserver` sends `ui/notifications/size-changed`); do not add manual size code.
- Never `window.confirm` / `alert`.
- Biome formats and lints (2-space, 120 cols, single quotes, JSX double quotes); fix with `pnpm lint:fix`. Suppress only with `// biome-ignore lint/<rule>: <reason>`.
- Conventional Commits; every commit message ends with the exact line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Lefthook formats staged files on pre-commit; stage whole files.
- Branch `feat/widget-reskin` off `main` (which already contains PR 1); this plan file is its first commit. `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` must pass at the end of every task.
- Code blocks below start with a comment naming the file (`// file: …` or `/* file: … */`). That first line is a label for the reader; do not write it into the file.

---

## File map

| File | Responsibility |
|---|---|
| `vitest.config.ts` (modify) | Two projects: `server` (node, `src/server/**/*.test.ts`) and `app` (jsdom, `src/app/**/*.test.{ts,tsx}`, setup file). |
| `src/app/test-setup.ts` (create) | jest-dom matchers, Testing Library cleanup. |
| `src/app/fixtures/views.ts` (create) | Typed fixture views shared by tests (and by stories in PR 3). |
| `src/app/lib/tools.ts` (modify) | Re-export `Board` and `Mark` types. |
| `src/app/lib/search.ts` (create) | `filterPlayers(players, query)`. |
| `src/app/lib/outcome.ts` (create) | `roundOutcome(game)`: `'win' \| 'loss' \| 'draw' \| null`. |
| `src/app/assets/kenney/*.png`, `License.txt` (create) | The 17 tiles used. |
| `src/app/assets/fonts/PressStart2P.woff2`, `OFL.txt` (create) | Pixel font. |
| `src/app/styles/tokens.css` (create) | Palette and tile custom properties per theme. |
| `src/app/styles/base.css` (create) | Font face, reset, primitives' classes, layout. |
| `src/app/styles/animations.css` (create) | Overlay, confetti, duck keyframes; reduced-motion. |
| `src/app/styles.css` (delete) | Replaced by `styles/`. |
| `src/app/main.tsx` (modify) | Imports the three stylesheets. |
| `src/app/ui/Panel.tsx`, `Ribbon.tsx`, `Button.tsx`, `Input.tsx`, `Badge.tsx`, `Cell.tsx`, `Modal.tsx`, `Toast.tsx`, `Overlay.tsx` (create) | Primitives, one per file. |
| `src/app/hooks/useToasts.ts` (create) | Toast list with auto-dismiss, timers cleared on unmount. |
| `src/app/hooks/useCountdown.ts` (create) | Local countdown + `formatSeconds`. |
| `src/app/hooks/usePollView.ts` (modify) | Leading poll. |
| `src/app/screens/JoinScreen.tsx`, `LobbyScreen.tsx`, `GameScreen.tsx` (create) | The three pages. |
| `src/app/components/*` (delete) | Replaced by `screens/` and `ui/`. |
| `src/app/App.tsx` (rewrite) | Host wiring, toasts, screen switch. |
| `CLAUDE.md`, `CONTRIBUTING.md`, spec (modify) | Docs. |

---

### Task 1: Test infrastructure, fixtures and pure helpers

**Files:**
- Modify: `vitest.config.ts`
- Create: `src/app/test-setup.ts`, `src/app/fixtures/views.ts`, `src/app/lib/search.ts`, `src/app/lib/search.test.ts`, `src/app/lib/outcome.ts`, `src/app/lib/outcome.test.ts`
- Modify: `src/app/lib/tools.ts` (type re-export line)

**Interfaces:**
- Consumes: `PublicPlayer`, `InviteView`, `GameView`, `PlayerView` from `src/app/lib/tools.ts`; `handle(name, tag)` from `src/app/lib/events.ts`.
- Produces: `filterPlayers(players: PublicPlayer[], query: string): PublicPlayer[]`; `type Outcome = 'win' | 'loss' | 'draw'`; `roundOutcome(game: GameView | null): Outcome | null`; fixtures `you`, `players`, `received`, `sent`, `emptyInvites`, `gameYourTurn`, `gameOpponentTurn`, `gameWon`, `gameLost`, `gameDraw`, `view(overrides)`; re-exported types `Board`, `Mark` from `lib/tools.ts`.

- [ ] **Step 1: Branch and dependencies**

```bash
git checkout main && git pull --ff-only
git checkout feat/widget-reskin 2>/dev/null || git checkout -b feat/widget-reskin
pnpm add -D jsdom@30.0.1 @testing-library/react@16.3.3 @testing-library/jest-dom@7.0.1 @testing-library/user-event@14.6.7
```

Expected: `package.json` devDependencies gain the four packages; `pnpm-lock.yaml` updated.

- [ ] **Step 2: Vitest projects**

Replace `vitest.config.ts`:

```ts
// file: vitest.config.ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Two projects: the server suite runs in node, the widget suite in jsdom with Testing Library.
export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'server', environment: 'node', include: ['src/server/**/*.test.ts'] },
      },
      {
        plugins: [react()],
        test: {
          name: 'app',
          environment: 'jsdom',
          include: ['src/app/**/*.test.{ts,tsx}'],
          setupFiles: ['src/app/test-setup.ts'],
          css: false,
        },
      },
    ],
  },
});
```

Create `src/app/test-setup.ts`:

```ts
// file: src/app/test-setup.ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
});
```

- [ ] **Step 3: Type re-exports**

In `src/app/lib/tools.ts`, add this line directly after the existing `export type { GameView, … } from '../../server/lobby/lobby.js';` line:

```ts
export type { Board, Mark } from '../../server/game/game.js';
```

- [ ] **Step 4: Fixtures**

```ts
// file: src/app/fixtures/views.ts
import type { Board, GameView, InviteView, PlayerView, PublicPlayer } from '../lib/tools';

// Shared by the widget tests (and by the Storybook stories in PR 3). Keep values stable: tests assert on them.

export const you: PlayerView['you'] = { id: 'me', name: 'worgho2', tag: '1234' };

export const players: PublicPlayer[] = [
  { id: 'p1', name: 'bob', tag: '0042', status: 'idle' },
  { id: 'p2', name: 'alice', tag: '0007', status: 'busy' },
  { id: 'p3', name: 'alice', tag: '0099', status: 'idle' },
];

export const received: InviteView[] = [{ inviteId: 'inv-r1', name: 'bob', tag: '0042', expiresIn: 45_000 }];
export const sent: InviteView[] = [{ inviteId: 'inv-s1', name: 'alice', tag: '0099', expiresIn: 12_000 }];
export const emptyInvites: PlayerView['invites'] = { sent: [], received: [] };

const emptyBoard: Board = Array<null>(9).fill(null);

export const gameYourTurn: GameView = {
  round: 1,
  board: emptyBoard,
  yourMark: 'X',
  yourTurn: true,
  opponentName: 'bob',
  opponentTag: '0042',
  yourScore: 0,
  opponentScore: 0,
  over: false,
  result: null,
};

export const gameOpponentTurn: GameView = {
  ...gameYourTurn,
  yourMark: 'O',
  yourTurn: false,
  board: ['X', null, null, null, null, null, null, null, null],
};

export const gameWon: GameView = {
  ...gameYourTurn,
  board: ['X', 'X', 'X', 'O', 'O', null, null, null, null],
  yourTurn: false,
  over: true,
  result: { status: 'won', winner: 'X' },
  yourScore: 1,
};

export const gameLost: GameView = { ...gameWon, yourMark: 'O', yourScore: 0, opponentScore: 1 };

export const gameDraw: GameView = {
  ...gameYourTurn,
  board: ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'],
  yourTurn: false,
  over: true,
  result: { status: 'draw' },
};

export function view(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    phase: 'lobby',
    you,
    onlineCount: 4,
    players,
    invites: { sent, received },
    game: null,
    events: [],
    error: null,
    ...overrides,
  };
}
```

- [ ] **Step 5: Failing tests for the helpers**

```ts
// file: src/app/lib/search.test.ts
import { describe, expect, it } from 'vitest';
import { players } from '../fixtures/views';
import { filterPlayers } from './search';

describe('filterPlayers', () => {
  it('keeps everyone for an empty or blank query', () => {
    expect(filterPlayers(players, '')).toEqual(players);
    expect(filterPlayers(players, '   ')).toEqual(players);
  });

  it('matches a substring of the full handle, case-insensitively', () => {
    expect(filterPlayers(players, 'ALICE').map((p) => p.id)).toEqual(['p2', 'p3']);
    expect(filterPlayers(players, 'alice#0099').map((p) => p.id)).toEqual(['p3']);
    expect(filterPlayers(players, '#00').map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterPlayers(players, 'zed')).toEqual([]);
  });
});
```

```ts
// file: src/app/lib/outcome.test.ts
import { describe, expect, it } from 'vitest';
import { gameDraw, gameLost, gameOpponentTurn, gameWon, gameYourTurn } from '../fixtures/views';
import { roundOutcome } from './outcome';

describe('roundOutcome', () => {
  it('is null without a game or while a round is in progress', () => {
    expect(roundOutcome(null)).toBeNull();
    expect(roundOutcome(gameYourTurn)).toBeNull();
    expect(roundOutcome(gameOpponentTurn)).toBeNull();
  });

  it('reports win, loss and draw from your point of view', () => {
    expect(roundOutcome(gameWon)).toBe('win');
    expect(roundOutcome(gameLost)).toBe('loss');
    expect(roundOutcome(gameDraw)).toBe('draw');
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `pnpm vitest run --project app`
Expected: FAIL, `Failed to resolve import "./search"` and `"./outcome"`.

- [ ] **Step 7: Implement the helpers**

```ts
// file: src/app/lib/search.ts
import { handle } from './events';
import type { PublicPlayer } from './tools';

/** Case-insensitive substring match on the full handle (`name#tag`). A blank query keeps everyone. */
export function filterPlayers(players: PublicPlayer[], query: string): PublicPlayer[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return players;
  return players.filter((player) => handle(player.name, player.tag).toLowerCase().includes(needle));
}
```

```ts
// file: src/app/lib/outcome.ts
import type { GameView } from './tools';

export type Outcome = 'win' | 'loss' | 'draw';

/** What the round-end overlay shows; null while a round is in progress. */
export function roundOutcome(game: GameView | null): Outcome | null {
  if (!game?.over || !game.result) return null;
  if (game.result.status === 'draw') return 'draw';
  if (game.result.status === 'won') return game.result.winner === game.yourMark ? 'win' : 'loss';
  return null;
}
```

- [ ] **Step 8: Verify both projects pass**

Run: `pnpm test`
Expected: two projects reported; `server` 53 tests, `app` 5 tests, all passing.

Run: `pnpm lint:fix && pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/app/test-setup.ts src/app/fixtures src/app/lib
git commit -m "test(app): jsdom project, fixtures, search and outcome helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Assets and stylesheets

**Files:**
- Create: `src/app/assets/kenney/tile_*.png` (17 files), `src/app/assets/kenney/License.txt`, `src/app/assets/fonts/PressStart2P.woff2`, `src/app/assets/fonts/OFL.txt`
- Create: `src/app/styles/tokens.css`, `src/app/styles/base.css`, `src/app/styles/animations.css`
- Delete: `src/app/styles.css`
- Modify: `src/app/main.tsx`

**Interfaces:**
- Produces: the CSS class contract every later task relies on: `.panel`, `.card`, `.cards`, `.ribbon`, `.lobby__search`, `.btn`, `.btn--primary|secondary|danger`, `.input`, `.badge`, `.badge--idle|busy`, `.cell`, `.cell--x|o`, `.board`, `.board-wrap`, `.overlay`, `.overlay--win|loss|draw`, `.confetti`, `.confetti__piece`, `.duck`, `.modal-backdrop`, `.modal`, `.modal__title`, `.modal__actions`, `.toasts`, `.toast`, `.muted`, `.error`, `.join`, `.join__form`, `.lobby`, `.lobby__players`, `.lobby__invites`, `.card__main`, `.card__handle`, `.card__actions`, `.countdown`, `.game`, `.game__header`, `.game__names`, `.game__status`, `.score`.

- [ ] **Step 1: Fetch the Kenney pack and copy the tiles**

```bash
TMP=$(mktemp -d)
curl -sSL -o "$TMP/kenney.zip" "https://kenney.nl/media/pages/assets/ui-pack-pixel-adventure/405ba5278a-1729196257/kenney_ui-pack-pixel-adventure.zip"
unzip -q "$TMP/kenney.zip" -d "$TMP/kenney"
mkdir -p src/app/assets/kenney
for n in 0000 0001 0002 0003 0007 0008 0009 0013 0014 0015 0016 0033 0034 0043 0044 0045 0069; do
  cp "$TMP/kenney/Tiles/Large tiles/Thick outline/tile_$n.png" src/app/assets/kenney/
done
cp "$TMP/kenney/License.txt" src/app/assets/kenney/License.txt
ls src/app/assets/kenney | wc -l
```

Expected: `18` (17 tiles + License.txt). Each tile is a 32x32 PNG. If the download URL has changed, get the current one from the "Download" button on https://kenney.nl/assets/ui-pack-pixel-adventure (the pack is CC0, version 2.0).

Tile roles (thick outline, 32px): 0000 beige panel · 0001 brown button · 0002 grey-blue button/input · 0003 dark panel · 0007 beige cell with corner brackets · 0008 dark secondary button · 0009 dark cell with brackets · 0013 beige card (screws) · 0014 brown pressed · 0015 grey pressed · 0016 dark card · 0033 red-bordered badge · 0034 green-bordered badge · 0043/0044/0045 red ribbon left/middle/right · 0069 red-bordered danger button.

- [ ] **Step 2: Fetch the font**

```bash
mkdir -p src/app/assets/fonts
CSS=$(curl -s -A 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap')
# Google serves one @font-face block per unicode subset; take the URL from the /* latin */ block.
URL=$(printf '%s' "$CSS" | awk '/\/\* latin \*\//{f=1} f && /src: url/ {match($0,/https[^)]+\.woff2/); print substr($0,RSTART,RLENGTH); exit}')
curl -s -o src/app/assets/fonts/PressStart2P.woff2 "$URL"
curl -s -o src/app/assets/fonts/OFL.txt https://raw.githubusercontent.com/google/fonts/main/ofl/pressstart2p/OFL.txt
file src/app/assets/fonts/PressStart2P.woff2; head -1 src/app/assets/fonts/OFL.txt
```

Expected: `Web Open Font Format (Version 2)` (about 12 KB, the Latin subset) and the OFL copyright line. The browser user agent matters: without it Google serves TTF. If the file is under 8 KB you got a non-Latin subset and text will fall back to Courier.

- [ ] **Step 3: Tokens**

```css
/* file: src/app/styles/tokens.css */
/* Palette and tile selection per host theme. Tiles are Kenney "UI Pack - Pixel Adventure" (CC0), 32x32. */
:root {
  --font: 'Press Start 2P', 'Courier New', monospace;
  --fg: #3a2a1a;
  --muted: #7d6b58;
  --accent: #e5534b;
  --shadow: rgba(0, 0, 0, 0.35);
  --btn-primary-fg: #fff6e0;
  --btn-secondary-fg: #2c3340;
  --btn-danger-fg: #2c3340;
  --tile-panel: url('../assets/kenney/tile_0000.png');
  --tile-card: url('../assets/kenney/tile_0013.png');
  --tile-btn-primary: url('../assets/kenney/tile_0001.png');
  --tile-btn-primary-pressed: url('../assets/kenney/tile_0014.png');
  --tile-btn-secondary: url('../assets/kenney/tile_0002.png');
  --tile-btn-secondary-pressed: url('../assets/kenney/tile_0015.png');
  --tile-btn-danger: url('../assets/kenney/tile_0069.png');
  --tile-input: url('../assets/kenney/tile_0002.png');
  --tile-cell: url('../assets/kenney/tile_0000.png');
  --tile-cell-hover: url('../assets/kenney/tile_0007.png');
  --tile-badge-idle: url('../assets/kenney/tile_0034.png');
  --tile-badge-busy: url('../assets/kenney/tile_0033.png');
  --tile-toast: url('../assets/kenney/tile_0002.png');
  --tile-ribbon-l: url('../assets/kenney/tile_0043.png');
  --tile-ribbon-m: url('../assets/kenney/tile_0044.png');
  --tile-ribbon-r: url('../assets/kenney/tile_0045.png');
}

:root[data-theme='dark'] {
  --fg: #f0e6d2;
  --muted: #a9b4c4;
  --shadow: rgba(0, 0, 0, 0.6);
  --btn-primary-fg: #2c3340;
  --btn-secondary-fg: #f0e6d2;
  --tile-panel: url('../assets/kenney/tile_0003.png');
  --tile-card: url('../assets/kenney/tile_0016.png');
  --tile-btn-primary: url('../assets/kenney/tile_0002.png');
  --tile-btn-primary-pressed: url('../assets/kenney/tile_0015.png');
  --tile-btn-secondary: url('../assets/kenney/tile_0008.png');
  --tile-btn-secondary-pressed: url('../assets/kenney/tile_0009.png');
  --tile-cell: url('../assets/kenney/tile_0003.png');
  --tile-cell-hover: url('../assets/kenney/tile_0009.png');
  --tile-toast: url('../assets/kenney/tile_0003.png');
}
```

- [ ] **Step 4: Base styles**

```css
/* file: src/app/styles/base.css */
@font-face {
  font-family: 'Press Start 2P';
  src: url('../assets/fonts/PressStart2P.woff2') format('woff2');
  font-display: swap;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 16px;
  font: 10px/1.6 var(--font);
  color: var(--fg);
  background: transparent;
  -webkit-font-smoothing: none;
}

#root {
  max-width: 720px;
  margin: 0 auto;
}

h2,
h3,
p,
ul {
  margin: 0;
}

h3 {
  font-size: 10px;
  margin: 12px 0 6px;
  text-transform: uppercase;
  color: var(--muted);
}

.muted {
  color: var(--muted);
}

.error {
  color: var(--accent);
  margin-top: 8px;
}

/* ---- 9-slice surfaces. Slice 8 of a 32px tile; 16px border = 2x, 8px = 1x. ---- */

.panel,
.card,
.btn,
.input,
.badge,
.cell,
.toast {
  border-style: solid;
  border-color: transparent;
  border-image-slice: 8 fill;
  border-image-repeat: round;
  image-rendering: pixelated;
  background: transparent;
}

.panel {
  border-width: 16px;
  border-image-source: var(--tile-panel);
  border-image-width: 16px;
  padding: 4px;
  margin-bottom: 12px;
}

.card {
  border-width: 8px;
  border-image-source: var(--tile-card);
  border-image-width: 8px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 2px;
}

.cards {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
}

.card__main {
  flex: 1 1 160px;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  padding: 4px 0;
  text-align: left;
  cursor: pointer;
}

.card__main:disabled {
  cursor: default;
}

.card__handle {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-left: auto;
}

.countdown {
  white-space: nowrap;
}

/* ---- Buttons and inputs (1x borders) ---- */

.btn {
  font: inherit;
  line-height: 1;
  border-width: 8px;
  border-image-width: 8px;
  padding: 4px 6px;
  cursor: pointer;
  white-space: nowrap;
}

.btn:active:not(:disabled) {
  transform: translateY(2px);
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.btn--primary {
  color: var(--btn-primary-fg);
  border-image-source: var(--tile-btn-primary);
}

.btn--primary:active:not(:disabled) {
  border-image-source: var(--tile-btn-primary-pressed);
}

.btn--secondary {
  color: var(--btn-secondary-fg);
  border-image-source: var(--tile-btn-secondary);
}

.btn--secondary:active:not(:disabled) {
  border-image-source: var(--tile-btn-secondary-pressed);
}

.btn--danger {
  color: var(--btn-danger-fg);
  border-image-source: var(--tile-btn-danger);
}

.input {
  font: inherit;
  color: #2c3340;
  border-width: 8px;
  border-image-source: var(--tile-input);
  border-image-width: 8px;
  padding: 4px 2px;
  width: 100%;
  min-width: 0;
}

.input:focus,
.btn:focus-visible,
.cell:focus-visible,
.card__main:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.badge {
  font-size: 8px;
  line-height: 1;
  color: #2c3340;
  border-width: 8px;
  border-image-width: 8px;
  padding: 2px 2px 0;
  text-transform: uppercase;
}

.badge--idle {
  border-image-source: var(--tile-badge-idle);
}

.badge--busy {
  border-image-source: var(--tile-badge-busy);
}

/* ---- Ribbon: three tiles (left cap, repeating middle, right cap) at 2x ---- */

.ribbon {
  position: relative;
  height: 64px;
  width: fit-content;
  min-width: 160px;
  margin: -44px auto 8px;
  padding: 0 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff6e0;
  font-size: 12px;
  text-align: center;
  background: var(--tile-ribbon-m) center / 64px 64px repeat-x;
  image-rendering: pixelated;
}

.ribbon::before,
.ribbon::after {
  content: '';
  position: absolute;
  top: 0;
  width: 64px;
  height: 64px;
  background: var(--tile-ribbon-l) center / 64px 64px no-repeat;
  image-rendering: pixelated;
}

.ribbon::before {
  left: 0;
}

.ribbon::after {
  right: 0;
  background-image: var(--tile-ribbon-r);
}

/* ---- Modal and toasts ---- */

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--shadow);
}

.modal {
  max-width: 360px;
  width: 100%;
  margin: 0;
  text-align: center;
}

.modal__title {
  font-size: 11px;
  margin-bottom: 8px;
}

.modal__actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 12px;
}

.toasts {
  position: fixed;
  top: 8px;
  right: 8px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 280px;
}

.toast {
  font: inherit;
  color: #2c3340;
  text-align: left;
  border-width: 8px;
  border-image-source: var(--tile-toast);
  border-image-width: 8px;
  padding: 4px;
  cursor: pointer;
}

:root[data-theme='dark'] .toast {
  color: var(--fg);
}

/* ---- Screens ---- */

.join {
  max-width: 360px;
  margin: 44px auto 0;
  text-align: center;
}

.join__online {
  margin-bottom: 8px;
}

.join__form {
  display: flex;
  gap: 8px;
}

.lobby {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr;
  margin-top: 44px;
}

@media (min-width: 560px) {
  .lobby {
    grid-template-columns: 1fr 1fr;
  }
}

.lobby .panel {
  margin-bottom: 0;
  min-width: 0;
}

.lobby__search {
  margin: 8px 0;
}

.game {
  text-align: center;
  margin-top: 8px;
}

.game__header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 11px;
}

.game__names {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.score {
  font-size: 16px;
  min-width: 2ch;
}

.game__status {
  margin: 8px 0 12px;
}

.board-wrap {
  position: relative;
  width: fit-content;
  margin: 0 auto 12px;
}

.board {
  display: grid;
  grid-template-columns: repeat(3, 72px);
  gap: 4px;
}

.cell {
  width: 72px;
  height: 72px;
  font: inherit;
  font-size: 24px;
  line-height: 1;
  color: var(--fg);
  border-width: 16px;
  border-image-source: var(--tile-cell);
  border-image-width: 16px;
  padding: 0;
  cursor: pointer;
}

.cell:hover:not(:disabled) {
  border-image-source: var(--tile-cell-hover);
}

.cell:disabled {
  cursor: default;
}

.cell--x {
  color: #d2453d;
}

.cell--o {
  color: #2f7fc1;
}

@media (max-width: 359px) {
  .board {
    grid-template-columns: repeat(3, 64px);
  }
  .cell {
    width: 64px;
    height: 64px;
  }
}
```

- [ ] **Step 5: Animations**

```css
/* file: src/app/styles/animations.css */
.overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  pointer-events: none;
  animation: overlay-in 300ms ease-out;
}

.overlay .ribbon {
  margin: 0;
}

.confetti {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.confetti__piece {
  position: absolute;
  top: -10px;
  width: 8px;
  height: 8px;
  animation: confetti-fall 2.4s linear infinite;
}

.duck {
  font-size: 56px;
  line-height: 1;
  animation: duck-bob 600ms ease-in-out infinite alternate;
}

@keyframes overlay-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes confetti-fall {
  0% {
    transform: translateY(0) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(260px) rotate(720deg);
    opacity: 0.2;
  }
}

@keyframes duck-bob {
  from {
    transform: translateY(-6px) rotate(-8deg);
  }
  to {
    transform: translateY(6px) rotate(8deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .overlay,
  .confetti__piece,
  .duck {
    animation: none;
  }
  .confetti {
    display: none;
  }
}
```

- [ ] **Step 6: Wire the stylesheets and drop the old one**

Replace `src/app/main.tsx`:

```tsx
// file: src/app/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TicTacToeApp } from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/animations.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <TicTacToeApp />
  </StrictMode>,
);
```

```bash
git rm -q src/app/styles.css
```

- [ ] **Step 7: Verify the bundle inlines everything**

```bash
pnpm lint:fix && pnpm lint && pnpm typecheck && pnpm build
grep -o 'data:image/png;base64' dist/mcp-app.html | wc -l
grep -o 'data:font/woff2;base64' dist/mcp-app.html | wc -l
grep -c '\.\./assets' dist/mcp-app.html
```

Expected: lint/typecheck/build clean; first count `25` (16 light-theme + 9 dark-theme `url()` references in tokens.css; tiles used by both themes appear twice), second count `1`, third count `0` (no unresolved relative URLs; `grep -c` exits 1 when it prints 0, which is fine). The old plain components still render with the new classes missing; that is expected until Task 8.

- [ ] **Step 8: Commit**

```bash
git add src/app/assets src/app/styles src/app/main.tsx
git commit -m "feat(app): Kenney tiles, Press Start 2P and the pixel-art stylesheet

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: UI primitives

**Files:**
- Create: `src/app/ui/Panel.tsx`, `Ribbon.tsx`, `Button.tsx`, `Input.tsx`, `Badge.tsx`, `Cell.tsx`, `Modal.tsx`, `Toast.tsx`, `Overlay.tsx`
- Create: `src/app/ui/primitives.test.tsx`

**Interfaces:**
- Consumes: CSS classes from Task 2; `Outcome` from `src/app/lib/outcome.ts`; `Mark` from `src/app/lib/tools.ts`.
- Produces:
  - `Panel(props: HTMLAttributes<HTMLDivElement>)` → `div.panel`
  - `Ribbon({ children })` → `div.ribbon`
  - `Button({ variant?: 'primary' | 'secondary' | 'danger', ...ButtonHTMLAttributes })` → `button.btn.btn--<variant>`, `type` defaults to `"button"`
  - `Input(props: InputHTMLAttributes<HTMLInputElement>)` → `input.input`
  - `Badge({ status: 'idle' | 'busy' })` → `span.badge`
  - `Cell({ index: number; mark: Mark | null; disabled: boolean; onClick: () => void })` → `button.cell` with `aria-label="Cell N[, X|O]"`
  - `Modal({ title: string; children?: ReactNode; confirmLabel: string; cancelLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void })` → `role="dialog"`, Escape calls `onCancel`
  - `ToastStack({ toasts: { id: number; text: string }[]; onDismiss: (id: number) => void })` → clickable toasts
  - `Overlay({ outcome: Outcome })` → `div.overlay[data-testid="overlay"][data-outcome]`, labels `You win!` / `You lose` / `Draw`

- [ ] **Step 1: Failing tests**

```tsx
// file: src/app/ui/primitives.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Badge } from './Badge';
import { Button } from './Button';
import { Cell } from './Cell';
import { Modal } from './Modal';
import { Overlay } from './Overlay';
import { ToastStack } from './Toast';

describe('Button', () => {
  it('defaults to type=button and the primary variant', () => {
    render(<Button>Go</Button>);
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('btn', 'btn--primary');
  });

  it('applies the requested variant', () => {
    render(<Button variant="danger">Deny</Button>);
    expect(screen.getByRole('button', { name: 'Deny' })).toHaveClass('btn--danger');
  });
});

describe('Badge', () => {
  it('shows the status text and class', () => {
    render(<Badge status="busy" />);
    expect(screen.getByText('busy')).toHaveClass('badge', 'badge--busy');
  });
});

describe('Cell', () => {
  it('labels itself by position and mark', () => {
    render(<Cell index={4} mark="X" disabled={false} onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cell 5, X' })).toHaveClass('cell--x');
  });

  it('calls onClick only when enabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<Cell index={0} mark={null} disabled={true} onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'Cell 1' }));
    expect(onClick).not.toHaveBeenCalled();
    rerender(<Cell index={0} mark={null} disabled={false} onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'Cell 1' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Modal', () => {
  it('is a labelled dialog whose buttons call the callbacks', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <Modal title="Leave the match?" confirmLabel="Leave" danger onConfirm={onConfirm} onCancel={onCancel}>
        <p>Your opponent will return to the lobby too.</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Leave the match?' });
    expect(dialog).toHaveTextContent('Your opponent will return to the lobby too.');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Escape cancels', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Modal title="Invite bob#0042 to a match?" confirmLabel="Invite" onConfirm={vi.fn()} onCancel={onCancel} />);
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('ToastStack', () => {
  it('renders nothing when empty and dismisses on click', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const { rerender, container } = render(<ToastStack toasts={[]} onDismiss={onDismiss} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ToastStack toasts={[{ id: 7, text: 'bob#0042 declined your invite.' }]} onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: 'bob#0042 declined your invite.' }));
    expect(onDismiss).toHaveBeenCalledWith(7);
  });
});

describe('Overlay', () => {
  it('renders confetti for a win, a duck for a loss and a plain ribbon for a draw', () => {
    const { rerender, container } = render(<Overlay outcome="win" />);
    expect(screen.getByTestId('overlay')).toHaveAttribute('data-outcome', 'win');
    expect(screen.getByText('You win!')).toBeInTheDocument();
    expect(container.querySelectorAll('.confetti__piece')).toHaveLength(40);

    rerender(<Overlay outcome="loss" />);
    expect(screen.getByText('You lose')).toBeInTheDocument();
    expect(screen.getByText('🦆')).toBeInTheDocument();
    expect(container.querySelectorAll('.confetti__piece')).toHaveLength(0);

    rerender(<Overlay outcome="draw" />);
    expect(screen.getByText('Draw')).toBeInTheDocument();
    expect(screen.queryByText('🦆')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project app src/app/ui`
Expected: FAIL, `Failed to resolve import "./Badge"` (and the others).

- [ ] **Step 3: Implement the primitives**

```tsx
// file: src/app/ui/Panel.tsx
import type { HTMLAttributes } from 'react';

/** A 9-slice Kenney panel. Extra classes are appended so screens can add layout hooks. */
export function Panel({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`panel ${className}`.trim()} {...rest} />;
}
```

```tsx
// file: src/app/ui/Ribbon.tsx
import type { ReactNode } from 'react';

/** Red title ribbon: left cap, repeating middle and right cap come from three Kenney tiles (see base.css). */
export function Ribbon({ children }: { children: ReactNode }) {
  return (
    <div className="ribbon">
      <span className="ribbon__text">{children}</span>
    </div>
  );
}
```

```tsx
// file: src/app/ui/Button.tsx
import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = 'primary', className = '', type = 'button', ...rest }: Props) {
  return <button type={type} className={`btn btn--${variant} ${className}`.trim()} {...rest} />;
}
```

```tsx
// file: src/app/ui/Input.tsx
import type { InputHTMLAttributes } from 'react';

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`.trim()} {...rest} />;
}
```

```tsx
// file: src/app/ui/Badge.tsx
export function Badge({ status }: { status: 'idle' | 'busy' }) {
  return <span className={`badge badge--${status}`}>{status}</span>;
}
```

```tsx
// file: src/app/ui/Cell.tsx
import type { Mark } from '../lib/tools';

interface Props {
  index: number;
  mark: Mark | null;
  disabled: boolean;
  onClick: () => void;
}

export function Cell({ index, mark, disabled, onClick }: Props) {
  const markClass = mark ? ` cell--${mark.toLowerCase()}` : '';
  return (
    <button
      type="button"
      className={`cell${markClass}`}
      aria-label={`Cell ${index + 1}${mark ? `, ${mark}` : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {mark ?? ''}
    </button>
  );
}
```

```tsx
// file: src/app/ui/Modal.tsx
import { type ReactNode, useEffect, useId } from 'react';
import { Button } from './Button';

interface Props {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Renders the confirm button in the danger variant (used for leaving a match). */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** In-widget confirmation. Hosts may swallow native dialogs, so this never uses window.confirm. */
export function Modal({ title, children, confirmLabel, cancelLabel = 'Cancel', danger = false, onConfirm, onCancel }: Props) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop">
      <div className="panel modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className="modal__title">
          {title}
        </h2>
        {children}
        <div className="modal__actions">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

```tsx
// file: src/app/ui/Toast.tsx
export interface ToastItem {
  id: number;
  text: string;
}

interface Props {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

/** Top-right stack of transient messages; each one is a button so a click dismisses it early. */
export function ToastStack({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <button type="button" className="toast" key={toast.id} onClick={() => onDismiss(toast.id)}>
          {toast.text}
        </button>
      ))}
    </div>
  );
}
```

```tsx
// file: src/app/ui/Overlay.tsx
import type { Outcome } from '../lib/outcome';
import { Ribbon } from './Ribbon';

const CONFETTI_COUNT = 40;
const COLORS = ['#e5534b', '#f2c14e', '#4fa3e0', '#7bc96f', '#fff6e0'];
const LABEL: Record<Outcome, string> = { win: 'You win!', loss: 'You lose', draw: 'Draw' };

// Positions and delays are derived from the index so renders are deterministic (tests, stories).
const pieces = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
  id: i,
  left: `${(i * 37) % 100}%`,
  delay: `${((i * 13) % 8) * 0.1}s`,
  color: COLORS[i % COLORS.length],
}));

/** Round-end feedback: confetti on a win, a bobbing duck on a loss, a plain ribbon on a draw. */
export function Overlay({ outcome }: { outcome: Outcome }) {
  return (
    <div className={`overlay overlay--${outcome}`} data-testid="overlay" data-outcome={outcome} aria-live="assertive">
      {outcome === 'win' && (
        <div className="confetti" aria-hidden="true">
          {pieces.map((piece) => (
            <span
              key={piece.id}
              className="confetti__piece"
              style={{ left: piece.left, animationDelay: piece.delay, background: piece.color }}
            />
          ))}
        </div>
      )}
      {outcome === 'loss' && (
        <div className="duck" aria-hidden="true">
          🦆
        </div>
      )}
      <Ribbon>{LABEL[outcome]}</Ribbon>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run --project app src/app/ui`
Expected: PASS, 9 tests.

Note on the duck test: `aria-hidden` elements are still found by `getByText`; only role queries skip them.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
pnpm lint:fix && pnpm lint && pnpm typecheck
git add src/app/ui
git commit -m "feat(app): pixel-art UI primitives

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```


---

### Task 4: Hooks: toasts, countdown, leading poll

**Files:**
- Create: `src/app/hooks/useToasts.ts`, `src/app/hooks/useToasts.test.tsx`, `src/app/hooks/useCountdown.ts`, `src/app/hooks/useCountdown.test.tsx`, `src/app/hooks/usePollView.test.tsx`
- Modify: `src/app/hooks/usePollView.ts`

**Interfaces:**
- Consumes: `ToastItem` from `src/app/ui/Toast.tsx`; `callTool` from `src/app/lib/tools.ts`.
- Produces: `TOAST_MS = 4000`; `useToasts(ttlMs = TOAST_MS): { toasts: ToastItem[]; push: (text: string) => void; dismiss: (id: number) => void }`; `useCountdown(expiresIn: number, tickMs = 1000): number`; `formatSeconds(ms: number): string` (ceil, clamped at 0, e.g. `'45s'`); `usePollView` polls once immediately.

- [ ] **Step 1: Failing tests**

```tsx
// file: src/app/hooks/useToasts.test.tsx
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_MS, useToasts } from './useToasts';

describe('useToasts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pushes a toast and auto-dismisses it after TOAST_MS', () => {
    const { result } = renderHook(() => useToasts());
    act(() => result.current.push('hello'));
    expect(result.current.toasts).toEqual([{ id: 1, text: 'hello' }]);
    act(() => vi.advanceTimersByTime(TOAST_MS - 1));
    expect(result.current.toasts).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.toasts).toEqual([]);
  });

  it('keeps several toasts in order with increasing ids', () => {
    const { result } = renderHook(() => useToasts());
    act(() => {
      result.current.push('one');
      result.current.push('two');
    });
    expect(result.current.toasts.map((t) => t.id)).toEqual([1, 2]);
  });

  it('dismiss removes a toast early and cancels its timer', () => {
    const { result } = renderHook(() => useToasts());
    act(() => result.current.push('bye'));
    act(() => result.current.dismiss(1));
    expect(result.current.toasts).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears pending timers on unmount', () => {
    const { result, unmount } = renderHook(() => useToasts());
    act(() => result.current.push('x'));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
```

```tsx
// file: src/app/hooks/useCountdown.test.tsx
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatSeconds, useCountdown } from './useCountdown';

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down once a second and clamps at zero', () => {
    const { result } = renderHook(() => useCountdown(2500));
    expect(result.current).toBe(2500);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(1500);
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current).toBe(0);
  });

  it('resyncs when a new value arrives from a poll', () => {
    const { result, rerender } = renderHook(({ ms }) => useCountdown(ms), { initialProps: { ms: 5000 } });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(4000);
    rerender({ ms: 9000 });
    expect(result.current).toBe(9000);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(8000);
  });

  it('stops ticking on unmount', () => {
    const { unmount } = renderHook(() => useCountdown(5000));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('formatSeconds', () => {
  it('rounds up to whole seconds and never goes negative', () => {
    expect(formatSeconds(45_000)).toBe('45s');
    expect(formatSeconds(4400)).toBe('5s');
    expect(formatSeconds(0)).toBe('0s');
    expect(formatSeconds(-5)).toBe('0s');
  });
});
```

```tsx
// file: src/app/hooks/usePollView.test.tsx
import type { App } from '@modelcontextprotocol/ext-apps';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePollView } from './usePollView';

describe('usePollView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls get_state immediately, then every interval', async () => {
    const view = { phase: 'lobby' };
    const callServerTool = vi.fn().mockResolvedValue({ structuredContent: view });
    const app = { callServerTool } as unknown as App;
    const onView = vi.fn();
    renderHook(() => usePollView(app, 'me', onView, 1000));

    expect(callServerTool).toHaveBeenCalledTimes(1);
    expect(callServerTool).toHaveBeenCalledWith({ name: 'get_state', arguments: { playerId: 'me' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(callServerTool).toHaveBeenCalledTimes(2);
    expect(onView).toHaveBeenLastCalledWith(view);
  });

  it('does nothing without a player id and stops on unmount', async () => {
    const callServerTool = vi.fn().mockResolvedValue({ structuredContent: {} });
    const app = { callServerTool } as unknown as App;
    const { unmount } = renderHook(() => usePollView(app, null, vi.fn(), 1000));
    expect(callServerTool).not.toHaveBeenCalled();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project app src/app/hooks`
Expected: FAIL. `useToasts` and `useCountdown` cannot be resolved; in `usePollView.test.tsx` the first assertion fails with `expected "spy" to be called 1 times, but got 0 times` (no leading poll yet).

- [ ] **Step 3: Implement**

```ts
// file: src/app/hooks/useToasts.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastItem } from '../ui/Toast';

export const TOAST_MS = 4000;

/** Transient messages with auto-dismiss. Owns its timers and clears them all on unmount. */
export function useToasts(ttlMs = TOAST_MS) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (text: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, text }]);
      timers.current.set(id, window.setTimeout(() => dismiss(id), ttlMs));
    },
    [dismiss, ttlMs],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return { toasts, push, dismiss };
}
```

```ts
// file: src/app/hooks/useCountdown.ts
import { useEffect, useState } from 'react';

/**
 * Counts `expiresIn` (ms) down locally once a second. Every poll delivers a fresh `expiresIn`, which
 * restarts the countdown, so client and server clocks never need to agree.
 */
export function useCountdown(expiresIn: number, tickMs = 1000): number {
  const [remaining, setRemaining] = useState(expiresIn);

  useEffect(() => {
    setRemaining(expiresIn);
    const started = Date.now();
    const id = window.setInterval(() => {
      setRemaining(Math.max(0, expiresIn - (Date.now() - started)));
    }, tickMs);
    return () => window.clearInterval(id);
  }, [expiresIn, tickMs]);

  return remaining;
}

export function formatSeconds(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 1000))}s`;
}
```

In `src/app/hooks/usePollView.ts`, change the interval setup so the first poll happens at once. Replace

```ts
    const id = window.setInterval(poll, intervalMs);
```

with

```ts
    void poll();
    const id = window.setInterval(poll, intervalMs);
```

and update the doc comment to: `Polls the app-only get_state tool once immediately and then every intervalMs while a player id is known. MCP Apps has no server-to-widget push, so this is how the widget learns about invites and opponent moves.`

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run --project app src/app/hooks`
Expected: PASS, 10 tests, no `act(...)` warnings in the output.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
pnpm lint:fix && pnpm lint && pnpm typecheck
git add src/app/hooks
git commit -m "feat(app): toast and countdown hooks, leading poll

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Join screen

**Files:**
- Create: `src/app/screens/JoinScreen.tsx`, `src/app/screens/JoinScreen.test.tsx`

**Interfaces:**
- Consumes: `Panel`, `Ribbon`, `Input`, `Button` from `src/app/ui/`.
- Produces: `JoinScreen({ onlineCount: number; error: string | null; onSubmit: (name: string) => void })`.

- [ ] **Step 1: Failing test**

```tsx
// file: src/app/screens/JoinScreen.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JoinScreen } from './JoinScreen';

describe('JoinScreen', () => {
  it('shows the online count and submits the trimmed name', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<JoinScreen onlineCount={3} error={null} onSubmit={onSubmit} />);
    expect(screen.getByText('3 players online')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Join Game' });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText('Your name'), '  worgho2  ');
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onSubmit).toHaveBeenCalledWith('worgho2');
  });

  it('uses the singular for one player and shows the server error inline', () => {
    render(<JoinScreen onlineCount={1} error="name required" onSubmit={vi.fn()} />);
    expect(screen.getByText('1 player online')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('name required');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project app src/app/screens/JoinScreen.test.tsx`
Expected: FAIL, `Failed to resolve import "./JoinScreen"`.

- [ ] **Step 3: Implement**

```tsx
// file: src/app/screens/JoinScreen.tsx
import { type FormEvent, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Panel } from '../ui/Panel';
import { Ribbon } from '../ui/Ribbon';

interface Props {
  onlineCount: number;
  error: string | null;
  onSubmit: (name: string) => void;
}

export function JoinScreen({ onlineCount, error, onSubmit }: Props) {
  const [name, setName] = useState('');
  const trimmed = name.trim();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <Panel className="join">
      <Ribbon>Tic-Tac-Toe</Ribbon>
      <p className="muted join__online">
        {onlineCount} player{onlineCount === 1 ? '' : 's'} online
      </p>
      <form className="join__form" onSubmit={submit}>
        <Input
          placeholder="Your name"
          aria-label="Your name"
          maxLength={24}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" disabled={!trimmed}>
          Join Game
        </Button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Panel>
  );
}
```

- [ ] **Step 4: Run to verify pass, lint, commit**

Run: `pnpm vitest run --project app src/app/screens/JoinScreen.test.tsx`
Expected: PASS, 2 tests.

```bash
pnpm lint:fix && pnpm lint && pnpm typecheck
git add src/app/screens/JoinScreen.tsx src/app/screens/JoinScreen.test.tsx
git commit -m "feat(app): join screen

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Lobby screen

**Files:**
- Create: `src/app/screens/LobbyScreen.tsx`, `src/app/screens/LobbyScreen.test.tsx`

**Interfaces:**
- Consumes: `filterPlayers`, `handle`, `useCountdown`, `formatSeconds`, `Panel`, `Ribbon`, `Input`, `Button`, `Badge`, `Modal`; fixtures `you`, `players`, `sent`, `received`, `emptyInvites`.
- Produces: `LobbyScreen({ you: PlayerView['you']; onlineCount: number; players: PublicPlayer[]; invites: PlayerView['invites']; onInvite: (targetId: string) => void; onAccept: (inviteId: string) => void; onDecline: (inviteId: string) => void; onCancel: (inviteId: string) => void })`.

- [ ] **Step 1: Failing tests**

```tsx
// file: src/app/screens/LobbyScreen.test.tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { emptyInvites, players, received, sent, you } from '../fixtures/views';
import { LobbyScreen } from './LobbyScreen';

type Props = Parameters<typeof LobbyScreen>[0];

function renderLobby(overrides: Partial<Props> = {}) {
  const handlers = { onInvite: vi.fn(), onAccept: vi.fn(), onDecline: vi.fn(), onCancel: vi.fn() };
  render(
    <LobbyScreen
      you={you}
      onlineCount={4}
      players={players}
      invites={{ sent, received }}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe('LobbyScreen', () => {
  it('lists players with handles and status, and shows who you are', () => {
    renderLobby();
    expect(screen.getByText(/You are worgho2#1234/)).toBeInTheDocument();
    expect(screen.getByText(/4 online/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bob#0042/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /alice#0007/ })).toHaveTextContent('busy');
  });

  it('search filters by handle substring, case-insensitively', async () => {
    const user = userEvent.setup();
    renderLobby();
    const search = screen.getByLabelText('Search players');
    await user.type(search, 'BOB');
    expect(screen.getByRole('button', { name: /bob#0042/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /alice#0007/ })).not.toBeInTheDocument();
    await user.clear(search);
    await user.type(search, 'zzz');
    expect(screen.getByText('No players match')).toBeInTheDocument();
  });

  it('disables Invite for busy players and for players with a pending sent invite', () => {
    renderLobby();
    const [bob, aliceBusy, alicePending] = screen.getAllByRole('button', { name: 'Invite' });
    expect(bob).toBeEnabled();
    expect(aliceBusy).toBeDisabled();
    expect(alicePending).toBeDisabled(); // alice#0099 already has a sent invite
    expect(screen.getByRole('button', { name: /alice#0099/ })).toBeDisabled();
  });

  it('clicking a card opens a confirmation; confirming invites that player and closes it', async () => {
    const user = userEvent.setup();
    const handlers = renderLobby();
    await user.click(screen.getByRole('button', { name: /bob#0042/ }));
    const dialog = screen.getByRole('dialog', { name: 'Invite bob#0042 to a match?' });
    await user.click(within(dialog).getByRole('button', { name: 'Invite' }));
    expect(handlers.onInvite).toHaveBeenCalledWith('p1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancelling the confirmation invites nobody', async () => {
    const user = userEvent.setup();
    const handlers = renderLobby();
    await user.click(screen.getAllByRole('button', { name: 'Invite' })[0]);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(handlers.onInvite).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('received invites offer Accept and Deny, sent invites offer Cancel, both with a countdown', async () => {
    const user = userEvent.setup();
    const handlers = renderLobby();
    expect(screen.getByText('45s')).toBeInTheDocument();
    expect(screen.getByText('12s')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(handlers.onAccept).toHaveBeenCalledWith('inv-r1');
    await user.click(screen.getByRole('button', { name: 'Deny' }));
    expect(handlers.onDecline).toHaveBeenCalledWith('inv-r1');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handlers.onCancel).toHaveBeenCalledWith('inv-s1');
  });

  it('shows the empty states', () => {
    renderLobby({ players: [], invites: emptyInvites, onlineCount: 1 });
    expect(screen.getByText('No one else is online yet')).toBeInTheDocument();
    expect(screen.getAllByText('No invites')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project app src/app/screens/LobbyScreen.test.tsx`
Expected: FAIL, `Failed to resolve import "./LobbyScreen"`.

- [ ] **Step 3: Implement**

```tsx
// file: src/app/screens/LobbyScreen.tsx
import { type ReactNode, useState } from 'react';
import { formatSeconds, useCountdown } from '../hooks/useCountdown';
import { handle } from '../lib/events';
import { filterPlayers } from '../lib/search';
import type { InviteView, PlayerView, PublicPlayer } from '../lib/tools';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Panel } from '../ui/Panel';
import { Ribbon } from '../ui/Ribbon';

interface Props {
  you: PlayerView['you'];
  onlineCount: number;
  players: PublicPlayer[];
  invites: PlayerView['invites'];
  onInvite: (targetId: string) => void;
  onAccept: (inviteId: string) => void;
  onDecline: (inviteId: string) => void;
  onCancel: (inviteId: string) => void;
}

function Countdown({ expiresIn }: { expiresIn: number }) {
  const remaining = useCountdown(expiresIn);
  return <span className="muted countdown">{formatSeconds(remaining)}</span>;
}

function InviteCard({ invite, children }: { invite: InviteView; children: ReactNode }) {
  return (
    <li className="card">
      <span className="card__handle">{handle(invite.name, invite.tag)}</span>
      <Countdown expiresIn={invite.expiresIn} />
      <span className="card__actions">{children}</span>
    </li>
  );
}

export function LobbyScreen({ you, onlineCount, players, invites, onInvite, onAccept, onDecline, onCancel }: Props) {
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<PublicPlayer | null>(null);

  // Sent invites carry the target's handle, not its id; handles are unique among registered players.
  const pendingHandles = new Set(invites.sent.map((invite) => handle(invite.name, invite.tag)));
  const canInvite = (player: PublicPlayer) =>
    player.status === 'idle' && !pendingHandles.has(handle(player.name, player.tag));
  const visible = filterPlayers(players, query);
  const yourHandle = you.name && you.tag ? handle(you.name, you.tag) : '…';

  const confirmInvite = () => {
    if (target) onInvite(target.id);
    setTarget(null);
  };

  return (
    <div className="lobby">
      <Panel className="lobby__players">
        <Ribbon>Players</Ribbon>
        <p className="muted">
          You are {yourHandle} · {onlineCount} online
        </p>
        <Input
          className="lobby__search"
          value={query}
          placeholder="Search players"
          aria-label="Search players"
          onChange={(event) => setQuery(event.target.value)}
        />
        {visible.length === 0 && (
          <p className="muted">{players.length === 0 ? 'No one else is online yet' : 'No players match'}</p>
        )}
        <ul className="cards">
          {visible.map((player) => {
            const enabled = canInvite(player);
            return (
              <li className="card" key={player.id}>
                <button type="button" className="card__main" disabled={!enabled} onClick={() => setTarget(player)}>
                  <span className="card__handle">{handle(player.name, player.tag)}</span>
                  <Badge status={player.status} />
                </button>
                <Button disabled={!enabled} onClick={() => setTarget(player)}>
                  Invite
                </Button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel className="lobby__invites">
        <Ribbon>Invites</Ribbon>
        <h3>Received</h3>
        {invites.received.length === 0 && <p className="muted">No invites</p>}
        <ul className="cards">
          {invites.received.map((invite) => (
            <InviteCard invite={invite} key={invite.inviteId}>
              <Button onClick={() => onAccept(invite.inviteId)}>Accept</Button>
              <Button variant="danger" onClick={() => onDecline(invite.inviteId)}>
                Deny
              </Button>
            </InviteCard>
          ))}
        </ul>
        <h3>Sent</h3>
        {invites.sent.length === 0 && <p className="muted">No invites</p>}
        <ul className="cards">
          {invites.sent.map((invite) => (
            <InviteCard invite={invite} key={invite.inviteId}>
              <Button variant="secondary" onClick={() => onCancel(invite.inviteId)}>
                Cancel
              </Button>
            </InviteCard>
          ))}
        </ul>
      </Panel>

      {target && (
        <Modal
          title={`Invite ${handle(target.name, target.tag)} to a match?`}
          confirmLabel="Invite"
          onConfirm={confirmInvite}
          onCancel={() => setTarget(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass, lint, commit**

Run: `pnpm vitest run --project app src/app/screens/LobbyScreen.test.tsx`
Expected: PASS, 7 tests.

```bash
pnpm lint:fix && pnpm lint && pnpm typecheck
git add src/app/screens/LobbyScreen.tsx src/app/screens/LobbyScreen.test.tsx
git commit -m "feat(app): lobby screen with search, invite lists and confirm modal

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Game screen

**Files:**
- Create: `src/app/screens/GameScreen.tsx`, `src/app/screens/GameScreen.test.tsx`

**Interfaces:**
- Consumes: `roundOutcome`, `handle`, `Panel`, `Button`, `Cell`, `Modal`, `Overlay`; fixtures `you`, `gameYourTurn`, `gameOpponentTurn`, `gameWon`, `gameLost`, `gameDraw`.
- Produces: `GameScreen({ you: PlayerView['you']; game: GameView; onMove: (cell: number) => void; onLeave: () => void })`.

- [ ] **Step 1: Failing tests**

```tsx
// file: src/app/screens/GameScreen.test.tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { gameDraw, gameLost, gameOpponentTurn, gameWon, gameYourTurn, you } from '../fixtures/views';
import type { GameView } from '../lib/tools';
import { GameScreen } from './GameScreen';

function renderGame(game: GameView, onMove = vi.fn(), onLeave = vi.fn()) {
  const utils = render(<GameScreen you={you} game={game} onMove={onMove} onLeave={onLeave} />);
  return { ...utils, onMove, onLeave };
}

describe('GameScreen', () => {
  it('renders the score header, round and turn line', () => {
    renderGame({ ...gameWon, over: false, result: null, yourTurn: true });
    expect(screen.getByLabelText('Your score')).toHaveTextContent('1');
    expect(screen.getByLabelText('Opponent score')).toHaveTextContent('0');
    expect(screen.getByText(/worgho2#1234/)).toBeInTheDocument();
    expect(screen.getByText(/bob#0042/)).toBeInTheDocument();
    expect(screen.getByText('Round 1 · you are X · Your turn')).toBeInTheDocument();
  });

  it('only empty cells are playable on your turn, and a click reports the index', async () => {
    const user = userEvent.setup();
    const { onMove } = renderGame({ ...gameYourTurn, board: ['X', null, null, null, null, null, null, null, null] });
    expect(screen.getByRole('button', { name: 'Cell 1, X' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cell 5' }));
    expect(onMove).toHaveBeenCalledWith(4);
  });

  it("disables every cell on the opponent's turn and after the round ends", () => {
    const { rerender } = renderGame(gameOpponentTurn);
    expect(screen.getByText("Round 1 · you are O · Opponent's turn")).toBeInTheDocument();
    for (const cell of screen.getAllByRole('button', { name: /^Cell/ })) expect(cell).toBeDisabled();
    rerender(<GameScreen you={you} game={gameWon} onMove={vi.fn()} onLeave={vi.fn()} />);
    for (const cell of screen.getAllByRole('button', { name: /^Cell/ })) expect(cell).toBeDisabled();
    expect(screen.getByText(/Next round starts in a moment/)).toBeInTheDocument();
  });

  it('shows the win, loss and draw overlays and none during play', () => {
    const { rerender } = renderGame(gameWon);
    expect(screen.getByTestId('overlay')).toHaveAttribute('data-outcome', 'win');
    expect(screen.getByText('You win!')).toBeInTheDocument();
    rerender(<GameScreen you={you} game={gameLost} onMove={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.getByTestId('overlay')).toHaveAttribute('data-outcome', 'loss');
    expect(screen.getByText('🦆')).toBeInTheDocument();
    rerender(<GameScreen you={you} game={gameDraw} onMove={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.getByText('Draw')).toBeInTheDocument();
    rerender(<GameScreen you={you} game={gameYourTurn} onMove={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument();
  });

  it('Back to lobby asks for confirmation before leaving', async () => {
    const user = userEvent.setup();
    const { onLeave } = renderGame(gameYourTurn);
    await user.click(screen.getByRole('button', { name: 'Back to lobby' }));
    const dialog = screen.getByRole('dialog', { name: 'Leave the match?' });
    expect(dialog).toHaveTextContent('Your opponent will return to the lobby too.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onLeave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Back to lobby' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project app src/app/screens/GameScreen.test.tsx`
Expected: FAIL, `Failed to resolve import "./GameScreen"`.

- [ ] **Step 3: Implement**

```tsx
// file: src/app/screens/GameScreen.tsx
import { useState } from 'react';
import { handle } from '../lib/events';
import { roundOutcome } from '../lib/outcome';
import type { GameView, PlayerView } from '../lib/tools';
import { Button } from '../ui/Button';
import { Cell } from '../ui/Cell';
import { Modal } from '../ui/Modal';
import { Overlay } from '../ui/Overlay';
import { Panel } from '../ui/Panel';

interface Props {
  you: PlayerView['you'];
  game: GameView;
  onMove: (cell: number) => void;
  onLeave: () => void;
}

function turnLine(game: GameView): string {
  if (game.over) return 'Next round starts in a moment…';
  return game.yourTurn ? 'Your turn' : "Opponent's turn";
}

export function GameScreen({ you, game, onMove, onLeave }: Props) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const outcome = roundOutcome(game);
  const yourHandle = you.name && you.tag ? handle(you.name, you.tag) : 'you';

  const leave = () => {
    setConfirmLeave(false);
    onLeave();
  };

  return (
    <Panel className="game">
      <header className="game__header">
        <output className="score" aria-label="Your score">
          {game.yourScore}
        </output>
        <span className="game__names">
          {yourHandle} <span className="muted">x</span> {handle(game.opponentName, game.opponentTag)}
        </span>
        <output className="score" aria-label="Opponent score">
          {game.opponentScore}
        </output>
      </header>
      <p className="muted game__status">
        Round {game.round} · you are {game.yourMark} · {turnLine(game)}
      </p>
      <div className="board-wrap">
        <div className="board">
          {game.board.map((mark, index) => (
            <Cell
              // Cells are positional and never reorder; the index is the identity.
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed 3x3 grid
              key={index}
              index={index}
              mark={mark}
              disabled={game.over || !game.yourTurn || mark !== null}
              onClick={() => onMove(index)}
            />
          ))}
        </div>
        {outcome && <Overlay key={game.round} outcome={outcome} />}
      </div>
      <Button variant="secondary" onClick={() => setConfirmLeave(true)}>
        Back to lobby
      </Button>
      {confirmLeave && (
        <Modal title="Leave the match?" confirmLabel="Leave" danger onConfirm={leave} onCancel={() => setConfirmLeave(false)}>
          <p>Your opponent will return to the lobby too.</p>
        </Modal>
      )}
    </Panel>
  );
}
```

- [ ] **Step 4: Run to verify pass, lint, commit**

Run: `pnpm vitest run --project app src/app/screens/GameScreen.test.tsx`
Expected: PASS, 5 tests.

```bash
pnpm lint:fix && pnpm lint && pnpm typecheck
git add src/app/screens/GameScreen.tsx src/app/screens/GameScreen.test.tsx
git commit -m "feat(app): game screen with score header, overlay and leave confirmation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: App wiring and removal of the old components

**Files:**
- Rewrite: `src/app/App.tsx`
- Delete: `src/app/components/NameScreen.tsx`, `src/app/components/LobbyScreen.tsx`, `src/app/components/GameBoard.tsx`

**Interfaces:**
- Consumes: `useToasts`, `usePollView`, `useHostTheme`, `eventText`, `callTool`/`isJoinResult`/`isPlayerView`/`parseTextBlock`, `JoinScreen`, `LobbyScreen`, `GameScreen`, `ToastStack`.
- Produces: the widget entry component `TicTacToeApp` (unchanged name, imported by `main.tsx`).

- [ ] **Step 1: Rewrite `App.tsx`**

```tsx
// file: src/app/App.tsx
import { useApp } from '@modelcontextprotocol/ext-apps/react';
import { useCallback, useEffect, useState } from 'react';
import pkg from '../../package.json';
import { useHostTheme } from './hooks/useHostTheme';
import { usePollView } from './hooks/usePollView';
import { useToasts } from './hooks/useToasts';
import { eventText } from './lib/events';
import { callTool, isJoinResult, isPlayerView, type PlayerView, parseTextBlock, type ToolName } from './lib/tools';
import { GameScreen } from './screens/GameScreen';
import { JoinScreen } from './screens/JoinScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { ToastStack } from './ui/Toast';

/** An error that only restates an event delivered in the same reply (the opponent left, so the move failed). */
function redundantError(view: PlayerView): boolean {
  return view.error === 'not in a game' && view.events.some((event) => event.type === 'opponent-left');
}

export function TicTacToeApp() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [theme, setTheme] = useState<string | undefined>(undefined);
  const [tornDown, setTornDown] = useState(false);
  const { toasts, push, dismiss } = useToasts();

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
      for (const event of next.events) push(eventText(event));
      // The join screen renders its error inline; everywhere else it is a toast.
      if (next.error && next.phase !== 'name' && !redundantError(next)) push(next.error);
    },
    [push],
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
      <p className="error">
        <strong>Error:</strong> {error.message}
      </p>
    );
  }
  if (!app) return <p className="muted">Connecting…</p>;
  if (!view) return <p className="muted">Loading…</p>;

  return (
    <main>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      {view.phase === 'name' && (
        <JoinScreen onlineCount={view.onlineCount} error={view.error} onSubmit={(name) => call('set_name', { name })} />
      )}
      {view.phase === 'lobby' && (
        <LobbyScreen
          you={view.you}
          onlineCount={view.onlineCount}
          players={view.players}
          invites={view.invites}
          onInvite={(targetId) => call('invite', { targetId })}
          onAccept={(inviteId) => call('accept_invite', { inviteId })}
          onDecline={(inviteId) => call('decline_invite', { inviteId })}
          onCancel={(inviteId) => call('cancel_invite', { inviteId })}
        />
      )}
      {view.phase === 'game' && view.game && (
        <GameScreen
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

- [ ] **Step 2: Delete the old components and verify everything**

```bash
git rm -q -r src/app/components
grep -rn "components/" src/app || echo "no references left"
pnpm lint:fix && pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Expected: "no references left"; lint, typecheck and build clean; `server` 53 tests and `app` 38 tests passing (5 helpers + 9 primitives + 10 hooks + 2 join + 7 lobby + 5 game), no `act(...)` warnings.

- [ ] **Step 3: Visual check without a host**

The widget cannot connect outside an MCP host, so check the rendering with a scratch harness that is not committed:

```bash
mkdir -p .scratch && cat > .scratch/preview.tsx <<'EOF'
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { gameLost, gameWon, gameYourTurn, players, received, sent, you } from '../src/app/fixtures/views';
import { GameScreen } from '../src/app/screens/GameScreen';
import { JoinScreen } from '../src/app/screens/JoinScreen';
import { LobbyScreen } from '../src/app/screens/LobbyScreen';
import { ToastStack } from '../src/app/ui/Toast';
import '../src/app/styles/tokens.css';
import '../src/app/styles/base.css';
import '../src/app/styles/animations.css';

const noop = () => {};
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastStack toasts={[{ id: 1, text: 'bob#0042 declined your invite.' }]} onDismiss={noop} />
    <JoinScreen onlineCount={3} error="name required" onSubmit={noop} />
    <LobbyScreen you={you} onlineCount={4} players={players} invites={{ sent, received }} onInvite={noop} onAccept={noop} onDecline={noop} onCancel={noop} />
    <GameScreen you={you} game={gameYourTurn} onMove={noop} onLeave={noop} />
    <GameScreen you={you} game={gameWon} onMove={noop} onLeave={noop} />
    <GameScreen you={you} game={gameLost} onMove={noop} onLeave={noop} />
  </StrictMode>,
);
EOF
cat > .scratch/index.html <<'EOF'
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>preview</title></head>
<body><div id="root"></div><script type="module" src="./preview.tsx"></script></body></html>
EOF
pnpm vite .scratch --port 5174 --open
```

Check in the browser: panels and buttons have crisp pixel borders (no blur), the ribbons overlap the panel tops, the lobby is two columns wide and stacks below 560px, the board cells are 72px with red X / blue O, confetti falls on the win screen and the duck bobs on the loss screen. Toggle dark mode by running `document.documentElement.dataset.theme = 'dark'` in the console.

Browser window resizing is unreliable in some setups; for the narrow checks add `.scratch/narrow.html` with two iframes (`<iframe src="/index.html" width="360" height="1400">` and one at `width="560"` with `?theme=dark`) and open `http://localhost:5174/narrow.html`: handles must stay readable (cards wrap), no horizontal scrollbar inside the invite lists.

Then stop Vite and `rm -rf .scratch`. Biome lints `.scratch/` and fails on the iframe page, so `pnpm lint` (Task 9) fails while the folder exists. Do not commit `.scratch`.

If this task is executed by a subagent without a browser, the controller runs this step.

- [ ] **Step 4: Commit**

```bash
git add src/app
git commit -m "feat(app): pixel-art screens wired into the widget

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Docs and pull request

**Files:**
- Modify: `CLAUDE.md` ("Commands" table, "Architecture" widget section, "Conventions")
- Modify: `CONTRIBUTING.md` (assets and widget tests)
- Modify: `docs/superpowers/specs/2026-09-14-game-design-and-use-cases.md` (two sentences), `docs/superpowers/plans/2026-09-14-widget-reskin.md` is already in the tree

- [ ] **Step 1: CLAUDE.md**

In the "Commands" table, change the `pnpm test` row's notes to: `Vitest with two projects: server (node, src/server/**/*.test.ts) and app (jsdom + Testing Library, src/app/**/*.test.{ts,tsx})`. Below the table, change the single-file example to `pnpm vitest run src/server/lobby/lobby.test.ts` (unchanged) and add: `One project only: pnpm vitest run --project app`.

Replace the "### Widget" section with:

```markdown
### Widget

`src/app/App.tsx` uses `useApp` from `@modelcontextprotocol/ext-apps/react`, polls, calls tools, and switches screens on `view.phase` (`name` → `screens/JoinScreen`, `lobby` → `screens/LobbyScreen`, `game` → `screens/GameScreen`). Screens and the primitives in `src/app/ui/` are pure (props in, callbacks out) and never import ext-apps; that is what makes them testable in jsdom and renderable in Storybook. `App.tsx` turns every `view.events` entry and any mutation `error` outside the name phase into a toast (`hooks/useToasts`, 4 s, timers cleared on unmount), except a `not in a game` error that arrives together with an `opponent-left` event. `lib/tools.ts` wraps `callTool`, preferring `structuredContent` and falling back to parsing the text block.

**Polling, not push.** MCP Apps has no server→widget push, so `hooks/usePollView.ts` calls `get_state` once immediately and then every `POLL_INTERVAL_MS = 1500`. Keep the poll interval well under the presence TTL. Invite countdowns tick locally from `expiresIn` (`hooks/useCountdown`) and resync on every poll.

**Visual system.** Plain CSS in `src/app/styles/`: `tokens.css` holds the palette and one CSS custom property per Kenney tile role, overridden under `:root[data-theme='dark']`; `base.css` styles the primitives as `border-image` 9-slices (`border-image-slice: 8 fill`, 16px borders for panels/cells = 2x, 8px for buttons/inputs/badges = 1x, `image-rendering: pixelated`); `animations.css` holds the round-end overlay (CSS confetti, bobbing 🦆, `prefers-reduced-motion` off switch). Assets live in `src/app/assets/` (17 tiles from Kenney "UI Pack - Pixel Adventure", CC0, plus Press Start 2P, OFL) and are inlined into the single-file bundle by `vite-plugin-singlefile`; never reference an external URL. Host sizing is automatic (`useApp` enables `autoResize`).

Widget tests use Testing Library with `src/app/test-setup.ts` (jest-dom matchers, cleanup) and the fixtures in `src/app/fixtures/views.ts`; the same fixtures feed the Storybook stories.
```

In "Conventions", add a bullet: `- Only `App.tsx` and `hooks/usePollView.ts` import from `@modelcontextprotocol/ext-apps`. New screens take a view slice and callbacks.`

- [ ] **Step 2: CONTRIBUTING.md**

Add a section (after the layout table if there is one, otherwise at the end):

```markdown
## Assets and credits

- UI tiles: [Kenney "UI Pack - Pixel Adventure"](https://kenney.nl/assets/ui-pack-pixel-adventure) (CC0). Only the tiles the widget uses are committed under `src/app/assets/kenney/` with Kenney's `License.txt`. To add one, copy it from `Tiles/Large tiles/Thick outline/` of the pack, add a `--tile-<role>` custom property in `src/app/styles/tokens.css` (both themes), and use it as `border-image-source`.
- Font: [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) (SIL OFL 1.1), `src/app/assets/fonts/`.

All assets are inlined into `dist/mcp-app.html`; the widget must not reference external URLs (MCP hosts sandbox it with a CSP).

## Widget tests

`pnpm test` runs two Vitest projects. Widget tests (`src/app/**/*.test.{ts,tsx}`) run in jsdom with Testing Library; render screens from the fixtures in `src/app/fixtures/views.ts`, query by role or label, and drive them with `@testing-library/user-event`. Run just that project with `pnpm vitest run --project app`.
```

- [ ] **Step 3: Spec touch-ups**

In `docs/superpowers/specs/2026-09-14-game-design-and-use-cases.md`:
- Under "### Sizing and host", replace the first sentence with: `ext-apps' `useApp` enables `autoResize` by default, so the widget's content height reaches the host through `ui/notifications/size-changed` without any code in the widget.`
- In the "### Structure" tree, replace `useCountdown, useRoundOverlay` with `useCountdown, useToasts` and add `outcome.ts` next to `tools.ts` in `lib/` with the note `roundOutcome(game): 'win' | 'loss' | 'draw' | null`.
- In "## Docs", change the README bullet to: `- `README.md`: screenshots from Storybook (PR 3).`
- In "## Testing", change the widget glob `src/app/**/*.test.tsx` to `src/app/**/*.test.{ts,tsx}` (pure helpers under `lib/` are plain `.ts`).

- [ ] **Step 4: Verify, commit, PR**

```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm test
git add CLAUDE.md CONTRIBUTING.md docs/superpowers/specs/2026-09-14-game-design-and-use-cases.md
git commit -m "docs: describe the widget visual system, hooks and jsdom tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin feat/widget-reskin
gh pr create --base main --title "feat: pixel-art widget with Kenney tiles, modals, toasts and round overlay" --body "$(cat <<'EOF'
## Summary
- Kenney 9-slice primitives (Panel, Ribbon, Button, Input, Badge, Cell, Modal, Toast, Overlay), Press Start 2P, light/dark tile sets via CSS custom properties, everything inlined
- Join / Lobby / Game screens: online count, search on `name#tag`, invite confirm modal, received/sent invite cards with local countdown, score header, leave confirm, CSS confetti / 🦆 / Draw overlay keyed on round
- Toasts own their timers; leading poll; `not in a game` suppressed when `opponent-left` arrives in the same reply
- Vitest `app` project (jsdom + Testing Library), fixtures shared with the upcoming Storybook stories

Spec: `docs/superpowers/specs/2026-09-14-game-design-and-use-cases.md`
Plan: `docs/superpowers/plans/2026-09-14-widget-reskin.md`

## Verification
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` (server 53, app 38)
- Scratch preview of every screen in light and dark, desktop and 360px

## Test plan
- [ ] CI green
- [ ] Two chat-client tabs through a host: join → invite (modal) → accept → win (confetti) → rematch → leave (modal)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: CI green on the PR.
