import type { Outcome } from '../lib/outcome';
import { Ribbon } from './Ribbon';

const CONFETTI_COUNT = 40;
const COLORS = ['#e5534b', '#f2c14e', '#4fa3e0', '#7bc96f', '#fff6e0'];
const LABEL: Record<Outcome, string> = { win: 'You win!', loss: 'You lose', draw: 'Draw' };

// Positions and delays are derived from the index so renders are deterministic (tests, stories).
const pieces = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
  id: i,
  left: `${(i * 37) % 100}%`,
  delay: `${((i * 13) % 8) * 0.1}s`,
  color: COLORS[i % COLORS.length],
}));

/** Round-end feedback: confetti on a win, a bobbing duck on a loss, a plain ribbon on a draw. */
export function Overlay({ outcome }: { outcome: Outcome }) {
  return (
    <div className={`overlay overlay--${outcome}`} data-testid="overlay" data-outcome={outcome} aria-live="assertive">
      {outcome === 'win' && (
        <div className="confetti" aria-hidden="true">
          {pieces.map((piece) => (
            <span
              key={piece.id}
              className="confetti__piece"
              style={{ left: piece.left, animationDelay: piece.delay, background: piece.color }}
            />
          ))}
        </div>
      )}
      {outcome === 'loss' && (
        <div className="duck" aria-hidden="true">
          🦆
        </div>
      )}
      <Ribbon>{LABEL[outcome]}</Ribbon>
    </div>
  );
}
