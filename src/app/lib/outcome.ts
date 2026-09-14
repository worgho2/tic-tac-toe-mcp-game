import type { GameView } from './tools';

export type Outcome = 'win' | 'loss' | 'draw';

/** What the round-end overlay shows; null while a round is in progress. */
export function roundOutcome(game: GameView | null): Outcome | null {
  if (!game?.over || !game.result) return null;
  if (game.result.status === 'draw') return 'draw';
  if (game.result.status === 'won') return game.result.winner === game.yourMark ? 'win' : 'loss';
  return null;
}
