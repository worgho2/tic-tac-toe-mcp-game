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
  CLOSED_TTL_MS,
  type GameView,
  INVITE_TTL_MS,
  type InviteView,
  type LobbyEvent,
  MAX_CLOSED_IDS,
  MAX_NAME,
  MODEL_NAME,
  MODEL_TAG,
  type Phase,
  type PlayerId,
  type PlayerKind,
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
  kind: PlayerKind;
  /** For model players: the human that started the match. */
  ownerId: PlayerId | null;
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
  /** Ids closed by the player, with the close time. `reconnect` refuses them until `CLOSED_TTL_MS` passes. */
  private closed = new Map<PlayerId, number>();

  constructor(
    private genId: () => string = defaultGenId,
    private clock: () => number = () => Date.now(),
    private genTag: () => string = defaultGenTag,
  ) {}

  connect(): PlayerId {
    const id = this.genId();
    this.players.set(id, this.newHuman(id));
    return id;
  }

  touch(id: PlayerId): void {
    const p = this.players.get(id);
    if (p) p.lastSeen = this.clock();
  }

  /**
   * Heartbeat that survives presence loss. A known id is touched; an unknown one (typically a widget that
   * reloaded after its player was swept) is re-created in the name phase so it can register again. Returns
   * true when a record was created. Ids are server-generated and unguessable, so accepting one back is no
   * more exposed than `join_game`, which anyone can call.
   */
  reconnect(id: PlayerId): boolean {
    if (this.players.has(id)) {
      this.touch(id);
      return false;
    }
    if (this.closed.has(id)) return false;
    this.players.set(id, this.newHuman(id));
    return true;
  }

  /** Presence removal, invite expiry and automatic rematches. Idempotent; safe to call on every request. */
  sweep(): void {
    const now = this.clock();
    for (const p of [...this.players.values()]) {
      if (p.kind === 'human' && p.lastSeen < now - PRESENCE_TTL_MS) this.removePlayer(p.id);
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
    // Insertion order == closedAt order, so the first non-expired entry means every later one is too.
    for (const [id, closedAt] of this.closed) {
      if (now - closedAt < CLOSED_TTL_MS) break;
      this.closed.delete(id);
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
    if (!target?.name || target.kind === 'model') return 'player not available';
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
    this.createMatch(a, b);
    return null;
  }

  /** Starts a match against a hidden model player owned by `humanId`. The human is X in round 1. */
  startModelMatch(humanId: PlayerId): string | null {
    const human = this.players.get(humanId);
    if (!human?.name) return 'register first';
    if (human.matchId) return 'you are already in a match';
    const model: PlayerState = {
      id: this.genId(),
      name: MODEL_NAME,
      tag: MODEL_TAG,
      kind: 'model',
      ownerId: humanId,
      matchId: null,
      lastSeen: this.clock(),
      events: [],
    };
    this.players.set(model.id, model);
    this.createMatch(human, model);
    return null;
  }

  isModelPlayer(id: PlayerId): boolean {
    return this.players.get(id)?.kind === 'model';
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

  /**
   * Ends the session for good: any match ends (the opponent gets `opponent-left`), invites are dropped,
   * the player is removed and the id is remembered so a stale widget replaying it stays closed.
   */
  close(id: PlayerId): null {
    this.removePlayer(id);
    this.closed.delete(id);
    if (this.closed.size >= MAX_CLOSED_IDS) {
      const oldest = this.closed.keys().next().value;
      if (oldest !== undefined) this.closed.delete(oldest);
    }
    this.closed.set(id, this.clock());
    return null;
  }

  viewFor(id: PlayerId): PlayerView {
    const p = this.players.get(id);
    if (!p) {
      return {
        phase: this.closed.has(id) ? 'closed' : 'name',
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

  private newHuman(id: PlayerId): PlayerState {
    return {
      id,
      name: null,
      tag: null,
      kind: 'human',
      ownerId: null,
      matchId: null,
      lastSeen: this.clock(),
      events: [],
    };
  }

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
    const notified = new Set<PlayerId>();
    for (const [invId, inv] of [...this.invites]) {
      if (inv.fromId !== id && inv.toId !== id) continue;
      this.invites.delete(invId);
      const other = inv.fromId === id ? inv.toId : inv.fromId;
      if (other === partnerId) continue;
      if (notified.has(other)) continue;
      notified.add(other);
      this.pushEvent(other, { type: 'invite-cancelled', ...this.handleOf(id), reason: 'in-match' });
    }
  }

  /** Starts round 1 with `a` as X, then drops every other pending invite of both players. */
  private createMatch(a: PlayerState, b: PlayerState): void {
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
    for (const pid of match.players) {
      if (this.players.get(pid)?.kind === 'model') this.players.delete(pid);
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
    for (const p of this.players.values()) if (p.name && p.kind === 'human') n += 1;
    return n;
  }

  private publicPlayers(selfId: PlayerId): PublicPlayer[] {
    const out: PublicPlayer[] = [];
    for (const p of this.players.values()) {
      if (p.id === selfId || !p.name || !p.tag || p.kind === 'model') continue;
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
    const oppKind: PlayerKind = this.players.get(oppId)?.kind ?? 'human';
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
      opponentKind: oppKind,
      modelPlayerId: oppKind === 'model' ? oppId : null,
    };
  }
}
