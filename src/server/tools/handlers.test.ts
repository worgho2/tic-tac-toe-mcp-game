import { beforeEach, describe, expect, it } from 'vitest';
import type { PlayerView } from '../lobby/lobby.js';
import { Lobby } from '../lobby/lobby.js';
import {
  handleAcceptInvite,
  handleGetState,
  handleInvite,
  handleJoin,
  handleMove,
  handleSetName,
  type JoinResult,
} from './handlers.js';

function makeCounter() {
  let n = 0;
  return () => `id${++n}`;
}

describe('tool handlers', () => {
  let lobby: Lobby;
  beforeEach(() => {
    lobby = new Lobby(makeCounter());
  });

  it('handleJoin allocates a playerId and returns an initial name-phase view', () => {
    const reply = handleJoin(lobby);
    const data = reply.structuredContent as unknown as JoinResult;
    expect(typeof data.playerId).toBe('string');
    expect(data.view.phase).toBe('name');
    // text content mirrors structuredContent for non-UI hosts
    expect(JSON.parse(reply.content[0].text)).toEqual(data);
  });

  it('handleSetName registers and returns a lobby-phase view', () => {
    const { playerId } = handleJoin(lobby).structuredContent as unknown as JoinResult;
    const view = handleSetName(lobby, { playerId, name: 'Alice' }).structuredContent as unknown as PlayerView;
    expect(view.phase).toBe('lobby');
    expect(view.you.name).toBe('Alice');
    expect(view.error).toBeNull();
  });

  it('handleGetState reflects another player joining', () => {
    const a = (handleJoin(lobby).structuredContent as unknown as JoinResult).playerId;
    handleSetName(lobby, { playerId: a, name: 'Alice' });
    const b = (handleJoin(lobby).structuredContent as unknown as JoinResult).playerId;
    handleSetName(lobby, { playerId: b, name: 'Bob' });
    const view = handleGetState(lobby, { playerId: a }).structuredContent as unknown as PlayerView;
    expect(view.players.map((p) => p.name)).toEqual(['Bob']);
  });

  it('a full invite→accept→move flow drives both players into a game', () => {
    const a = (handleJoin(lobby).structuredContent as unknown as JoinResult).playerId;
    handleSetName(lobby, { playerId: a, name: 'Alice' });
    const b = (handleJoin(lobby).structuredContent as unknown as JoinResult).playerId;
    handleSetName(lobby, { playerId: b, name: 'Bob' });
    handleInvite(lobby, { playerId: a, targetId: b });
    const bView = handleGetState(lobby, { playerId: b }).structuredContent as unknown as PlayerView;
    handleAcceptInvite(lobby, { playerId: b, inviteId: bView.invite!.inviteId });
    const moved = handleMove(lobby, { playerId: a, cell: 4 }).structuredContent as unknown as PlayerView;
    expect(moved.game!.board[4]).toBe('X');
  });

  it('an invalid move surfaces an error in the view without throwing', () => {
    const a = (handleJoin(lobby).structuredContent as unknown as JoinResult).playerId;
    handleSetName(lobby, { playerId: a, name: 'Alice' });
    const view = handleMove(lobby, { playerId: a, cell: 0 }).structuredContent as unknown as PlayerView;
    expect(view.error).toMatch(/not in a game/i);
  });
});
