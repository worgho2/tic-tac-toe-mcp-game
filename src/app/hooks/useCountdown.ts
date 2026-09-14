import { useEffect, useState } from 'react';

/**
 * Counts `expiresIn` (ms) down locally once a second. Every poll delivers a fresh `expiresIn`, which
 * restarts the countdown, so client and server clocks never need to agree.
 */
export function useCountdown(expiresIn: number, tickMs = 1000): number {
  const [remaining, setRemaining] = useState(expiresIn);

  useEffect(() => {
    setRemaining(expiresIn);
    const started = Date.now();
    const id = window.setInterval(() => {
      setRemaining(Math.max(0, expiresIn - (Date.now() - started)));
    }, tickMs);
    return () => window.clearInterval(id);
  }, [expiresIn, tickMs]);

  return remaining;
}

export function formatSeconds(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 1000))}s`;
}
