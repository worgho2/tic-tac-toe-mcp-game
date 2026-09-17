import type { Lobby, PlayerView } from '../lobby/lobby.js';

export interface ToolReply {
  // index signature so the reply satisfies the SDK's CallToolResult shape
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  structuredContent: Record<string, unknown>;
}

export interface JoinResult {
  playerId: string;
  view: PlayerView;
}

function reply(data: object): ToolReply {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    structuredContent: data as Record<string, unknown>,
  };
}

/**
 * Heartbeat for the caller (re-creating a swept player so a reloaded widget can register again), then
 * advance every time-based transition before the mutation runs.
 */
function tick(lobby: Lobby, playerId: string): void {
  lobby.reconnect(playerId);
  lobby.sweep();
}

/** view for `playerId` with the mutation's error (if any) merged in. */
function viewWithError(lobby: Lobby, playerId: string, error: string | null): ToolReply {
  return reply({ ...lobby.viewFor(playerId), error });
}

export function handleJoin(lobby: Lobby): ToolReply {
  lobby.sweep();
  const playerId = lobby.connect();
  return reply({ playerId, view: lobby.viewFor(playerId) });
}

export function handleSetName(lobby: Lobby, args: { playerId: string; name: string }): ToolReply {
  tick(lobby, args.playerId);
  const error = lobby.register(args.playerId, args.name);
  return viewWithError(lobby, args.playerId, error);
}

export function handleGetState(lobby: Lobby, args: { playerId: string }): ToolReply {
  tick(lobby, args.playerId);
  return reply(lobby.viewFor(args.playerId));
}

export function handleInvite(lobby: Lobby, args: { playerId: string; targetId: string }): ToolReply {
  tick(lobby, args.playerId);
  const error = lobby.invite(args.playerId, args.targetId);
  return viewWithError(lobby, args.playerId, error);
}

export function handleAcceptInvite(lobby: Lobby, args: { playerId: string; inviteId: string }): ToolReply {
  tick(lobby, args.playerId);
  const error = lobby.acceptInvite(args.playerId, args.inviteId);
  return viewWithError(lobby, args.playerId, error);
}

export function handleDeclineInvite(lobby: Lobby, args: { playerId: string; inviteId: string }): ToolReply {
  tick(lobby, args.playerId);
  const error = lobby.declineInvite(args.playerId, args.inviteId);
  return viewWithError(lobby, args.playerId, error);
}

export function handleCancelInvite(lobby: Lobby, args: { playerId: string; inviteId: string }): ToolReply {
  tick(lobby, args.playerId);
  const error = lobby.cancelInvite(args.playerId, args.inviteId);
  return viewWithError(lobby, args.playerId, error);
}

export function handleMove(lobby: Lobby, args: { playerId: string; cell: number }): ToolReply {
  tick(lobby, args.playerId);
  const error = lobby.makeMove(args.playerId, args.cell);
  return viewWithError(lobby, args.playerId, error);
}

export function handleLeave(lobby: Lobby, args: { playerId: string }): ToolReply {
  tick(lobby, args.playerId);
  const error = lobby.leave(args.playerId);
  return viewWithError(lobby, args.playerId, error);
}

export function handleCloseSession(lobby: Lobby, args: { playerId: string }): ToolReply {
  tick(lobby, args.playerId);
  const error = lobby.close(args.playerId);
  return viewWithError(lobby, args.playerId, error);
}

export function handlePlayVsModel(lobby: Lobby, args: { playerId: string }): ToolReply {
  tick(lobby, args.playerId);
  const error = lobby.startModelMatch(args.playerId);
  return viewWithError(lobby, args.playerId, error);
}

/**
 * Called by the model, not the widget. No `reconnect`: an unknown id must not be re-created as a human,
 * and only a model player may move through here. The guard must not build a view: `args.playerId` could
 * be a human's id (e.g. a model that reused the `playerId` from the `join_game` reply instead of the one
 * the widget handed it for this match), and `viewFor` would both return that human's private view and
 * drain their pending events, silently swallowing toasts the widget hasn't shown yet.
 */
export function handleModelMove(lobby: Lobby, args: { playerId: string; cell: number }): ToolReply {
  lobby.sweep();
  if (!lobby.isModelPlayer(args.playerId)) return reply({ error: 'not a model player' });
  const error = lobby.makeMove(args.playerId, args.cell);
  return viewWithError(lobby, args.playerId, error);
}
