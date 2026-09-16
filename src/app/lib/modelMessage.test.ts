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
