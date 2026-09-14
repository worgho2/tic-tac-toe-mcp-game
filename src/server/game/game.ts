export type Mark = 'X' | 'O';
export type Cell = Mark | null;
export type Board = Cell[]; // length 9, row-major
export type GameResult = { status: 'won'; winner: Mark } | { status: 'draw' } | { status: 'ongoing' };

export class InvalidMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMoveError';
  }
}

const LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8], // rows
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8], // cols
  [0, 4, 8],
  [2, 4, 6], // diagonals
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
