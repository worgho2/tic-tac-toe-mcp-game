import type { App } from '@modelcontextprotocol/ext-apps';
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildModelMessage } from '../lib/modelMessage';
import type { GameView } from '../lib/tools';

/** How long without a board change before the game screen offers "Ask again". */
export const MODEL_STALE_MS = 10_000;

/**
 * Asks the host's model for its move. MCP Apps has no channel from the widget to the model except a
 * chat message (`ui/message`), so whenever it is the model's turn this posts one message as the user,
 * once per board state. `stale` turns true after `staleMs` without a board change (or at once if the
 * host rejects the message); `resend` posts the same message again.
 */
export function useModelTurn(
  app: App | null,
  game: GameView | null,
  staleMs = MODEL_STALE_MS,
): { stale: boolean; resend: () => Promise<void> } {
  const [stale, setStale] = useState(false);
  const timer = useRef<number | null>(null);
  const active = game !== null && game.opponentKind === 'model' && !game.yourTurn && !game.over;
  // A string, so identical boards from successive polls do not re-trigger the effect.
  const text = active ? buildModelMessage(game) : null;

  const clearTimer = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const send = useCallback(async () => {
    if (!app || text === null) return;
    setStale(false);
    clearTimer();
    timer.current = window.setTimeout(() => setStale(true), staleMs);
    try {
      const result = await app.sendMessage({ role: 'user', content: [{ type: 'text', text }] });
      if (result.isError) setStale(true);
    } catch (err) {
      console.error(err);
      setStale(true);
    }
  }, [app, text, staleMs, clearTimer]);

  useEffect(() => {
    if (text === null) {
      setStale(false);
      return;
    }
    void send();
    return clearTimer;
  }, [text, send, clearTimer]);

  return { stale, resend: send };
}
