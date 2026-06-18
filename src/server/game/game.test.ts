import { describe, expect, it } from 'vitest';
import { applyMove, type Board, createBoard, getResult, InvalidMoveError } from './game.js';

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
