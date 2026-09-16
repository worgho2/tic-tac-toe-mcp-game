# Model opponent and session close

Date: 2026-09-16
Status: approved design. Extends `2026-09-14-game-design-and-use-cases.md`; everything not mentioned here is unchanged.

## Goal

Two additions to the tic-tac-toe MCP App:

1. **Play against the model.** A player can start a match against the assistant that hosts the widget, with no game engine on the server. The widget asks the model for a move by posting a message into the chat; the model answers by calling a tool. The server only arbitrates.
2. **Close the session.** A player can end their session from any screen. A closed player id is never re-created, so a stale widget left in an earlier chat message cannot come back as a second player when the same chat opens the game again.

## Decisions

| Topic | Decision |
|---|---|
| Who plays for the model | The host's own model, through a model-visible tool. No strategy, engine or LLM call inside the server. |
| Model player identity | A regular lobby player with `kind: 'model'`, handle `Model#AI`, bound to the human that started the match. Hidden from the public list, exempt from presence, deleted with the match. |
| Turn signalling | The widget posts one `ui/message` (`app.sendMessage`, role `user`) per model turn, containing the board and the instruction to call `model_move`. Chat noise is accepted; it is what makes the model's play observable. |
| Reasoning | Not requested. The message asks for the move only. |
| Model does not move | After 10 s without a board change the game screen shows an "Ask again" button that re-sends the same message. No automatic retry. A host that rejects the message (`isError`) shows the button immediately. |
| Host support | The "Play vs model" button is shown only when `app.getHostCapabilities()?.message` is set. |
| Close button | A small "X" fixed to the widget's top-right corner on every phase except `closed`, behind a confirm modal. |
| Closed screen | "Session closed" panel with the hint to ask the assistant to open the game again. Polling stops. No way back from that widget. |
| Teardown | Unchanged: `onteardown` only stops polling. Leaving and returning to the conversation keeps reconnecting as today. |
| Rounds against the model | Same rules as human matches: human is X in round 1, marks alternate, 3 s rematch, per-player score. |

## Use cases

Actors as in the 2026-09-14 spec, plus **Model** (the assistant running the Host).

### UC7 Play against the model

1. In the lobby the Player clicks "Play vs model". The Server creates a model player and a match; the Player is X, round 1, their turn.
2. The Player clicks a cell. The Server applies the move. The board shows "Waiting for the model…".
3. The widget posts a message into the chat as the user (see "Message format"). The Model calls `model_move` with the given `playerId` and a cell. The Server applies it; the widget's next poll shows the move and "Your turn".
4. If the Model picks a taken cell or plays out of turn, the tool reply carries the error and the current board; the Model retries. The widget is unaffected.
5. If the board has not changed 10 s after the message was sent, "Ask again" appears. Clicking it re-sends the same message and restarts the timer.
6. When a round ends the overlay and score behave as in UC5. After 3 s the next round starts with marks swapped. If the Model is X, the widget posts the message for the opening move as soon as it sees the new round.
7. "Back to lobby" ends the match. The model player is deleted; nothing is posted to the chat.

### UC8 Close the session

1. The Player clicks the "X" in the widget's corner. A modal asks "Close this session?" with the note that the widget will stop working and the assistant must open the game again to play. In a match the note adds that the opponent returns to the lobby.
2. On confirm the Server ends any match (opponent gets `opponent-left`), removes the player, records the id as closed, and replies with `phase: 'closed'`.
3. The widget shows the closed screen and stops polling.
4. If the Host later replays the original `join_game` result (page reload, returning to the chat), the widget first renders the replayed view, then its first `get_state` returns `closed` and the closed screen appears within one poll interval. The id is never re-created.

## Server model

### Types

```ts
export const CLOSED_TTL_MS = 24 * 60 * 60 * 1000;

export type Phase = 'name' | 'lobby' | 'game' | 'closed';
export type PlayerKind = 'human' | 'model';

export interface GameView {
  // ...existing fields
  opponentKind: PlayerKind;
  /** Id the widget hands to the model so it can call `model_move`; null in human matches. */
  modelPlayerId: PlayerId | null;
}
```

Internal `PlayerState` gains `kind: PlayerKind` and `ownerId: PlayerId | null` (the human that started the model match; `null` for humans). `Lobby` gains `closed: Map<PlayerId, number>` (id → closedAt).

### Lobby behaviour

- `startModelMatch(humanId)`: errors `register first`, `you are already in a match`. Creates a player `{ name: 'Model', tag: 'AI', kind: 'model', ownerId: humanId }` and a match with the human as X, then runs the same invite auto-cancel as `acceptInvite`. Returns `null`.
- `publicPlayers` and `onlineCount` skip `kind: 'model'`. `invite` to a model player returns `player not available`.
- `sweep()`: model players are not subject to `PRESENCE_TTL_MS`. Closed ids older than `CLOSED_TTL_MS` are dropped from `closed`.
- `endMatch`: after the existing bookkeeping, deletes every `kind: 'model'` player of that match. Covers `leave`, presence sweep of the owner, and `close`.
- `makeMove` and `gameView` are unchanged apart from the two new `GameView` fields. `handleOf` of a model player yields `Model#AI`.
- `close(id)`: `leave(id)`, remove the player (if present), set `closed[id] = clock()`. Always returns `null`, also for unknown ids (the widget may have been swept before the click).
- `reconnect(id)`: if `closed.has(id)`, return `false` without creating anything. Otherwise as today.
- `viewFor(id)` for an unknown id: `phase: 'closed'` when `closed.has(id)`, else the existing name-phase view.

### Tools

| Tool | Visibility | Args | Mutation |
|---|---|---|---|
| `play_vs_model` | app | `{ playerId }` | `startModelMatch` |
| `close_session` | app | `{ playerId }` | `close` |
| `model_move` | model | `{ playerId, cell }` | `makeMove`, guarded |

`model_move` is registered through the SDK's plain `server.registerTool` with no `_meta.ui` at all (`registerAppTool` requires one), so the call does not open another widget. Description for the model: "Play your move in a tic-tac-toe match against the user. Only call this when the game widget asks you to; use the playerId it gives you. Cells are 0-8, left to right, top to bottom." Handler: `sweep` only (no `reconnect`, which would re-create an unknown id as a human), then if the id is not a `kind: 'model'` player reply with `error: 'not a model player'`, else `makeMove` and reply with the model player's view. The reply gives the model the board, `yourTurn` and any error, so a wrong move is self-correcting.

`join_game`'s description mentions that the user can also play against the assistant.

## Widget

### Structure changes

```
src/app/
  App.tsx                 + useModelTurn, close button + modal, ClosedScreen, canPlayModel
  screens/
    LobbyScreen.tsx       + canPlayModel, onPlayModel
    GameScreen.tsx        + modelTurn?: { stale: boolean; onResend: () => void }
    ClosedScreen.tsx      new, no props
  hooks/
    useModelTurn.ts       new, host boundary (uses app.sendMessage)
  lib/
    modelMessage.ts       new, pure: buildModelMessage(game): string
    tools.ts              + 'play_vs_model' | 'close_session'
```

Screens stay pure. `useModelTurn` joins `usePollView` and `useHostTheme` as the only hooks touching ext-apps.

### useModelTurn

`useModelTurn(app, game)` returns `{ stale, resend }`.

- Active when `game?.opponentKind === 'model' && !game.yourTurn && !game.over`.
- State key: `` `${game.round}:${game.board.join('')}` ``. When the key changes while active, send `buildModelMessage(game)` via `app.sendMessage({ role: 'user', content: [{ type: 'text', text }] })` once, and start a 10 s timer. Timer fires → `stale = true`. `sendMessage` resolving with `isError` → `stale = true` at once.
- `resend()` sends the same message and restarts the timer.
- Any key change or leaving the active state clears the timer and resets `stale`. Timers are cleared on unmount.

### Message format

```
Your move in tic-tac-toe (round 2, you are O, score: you 0, opponent 1).
Board, cells 0-8 left to right, top to bottom (. = empty):
X . O
. X .
. . .
Call the model_move tool with playerId "k3j9x2a1" and the cell you choose.
```

`buildModelMessage` derives "you are O" from the opposite of `game.yourMark`, and the scores from the human's perspective flipped.

### Screens

**Lobby.** A "Play vs model" Button above the search input when `canPlayModel` is true; clicking calls `onPlayModel` directly (no modal).

**Game.** When `modelTurn` is given and it is the opponent's turn, the turn line reads "Waiting for the model…". When `modelTurn.stale` is true, an "Ask again" Button appears under the turn line.

**Closed.** Panel, Ribbon "Session closed", muted text "Ask the assistant to open the game again to play."

**Close button.** Rendered by `App.tsx` outside the screens: `<button class="close" aria-label="Close session">×</button>`, absolutely positioned top-right, small 9-slice variant. Opens the existing `Modal` (`danger`, confirm label "Close"). Confirm calls `close_session`.

### App.tsx wiring

- `canPlayModel = Boolean(app?.getHostCapabilities()?.message)`.
- `usePollView(app, tornDown || view?.phase === 'closed' ? null : playerId, ingest)`.
- `const { stale, resend } = useModelTurn(app, view?.game ?? null)`; pass `modelTurn={{ stale, onResend: resend }}` to `GameScreen` when `view.game.opponentKind === 'model'`.

## Testing

- `lobby.test.ts`: `startModelMatch` creates a hidden player and a match (not in `publicPlayers`/`onlineCount`, invite to it fails); model player survives a sweep past the presence TTL while the owner is alive; owner sweep or `leave` deletes the model player; full round against the model with score and rematch swap; `close` ends the match with `opponent-left`, `reconnect` on a closed id returns false and creates nothing, `viewFor` returns `closed`; closed ids expire after 24 h; `close` on an unknown id still records it.
- `handlers.test.ts`: `model_move` rejects a human id; `close_session` reply has `phase: 'closed'`.
- `server.test.ts`: `join_game` and `model_move` are the only model-visible tools; `model_move` has no `resourceUri`; ten app-only tools carry `visibility: ['app']`; end-to-end: `join_game` → `set_name` → `play_vs_model` → `make_move` → `model_move` → `get_state` shows the model's mark.
- Widget: `useModelTurn` with a fake `app` and fake timers (sends once per key, no resend on the same board, stale at 10 s, `resend` sends again, `isError` marks stale); `buildModelMessage` snapshot; `LobbyScreen` shows the button only with `canPlayModel`; `GameScreen` shows "Waiting for the model…" and "Ask again"; `ClosedScreen` renders.
- Storybook: lobby with the button, game vs model waiting, game vs model stale, closed screen, close modal open.
- Manual: ext-apps `basic-host` if it supports `ui/message`; otherwise Claude. Result recorded in the PR.

## Docs

- `CLAUDE.md`: tool surface (two model-visible, ten app-only), `Phase` gains `closed`, `useModelTurn` joins the host-boundary list, message format pointer.
- `README.md`: short "Play against your assistant" section and a line about the close button.
- `2026-09-14-game-design-and-use-cases.md`: a status line pointing here.

## Delivery

One branch, one PR, `feat:` commits (release 0.3.0). Two independent blocks in the plan, session close first because it is smaller and fixes an observed problem, then the model opponent.

## Out of scope

Model vs model, choosing who starts, difficulty, separate win counters against the model, closing on teardown, taking the model's name from the host, and any server-to-widget push.
