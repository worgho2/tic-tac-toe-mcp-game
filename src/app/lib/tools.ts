import type { App } from '@modelcontextprotocol/ext-apps';
import type { PlayerView } from '../../server/lobby/lobby.js';

export type { GameView, PlayerView, PublicPlayer } from '../../server/lobby/lobby.js';

/** Reply of `join_game`; every other tool replies with a bare `PlayerView`. */
export interface JoinResult {
  playerId: string;
  view: PlayerView;
}

export type ToolName = 'set_name' | 'get_state' | 'invite' | 'accept_invite' | 'decline_invite' | 'make_move' | 'leave';

/**
 * Calls a server tool through the host and unwraps the payload: `structuredContent` when present,
 * otherwise the JSON in the first text block (for hosts that strip structured content).
 */
export async function callTool<T = PlayerView>(app: App, name: ToolName, args: Record<string, unknown>): Promise<T> {
  const result = await app.callServerTool({ name, arguments: args });
  if (result.isError) {
    throw new Error(`Tool "${name}" failed`);
  }
  if (result.structuredContent !== undefined && result.structuredContent !== null) {
    return result.structuredContent as T;
  }
  return parseTextBlock(result.content) as T;
}

/** Parses the JSON mirrored in the first text block (hosts without structured content support). */
export function parseTextBlock(content: ReadonlyArray<{ type: string; text?: string }> | undefined): unknown {
  const text = content?.find((block) => block.type === 'text')?.text;
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Type guard for a `join_game` reply. */
export function isJoinResult(data: unknown): data is JoinResult {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as JoinResult).playerId === 'string' &&
    typeof (data as JoinResult).view === 'object'
  );
}

/** Type guard for a bare `PlayerView` reply. */
export function isPlayerView(data: unknown): data is PlayerView {
  return typeof data === 'object' && data !== null && typeof (data as PlayerView).phase === 'string';
}
