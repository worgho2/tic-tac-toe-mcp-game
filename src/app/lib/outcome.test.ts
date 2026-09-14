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
