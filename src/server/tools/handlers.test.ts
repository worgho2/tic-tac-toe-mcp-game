import { beforeEach, describe, expect, it } from 'vitest';
import type { PlayerView } from '../lobby/lobby.js';
import { Lobby, PRESENCE_TTL_MS, REMATCH_DELAY_MS } from '../lobby/lobby.js';
import {
  handleAcceptInvite,
  handleCancelInvite,
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
  let now: number;
  let lobby: Lobby;
  beforeEach(() => {
    now = 1000;
    lobby = new Lobby(makeCounter(), () => now);
  });

  function joinAs(name: string): string {
    const { playerId } = handleJoin(lobby).structuredContent as unknown as JoinResult;
    handleSetName(lobby, { playerId, name });
    return playerId;
  }
  function stateOf(playerId: string): PlayerView {
    return handleGetState(lobby, { playerId }).structuredContent as unknown as PlayerView;
  }

  it('handleJoin allocates a playerId and returns an initial name-phase view', () => {
    const reply = handleJoin(lobby);
    const data = reply.structuredContent as unknown as JoinResult;
    expect(typeof data.playerId).toBe('string');
    expect(data.view.phase).toBe('name');
    expect(data.view.onlineCount).toBe(0);
    // text content mirrors structuredContent for non-UI hosts
    expect(JSON.parse(reply.content[0].text)).toEqual(data);
  });

  it('handleSetName registers and returns a lobby-phase view with a tag', () => {
    const { playerId } = handleJoin(lobby).structuredContent as unknown as JoinResult;
    const view = handleSetName(lobby, { playerId, name: 'Alice' }).structuredContent as unknown as PlayerView;
    expect(view.phase).toBe('lobby');
    expect(view.you.name).toBe('Alice');
    expect(view.you.tag).toMatch(/^\d{4}$/);
    expect(view.error).toBeNull();
  });

  it('a stale playerId (swept while the widget was reloading) can register again instead of failing', () => {
    const alice = joinAs('Alice');
    const bob = joinAs('Bob');
    now += PRESENCE_TTL_MS + 1;
    stateOf(bob); // bob polls, which sweeps alice
    expect(stateOf(bob).onlineCount).toBe(1);
    const view = handleSetName(lobby, { playerId: alice, name: 'Alice' }).structuredContent as unknown as PlayerView;
    expect(view.error).toBeNull();
    expect(view.phase).toBe('lobby');
    expect(view.you.name).toBe('Alice');
    expect(view.you.tag).toMatch(/^\d{4}$/);
    expect(stateOf(bob).onlineCount).toBe(2);
  });

  it('handleGetState reflects another player joining', () => {
    const a = joinAs('Alice');
    joinAs('Bob');
    expect(stateOf(a).players.map((p) => p.name)).toEqual(['Bob']);
    expect(stateOf(a).onlineCount).toBe(2);
  });

  it('a full invite→accept→move flow drives both players into a game', () => {
    const a = joinAs('Alice');
    const b = joinAs('Bob');
    handleInvite(lobby, { playerId: a, targetId: b });
    handleAcceptInvite(lobby, { playerId: b, inviteId: stateOf(b).invites.received[0].inviteId });
    const moved = handleMove(lobby, { playerId: a, cell: 4 }).structuredContent as unknown as PlayerView;
    expect(moved.game!.board[4]).toBe('X');
  });

  it('handleCancelInvite withdraws a sent invite', () => {
    const a = joinAs('Alice');
    const b = joinAs('Bob');
    const sent = handleInvite(lobby, { playerId: a, targetId: b }).structuredContent as unknown as PlayerView;
    const view = handleCancelInvite(lobby, { playerId: a, inviteId: sent.invites.sent[0].inviteId })
      .structuredContent as unknown as PlayerView;
    expect(view.error).toBeNull();
    expect(view.invites.sent).toEqual([]);
    expect(stateOf(b).events).toEqual([
      { type: 'invite-cancelled', name: 'Alice', tag: expect.any(String), reason: 'by-sender' },
    ]);
  });

  it('every handler sweeps, so a rematch starts on any call after the delay', () => {
    const a = joinAs('Alice');
    const b = joinAs('Bob');
    handleInvite(lobby, { playerId: a, targetId: b });
    handleAcceptInvite(lobby, { playerId: b, inviteId: stateOf(b).invites.received[0].inviteId });
    for (const [who, cell] of [
      [a, 0],
      [b, 3],
      [a, 1],
      [b, 4],
      [a, 2],
    ] as const) {
      handleMove(lobby, { playerId: who, cell });
    }
    now += REMATCH_DELAY_MS;
    // A mutation, not get_state: the sweep inside it must advance the round first.
    const view = handleMove(lobby, { playerId: b, cell: 4 }).structuredContent as unknown as PlayerView;
    expect(view.error).toBeNull(); // b is X in round 2 and may move
    expect(view.game).toMatchObject({ round: 2 });
    expect(view.game!.board[4]).toBe('X');
  });

  it('an invalid move surfaces an error in the view without throwing', () => {
    const a = joinAs('Alice');
    const view = handleMove(lobby, { playerId: a, cell: 0 }).structuredContent as unknown as PlayerView;
    expect(view.error).toMatch(/not in a game/i);
  });
});
