import { useState } from 'react';
import { handle } from '../lib/events';
import { roundOutcome } from '../lib/outcome';
import type { GameView, PlayerView } from '../lib/tools';
import { Button } from '../ui/Button';
import { Cell } from '../ui/Cell';
import { Modal } from '../ui/Modal';
import { Overlay } from '../ui/Overlay';
import { Panel } from '../ui/Panel';

interface Props {
  you: PlayerView['you'];
  game: GameView;
  onMove: (cell: number) => void;
  onLeave: () => void;
  /** Present in matches against the model: staleness of the last request and how to repeat it. */
  modelTurn?: { stale: boolean; onResend: () => void };
}

function turnLine(game: GameView, waitingForModel: boolean): string {
  if (game.over) return 'Next round starts in a moment…';
  if (game.yourTurn) return 'Your turn';
  return waitingForModel ? 'Waiting for the model…' : "Opponent's turn";
}

export function GameScreen({ you, game, onMove, onLeave, modelTurn }: Props) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const outcome = roundOutcome(game);
  const yourHandle = you.name && you.tag ? handle(you.name, you.tag) : '';
  const modelPending = modelTurn !== undefined && !game.yourTurn && !game.over;

  const leave = () => {
    setConfirmLeave(false);
    onLeave();
  };

  return (
    <Panel className="game">
      <header className="game__header">
        <output className="score" aria-label="Your score">
          {game.yourScore}
        </output>
        <span className="game__names">
          {yourHandle} <span className="muted">x</span> {handle(game.opponentName, game.opponentTag)}
        </span>
        <output className="score" aria-label="Opponent score">
          {game.opponentScore}
        </output>
      </header>
      <p className="muted game__status">
        Round {game.round} · you are {game.yourMark} · {turnLine(game, modelPending)}
      </p>
      {modelPending && modelTurn.stale && (
        <Button variant="secondary" className="game__resend" onClick={modelTurn.onResend}>
          Ask again
        </Button>
      )}
      <div className="board-wrap">
        <div className="board">
          {game.board.map((mark, index) => (
            <Cell
              // Cells are positional and never reorder; the index is the identity.
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed 3x3 grid
              key={index}
              index={index}
              mark={mark}
              disabled={game.over || !game.yourTurn || mark !== null}
              onClick={() => onMove(index)}
            />
          ))}
        </div>
        {outcome && <Overlay key={game.round} outcome={outcome} />}
      </div>
      <Button variant="secondary" onClick={() => setConfirmLeave(true)}>
        Back to lobby
      </Button>
      {confirmLeave && (
        <Modal
          title="Leave the match?"
          confirmLabel="Leave"
          danger
          onConfirm={leave}
          onCancel={() => setConfirmLeave(false)}
        >
          <p>Your opponent will return to the lobby too.</p>
        </Modal>
      )}
    </Panel>
  );
}
