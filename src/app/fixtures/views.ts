import type { Board, GameView, InviteView, PlayerView, PublicPlayer } from '../lib/tools';
import type { ScreenMeta } from '../screens/ScreenFrame';

// Shared by the widget tests (and by the Storybook stories). Keep values stable: tests assert on them.

/** Footer data every screen takes; stories replace onOpenLink with a spy. */
export const meta: ScreenMeta = { version: '0.3.0', onlineCount: 4, onOpenLink: () => {} };

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
  opponentKind: 'human',
  modelPlayerId: null,
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

// Longest names the server accepts (MAX_NAME = 24; the pixel font is monospaced, so any 24 characters are as wide).
const LONG_A = 'maximilian_the_legendary';
const LONG_B = 'bartholomew_of_nowhere_x';

export const longYou: PlayerView['you'] = { id: 'me', name: LONG_A, tag: '1234' };
export const longPlayers: PublicPlayer[] = [
  { id: 'p1', name: LONG_B, tag: '0042', status: 'idle' },
  { id: 'p2', name: `${LONG_B.slice(0, 20)}_two`, tag: '0007', status: 'busy' },
  { id: 'p3', name: 'al', tag: '0099', status: 'idle' },
];
export const longInvites: PlayerView['invites'] = {
  received: [{ inviteId: 'inv-r1', name: LONG_B, tag: '0042', expiresIn: 45_000 }],
  sent: [{ inviteId: 'inv-s1', name: `${LONG_B.slice(0, 20)}_two`, tag: '0007', expiresIn: 12_000 }],
};
export const gameLongNames: GameView = { ...gameYourTurn, opponentName: LONG_B, yourScore: 12, opponentScore: 10 };
