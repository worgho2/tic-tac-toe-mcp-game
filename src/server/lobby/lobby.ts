import {
  applyMove,
  type Board,
  createBoard,
  type GameResult,
  getResult,
  InvalidMoveError,
  type Mark,
} from '../game/game.js';
import {
  type GameView,
  INVITE_TTL_MS,
  type InviteView,
  type LobbyEvent,
  MAX_NAME,
  type Phase,
  type PlayerId,
  type PlayerView,
  PRESENCE_TTL_MS,
  type PublicPlayer,
  REMATCH_DELAY_MS,
} from './types.js';

export * from './types.js';

interface PlayerState {
  id: PlayerId;
  name: string | null;
  tag: string | null;
  matchId: string | null;
  lastSeen: number;
  events: LobbyEvent[];
}
interface Invite {
  id: string;
  fromId: PlayerId;
  toId: PlayerId;
  createdAt: number;
}
interface Match {
  id: string;
  players: [PlayerId, PlayerId];
  marks: Record<PlayerId, Mark>;
  score: Record<PlayerId, number>;
  round: number;
  board: Board;
  turn: Mark;
  over: boolean;
  result: GameResult | null;
  /** Set when a round ends; the next round starts REMATCH_DELAY_MS later. */
  endedAt: number | null;
}

function defaultGenId(): string {
  return Math.random().toString(36).slice(2, 10);
}
function defaultGenTag(): string {
  return String(Math.floor(Math.random() * 10_000)).padStart(4, '0');
}

/**
 * In-memory lobby: players, invites, matches and presence. Mutations return an error string or `null`;
 * `viewFor` snapshots the state for one player. Time-based transitions (presence, invite expiry, rematch)
 * happen in `sweep()`, which the tool handlers call on every request.
 */
export class Lobby {
  private players = new Map<PlayerId, PlayerState>();
  private invites = new Map<string, Invite>();
  private matches = new Map<string, Match>();

  constructor(
    private genId: () => string = defaultGenId,
    private clock: () => number = () => Date.now(),
    private genTag: () => string = defaultGenTag,
  ) {}

  connect(): PlayerId {
    const id = this.genId();
    this.players.set(id, { id, name: null, tag: null, matchId: null, lastSeen: this.clock(), events: [] });
    return id;
  }

  touch(id: PlayerId): void {
    const p = this.players.get(id);
    if (p) p.lastSeen = this.clock();
  }

  /** Presence removal, invite expiry and automatic rematches. Idempotent; safe to call on every request. */
  sweep(): void {
    const now = this.clock();
    for (const p of [...this.players.values()]) {
      if (p.lastSeen < now - PRESENCE_TTL_MS) this.removePlayer(p.id);
    }
    for (const [invId, inv] of [...this.invites]) {
      if (now - inv.createdAt >= INVITE_TTL_MS) {
        this.invites.delete(invId);
        this.pushEvent(inv.fromId, { type: 'invite-expired', ...this.handleOf(inv.toId) });
      }
    }
    for (const match of this.matches.values()) {
      if (match.endedAt !== null && now - match.endedAt >= REMATCH_DELAY_MS) this.startNextRound(match);
    }
  }

  register(id: PlayerId, name: string): string | null {
    const p = this.players.get(id);
    if (!p) return 'unknown player';
    const trimmed = name.trim().slice(0, MAX_NAME);
    if (!trimmed) return 'name required';
    p.name = trimmed;
    p.tag = this.uniqueTag(id, trimmed);
    return null;
  }

  invite(fromId: PlayerId, targetId: PlayerId): string | null {
    if (fromId === targetId) return 'cannot invite yourself';
    const from = this.players.get(fromId);
    const target = this.players.get(targetId);
    if (!from?.name) return 'register first';
    if (!target?.name) return 'player not available';
    if (from.matchId || target.matchId) return 'player is busy';
    for (const inv of this.invites.values()) {
      if (inv.fromId === fromId && inv.toId === targetId) return 'invite already pending';
    }
    const invite: Invite = { id: this.genId(), fromId, toId: targetId, createdAt: this.clock() };
    this.invites.set(invite.id, invite);
    return null;
  }

  cancelInvite(byId: PlayerId, inviteId: string): string | null {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.fromId !== byId) return 'invite not found';
    this.invites.delete(inviteId);
    this.pushEvent(invite.toId, { type: 'invite-cancelled', ...this.handleOf(byId), reason: 'by-sender' });
    return null;
  }

  declineInvite(byId: PlayerId, inviteId: string): string | null {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.toId !== byId) return null;
    this.invites.delete(inviteId);
    this.pushEvent(invite.fromId, { type: 'invite-declined', ...this.handleOf(byId) });
    return null;
  }

  acceptInvite(byId: PlayerId, inviteId: string): string | null {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.toId !== byId) return 'invite not found';
    this.invites.delete(inviteId);
    const a = this.players.get(invite.fromId);
    const b = this.players.get(byId);
    if (!a?.name) return 'player no longer available';
    // Defensive: invites of a player entering a match are auto-cancelled, so this is only reachable
    // if a future code path leaves one behind. The copy matches the spec.
    if (a.matchId) return `${a.name}#${a.tag} is in another match`;
    if (!b?.name) return 'register first';
    if (b.matchId) return 'you are already in a match';
    const match: Match = {
      id: this.genId(),
      players: [a.id, b.id],
      marks: { [a.id]: 'X', [b.id]: 'O' },
      score: { [a.id]: 0, [b.id]: 0 },
      round: 1,
      board: createBoard(),
      turn: 'X',
      over: false,
      result: null,
      endedAt: null,
    };
    this.matches.set(match.id, match);
    a.matchId = match.id;
    b.matchId = match.id;
    this.cancelInvitesOf(a.id, b.id);
    this.cancelInvitesOf(b.id, a.id);
    return null;
  }

  makeMove(id: PlayerId, cell: number): string | null {
    const p = this.players.get(id);
    if (!p?.matchId) return 'not in a game';
    const match = this.matches.get(p.matchId);
    if (!match) return 'game not found';
    if (match.over) return 'round is over';
    const mark = match.marks[id];
    if (match.turn !== mark) return 'not your turn';
    try {
      match.board = applyMove(match.board, cell, mark);
    } catch (err) {
      if (err instanceof InvalidMoveError) return err.message;
      throw err;
    }
    const result = getResult(match.board);
    if (result.status === 'ongoing') {
      match.turn = mark === 'X' ? 'O' : 'X';
      return null;
    }
    match.over = true;
    match.result = result;
    match.endedAt = this.clock();
    if (result.status === 'won') match.score[id] += 1;
    return null;
  }

  leave(id: PlayerId): string | null {
    const p = this.players.get(id);
    if (!p?.matchId) return null;
    this.endMatch(p.matchId, id);
    return null;
  }

  viewFor(id: PlayerId): PlayerView {
    const p = this.players.get(id);
    if (!p) {
      return {
        phase: 'name',
        you: { id, name: null, tag: null },
        onlineCount: this.onlineCount(),
        players: [],
        invites: { sent: [], received: [] },
        game: null,
        events: [],
        error: null,
      };
    }
    const events = p.events;
    p.events = [];
    const match = p.matchId ? (this.matches.get(p.matchId) ?? null) : null;
    const phase: Phase = !p.name ? 'name' : match ? 'game' : 'lobby';
    return {
      phase,
      you: { id: p.id, name: p.name, tag: p.tag },
      onlineCount: this.onlineCount(),
      players: this.publicPlayers(id),
      invites: this.invitesFor(id),
      game: match ? this.gameView(match, id) : null,
      events,
      error: null,
    };
  }

  // ---- internals ----

  private uniqueTag(selfId: PlayerId, name: string): string {
    let tag = this.genTag();
    while (this.handleTaken(selfId, name, tag)) tag = this.genTag();
    return tag;
  }

  private handleTaken(selfId: PlayerId, name: string, tag: string): boolean {
    for (const p of this.players.values()) {
      if (p.id !== selfId && p.name === name && p.tag === tag) return true;
    }
    return false;
  }

  private handleOf(id: PlayerId): { name: string; tag: string } {
    const p = this.players.get(id);
    return { name: p?.name ?? 'unknown', tag: p?.tag ?? '0000' };
  }

  private pushEvent(id: PlayerId, event: LobbyEvent): void {
    this.players.get(id)?.events.push(event);
  }

  /** Drops every pending invite involving `id` except those with `partnerId`, notifying the other party. */
  private cancelInvitesOf(id: PlayerId, partnerId: PlayerId): void {
    for (const [invId, inv] of [...this.invites]) {
      if (inv.fromId !== id && inv.toId !== id) continue;
      this.invites.delete(invId);
      const other = inv.fromId === id ? inv.toId : inv.fromId;
      if (other === partnerId) continue;
      this.pushEvent(other, { type: 'invite-cancelled', ...this.handleOf(id), reason: 'in-match' });
    }
  }

  private startNextRound(match: Match): void {
    const [a, b] = match.players;
    match.marks = { [a]: match.marks[b], [b]: match.marks[a] };
    match.board = createBoard();
    match.turn = 'X';
    match.round += 1;
    match.over = false;
    match.result = null;
    match.endedAt = null;
  }

  /** Ends the match for both players; everyone but `leaverId` gets an `opponent-left` event. */
  private endMatch(matchId: string, leaverId: PlayerId): void {
    const leaver = this.players.get(leaverId);
    if (leaver) leaver.matchId = null;
    const match = this.matches.get(matchId);
    if (!match) return;
    this.matches.delete(matchId);
    for (const pid of match.players) {
      if (pid === leaverId) continue;
      const opp = this.players.get(pid);
      if (opp && opp.matchId === matchId) {
        opp.matchId = null;
        opp.events.push({ type: 'opponent-left' });
      }
    }
  }

  private removePlayer(id: PlayerId): void {
    const p = this.players.get(id);
    if (!p) return;
    if (p.matchId) this.endMatch(p.matchId, id);
    for (const [invId, inv] of [...this.invites]) {
      if (inv.fromId === id || inv.toId === id) this.invites.delete(invId);
    }
    this.players.delete(id);
  }

  private onlineCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.name) n += 1;
    return n;
  }

  private publicPlayers(selfId: PlayerId): PublicPlayer[] {
    const out: PublicPlayer[] = [];
    for (const p of this.players.values()) {
      if (p.id === selfId || !p.name || !p.tag) continue;
      out.push({ id: p.id, name: p.name, tag: p.tag, status: p.matchId ? 'busy' : 'idle' });
    }
    return out;
  }

  private invitesFor(id: PlayerId): { sent: InviteView[]; received: InviteView[] } {
    const now = this.clock();
    const sent: InviteView[] = [];
    const received: InviteView[] = [];
    for (const inv of this.invites.values()) {
      const expiresIn = inv.createdAt + INVITE_TTL_MS - now;
      if (expiresIn <= 0) continue;
      if (inv.fromId === id) sent.push({ inviteId: inv.id, ...this.handleOf(inv.toId), expiresIn });
      else if (inv.toId === id) received.push({ inviteId: inv.id, ...this.handleOf(inv.fromId), expiresIn });
    }
    return { sent, received };
  }

  private gameView(match: Match, id: PlayerId): GameView {
    const oppId = match.players.find((x) => x !== id)!;
    const opp = this.handleOf(oppId);
    return {
      round: match.round,
      board: match.board,
      yourMark: match.marks[id],
      yourTurn: !match.over && match.turn === match.marks[id],
      opponentName: opp.name,
      opponentTag: opp.tag,
      yourScore: match.score[id],
      opponentScore: match.score[oppId],
      over: match.over,
      result: match.result,
    };
  }
}
