import { useState } from 'react';
import { roundOutcome } from '../lib/outcome';
import type { GameView, PlayerView } from '../lib/tools';
import { Box } from '../ui/Box';
import { Button } from '../ui/Button';
import { Cell } from '../ui/Cell';
import { Modal } from '../ui/Modal';
import { Overlay } from '../ui/Overlay';
import { Scoreboard } from '../ui/Scoreboard';
import { ScreenFrame, type ScreenMeta } from './ScreenFrame';

interface Props {
  meta: ScreenMeta;
  you: PlayerView['you'];
  game: GameView;
  onMove: (cell: number) => void;
  onLeave: () => void;
  onClose: () => void;
  /** Present in matches against the model: staleness of the last request and how to repeat it. */
  modelTurn?: { stale: boolean; onResend: () => void };
}

function turnLine(game: GameView, waitingForModel: boolean): string {
  if (game.over) return 'Next round starts in a moment…';
  if (game.yourTurn) return 'Your turn';
  return waitingForModel ? 'Waiting for the model…' : "Opponent's turn";
}

export function GameScreen({ meta, you, game, onMove, onLeave, onClose, modelTurn }: Props) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const outcome = roundOutcome(game);
  const modelPending = modelTurn !== undefined && !game.yourTurn && !game.over;
  const opponentMark = game.yourMark === 'X' ? 'O' : 'X';

  const leave = () => {
    setConfirmLeave(false);
    onLeave();
  };

  return (
    <ScreenFrame
      className="game"
      title={`Round ${game.round}`}
      header={
        <div className="header-actions">
          <Button variant="secondary" onClick={() => setConfirmLeave(true)}>
            Back to lobby
          </Button>
          {modelPending && modelTurn.stale && (
            <Button variant="secondary" onClick={modelTurn.onResend}>
              Ask again
            </Button>
          )}
        </div>
      }
      meta={meta}
      close={{ inMatch: true, onClose }}
    >
      <Scoreboard
        you={{ name: you.name ?? 'You', tag: you.tag, mark: game.yourMark, score: game.yourScore }}
        opponent={{ name: game.opponentName, tag: game.opponentTag, mark: opponentMark, score: game.opponentScore }}
        turn={game.over ? null : game.yourTurn ? 'you' : 'opponent'}
      />
      <Box title={turnLine(game, modelPending)} className="game__board">
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
      </Box>
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
    </ScreenFrame>
  );
}
