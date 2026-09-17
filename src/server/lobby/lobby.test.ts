import { beforeEach, describe, expect, it } from 'vitest';
import { CLOSED_TTL_MS, INVITE_TTL_MS, Lobby, MAX_CLOSED_IDS, PRESENCE_TTL_MS, REMATCH_DELAY_MS } from './lobby.js';

// Deterministic ids (id1, id2, …), tags (0001, 0002, …) and a controllable clock.
function makeCounter(prefix = 'id') {
  let n = 0;
  return () => `${prefix}${++n}`;
}
function makeTagCounter() {
  let n = 0;
  return () => String(++n).padStart(4, '0');
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

describe('Lobby', () => {
  let clock: ReturnType<typeof makeClock>;
  let lobby: Lobby;
  beforeEach(() => {
    clock = makeClock();
    lobby = new Lobby(makeCounter(), clock.now, makeTagCounter());
  });

  // Registers a fresh named player and returns its id.
  function join(name: string): string {
    const id = lobby.connect();
    lobby.register(id, name);
    return id;
  }
  // Sends an invite from a to b and returns the invite id as b sees it.
  function inviteFrom(a: string, b: string): string {
    expect(lobby.invite(a, b)).toBeNull();
    return lobby.viewFor(b).invites.received.at(-1)!.inviteId;
  }
  // Puts a and b into a match (a is X).
  function startMatch(a: string, b: string): void {
    expect(lobby.acceptInvite(b, inviteFrom(a, b))).toBeNull();
  }

  describe('identity', () => {
    it('connect returns a fresh id and starts on the name phase', () => {
      const id = lobby.connect();
      expect(typeof id).toBe('string');
      expect(lobby.viewFor(id).phase).toBe('name');
    });

    it('register assigns a 4-digit tag and moves the player to the lobby', () => {
      const a = lobby.connect();
      expect(lobby.register(a, 'Alice')).toBeNull();
      const view = lobby.viewFor(a);
      expect(view.phase).toBe('lobby');
      expect(view.you).toEqual({ id: a, name: 'Alice', tag: '0001' });
    });

    it('the default tag generator yields 4 digits', () => {
      const real = new Lobby();
      const a = real.connect();
      real.register(a, 'Alice');
      expect(real.viewFor(a).you.tag).toMatch(/^\d{4}$/);
    });

    it('register rejects an empty name', () => {
      const a = lobby.connect();
      expect(lobby.register(a, '   ')).toMatch(/name/i);
    });

    it('register truncates names to 24 characters', () => {
      const a = lobby.connect();
      lobby.register(a, 'a'.repeat(30));
      expect(lobby.viewFor(a).you.name).toHaveLength(24);
    });

    it('two players may share a name but get different tags', () => {
      const tags = ['0007', '0007', '0042'];
      lobby = new Lobby(makeCounter(), clock.now, () => tags.shift() ?? '9999');
      const a = join('Alice');
      const b = join('Alice');
      expect(lobby.viewFor(a).you.tag).toBe('0007');
      expect(lobby.viewFor(b).you.tag).toBe('0042'); // 0007 was retried
    });

    it('a player sees other registered players with their tags, not themselves', () => {
      const a = join('Alice');
      join('Bob');
      lobby.connect(); // unregistered: invisible
      const view = lobby.viewFor(a);
      expect(view.players).toEqual([{ id: 'id2', name: 'Bob', tag: '0002', status: 'idle' }]);
    });

    it('onlineCount counts registered players, including you, even before you register', () => {
      join('Alice');
      join('Bob');
      const c = lobby.connect();
      expect(lobby.viewFor(c).onlineCount).toBe(2);
      lobby.register(c, 'Carol');
      expect(lobby.viewFor(c).onlineCount).toBe(3);
    });
  });

  describe('invites', () => {
    it('shows up under received for the target and sent for the sender, with the TTL', () => {
      const a = join('Alice');
      const b = join('Bob');
      const inviteId = inviteFrom(a, b);
      expect(lobby.viewFor(b).invites).toEqual({
        sent: [],
        received: [{ inviteId, name: 'Alice', tag: '0001', expiresIn: INVITE_TTL_MS }],
      });
      expect(lobby.viewFor(a).invites).toEqual({
        sent: [{ inviteId, name: 'Bob', tag: '0002', expiresIn: INVITE_TTL_MS }],
        received: [],
      });
    });

    it('expiresIn counts down with the clock', () => {
      const a = join('Alice');
      const b = join('Bob');
      inviteFrom(a, b);
      clock.advance(10_000);
      expect(lobby.viewFor(b).invites.received[0].expiresIn).toBe(INVITE_TTL_MS - 10_000);
    });

    it('rejects inviting yourself, an unregistered player, or a busy player', () => {
      const a = join('Alice');
      const b = join('Bob');
      const c = join('Carol');
      const ghost = lobby.connect();
      expect(lobby.invite(a, a)).toMatch(/yourself/i);
      expect(lobby.invite(a, ghost)).toMatch(/not available/i);
      startMatch(a, b);
      expect(lobby.invite(c, a)).toMatch(/busy/i);
    });

    it('rejects a second pending invite to the same player', () => {
      const a = join('Alice');
      const b = join('Bob');
      inviteFrom(a, b);
      expect(lobby.invite(a, b)).toMatch(/already pending/i);
    });

    it('allows several sent and received invites at once', () => {
      const a = join('Alice');
      const b = join('Bob');
      const c = join('Carol');
      inviteFrom(a, b);
      inviteFrom(a, c);
      inviteFrom(c, a);
      expect(lobby.viewFor(a).invites.sent.map((i) => i.name)).toEqual(['Bob', 'Carol']);
      expect(lobby.viewFor(a).invites.received.map((i) => i.name)).toEqual(['Carol']);
    });

    it('cancelInvite removes it and tells the target', () => {
      const a = join('Alice');
      const b = join('Bob');
      const inviteId = inviteFrom(a, b);
      expect(lobby.cancelInvite(a, inviteId)).toBeNull();
      expect(lobby.viewFor(a).invites.sent).toEqual([]);
      const bv = lobby.viewFor(b);
      expect(bv.invites.received).toEqual([]);
      expect(bv.events).toEqual([{ type: 'invite-cancelled', name: 'Alice', tag: '0001', reason: 'by-sender' }]);
    });

    it('only the sender can cancel', () => {
      const a = join('Alice');
      const b = join('Bob');
      const inviteId = inviteFrom(a, b);
      expect(lobby.cancelInvite(b, inviteId)).toMatch(/not found/i);
      expect(lobby.viewFor(b).invites.received).toHaveLength(1);
    });

    it('declineInvite removes it and tells the sender', () => {
      const a = join('Alice');
      const b = join('Bob');
      const inviteId = inviteFrom(a, b);
      expect(lobby.declineInvite(b, inviteId)).toBeNull();
      expect(lobby.viewFor(a).events).toEqual([{ type: 'invite-declined', name: 'Bob', tag: '0002' }]);
      expect(lobby.viewFor(b).invites.received).toEqual([]);
    });

    it('expires after INVITE_TTL_MS on sweep and tells the sender', () => {
      const a = join('Alice');
      const b = join('Bob');
      inviteFrom(a, b);
      clock.advance(INVITE_TTL_MS - 1);
      lobby.touch(a);
      lobby.touch(b);
      lobby.sweep();
      expect(lobby.viewFor(b).invites.received).toHaveLength(1);
      clock.advance(1);
      lobby.touch(a);
      lobby.touch(b);
      lobby.sweep();
      expect(lobby.viewFor(b).invites.received).toEqual([]);
      expect(lobby.viewFor(a).events).toEqual([{ type: 'invite-expired', name: 'Bob', tag: '0002' }]);
    });

    it('an expired invite cannot be accepted', () => {
      const a = join('Alice');
      const b = join('Bob');
      const inviteId = inviteFrom(a, b);
      clock.advance(INVITE_TTL_MS);
      lobby.touch(a);
      lobby.touch(b);
      lobby.sweep();
      expect(lobby.acceptInvite(b, inviteId)).toMatch(/not found/i);
    });

    it('events are delivered once', () => {
      const a = join('Alice');
      const b = join('Bob');
      lobby.declineInvite(b, inviteFrom(a, b));
      expect(lobby.viewFor(a).events).toHaveLength(1);
      expect(lobby.viewFor(a).events).toEqual([]);
    });
  });

  describe('matches', () => {
    // X(a) wins the top row: a0 b3 a1 b4 a2
    function playXWin(a: string, b: string): void {
      lobby.makeMove(a, 0);
      lobby.makeMove(b, 3);
      lobby.makeMove(a, 1);
      lobby.makeMove(b, 4);
      expect(lobby.makeMove(a, 2)).toBeNull();
    }
    // Full board, nobody wins: X 0,2,3,7,8  O 1,4,5,6
    function playDraw(a: string, b: string): void {
      for (const [who, cell] of [
        [a, 0],
        [b, 1],
        [a, 2],
        [b, 4],
        [a, 3],
        [b, 5],
        [a, 7],
        [b, 6],
        [a, 8],
      ] as const) {
        expect(lobby.makeMove(who, cell)).toBeNull();
      }
    }

    it('accepting an invite starts round 1: inviter is X and moves first, scores are 0', () => {
      const a = join('Alice');
      const b = join('Bob');
      startMatch(a, b);
      const av = lobby.viewFor(a);
      const bv = lobby.viewFor(b);
      expect(av.phase).toBe('game');
      expect(av.game).toMatchObject({
        round: 1,
        yourMark: 'X',
        yourTurn: true,
        opponentName: 'Bob',
        opponentTag: '0002',
        yourScore: 0,
        opponentScore: 0,
        over: false,
        result: null,
      });
      expect(bv.game).toMatchObject({ yourMark: 'O', yourTurn: false, opponentName: 'Alice' });
      expect(lobby.viewFor(a).players[0].status).toBe('busy');
    });

    it('starting a match auto-cancels the other invites of both players and notifies the other parties', () => {
      const a = join('Alice');
      const b = join('Bob');
      const c = join('Carol');
      const d = join('Dave');
      const aToC = inviteFrom(a, c); // a's other sent invite
      inviteFrom(d, b); // b's other received invite
      startMatch(a, b);
      expect(lobby.viewFor(a).invites).toEqual({ sent: [], received: [] });
      expect(lobby.viewFor(b).invites).toEqual({ sent: [], received: [] });
      expect(lobby.viewFor(c).events).toEqual([
        { type: 'invite-cancelled', name: 'Alice', tag: '0001', reason: 'in-match' },
      ]);
      expect(lobby.viewFor(d).events).toEqual([
        { type: 'invite-cancelled', name: 'Bob', tag: '0002', reason: 'in-match' },
      ]);
      expect(lobby.viewFor(d).invites.sent).toEqual([]);
      // c's stale card (not yet refreshed by a poll) cannot be accepted any more
      expect(lobby.acceptInvite(c, aToC)).toMatch(/not found/i);
    });

    it('mutual invites: accepting either starts the match and silently drops the other', () => {
      const a = join('Alice');
      const b = join('Bob');
      inviteFrom(a, b);
      const fromB = inviteFrom(b, a);
      expect(lobby.acceptInvite(a, fromB)).toBeNull();
      expect(lobby.viewFor(a).phase).toBe('game');
      expect(lobby.viewFor(a).events).toEqual([]);
      expect(lobby.viewFor(b).events).toEqual([]);
      expect(lobby.viewFor(b).invites).toEqual({ sent: [], received: [] });
    });

    it('a third party with mutual invites gets a single in-match event', () => {
      const a = join('Alice');
      const b = join('Bob');
      const c = join('Carol');
      inviteFrom(a, c);
      inviteFrom(c, a);
      startMatch(a, b);
      expect(lobby.viewFor(c).events).toEqual([
        { type: 'invite-cancelled', name: 'Alice', tag: '0001', reason: 'in-match' },
      ]);
      expect(lobby.viewFor(c).invites).toEqual({ sent: [], received: [] });
    });

    it('rejects a move out of turn, on an occupied cell, or when not in a game', () => {
      const a = join('Alice');
      const b = join('Bob');
      const c = join('Carol');
      startMatch(a, b);
      expect(lobby.makeMove(b, 0)).toMatch(/turn/i);
      expect(lobby.makeMove(a, 0)).toBeNull();
      expect(lobby.makeMove(b, 0)).toMatch(/taken/i);
      expect(lobby.makeMove(c, 0)).toMatch(/not in a game/i);
    });

    it('a win ends the round, increments the winner score and is visible to both', () => {
      const a = join('Alice');
      const b = join('Bob');
      startMatch(a, b);
      playXWin(a, b);
      const av = lobby.viewFor(a).game!;
      const bv = lobby.viewFor(b).game!;
      expect(av).toMatchObject({
        over: true,
        result: { status: 'won', winner: 'X' },
        yourScore: 1,
        opponentScore: 0,
        yourTurn: false,
      });
      expect(bv).toMatchObject({ over: true, yourScore: 0, opponentScore: 1, yourTurn: false });
      expect(lobby.makeMove(b, 5)).toMatch(/over/i);
    });

    it('a draw ends the round without changing the score', () => {
      const a = join('Alice');
      const b = join('Bob');
      startMatch(a, b);
      playDraw(a, b);
      expect(lobby.viewFor(a).game).toMatchObject({
        over: true,
        result: { status: 'draw' },
        yourScore: 0,
        opponentScore: 0,
      });
    });

    it('after REMATCH_DELAY_MS a sweep starts the next round with marks swapped and the score kept', () => {
      const a = join('Alice');
      const b = join('Bob');
      startMatch(a, b);
      playXWin(a, b);
      clock.advance(REMATCH_DELAY_MS - 1);
      lobby.sweep();
      expect(lobby.viewFor(a).game).toMatchObject({ round: 1, over: true });
      clock.advance(1);
      lobby.sweep();
      const av = lobby.viewFor(a).game!;
      const bv = lobby.viewFor(b).game!;
      expect(av).toMatchObject({ round: 2, over: false, result: null, yourMark: 'O', yourTurn: false, yourScore: 1 });
      expect(bv).toMatchObject({ round: 2, yourMark: 'X', yourTurn: true, opponentScore: 1 });
      expect(av.board).toEqual(Array(9).fill(null));
      expect(lobby.makeMove(b, 4)).toBeNull(); // b is X now and moves first
    });

    it('marks alternate every round', () => {
      const a = join('Alice');
      const b = join('Bob');
      startMatch(a, b);
      playXWin(a, b);
      clock.advance(REMATCH_DELAY_MS);
      lobby.sweep();
      playXWin(b, a); // b is X in round 2
      clock.advance(REMATCH_DELAY_MS);
      lobby.sweep();
      expect(lobby.viewFor(a).game).toMatchObject({ round: 3, yourMark: 'X', yourScore: 1, opponentScore: 1 });
    });

    it('leaving ends the match for both, whether or not the round is over', () => {
      const a = join('Alice');
      const b = join('Bob');
      startMatch(a, b);
      lobby.makeMove(a, 0);
      expect(lobby.leave(a)).toBeNull();
      expect(lobby.viewFor(a).phase).toBe('lobby');
      const bv = lobby.viewFor(b);
      expect(bv.phase).toBe('lobby');
      expect(bv.events).toEqual([{ type: 'opponent-left' }]);
      expect(lobby.viewFor(b).events).toEqual([]); // drained
      expect(lobby.viewFor(a).players[0].status).toBe('idle');
    });

    it('leaving during the rematch pause also ends the match', () => {
      const a = join('Alice');
      const b = join('Bob');
      startMatch(a, b);
      playXWin(a, b);
      lobby.leave(b);
      const av = lobby.viewFor(a);
      expect(av.phase).toBe('lobby');
      expect(av.events).toEqual([{ type: 'opponent-left' }]);
      clock.advance(REMATCH_DELAY_MS);
      lobby.sweep(); // nothing left to advance
      expect(lobby.viewFor(a).game).toBeNull();
    });

    it('leave when not in a match is a no-op', () => {
      const a = join('Alice');
      expect(lobby.leave(a)).toBeNull();
    });

    describe('model opponent', () => {
      it('startModelMatch puts the player in a game against Model#AI as X', () => {
        const a = join('Alice');
        expect(lobby.startModelMatch(a)).toBeNull();
        const av = lobby.viewFor(a);
        expect(av.phase).toBe('game');
        expect(av.game).toMatchObject({
          round: 1,
          yourMark: 'X',
          yourTurn: true,
          opponentName: 'Model',
          opponentTag: 'AI',
          opponentKind: 'model',
          yourScore: 0,
          opponentScore: 0,
        });
        expect(av.game!.modelPlayerId).toEqual(expect.any(String));
        expect(lobby.isModelPlayer(av.game!.modelPlayerId!)).toBe(true);
        expect(lobby.isModelPlayer(a)).toBe(false);
      });

      it('requires a registered player who is not in a match', () => {
        const c = lobby.connect();
        expect(lobby.startModelMatch(c)).toMatch(/register first/i);
        const a = join('Alice');
        lobby.startModelMatch(a);
        expect(lobby.startModelMatch(a)).toMatch(/already in a match/i);
      });

      it('the model player is hidden from the lobby and cannot be invited', () => {
        const a = join('Alice');
        const b = join('Bob');
        lobby.startModelMatch(a);
        const modelId = lobby.viewFor(a).game!.modelPlayerId!;
        const bv = lobby.viewFor(b);
        expect(bv.onlineCount).toBe(2);
        expect(bv.players).toEqual([{ id: a, name: 'Alice', tag: '0001', status: 'busy' }]);
        expect(lobby.invite(b, modelId)).toMatch(/not available/i);
      });

      it('starting a model match auto-cancels pending invites like a human match', () => {
        const a = join('Alice');
        const b = join('Bob');
        inviteFrom(a, b);
        lobby.startModelMatch(a);
        const bv = lobby.viewFor(b);
        expect(bv.invites.received).toEqual([]);
        expect(bv.events).toEqual([{ type: 'invite-cancelled', name: 'Alice', tag: '0001', reason: 'in-match' }]);
      });

      it('the model moves through makeMove with its own id; rounds, score and rematch work as usual', () => {
        const a = join('Alice');
        lobby.startModelMatch(a);
        const m = lobby.viewFor(a).game!.modelPlayerId!;
        expect(lobby.makeMove(m, 0)).toMatch(/turn/i);
        playXWin(a, m);
        expect(lobby.viewFor(a).game).toMatchObject({ over: true, yourScore: 1, opponentScore: 0 });
        expect(lobby.viewFor(m).game).toMatchObject({
          yourScore: 0,
          opponentScore: 1,
          opponentName: 'Alice',
          opponentKind: 'human',
          modelPlayerId: null,
        });
        clock.advance(REMATCH_DELAY_MS);
        lobby.sweep();
        expect(lobby.viewFor(a).game).toMatchObject({ round: 2, yourMark: 'O', yourTurn: false });
        expect(lobby.makeMove(m, 4)).toBeNull();
      });

      it('the model player is exempt from presence but dies with the match', () => {
        const a = join('Alice');
        lobby.startModelMatch(a);
        const m = lobby.viewFor(a).game!.modelPlayerId!;
        clock.advance(PRESENCE_TTL_MS - 1);
        lobby.touch(a);
        clock.advance(2);
        lobby.sweep();
        expect(lobby.viewFor(a).phase).toBe('game');
        expect(lobby.makeMove(m, 0)).toMatch(/turn/i);
        lobby.leave(a);
        expect(lobby.viewFor(a).phase).toBe('lobby');
        expect(lobby.isModelPlayer(m)).toBe(false);
        expect(lobby.makeMove(m, 0)).toMatch(/not in a game/i);
      });

      it('sweeping the owner removes the model player too', () => {
        const a = join('Alice');
        lobby.startModelMatch(a);
        const m = lobby.viewFor(a).game!.modelPlayerId!;
        clock.advance(PRESENCE_TTL_MS + 1);
        lobby.sweep();
        expect(lobby.viewFor('nobody').onlineCount).toBe(0);
        expect(lobby.isModelPlayer(m)).toBe(false);
      });
    });
  });

  describe('presence', () => {
    it('sweep removes a player idle past the TTL and ends their match', () => {
      const a = join('Alice');
      const b = join('Bob');
      join('Carol');
      startMatch(a, b);
      clock.advance(PRESENCE_TTL_MS + 1);
      lobby.touch(b);
      lobby.touch('id3');
      lobby.sweep();
      const bv = lobby.viewFor(b);
      expect(bv.phase).toBe('lobby');
      expect(bv.events).toEqual([{ type: 'opponent-left' }]);
      expect(lobby.viewFor(a).phase).toBe('name'); // a was removed entirely
      expect(lobby.viewFor(b).onlineCount).toBe(2);
    });

    it('sweep drops the pending invites of a removed player without an event', () => {
      const a = join('Alice');
      const c = join('Carol');
      inviteFrom(c, a);
      inviteFrom(a, c);
      clock.advance(PRESENCE_TTL_MS + 1);
      lobby.touch(c);
      lobby.sweep();
      const cv = lobby.viewFor(c);
      expect(cv.invites).toEqual({ sent: [], received: [] });
      expect(cv.events).toEqual([]);
    });

    it('reconnect re-creates a swept id in the name phase without counting it as online', () => {
      const a = join('Alice');
      const b = join('Bob');
      clock.advance(PRESENCE_TTL_MS + 1);
      lobby.touch(b);
      lobby.sweep();
      expect(lobby.reconnect(a)).toBe(true);
      const av = lobby.viewFor(a);
      expect(av.phase).toBe('name');
      expect(av.you).toEqual({ id: a, name: null, tag: null });
      expect(av.onlineCount).toBe(1);
      expect(lobby.register(a, 'Alice')).toBeNull();
      expect(lobby.viewFor(a).phase).toBe('lobby');
      expect(lobby.viewFor(b).onlineCount).toBe(2);
    });

    it('reconnect on a live player only refreshes presence', () => {
      const a = join('Alice');
      clock.advance(PRESENCE_TTL_MS - 1);
      expect(lobby.reconnect(a)).toBe(false);
      clock.advance(PRESENCE_TTL_MS - 1);
      lobby.sweep();
      expect(lobby.viewFor(a).phase).toBe('lobby');
      expect(lobby.viewFor(a).you.name).toBe('Alice');
    });
  });

  describe('session close', () => {
    it('close ends the match for the opponent, removes the player and reports the closed phase', () => {
      const a = join('Alice');
      const b = join('Bob');
      startMatch(a, b);
      expect(lobby.close(a)).toBeNull();
      expect(lobby.viewFor(a).phase).toBe('closed');
      const bv = lobby.viewFor(b);
      expect(bv.phase).toBe('lobby');
      expect(bv.events).toEqual([{ type: 'opponent-left' }]);
      expect(bv.onlineCount).toBe(1);
    });

    it('close drops the pending invites of the player', () => {
      const a = join('Alice');
      const b = join('Bob');
      inviteFrom(a, b);
      lobby.close(a);
      expect(lobby.viewFor(b).invites.received).toEqual([]);
    });

    it('a closed id is never re-created by reconnect', () => {
      const a = join('Alice');
      lobby.close(a);
      expect(lobby.reconnect(a)).toBe(false);
      expect(lobby.viewFor(a).phase).toBe('closed');
      expect(lobby.register(a, 'Alice')).toMatch(/unknown player/i);
      expect(lobby.viewFor(a).onlineCount).toBe(0);
    });

    it('close on an unknown id still records it', () => {
      expect(lobby.close('ghost')).toBeNull();
      expect(lobby.reconnect('ghost')).toBe(false);
      expect(lobby.viewFor('ghost').phase).toBe('closed');
    });

    it('closed ids are forgotten after CLOSED_TTL_MS', () => {
      const a = join('Alice');
      lobby.close(a);
      clock.advance(CLOSED_TTL_MS - 1);
      lobby.sweep();
      expect(lobby.viewFor(a).phase).toBe('closed');
      clock.advance(1);
      lobby.sweep();
      expect(lobby.viewFor(a).phase).toBe('name');
      expect(lobby.reconnect(a)).toBe(true);
    });

    it('the closed map is capped; the oldest id is evicted first', () => {
      for (let i = 0; i <= MAX_CLOSED_IDS; i++) {
        lobby.close(`c${i}`);
      }
      expect(lobby.reconnect('c0')).toBe(true);
      expect(lobby.reconnect(`c${MAX_CLOSED_IDS}`)).toBe(false);
    });
  });
});
