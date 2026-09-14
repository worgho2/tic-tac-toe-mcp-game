# Storybook, CI and Accessibility Carry-overs (PR 3 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Storybook 10 with stories for every primitive and every screen state (both themes, narrow viewport), a CI job that builds it, the accessibility items deferred from PR 2 (modal focus trap, a contrast test over the theme tokens), README screenshots and docs, per the "Storybook", "Testing" and "Docs" sections of `docs/superpowers/specs/2026-09-14-game-design-and-use-cases.md`.

**Architecture:** Storybook 10 on `@storybook/react-vite` loads the repo's `vite.config.ts` and removes the single-file plugin in `viteFinal`; `.storybook/preview.tsx` imports the three stylesheets and adds a light/dark toolbar that sets `data-theme` on `<html>`, exactly like the host does. Stories are CSF3 files next to their components and reuse `src/app/fixtures/views.ts`. The contrast test is plain arithmetic over `tokens.css` against the sampled Kenney tile fills, so it runs in the existing jsdom project without a browser.

**Tech Stack:** Storybook 10.6 (`storybook`, `@storybook/react-vite`, `@storybook/addon-a11y`), Vite 8, Vitest 5, Testing Library, Biome, GitHub Actions.

## Global Constraints

- pnpm only; add dev dependencies with `pnpm add -D` at exact versions: `storybook@10.6.0`, `@storybook/react-vite@10.6.0`, `@storybook/addon-a11y@10.6.0`.
- The widget bundle (`pnpm build` → `dist/mcp-app.html`) must be unaffected: no new imports in `src/app/` outside `*.stories.tsx` and `*.test.ts(x)` files; `vite.config.ts` unchanged.
- Storybook must not use `vite-plugin-singlefile` (filter the plugin named `vite:singlefile` in `viteFinal`) nor `build.rollupOptions.input`.
- Stories import types from `@storybook/react-vite` (`Meta`, `StoryObj`, `Decorator`, `Preview`) and helpers from `storybook/test` (`fn`, `userEvent`, `within`, `expect`). No `@storybook/addon-docs`, no `autodocs` tags.
- Story coverage from the spec: every primitive (all variants and states); Join (empty, with error, 0 and many online); Lobby (empty, many players, with received and sent invites, confirm modal open, narrow viewport); Game (your turn, opponent's turn, win, loss, draw, mid-rematch); both themes via a global toolbar toggle that sets `data-theme`.
- Scripts: `storybook` (`storybook dev -p 6006`), `build-storybook` (`storybook build`). Output `storybook-static/` is git-ignored, excluded from Biome, from `tsconfig.server.json` (already excluded: it only includes `src/server`) and from the Docker image (`.dockerignore`).
- CI: a `storybook` job on pull requests running `pnpm build-storybook` with `STORYBOOK_DISABLE_TELEMETRY=1`.
- Accessibility: Modal keeps focus inside (Tab and Shift+Tab cycle), starts on Cancel, Escape cancels from anywhere inside; contrast test asserts WCAG AA (4.5:1 text, 3:1 marks, focus ring, badges, primary-button and ribbon text) for both themes against the sampled tile fills; the light `--accent`/`--cell-x` become `#bd3a32` (4.9:1 on the beige fill; the previous `#c73e36` measured 4.50 on the real fill `#fff1d2`).
- Biome: 2-space, 120 cols, single quotes, JSX double quotes. `.storybook/` is linted and typechecked (add it to `tsconfig.json` `include`).
- Conventional Commits; every commit message ends with the exact line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; lowercase the subject if commitlint rejects proper-noun casing.
- Branch `feat/storybook-and-a11y` off `main` (which contains PR 1 and PR 2); this plan file is its first commit. `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` and `pnpm build-storybook` must pass at the end of every task from Task 1 on.
- Code blocks start with a `// file: …` / `/* file: … */` / `# file: …` label line naming the file; that line is for the reader and is not written into the file.

---

## File map

| File | Responsibility |
|---|---|
| `.storybook/main.ts` (create) | Framework, story glob, a11y addon, `viteFinal` dropping the single-file plugin. |
| `.storybook/preview.tsx` (create) | Global styles, theme toolbar + decorator, `layout: 'padded'`. |
| `package.json` (modify) | Scripts and dev dependencies. |
| `tsconfig.json`, `.gitignore`, `biome.json`, `.dockerignore` (modify) | Include `.storybook`; ignore `storybook-static`. |
| `src/app/ui/*.stories.tsx` (create, 8 files) | Primitive stories. |
| `src/app/screens/*.stories.tsx` (create, 3 files) | Screen stories. |
| `src/app/ui/Modal.tsx` (modify), `src/app/ui/Modal.trap.test.tsx` (create) | Focus trap. |
| `src/app/styles/contrast.test.ts` (create), `src/app/styles/tokens.css` (modify) | Contrast assertion and the light accent fix. |
| `.github/workflows/ci.yml` (modify) | `storybook` job. |
| `docs/media/*.png` (create), `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, spec (modify) | Screenshots and docs. |

---

### Task 1: Storybook setup with one story

**Files:**
- Create: `.storybook/main.ts`, `.storybook/preview.tsx`, `src/app/ui/Button.stories.tsx`
- Modify: `package.json` (scripts, devDependencies via pnpm), `tsconfig.json` (`include`), `.gitignore`, `biome.json` (`files.includes`), `.dockerignore`

**Interfaces:**
- Produces: the story conventions every later task follows: `import type { Meta, StoryObj } from '@storybook/react-vite'`, `const meta = { title, component, args } satisfies Meta<typeof X>; export default meta; type Story = StoryObj<typeof meta>;`, titles `UI/<Name>` and `Screens/<Name>`; the global `theme` (`'light' | 'dark'`) and the built-in `viewport` global (`{ value: 'mobile1', isRotated: false }` for 320px).

- [ ] **Step 1: Branch and dependencies**

```bash
git checkout main && git pull --ff-only
git checkout feat/storybook-and-a11y 2>/dev/null || git checkout -b feat/storybook-and-a11y
pnpm add -D storybook@10.6.0 @storybook/react-vite@10.6.0 @storybook/addon-a11y@10.6.0
```

Expected: three exact-version devDependencies added; `pnpm-lock.yaml` updated (Storybook pulls a large tree; that is normal).

- [ ] **Step 2: Scripts and ignores**

In `package.json` `scripts`, add after `"test:watch"`:

```json
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build",
```

Append to `.gitignore` under `# Build output`:

```
storybook-static/
```

In `biome.json`, change `files.includes` to:

```json
    "includes": ["**", "!CHANGELOG.md", "!.release-please-manifest.json", "!pnpm-lock.yaml", "!dist", "!storybook-static"]
```

In `tsconfig.json`, change `include` to:

```json
  "include": ["src", ".storybook", "vite.config.ts", "vitest.config.ts"]
```

Append to `.dockerignore`:

```
.storybook
storybook-static
```

- [ ] **Step 3: Storybook config**

```ts
// file: .storybook/main.ts
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/app/**/*.stories.tsx'],
  addons: ['@storybook/addon-a11y'],
  // The builder loads the repo's vite.config.ts. The widget build inlines everything into one HTML file;
  // Storybook needs a normal multi-file build, so drop the single-file plugin and the fixed HTML entry.
  viteFinal: (config) => ({
    ...config,
    plugins: (config.plugins ?? []).filter(
      (plugin) => !(plugin && typeof plugin === 'object' && 'name' in plugin && plugin.name === 'vite:singlefile'),
    ),
    build: { ...config.build, rollupOptions: { ...config.build?.rollupOptions, input: undefined } },
  }),
};

export default config;
```

```tsx
// file: .storybook/preview.tsx
import type { Decorator, Preview } from '@storybook/react-vite';
import { useEffect } from 'react';
import '../src/app/styles/tokens.css';
import '../src/app/styles/base.css';
import '../src/app/styles/animations.css';

// Mirrors what hooks/useHostTheme.ts does with the host theme: tokens.css switches on <html data-theme>.
const withTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme as string;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return <Story />;
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Host theme',
      toolbar: { title: 'Theme', icon: 'mirror', items: ['light', 'dark'], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'light' },
  parameters: { layout: 'padded' },
};

export default preview;
```

- [ ] **Step 4: First story**

```tsx
// file: src/app/ui/Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Button } from './Button';

const meta = {
  title: 'UI/Button',
  component: Button,
  args: { children: 'Invite', onClick: fn() },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: 'secondary', children: 'Cancel' } };
export const Danger: Story = { args: { variant: 'danger', children: 'Deny' } };
export const Disabled: Story = { args: { disabled: true } };
export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Button>Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="danger">Danger</Button>
      <Button disabled>Disabled</Button>
    </div>
  ),
};
```

- [ ] **Step 5: Verify**

```bash
pnpm lint:fix && pnpm lint
pnpm typecheck
STORYBOOK_DISABLE_TELEMETRY=1 pnpm build-storybook
ls storybook-static/index.html storybook-static/iframe.html
git status --short | grep storybook-static || echo "storybook-static ignored"
pnpm build && pnpm test
```

Expected: all clean; the Storybook build ends with `Storybook build completed successfully`; `storybook-static` is not in `git status`; the widget build and the 95 tests are unaffected. Then run `pnpm storybook` once, open http://localhost:6006, confirm the `UI/Button` stories render with pixel borders and the toolbar "Theme" switch flips to dark; stop it.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json .gitignore biome.json .dockerignore .storybook src/app/ui/Button.stories.tsx
git commit -m "build(storybook): storybook 10 on react-vite with theme toolbar

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Primitive stories

**Files:**
- Create: `src/app/ui/Panel.stories.tsx`, `Ribbon.stories.tsx`, `Input.stories.tsx`, `Badge.stories.tsx`, `Cell.stories.tsx`, `Modal.stories.tsx`, `Toast.stories.tsx`, `Overlay.stories.tsx`

**Interfaces:**
- Consumes: the conventions from Task 1; the primitives' props (`Cell({ index, mark, disabled, onClick })`, `Modal({ title, children?, confirmLabel, cancelLabel?, danger?, onConfirm, onCancel })`, `ToastStack({ toasts, onDismiss })`, `Overlay({ outcome })`, `Badge({ status })`).

- [ ] **Step 1: Write the eight story files**

```tsx
// file: src/app/ui/Panel.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Panel } from './Panel';
import { Ribbon } from './Ribbon';

const meta = {
  title: 'UI/Panel',
  component: Panel,
} satisfies Meta<typeof Panel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {
  args: { children: <p>A 9-slice Kenney panel with 16px borders.</p> },
};
export const WithRibbon: Story = {
  render: () => (
    <Panel style={{ marginTop: 44 }}>
      <Ribbon>Tic-Tac-Toe</Ribbon>
      <p className="muted">The ribbon overlaps the panel top, like Kenney's sample.</p>
    </Panel>
  ),
};
export const Card: Story = {
  render: () => (
    <ul className="cards">
      <li className="card">
        <span className="card__handle">bob#0042</span>
        <span className="card__actions">card surface (8px borders)</span>
      </li>
    </ul>
  ),
};
```

```tsx
// file: src/app/ui/Ribbon.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Ribbon } from './Ribbon';

const meta = {
  title: 'UI/Ribbon',
  component: Ribbon,
  args: { children: 'Players' },
  decorators: [
    (Story) => (
      <div style={{ paddingTop: 44 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Ribbon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Short: Story = {};
export const Long: Story = { args: { children: 'You win! Next round starts in a moment' } };
```

```tsx
// file: src/app/ui/Input.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './Input';

const meta = {
  title: 'UI/Input',
  component: Input,
  args: { placeholder: 'Your name', 'aria-label': 'Your name', maxLength: 24 },
} satisfies Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Filled: Story = { args: { defaultValue: 'worgho2' } };
export const Disabled: Story = { args: { defaultValue: 'worgho2', disabled: true } };
```

```tsx
// file: src/app/ui/Badge.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './Badge';

const meta = {
  title: 'UI/Badge',
  component: Badge,
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = { args: { status: 'idle' } };
export const Busy: Story = { args: { status: 'busy' } };
```

```tsx
// file: src/app/ui/Cell.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Cell } from './Cell';

const meta = {
  title: 'UI/Cell',
  component: Cell,
  args: { index: 4, mark: null, disabled: false, onClick: fn() },
} satisfies Meta<typeof Cell>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const X: Story = { args: { mark: 'X', disabled: true } };
export const O: Story = { args: { mark: 'O', disabled: true } };
export const Board: Story = {
  render: () => (
    <div className="board">
      {(['X', 'O', 'X', null, 'O', null, null, null, 'X'] as const).map((mark, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed 3x3 grid
        <Cell key={index} index={index} mark={mark} disabled={mark !== null} onClick={fn()} />
      ))}
    </div>
  ),
};
```

```tsx
// file: src/app/ui/Modal.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Modal } from './Modal';

const meta = {
  title: 'UI/Modal',
  component: Modal,
  args: { onConfirm: fn(), onCancel: fn() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Modal>;
export default meta;
type Story = StoryObj<typeof meta>;

export const InviteConfirm: Story = {
  args: { title: 'Invite bob#0042 to a match?', confirmLabel: 'Invite' },
};
export const LeaveConfirm: Story = {
  args: {
    title: 'Leave the match?',
    confirmLabel: 'Leave',
    danger: true,
    children: <p>Your opponent will return to the lobby too.</p>,
  },
};
```

```tsx
// file: src/app/ui/Toast.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ToastStack } from './Toast';

const meta = {
  title: 'UI/Toast',
  component: ToastStack,
  args: { onDismiss: fn() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ToastStack>;
export default meta;
type Story = StoryObj<typeof meta>;

export const One: Story = { args: { toasts: [{ id: 1, text: 'bob#0042 declined your invite.' }] } };
export const Several: Story = {
  args: {
    toasts: [
      { id: 1, text: 'bob#0042 declined your invite.' },
      { id: 2, text: 'Your invite to alice#0099 expired.' },
      { id: 3, text: 'Your opponent left the match.' },
    ],
  },
};
```

```tsx
// file: src/app/ui/Overlay.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Overlay } from './Overlay';

const meta = {
  title: 'UI/Overlay',
  component: Overlay,
  // The overlay is absolutely positioned; give it a board-sized stage to sit on.
  decorators: [
    (Story) => (
      <div className="board-wrap" style={{ width: 224, height: 224, background: 'rgba(0,0,0,0.1)' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Overlay>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Win: Story = { args: { outcome: 'win' } };
export const Loss: Story = { args: { outcome: 'loss' } };
export const Draw: Story = { args: { outcome: 'draw' } };
```

- [ ] **Step 2: Verify and commit**

```bash
pnpm lint:fix && pnpm lint && pnpm typecheck
STORYBOOK_DISABLE_TELEMETRY=1 pnpm build-storybook
```

Expected: clean; the build lists no errors. Open `pnpm storybook` and click through `UI/*`: every story renders; the Overlay `Win` story shows confetti falling, `Loss` shows the bobbing duck; the Modal stories cover the viewport with the backdrop.

```bash
git add src/app/ui/*.stories.tsx
git commit -m "docs(storybook): stories for every ui primitive

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Screen stories

**Files:**
- Create: `src/app/screens/JoinScreen.stories.tsx`, `LobbyScreen.stories.tsx`, `GameScreen.stories.tsx`

**Interfaces:**
- Consumes: fixtures from `src/app/fixtures/views.ts` (`you`, `players`, `received`, `sent`, `emptyInvites`, `gameYourTurn`, `gameOpponentTurn`, `gameWon`, `gameLost`, `gameDraw`); screen props from PR 2.

- [ ] **Step 1: Write the three story files**

```tsx
// file: src/app/screens/JoinScreen.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { JoinScreen } from './JoinScreen';

const meta = {
  title: 'Screens/Join',
  component: JoinScreen,
  args: { onlineCount: 3, error: null, onSubmit: fn() },
} satisfies Meta<typeof JoinScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const NobodyOnline: Story = { args: { onlineCount: 0 } };
export const OnePlayerOnline: Story = { args: { onlineCount: 1 } };
export const ManyOnline: Story = { args: { onlineCount: 128 } };
export const WithError: Story = { args: { error: 'name required' } };
```

```tsx
// file: src/app/screens/LobbyScreen.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { emptyInvites, players, received, sent, you } from '../fixtures/views';
import type { PublicPlayer } from '../lib/tools';
import { LobbyScreen } from './LobbyScreen';

const manyPlayers: PublicPlayer[] = Array.from({ length: 14 }, (_, i) => ({
  id: `m${i}`,
  name: ['bob', 'alice', 'carol', 'dave', 'erin', 'frank', 'grace'][i % 7],
  tag: String(1000 + i * 37).slice(-4),
  status: i % 3 === 0 ? 'busy' : 'idle',
}));

const meta = {
  title: 'Screens/Lobby',
  component: LobbyScreen,
  args: {
    you,
    onlineCount: 4,
    players,
    invites: { sent, received },
    onInvite: fn(),
    onAccept: fn(),
    onDecline: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof LobbyScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithInvites: Story = {};
export const Empty: Story = { args: { players: [], invites: emptyInvites, onlineCount: 1 } };
export const ManyPlayers: Story = { args: { players: manyPlayers, invites: emptyInvites, onlineCount: 15 } };
export const ConfirmModalOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Invite bob#0042' }));
    await expect(canvas.getByRole('dialog')).toBeInTheDocument();
  },
};
export const Narrow: Story = { globals: { viewport: { value: 'mobile1', isRotated: false } } };
export const NarrowDark: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false }, theme: 'dark' },
};
```

```tsx
// file: src/app/screens/GameScreen.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { gameDraw, gameLost, gameOpponentTurn, gameWon, gameYourTurn, you } from '../fixtures/views';
import { GameScreen } from './GameScreen';

const meta = {
  title: 'Screens/Game',
  component: GameScreen,
  args: { you, game: gameYourTurn, onMove: fn(), onLeave: fn() },
} satisfies Meta<typeof GameScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const YourTurn: Story = {};
export const OpponentsTurn: Story = { args: { game: gameOpponentTurn } };
export const Win: Story = { args: { game: gameWon } };
export const Loss: Story = { args: { game: gameLost } };
export const Draw: Story = { args: { game: gameDraw } };
export const MidRematch: Story = {
  // Round 2 just started after a 1-1 split: marks swapped, empty board, opponent (now X) to move.
  args: {
    game: { ...gameOpponentTurn, round: 2, board: gameYourTurn.board, yourScore: 1, opponentScore: 1 },
  },
};
export const Dark: Story = { args: { game: gameWon }, globals: { theme: 'dark' } };
```

- [ ] **Step 2: Verify and commit**

```bash
pnpm lint:fix && pnpm lint && pnpm typecheck
STORYBOOK_DISABLE_TELEMETRY=1 pnpm build-storybook
```

Expected: clean. Open `pnpm storybook`: `Screens/Lobby/Confirm Modal Open` shows the dialog after its play function runs (the Interactions panel shows the click and the assertion green); `Narrow` renders in the 320px "Small mobile" viewport with the two lobby panels stacked; `Screens/Game/Win` shows confetti.

```bash
git add src/app/screens/*.stories.tsx
git commit -m "docs(storybook): stories for the join, lobby and game screens

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Modal focus trap and theme contrast test

**Files:**
- Modify: `src/app/ui/Modal.tsx`
- Create: `src/app/ui/Modal.trap.test.tsx`, `src/app/styles/contrast.test.ts`
- Modify: `src/app/styles/tokens.css` (light `--accent` and `--cell-x`)

**Interfaces:**
- Consumes: `Modal` and `Button` (with its `ref` prop) from PR 2; `tokens.css` structure (`:root { … }` then `:root[data-theme='dark'] { … }`, one `--name: #rrggbb;` per line).
- Produces: `Modal` keyboard contract: focus starts on Cancel, Tab/Shift+Tab cycle inside the dialog, Escape calls `onCancel`; a contrast test that fails whenever a token drops below WCAG AA against its tile.

- [ ] **Step 1: Failing tests**

```tsx
// file: src/app/ui/Modal.trap.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal focus trap', () => {
  it('cycles Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">outside</button>
        <Modal title="Leave the match?" confirmLabel="Leave" danger onConfirm={vi.fn()} onCancel={vi.fn()} />
      </>,
    );
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const leave = screen.getByRole('button', { name: 'Leave' });
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(leave).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(leave).toHaveFocus();
  });

  it('Escape cancels from anywhere inside the dialog', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Modal title="Invite bob#0042 to a match?" confirmLabel="Invite" onConfirm={vi.fn()} onCancel={onCancel} />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Invite' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
```

```ts
// file: src/app/styles/contrast.test.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Fill colour at pixel (16,16) of each Kenney tile used as a text background (sampled once with Pillow:
// Image.open(tile).getpixel((16, 16))). Update this table if a tile role changes in tokens.css.
const FILLS = {
  panelLight: '#fff1d2', // tile_0000, also cards (0013)
  panelDark: '#647685', // tile_0003, also dark cards (0016) and the transparent dark secondary button (0008)
  greyBlue: '#94afc6', // tile_0002 (inputs, toasts, light secondary / dark primary buttons), badges (0033/0034), danger (0069)
  brown: '#a3703a', // tile_0001 (light primary button)
  ribbon: '#e2665b', // tile_0044
};
const DARK_ERROR_BACKDROP_ALPHA = 0.45; // rgba(0,0,0,0.45) behind dark-theme error text (base.css)

function tokens(css: string, block: 'light' | 'dark'): Record<string, string> {
  const start = block === 'light' ? css.indexOf(':root {') : css.indexOf(":root[data-theme='dark'] {");
  const end = css.indexOf('}', start);
  const out: Record<string, string> = {};
  for (const [, name, value] of css.slice(start, end).matchAll(/--([a-z-]+): (#[0-9a-f]{6});/g)) out[name] = value;
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function darken(hex: string, alpha: number): string {
  const c = [1, 3, 5].map((i) => Math.round(Number.parseInt(hex.slice(i, i + 2), 16) * (1 - alpha)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// The app Vitest project sets css: false, so read the stylesheet from disk (cwd is the repo root under Vitest).
const css = readFileSync(resolve(process.cwd(), 'src/app/styles/tokens.css'), 'utf-8');
const light = tokens(css, 'light');
const dark = { ...light, ...tokens(css, 'dark') };

// WCAG 2.1 AA: 4.5:1 for text, 3:1 for large text, UI components and focus indicators.
describe('theme contrast (tokens.css against the Kenney tile fills)', () => {
  it.each([
    ['fg', light.fg, FILLS.panelLight, 4.5],
    ['muted', light.muted, FILLS.panelLight, 4.5],
    ['accent (error text)', light.accent, FILLS.panelLight, 4.5],
    ['focus ring', light.focus, FILLS.panelLight, 3],
    ['cell X mark', light['cell-x'], FILLS.panelLight, 3],
    ['cell O mark', light['cell-o'], FILLS.panelLight, 3],
    ['input text', light['input-fg'], FILLS.greyBlue, 4.5],
    ['toast text', light['toast-fg'], FILLS.greyBlue, 4.5],
    ['badge text', light['badge-fg'], FILLS.greyBlue, 3],
    ['secondary button text', light['btn-secondary-fg'], FILLS.greyBlue, 4.5],
    ['primary button text', light['btn-primary-fg'], FILLS.brown, 3],
    ['ribbon text', light['ribbon-fg'], FILLS.ribbon, 3],
  ])('light: %s', (_name, color, fill, min) => {
    expect(contrast(color, fill)).toBeGreaterThanOrEqual(min);
  });

  it.each([
    ['fg', dark.fg, FILLS.panelDark, 4.5],
    ['muted', dark.muted, FILLS.panelDark, 4.5],
    ['accent (error text on its backdrop)', dark.accent, darken(FILLS.panelDark, DARK_ERROR_BACKDROP_ALPHA), 4.5],
    ['focus ring', dark.focus, FILLS.panelDark, 3],
    ['cell X mark', dark['cell-x'], FILLS.panelDark, 3],
    ['cell O mark', dark['cell-o'], FILLS.panelDark, 3],
    ['toast text', dark['toast-fg'], FILLS.panelDark, 4.5],
    ['secondary button text', dark['btn-secondary-fg'], FILLS.panelDark, 4.5],
    ['primary button text', dark['btn-primary-fg'], FILLS.greyBlue, 4.5],
  ])('dark: %s', (_name, color, fill, min) => {
    expect(contrast(color, fill)).toBeGreaterThanOrEqual(min);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project app src/app/ui/Modal.trap.test.tsx src/app/styles`
Expected: FAIL. The trap test fails at the second `expect(cancel).toHaveFocus()` (focus is no longer inside the dialog); in the contrast test exactly one row fails: `light: accent (error text)` with `expected 4.50… to be greater than or equal to 4.5` (the current `#c73e36` measures 4.50 on the real fill). Primary-button and ribbon text pass at the 3:1 bar (decorative pixel-art elements; documented in the spec).

- [ ] **Step 3: Implement**

Replace `src/app/ui/Modal.tsx`:

```tsx
// file: src/app/ui/Modal.tsx
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from 'react';
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

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * In-widget confirmation. Hosts may swallow native dialogs, so this never uses window.confirm.
 * Focus starts on Cancel, Tab cycles inside the dialog, Escape cancels.
 */
export function Modal({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        className="panel modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="modal__title">
          {title}
        </h2>
        {children}
        <div className="modal__actions">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
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

In `src/app/styles/tokens.css`, in the `:root {` block only, change `--accent: #c73e36;` to `--accent: #bd3a32;` and `--cell-x: #c73e36;` to `--cell-x: #bd3a32;` (4.9:1 on the beige fill). The dark block is untouched.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run --project app`
Expected: PASS, 65 tests (42 from PR 2 + 2 trap + 21 contrast rows), no warnings. The existing `primitives.test.tsx` "Escape cancels" test still passes because focus starts inside the dialog.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
pnpm lint:fix && pnpm lint && pnpm typecheck && pnpm build
git add src/app/ui/Modal.tsx src/app/ui/Modal.trap.test.tsx src/app/styles/contrast.test.ts src/app/styles/tokens.css
git commit -m "fix(app): modal focus trap and a WCAG contrast test over the theme tokens

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: CI job for the Storybook build

**Files:**
- Modify: `.github/workflows/ci.yml` (add a job after `quality`)

- [ ] **Step 1: Add the job**

Insert between the `quality` job and the `docker` job:

```yaml
# file: .github/workflows/ci.yml (new job)
  storybook:
    name: CI Storybook Build Gate
    runs-on: ubuntu-latest
    env:
      STORYBOOK_DISABLE_TELEMETRY: '1'
    steps:
      - name: Checkout
        uses: actions/checkout@v7
        with:
          fetch-depth: 1

      - name: Setup pnpm
        uses: pnpm/action-setup@v6
        with:
          run_install: false

      - name: Setup Node
        uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build Storybook
        run: pnpm build-storybook

```

Keep the exact indentation of the existing jobs (two spaces under `jobs:`); change nothing else in the file.

- [ ] **Step 2: Verify locally and commit**

```bash
node -e "const y=require('node:fs').readFileSync('.github/workflows/ci.yml','utf8'); for (const j of ['quality:','storybook:','docker:']) if(!y.includes(j)) throw new Error('missing '+j); console.log('jobs present')"
pnpm lint
git add .github/workflows/ci.yml
git commit -m "ci: build storybook on pull requests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Expected: `jobs present`; CI on the PR later shows three jobs green (`CI Code Quality Gate`, `CI Storybook Build Gate`, `CI Docker Build Gate`).

---

### Task 6: README screenshots and docs

**Files:**
- Create: `docs/media/join.png`, `docs/media/lobby.png`, `docs/media/game.png` (captured by the controller from Storybook, light theme, about 720px wide)
- Modify: `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/superpowers/specs/2026-09-14-game-design-and-use-cases.md`

**Interfaces:**
- Consumes: the three PNGs; the executor of this task does not capture them (a browser is needed). If they are missing, report NEEDS_CONTEXT.

- [ ] **Step 1 (controller): capture the screenshots**

Run `pnpm storybook` and open the chrome-free story iframes `http://localhost:6006/iframe.html?id=screens-join--empty&viewMode=story`, `…?id=screens-lobby--with-invites&viewMode=story` and `…?id=screens-game--win&viewMode=story` in the light theme at about 720px wide; save each as a real PNG (convert or crop with Pillow if the capture tool produces JPEG) as `docs/media/join.png`, `docs/media/lobby.png`, `docs/media/game.png` (PNG, under 300 KB each). Confirm with `ls -la docs/media`.

- [ ] **Step 2: README**

Replace the line `<!-- TODO: demo GIF at docs/media/demo.gif once the game design round is done -->` with:

```markdown
<p align="center">
  <img src="docs/media/join.png" alt="Join screen: name input and Join Game button on a pixel-art panel" width="30%" />
  <img src="docs/media/lobby.png" alt="Lobby: online players with Invite buttons, received and sent invites with countdowns" width="30%" />
  <img src="docs/media/game.png" alt="Game: score header, 3x3 board, confetti and a You win ribbon" width="30%" />
</p>
```

In the "Play now" section, step 4 currently says "One of you hits *Invite*, the other *Accept*." Append to that step: `Names can repeat: everyone gets a `#1234` tag, so look for the full handle. Invites expire after a minute.` And replace step 5 with: `**5. Rematch.** When a round ends the next one starts by itself after a moment, with X and O swapped and the score kept. *Back to lobby* ends the match for both of you.`

- [ ] **Step 3: CLAUDE.md, CONTRIBUTING.md, spec**

`CLAUDE.md`:
- In the "Commands" table add a row: `| `pnpm storybook` / `pnpm build-storybook` | Storybook 10 (`@storybook/react-vite`) on port 6006; static build to `storybook-static/` (git-ignored) |`.
- In "Docs: what to trust", replace `"Widget" and "Visual system" sections match the code; its "Storybook" section describes PR 3, which has not landed yet)` with `"Widget", "Visual system" and "Storybook" sections all match the code)` and replace `are the plans for the server and widget halves of the latter` with `and `docs/superpowers/plans/2026-09-14-storybook-and-a11y.md` are the plans that implemented the latter`.
- In the "### Widget" section, replace `the same fixtures will feed the Storybook stories in PR 3` with `the same fixtures feed the `*.stories.tsx` files next to each component`. Add at the end of that section: `Storybook lives in `.storybook/` (`main.ts` drops `vite-plugin-singlefile` in `viteFinal`; `preview.tsx` imports the stylesheets and adds the light/dark toolbar). Stories are CSF3 with `Meta`/`StoryObj` from `@storybook/react-vite` and `fn`/`userEvent` from `storybook/test`. `src/app/styles/contrast.test.ts` fails the build if a token drops below WCAG AA against its tile fill (fills sampled from the PNGs and listed in the test).`

`CONTRIBUTING.md`: add a section `## Storybook` after "## Widget tests":

```markdown
## Storybook

`pnpm storybook` serves every primitive and screen state at http://localhost:6006 (light/dark toolbar, 320px "Small mobile" viewport on the narrow stories, a11y panel from `@storybook/addon-a11y`). `pnpm build-storybook` writes `storybook-static/`, which CI builds on every pull request. Stories live next to their components as `*.stories.tsx` and reuse `src/app/fixtures/views.ts`; add a story whenever you add a state a reviewer should be able to see without an MCP host.
```

Spec `docs/superpowers/specs/2026-09-14-game-design-and-use-cases.md`: in the "## Storybook" section change only two things: the bullet starting `Output `storybook-static/`` becomes `- Output `storybook-static/` git-ignored, excluded from Biome and the Docker image (`tsconfig.server.json` only includes `src/server`).`, and in the stories bullet replace `400px viewport` with `320px "Small mobile" viewport`. In "## Testing" append a bullet: `- `src/app/styles/contrast.test.ts`: WCAG AA contrast of every text/mark token against the sampled Kenney tile fills, both themes.`

- [ ] **Step 4: Verify, commit, PR**

```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm test && STORYBOOK_DISABLE_TELEMETRY=1 pnpm build-storybook
git add docs/media README.md CLAUDE.md CONTRIBUTING.md docs/superpowers/specs/2026-09-14-game-design-and-use-cases.md
git commit -m "docs: readme screenshots, storybook and contrast test documentation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

The controller pushes and opens the PR after the whole-branch review.

---

### Task 7 (controller): smoke test inside the real ext-apps basic-host

Not a code task; run before opening the PR, after Task 6.

```bash
pnpm build && PORT=8765 pnpm start &
git clone --depth 1 https://github.com/modelcontextprotocol/ext-apps /tmp/ext-apps
cd /tmp/ext-apps && npm install
cd examples/basic-host && npm run dev
```

Open the basic-host URL it prints, add the server `http://localhost:8765/mcp`, call `join_game` in two browser tabs, and check inside the host's iframe: the widget height follows the content (`autoResize`), toasts sit at the top-right of the iframe and modals cover it, the ribbons are not clipped at the top of the iframe, the theme follows the host, and a full invite → accept → win → rematch → leave flow works. Record findings in the PR description; anything broken becomes a fix commit on this branch.
