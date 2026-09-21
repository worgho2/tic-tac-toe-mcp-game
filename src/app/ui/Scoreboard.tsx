import type { Mark } from '../lib/tools';
import { Box } from './Box';
import { Handle } from './Handle';

export interface ScoreSide {
  name: string;
  /** Null when the player has no tag yet; the name shows alone. */
  tag: string | null;
  mark: Mark;
  score: number;
}

interface Props {
  you: ScoreSide;
  opponent: ScoreSide;
  /** Whose move it is; null between rounds. */
  turn: 'you' | 'opponent' | null;
}

function Plate({ side, active, scoreLabel }: { side: ScoreSide; active: boolean; scoreLabel: string }) {
  return (
    <Box
      title={side.tag ? <Handle name={side.name} tag={side.tag} /> : side.name}
      className={`plate${active ? ' plate--active' : ''}`}
    >
      <div className="plate__body">
        <span className={`plate__mark plate__mark--${side.mark.toLowerCase()}`}>{side.mark}</span>
        <output className="plate__score" aria-label={scoreLabel}>
          {side.score}
        </output>
      </div>
      <p className={`plate__turn${active ? '' : ' plate__turn--idle'}`}>
        <span className="dot" aria-hidden="true" />
        {active ? 'Turn' : 'Waiting'}
      </p>
    </Box>
  );
}

/** Two player plates (handle title bar, mark, score) facing each other; the player to move gets the framed plate. */
export function Scoreboard({ you, opponent, turn }: Props) {
  return (
    <div className="scoreboard">
      <Plate side={you} active={turn === 'you'} scoreLabel="Your score" />
      <span className="scoreboard__vs">VS</span>
      <Plate side={opponent} active={turn === 'opponent'} scoreLabel="Opponent score" />
    </div>
  );
}
