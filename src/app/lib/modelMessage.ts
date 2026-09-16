import type { GameView } from './tools';

/** The chat message the widget posts as the user when it is the model's turn. Pure; see the spec's "Message format". */
export function buildModelMessage(game: GameView): string {
  const modelMark = game.yourMark === 'X' ? 'O' : 'X';
  const rows = [0, 3, 6].map((start) =>
    game.board
      .slice(start, start + 3)
      .map((cell) => cell ?? '.')
      .join(' '),
  );
  return [
    `Your move in tic-tac-toe (round ${game.round}, you are ${modelMark}, score: you ${game.opponentScore}, opponent ${game.yourScore}).`,
    'Board, cells 0-8 left to right, top to bottom (. = empty):',
    ...rows,
    `Call the model_move tool with playerId "${game.modelPlayerId}" and the cell you choose.`,
  ].join('\n');
}
