import { handle } from '../lib/events';
import type { GameView } from '../lib/tools';

interface Props {
  you: { name: string | null; tag: string | null };
  game: GameView;
  onMove: (cell: number) => void;
  onLeave: () => void;
}

function statusLine(game: GameView): string {
  if (game.over) {
    if (game.result?.status === 'draw') return 'Draw. Next round starts in a moment…';
    const youWon = game.result?.status === 'won' && game.result.winner === game.yourMark;
    return youWon ? 'You win! Next round starts in a moment…' : 'You lose. Next round starts in a moment…';
  }
  return game.yourTurn ? 'Your turn' : "Opponent's turn";
}

export function GameBoard({ you, game, onMove, onLeave }: Props) {
  const yourHandle = you.name && you.tag ? handle(you.name, you.tag) : 'you';
  return (
    <section>
      <h2>
        [{game.yourScore}] {yourHandle} x {handle(game.opponentName, game.opponentTag)} [{game.opponentScore}]
      </h2>
      <p className="muted">
        Round {game.round} · you are {game.yourMark} · {statusLine(game)}
      </p>
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
      <div className="row">
        <button type="button" className="secondary" onClick={onLeave}>
          Back to lobby
        </button>
      </div>
    </section>
  );
}
