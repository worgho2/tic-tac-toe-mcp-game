import { beforeEach, describe, expect, it } from 'vitest';
import { Lobby, PRESENCE_TTL_MS } from './lobby.js';

// Deterministic ids: id1, id2, ... ; controllable clock.
function makeCounter() {
  let n = 0;
  return () => `id${++n}`;
}
function makeClock(start = 1000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('Lobby (pull model)', () => {
  let genId: () => string;
  let clock: ReturnType<typeof makeClock>;
  let lobby: Lobby;
  beforeEach(() => {
    genId = makeCounter();
    clock = makeClock();
    lobby = new Lobby(genId, clock.now);
  });

  // helper: register a fresh named player, return its id
  function join(name: string): string {
    const id = lobby.connect();
    lobby.register(id, name);
    return id;
  }

  it('connect returns a fresh id and starts on the name phase', () => {
    const id = lobby.connect();
    expect(typeof id).toBe('string');
    expect(lobby.viewFor(id).phase).toBe('name');
  });

  it('register moves a player to the lobby phase', () => {
    const a = lobby.connect();
    expect(lobby.register(a, 'Alice')).toBeNull();
    expect(lobby.viewFor(a).phase).toBe('lobby');
    expect(lobby.viewFor(a).you.name).toBe('Alice');
  });

  it('register rejects an empty name', () => {
    const a = lobby.connect();
    expect(lobby.register(a, '   ')).toMatch(/name/i);
  });

  it('a player sees other registered players (not themselves)', () => {
    const a = join('Alice');
    join('Bob');
    const view = lobby.viewFor(a);
    expect(view.players.map((p) => p.name)).toEqual(['Bob']);
    expect(view.players[0].status).toBe('idle');
  });

  it('invite surfaces a pending invite to the target only', () => {
    const a = join('Alice');
    const b = join('Bob');
    expect(lobby.invite(a, b)).toBeNull();
    expect(lobby.viewFor(b).invite).toMatchObject({ fromName: 'Alice' });
    expect(lobby.viewFor(a).invite).toBeNull();
  });

  it('invite rejects a busy target', () => {
    const a = join('Alice');
    const b = join('Bob');
    const c = join('Carol');
    const inv = lobby.viewFor(b); // none yet
    expect(inv.invite).toBeNull();
    lobby.invite(a, b);
    const inviteId = lobby.viewFor(b).invite!.inviteId;
    lobby.acceptInvite(b, inviteId); // a & b now in a game
    expect(lobby.invite(c, a)).toMatch(/busy/i);
  });

  it('accepting an invite starts a game: inviter is X and moves first', () => {
    const a = join('Alice');
    const b = join('Bob');
    lobby.invite(a, b);
    const inviteId = lobby.viewFor(b).invite!.inviteId;
    expect(lobby.acceptInvite(b, inviteId)).toBeNull();
    const av = lobby.viewFor(a).game!;
    const bv = lobby.viewFor(b).game!;
    expect(av.yourMark).toBe('X');
    expect(bv.yourMark).toBe('O');
    expect(av.yourTurn).toBe(true);
    expect(bv.yourTurn).toBe(false);
    expect(av.opponentName).toBe('Bob');
  });

  it('rejects a move played out of turn', () => {
    const a = join('Alice');
    const b = join('Bob');
    lobby.invite(a, b);
    lobby.acceptInvite(b, lobby.viewFor(b).invite!.inviteId);
    expect(lobby.makeMove(b, 0)).toMatch(/turn/i); // O cannot move first
  });

  it('rejects a move on an occupied cell', () => {
    const a = join('Alice');
    const b = join('Bob');
    lobby.invite(a, b);
    lobby.acceptInvite(b, lobby.viewFor(b).invite!.inviteId);
    expect(lobby.makeMove(a, 0)).toBeNull();
    expect(lobby.makeMove(b, 0)).toMatch(/turn|taken|occupied/i);
  });

  it('a winning move ends the game and is RETAINED for both players to see', () => {
    const a = join('Alice');
    const b = join('Bob');
    lobby.invite(a, b);
    lobby.acceptInvite(b, lobby.viewFor(b).invite!.inviteId);
    // X(a): 0,1,2 ; O(b): 3,4
    lobby.makeMove(a, 0);
    lobby.makeMove(b, 3);
    lobby.makeMove(a, 1);
    lobby.makeMove(b, 4);
    expect(lobby.makeMove(a, 2)).toBeNull(); // X wins top row
    const av = lobby.viewFor(a).game!;
    const bv = lobby.viewFor(b).game!;
    expect(av.over).toBe(true);
    expect(av.result).toEqual({ status: 'won', winner: 'X' });
    expect(bv.over).toBe(true); // opponent still sees the finished game
    expect(av.yourTurn).toBe(false);
  });

  it('leaving a finished game returns the player to the lobby', () => {
    const a = join('Alice');
    const b = join('Bob');
    lobby.invite(a, b);
    lobby.acceptInvite(b, lobby.viewFor(b).invite!.inviteId);
    lobby.makeMove(a, 0);
    lobby.makeMove(b, 3);
    lobby.makeMove(a, 1);
    lobby.makeMove(b, 4);
    lobby.makeMove(a, 2); // over
    expect(lobby.leave(a)).toBeNull();
    expect(lobby.viewFor(a).phase).toBe('lobby');
  });

  it('leaving an ACTIVE game notifies the opponent via a one-shot notice', () => {
    const a = join('Alice');
    const b = join('Bob');
    lobby.invite(a, b);
    lobby.acceptInvite(b, lobby.viewFor(b).invite!.inviteId);
    lobby.leave(a);
    const first = lobby.viewFor(b);
    expect(first.phase).toBe('lobby');
    expect(first.notice).toMatch(/left/i);
    // notice is one-shot: cleared after it is read once
    expect(lobby.viewFor(b).notice).toBeNull();
  });

  it('declineInvite notifies the inviter once', () => {
    const a = join('Alice');
    const b = join('Bob');
    lobby.invite(a, b);
    lobby.declineInvite(b, lobby.viewFor(b).invite!.inviteId);
    expect(lobby.viewFor(a).notice).toMatch(/declined/i);
  });

  it('sweep removes a player idle past the TTL and ends their active game', () => {
    const a = join('Alice');
    const b = join('Bob');
    lobby.invite(a, b);
    lobby.acceptInvite(b, lobby.viewFor(b).invite!.inviteId);
    clock.advance(PRESENCE_TTL_MS + 1);
    lobby.touch(b); // b is still active; a is now stale
    lobby.sweep();
    const bv = lobby.viewFor(b);
    expect(bv.phase).toBe('lobby'); // game ended
    expect(bv.notice).toMatch(/left/i);
    expect(lobby.viewFor(a).phase).toBe('name'); // a was removed entirely
  });
});
