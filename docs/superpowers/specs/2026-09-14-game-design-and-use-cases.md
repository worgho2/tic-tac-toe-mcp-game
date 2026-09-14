# Game design and use cases

Date: 2026-09-14
Status: approved design, supersedes the game-behaviour parts of the two `2026-06-18` specs.

## Goal

Define the player-facing behaviour of the tic-tac-toe MCP App (Join, Lobby, Game), the server model that backs it, the pixel-art visual system built from the Kenney "UI Pack - Pixel Adventure" (CC0), and a Storybook setup so every screen state can be inspected without an MCP host.

Infrastructure decisions (React 19, ext-apps 2.0, single-file Vite bundle, stateless HTTP, single replica, no auth, no persistence) come from `2026-09-14-portfolio-restructure-design.md` and are unchanged.

## Decisions

| Topic | Decision |
|---|---|
| Player identity | `name#1234`: a trimmed name (max 24 chars) plus a random 4-digit tag assigned on `set_name`, retried on collision. Names may repeat; handles are unique among registered players. |
| Invites | Any number of sent and received invites per player, one pending invite per (from, to) pair. Expire after 60 s. Sender can cancel. When a match starts, every other pending invite of either player is removed and the counter-party is notified. |
| Accept while sender busy | Cannot happen through the API: when the sender enters a match the invite is auto-cancelled and the target receives an `invite-cancelled` event with reason `in-match`, shown as "`<handle>` is in another match". A stale Accept on a card the widget has not refreshed yet returns "invite not found". `acceptInvite` keeps a defensive guard with the same copy. |
| Rematch | A finished round stays visible for 3 s, then the next round starts automatically. X and O alternate every round. Winner's score +1; draws change nothing. |
| Match end | Only when a player leaves (button) or is swept by presence. The other player returns to the lobby with an "opponent left" event. |
| Loss / win feedback | CSS-only confetti on a win, a bobbing 🦆 emoji on a loss, a plain "Draw" ribbon on a draw. No extra sprite assets. |
| UI stack | React 19 + plain CSS. Primitives skinned with `border-image` 9-slice cuts of Kenney 32px tiles, `image-rendering: pixelated`. Font: Press Start 2P (OFL). All assets inlined into the single-file bundle. |
| Inspection tool | Storybook 10 (`@storybook/react-vite`, supports Vite 8). Stories for every primitive and every screen state. |
| Presence | Unchanged: 10 s TTL, 1.5 s poll. A backgrounded browser tab may throttle timers and get the player swept mid-match; documented limitation. |
| Native dialogs | Never `window.confirm`/`alert`. Confirmations are in-widget modals. |

## Use cases

Actors: **Player** (a human using the widget inside an AI chat client), **Host** (the chat client), **Server**.

### UC1 Join

1. The model calls `join_game`; the Host renders the widget. The Server has created a connected but unregistered player.
2. The Join page shows the number of registered players online (live), a name input and a "Join Game" button.
3. The Player submits a non-empty name. The Server assigns a tag and moves the Player to the lobby.
4. Errors (empty name, unknown player) render inside the Join panel.

### UC2 Browse and search the lobby

1. The Lobby lists every other registered player with handle and idle/busy badge.
2. A search input filters the list by substring of the full handle (`name#tag`), case-insensitive, client-side.
3. Busy players and players with a pending invite from me show a disabled "Invite" button, and clicking their card does nothing.

### UC3 Send an invite

1. The Player clicks an idle player's card or its "Invite" button.
2. A modal asks "Invite `<handle>` to a match?" with Confirm and Cancel.
3. On Confirm the Server creates an invite (60 s TTL). It appears under "Sent" with a countdown and a Cancel button. The countdown runs locally from `expiresIn` and resyncs on every poll, so client and server clock skew does not matter.
4. Errors: target busy, target gone, duplicate pending invite. Shown as an error toast.

### UC4 Receive and answer an invite

1. A received invite appears under "Received" with the sender's handle, a countdown, Accept and Deny.
2. Accept: if the sender is still idle, a match starts and both players move to the Game page. If the sender entered another match meanwhile, the invite has already been auto-cancelled: the Player sees the "`<handle>` is in another match" toast from the `in-match` event, and a stale Accept returns the error "invite not found".
3. Deny: the invite is removed; the sender receives an `invite-declined` event.
4. Expiry: after 60 s the invite disappears from both sides; the sender receives an `invite-expired` event.
5. Cancel by sender: the invite disappears; the receiver receives an `invite-cancelled` event.
6. When either party enters a different match, the invite disappears and the other party receives an `invite-cancelled` event with reason `in-match`.

### UC5 Play a match

1. The Game page shows the header `[score] you  x  opponent [score]`, whose turn it is, the board, and a "Back to lobby" button.
2. On my turn I click an empty cell; the Server applies the move. Cells are disabled otherwise.
3. When the round ends, the board stays for 3 s with an overlay: confetti (win), duck (loss) or "Draw". Score updates immediately.
4. After 3 s the Server starts the next round with marks swapped and an empty board. The overlay clears.
5. "Back to lobby" opens a modal ("Leave the match? Your opponent will return to the lobby too."). Confirm ends the match for both. The opponent gets an `opponent-left` event and is returned to the lobby.

### UC6 Presence loss

1. If a player stops polling for 10 s they are removed, their invites deleted, and any match they were in ends with an `opponent-left` event for the other side.

## Server model

### Types

```ts
export const PRESENCE_TTL_MS = 10_000;
export const INVITE_TTL_MS = 60_000;
export const REMATCH_DELAY_MS = 3_000;

export interface PublicPlayer { id: PlayerId; name: string; tag: string; status: 'idle' | 'busy' }

export interface InviteView { inviteId: string; name: string; tag: string; expiresIn: number } // ms left, computed at view time

export interface GameView {
  round: number;            // 1-based, increments on every automatic rematch
  board: Board;
  yourMark: Mark;
  yourTurn: boolean;
  opponentName: string;
  opponentTag: string;
  yourScore: number;
  opponentScore: number;
  over: boolean;            // true during the 3 s pause
  result: GameResult | null;
}

export type LobbyEvent =
  | { type: 'opponent-left' }
  | { type: 'invite-declined'; name: string; tag: string }
  | { type: 'invite-expired'; name: string; tag: string }
  | { type: 'invite-cancelled'; name: string; tag: string; reason: 'by-sender' | 'in-match' };

export interface PlayerView {
  phase: 'name' | 'lobby' | 'game';
  you: { id: PlayerId; name: string | null; tag: string | null };
  onlineCount: number;      // registered players, including you
  players: PublicPlayer[];
  invites: { sent: InviteView[]; received: InviteView[] };
  game: GameView | null;
  events: LobbyEvent[];     // drained on every view
  error: string | null;
}
```

Internal: `Invite` gains `createdAt`; `Game` becomes `Match` with `round`, `score: Record<PlayerId, number>`, `endedAt: number | null`. `PlayerState.notice` becomes `events: LobbyEvent[]`.

### Lobby behaviour

- Constructor gains an injectable `genTag: () => string` (default: 4 random digits) alongside `genId` and `clock`.
- `register(id, name)`: assigns a tag, retrying while another registered player has the same `name#tag`.
- `invite(from, to)`: rejects self, unregistered, busy, duplicate pending pair. Stores `createdAt`. Mutual invites (A→B and B→A both pending) are allowed; accepting either starts the match and the auto-cancel step removes the other.
- `cancelInvite(by, inviteId)`: only the sender; pushes `invite-cancelled/by-sender` to the receiver.
- `acceptInvite(by, inviteId)`: deletes the invite; returns "invite not found" if it is unknown or not addressed to `by`; keeps a defensive "`<handle>` is in another match" guard for a busy sender (unreachable through the public API because of auto-cancel); otherwise creates the match, then removes all other invites of both players, pushing `invite-cancelled/in-match` to each counter-party.
- `sweep()`: presence removal as today, plus invite expiry (push `invite-expired` to the sender), plus rematch: every match with `endedAt !== null` and `clock() - endedAt >= REMATCH_DELAY_MS` gets `round + 1`, swapped marks, empty board, `turn = 'X'`, `over = false`, `endedAt = null`. `viewFor` stays a pure snapshot (apart from draining `events`); instead every handler calls `sweep()` after `touch()` and before its mutation, so time-based transitions advance on any tool call.
- `makeMove`: on a terminal result sets `over`, `result`, `endedAt`, and increments the winner's score.
- `leave(id)`: ends the match for both regardless of `over`; the opponent gets `opponent-left` and `gameId = null`.
- `viewFor(id)`: fills `onlineCount`, `invites` (both directions, with `expiresIn`), `events` (drained), `game`.

### Tools

`join_game` unchanged (model-visible, links the `ui://` resource). App-only tools, all following the handler shape `touch → sweep → mutate → viewFor + error`:

| Tool | Args | Mutation |
|---|---|---|
| `set_name` | `{ playerId, name }` | `register` |
| `get_state` | `{ playerId }` | none |
| `invite` | `{ playerId, targetId }` | `invite` |
| `accept_invite` | `{ playerId, inviteId }` | `acceptInvite` |
| `decline_invite` | `{ playerId, inviteId }` | `declineInvite` |
| `cancel_invite` | `{ playerId, inviteId }` | `cancelInvite` (new) |
| `make_move` | `{ playerId, cell }` | `makeMove` |
| `leave` | `{ playerId }` | `leave` |

## Widget

### Structure

```
src/app/
  App.tsx                 useApp, polling, tool calls, theme; renders one screen + toasts
  screens/
    JoinScreen.tsx        { onlineCount, error, onSubmit }
    LobbyScreen.tsx       { you, players, invites, onInvite, onAccept, onDecline, onCancel }
    GameScreen.tsx        { you, game, onMove, onLeave }
  ui/                     Panel, Ribbon, Button, Input, Badge, Modal, Toast, Cell, Overlay
  assets/kenney/          only the tiles used + License.txt
  assets/fonts/           PressStart2P.woff2 + OFL.txt
  hooks/                  usePollView (kept), useHostTheme (kept), useCountdown, useToasts
  lib/tools.ts            adds 'cancel_invite'
  lib/outcome.ts          roundOutcome(game): 'win' | 'loss' | 'draw' | null
  styles/                 tokens.css (palette per theme), base.css, animations.css
```

Screens and primitives are pure: props in, callbacks out, no ext-apps imports. The host boundary is `App.tsx` (`useApp`), `lib/tools.ts` (`callTool` wraps `app.callServerTool`) and the hooks `usePollView` and `useHostTheme`.

### Screens

**Join.** Centered Panel with a Ribbon title, "N players online" (from `onlineCount`; Join polls `get_state` like every other phase), Input, "Join Game" Button. Server `error` rendered inside the panel.

**Lobby.** CSS grid, two columns at `min-width: 560px`, one column below (players first). Left column: search Input, then a scrollable list of player cards (handle, Badge idle/busy, "Invite" Button). Right column: "Received" list (handle, countdown, Accept, Deny) then "Sent" list (handle, countdown, Cancel). Empty states: "No one else is online yet", "No invites". Clicking a card or its button opens the invite confirm Modal.

**Game.** Header `[yourScore] you#tag  x  opponent#tag [opponentScore]`, turn line ("Your turn" / "Opponent's turn" / result), 3x3 grid of Cell buttons (X and O as font glyphs), "Back to lobby" Button behind a Modal. Overlay component keyed on `game.round`: rendered while `game.over` is true; when the round number changes the overlay resets. Win → confetti (about 40 absolutely positioned divs with CSS keyframes, random colours from the palette), loss → 🦆 with a bob keyframe, draw → "Draw" Ribbon. All animations disabled under `prefers-reduced-motion`.

**Toasts.** `App.tsx` appends every `events` entry to a toast list rendered top-right, auto-dismissed after 4 s, dismissible by click. `error` is shown as a toast too, except on the Join page where it is inline.

### Sizing and host

ext-apps' `useApp` enables `autoResize` by default, so the widget's content height reaches the host through `ui/notifications/size-changed` without any code in the widget. Content max width 720px, works down to 320px.

## Visual system

- Tiles come from `Tiles/Large tiles/Thick outline` (32x32). Each primitive uses `border-image-slice: 8 fill` plus `border-image-width` 16px (panels, cells) or 8px (buttons, inputs, badges, toasts) and `border-image-repeat: round` so panels scale without blur; `image-rendering: pixelated` on everything.
- Two palettes mapped to the host theme via the existing `data-theme`: light → beige panels, brown buttons, red ribbons; dark → grey/blue panels, blue buttons, red ribbons.
- Button states: default tile, pressed tile (Kenney ships both), disabled at 50% opacity.
- Font: Press Start 2P at 8px badges, 10px body, 11–12px headings and ribbons, 16px scores; line-height 1.6 for readability.
- Vite: `vite-plugin-singlefile` already forces `assetsInlineLimit` to always inline, so imported PNGs and the woff2 become data URIs with no config change. No external URLs in the bundle, so no `_meta.ui.csp` changes.
- Credits: Kenney (CC0) and the font (OFL) in `CONTRIBUTING.md` and in the asset folders' license files.

## Storybook

- Storybook 10, `@storybook/react-vite`, `.storybook/main.ts` with `stories: ['../src/app/**/*.stories.tsx']`. The builder loads the root `vite.config.ts` by default, so `viteFinal` removes the `vite-plugin-singlefile` plugin by name and drops `build.rollupOptions.input`; `@vitejs/plugin-react` is kept.
- Stories: every primitive (all variants and states); Join (empty, with error, 0 and many online); Lobby (empty, many players, with received and sent invites, confirm modal open, 400px viewport); Game (your turn, opponent's turn, win, loss, draw, mid-rematch); both themes via a global toolbar toggle that sets `data-theme`.
- Scripts: `storybook` (`storybook dev -p 6006`), `build-storybook`. Output `storybook-static/` git-ignored, excluded from Biome, `tsconfig.server.json`, and the Docker image.
- CI: a `build-storybook` job on pull requests.

## Testing

- `lobby.test.ts`: tag assignment and collision retry; invite expiry via injected clock; per-pair uniqueness; cancel; stale accept after the sender entered another match returns "invite not found"; auto-cancel of other invites on match start with events; rematch after 3 s with swapped marks; score on win, unchanged on draw; leave ends match and emits `opponent-left`; events drained once.
- `handlers.test.ts`: `cancel_invite` handler; reply shape for the new `PlayerView`.
- `server.test.ts`: eight app-only tools with `visibility: ['app']`; `join_game` payload matches the new shape.
- Widget: Vitest gets a second project (`src/app/**/*.test.{ts,tsx}`, `jsdom`, Testing Library) for the search filter, countdown, overlay-per-round latch and screen rendering from fixture views. Fixtures are shared with the stories.
- Manual: two clients through the ext-apps `basic-host`, covering UC1–UC6.

## Docs

- This spec is the source of truth for game behaviour. The `2026-06-18` specs and plans stay for history only.
- `CLAUDE.md`: tool table (eight app-only tools), `PlayerView` shape (`invites`, `events`, `onlineCount`), Storybook commands, widget test glob, "Docs: what to trust".
- `CONTRIBUTING.md`: Storybook section, asset credits, how to add a tile.
- `README.md`: screenshots from Storybook (PR 3).

## Delivery

Three pull requests, each green on lint, typecheck, test, build:

1. Server model and tools (this spec's "Server model" section, tests, `CLAUDE.md` tool table). Because the root `tsconfig.json` typechecks both trees, this PR also includes the minimal widget adaptation to the new `PlayerView` (plain lists for `invites`, banners for `events`, a `cancel_invite` call) so typecheck and build stay green; the reskin waits for PR 2.
2. Widget: primitives, assets, screens, animations, widget tests.
3. Storybook, CI job, docs and screenshots.

## Out of scope

Persistence, horizontal scaling, auth, spectators, chat, AI opponent, sound, and any server-to-widget push.
