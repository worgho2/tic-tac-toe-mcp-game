import type { Board, GameView, InviteView, PlayerView, PublicPlayer } from '../lib/tools';

// Shared by the widget tests (and by the Storybook stories). Keep values stable: tests assert on them.

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
