import type { App } from '@modelcontextprotocol/ext-apps';
import { useEffect } from 'react';
import { callTool, type PlayerView } from '../lib/tools';

export const POLL_INTERVAL_MS = 1500;

/**
 * Polls the app-only get_state tool once immediately, then every intervalMs, and again whenever the tab becomes visible, while a player id is known. MCP Apps has no server-to-widget push, so this is how the widget learns about invites and opponent moves.
 */
export function usePollView(
  app: App | null,
  playerId: string | null,
  onView: (view: PlayerView) => void,
  intervalMs = POLL_INTERVAL_MS,
): void {
  useEffect(() => {
    if (!app || !playerId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const view = await callTool<PlayerView>(app, 'get_state', { playerId });
        if (!cancelled) onView(view);
      } catch {
        // Transient host/transport errors: the next tick retries.
      }
    };

    // Background tabs throttle timers; poll as soon as the tab is visible again so presence is refreshed
    // before the next (possibly delayed) tick.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void poll();
    };

    void poll();
    const id = window.setInterval(poll, intervalMs);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [app, playerId, onView, intervalMs]);
}
