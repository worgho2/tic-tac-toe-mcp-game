import type { GameView } from '../lib/tools';

interface Props {
  game: GameView;
  onMove: (cell: number) => void;
  onLeave: () => void;
}

function statusLine(game: GameView): string {
  if (game.over) {
    return game.result?.status === 'won' ? `${game.result.winner} wins!` : "It's a draw.";
  }
  return game.yourTurn ? 'Your turn' : "Opponent's turn";
}

export function GameBoard({ game, onMove, onLeave }: Props) {
  return (
    <section>
      <h2>
        vs {game.opponentName} — you are {game.yourMark}
      </h2>
      <p className="muted">{statusLine(game)}</p>
      <div className="board">
        {game.board.map((mark, index) => (
          <button
            // Cells are positional and never reorder; the index is the identity.
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed 3x3 grid
            key={index}
            type="button"
            className="cell"
            aria-label={`Cell ${index + 1}${mark ? `, ${mark}` : ''}`}
            disabled={game.over || !game.yourTurn || mark !== null}
            onClick={() => onMove(index)}
          >
            {mark ?? ''}
          </button>
        ))}
      </div>
      {game.over && (
        <div className="row">
          <button type="button" className="secondary" onClick={onLeave}>
            Back to lobby
          </button>
        </div>
      )}
    </section>
  );
}
