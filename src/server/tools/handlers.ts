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

/** view for `playerId` with the mutation's error (if any) merged in. */
function viewWithError(lobby: Lobby, playerId: string, error: string | null): ToolReply {
  return reply({ ...lobby.viewFor(playerId), error });
}

export function handleJoin(lobby: Lobby): ToolReply {
  const playerId = lobby.connect();
  return reply({ playerId, view: lobby.viewFor(playerId) });
}

export function handleSetName(lobby: Lobby, args: { playerId: string; name: string }): ToolReply {
  lobby.touch(args.playerId);
  const error = lobby.register(args.playerId, args.name);
  return viewWithError(lobby, args.playerId, error);
}

export function handleGetState(lobby: Lobby, args: { playerId: string }): ToolReply {
  lobby.touch(args.playerId);
  lobby.sweep();
  return reply(lobby.viewFor(args.playerId));
}

export function handleInvite(lobby: Lobby, args: { playerId: string; targetId: string }): ToolReply {
  lobby.touch(args.playerId);
  const error = lobby.invite(args.playerId, args.targetId);
  return viewWithError(lobby, args.playerId, error);
}

export function handleAcceptInvite(lobby: Lobby, args: { playerId: string; inviteId: string }): ToolReply {
  lobby.touch(args.playerId);
  const error = lobby.acceptInvite(args.playerId, args.inviteId);
  return viewWithError(lobby, args.playerId, error);
}

export function handleDeclineInvite(lobby: Lobby, args: { playerId: string; inviteId: string }): ToolReply {
  lobby.touch(args.playerId);
  const error = lobby.declineInvite(args.playerId, args.inviteId);
  return viewWithError(lobby, args.playerId, error);
}

export function handleMove(lobby: Lobby, args: { playerId: string; cell: number }): ToolReply {
  lobby.touch(args.playerId);
  const error = lobby.makeMove(args.playerId, args.cell);
  return viewWithError(lobby, args.playerId, error);
}

export function handleLeave(lobby: Lobby, args: { playerId: string }): ToolReply {
  lobby.touch(args.playerId);
  const error = lobby.leave(args.playerId);
  return viewWithError(lobby, args.playerId, error);
}
