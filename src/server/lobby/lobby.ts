import {
  applyMove,
  type Board,
  createBoard,
  type GameResult,
  getResult,
  InvalidMoveError,
  type Mark,
} from '../game/game.js';

export const PRESENCE_TTL_MS = 10000;
const MAX_NAME = 24;

export type PlayerId = string;
export type Phase = 'name' | 'lobby' | 'game';

export interface PublicPlayer {
  id: PlayerId;
  name: string;
  status: 'idle' | 'busy';
}

export interface GameView {
  board: Board;
  yourMark: Mark;
  yourTurn: boolean;
  opponentName: string;
  over: boolean;
  result: GameResult | null;
}

export interface PlayerView {
  phase: Phase;
  you: { id: PlayerId; name: string | null };
  players: PublicPlayer[];
  invite: { inviteId: string; fromName: string } | null;
  game: GameView | null;
  notice: string | null;
  error: string | null;
}

interface PlayerState {
  id: PlayerId;
  name: string | null;
  gameId: string | null;
  lastSeen: number;
  notice: string | null;
}
interface Invite {
  id: string;
  fromId: PlayerId;
  toId: PlayerId;
}
interface Game {
  id: string;
  board: Board;
  turn: Mark;
  marks: Record<PlayerId, Mark>;
  players: [PlayerId, PlayerId];
  over: boolean;
  result: GameResult | null;
}

function defaultGenId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class Lobby {
  private players = new Map<PlayerId, PlayerState>();
  private invites = new Map<string, Invite>();
  private games = new Map<string, Game>();

  constructor(
    private genId: () => string = defaultGenId,
    private clock: () => number = () => Date.now(),
  ) {}

  connect(): PlayerId {
    const id = this.genId();
    this.players.set(id, { id, name: null, gameId: null, lastSeen: this.clock(), notice: null });
    return id;
  }

  touch(id: PlayerId): void {
    const p = this.players.get(id);
    if (p) p.lastSeen = this.clock();
  }

  sweep(): void {
    const cutoff = this.clock() - PRESENCE_TTL_MS;
    for (const p of [...this.players.values()]) {
      if (p.lastSeen < cutoff) this.removePlayer(p.id, 'Your opponent left the game.');
    }
  }

  register(id: PlayerId, name: string): string | null {
    const p = this.players.get(id);
    if (!p) return 'unknown player';
    const trimmed = name.trim().slice(0, MAX_NAME);
    if (!trimmed) return 'name required';
    p.name = trimmed;
    return null;
  }

  invite(fromId: PlayerId, targetId: PlayerId): string | null {
    if (fromId === targetId) return 'cannot invite yourself';
    const from = this.players.get(fromId);
    const target = this.players.get(targetId);
    if (!from?.name) return 'register first';
    if (!target?.name) return 'player not available';
    if (from.gameId || target.gameId) return 'player is busy';
    const invite: Invite = { id: this.genId(), fromId, toId: targetId };
    this.invites.set(invite.id, invite);
    return null;
  }

  acceptInvite(byId: PlayerId, inviteId: string): string | null {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.toId !== byId) return 'invite not found';
    this.invites.delete(inviteId);
    const a = this.players.get(invite.fromId);
    const b = this.players.get(invite.toId);
    if (!a?.name || a.gameId || !b || !b.name || b.gameId) return 'player no longer available';
    const game: Game = {
      id: this.genId(),
      board: createBoard(),
      turn: 'X',
      marks: { [a.id]: 'X', [b.id]: 'O' },
      players: [a.id, b.id],
      over: false,
      result: null,
    };
    this.games.set(game.id, game);
    a.gameId = game.id;
    b.gameId = game.id;
    return null;
  }

  declineInvite(byId: PlayerId, inviteId: string): string | null {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.toId !== byId) return null;
    this.invites.delete(inviteId);
    const from = this.players.get(invite.fromId);
    if (from) from.notice = 'Your invite was declined.';
    return null;
  }

  makeMove(id: PlayerId, cell: number): string | null {
    const p = this.players.get(id);
    if (!p?.gameId) return 'not in a game';
    const game = this.games.get(p.gameId);
    if (!game) return 'game not found';
    if (game.over) return 'game is over';
    const mark = game.marks[id];
    if (game.turn !== mark) return 'not your turn';
    try {
      game.board = applyMove(game.board, cell, mark);
    } catch (err) {
      if (err instanceof InvalidMoveError) return err.message;
      throw err;
    }
    const result = getResult(game.board);
    if (result.status !== 'ongoing') {
      game.over = true;
      game.result = result;
    } else {
      game.turn = mark === 'X' ? 'O' : 'X';
    }
    return null;
  }

  leave(id: PlayerId): string | null {
    const p = this.players.get(id);
    if (!p?.gameId) return null;
    const game = this.games.get(p.gameId);
    p.gameId = null;
    if (!game) return null;
    if (!game.over) {
      const oppId = game.players.find((x) => x !== id);
      const opp = oppId ? this.players.get(oppId) : undefined;
      if (opp && opp.gameId === game.id) {
        opp.notice = 'Your opponent left the game.';
        opp.gameId = null;
      }
      this.games.delete(game.id);
    } else if (game.players.every((pid) => this.players.get(pid)?.gameId !== game.id)) {
      this.games.delete(game.id);
    }
    return null;
  }

  viewFor(id: PlayerId): PlayerView {
    const p = this.players.get(id);
    if (!p) {
      return {
        phase: 'name',
        you: { id, name: null },
        players: [],
        invite: null,
        game: null,
        notice: null,
        error: null,
      };
    }
    const notice = p.notice;
    p.notice = null;
    const game = p.gameId ? (this.games.get(p.gameId) ?? null) : null;
    const phase: Phase = !p.name ? 'name' : game ? 'game' : 'lobby';
    return {
      phase,
      you: { id: p.id, name: p.name },
      players: this.publicPlayers(id),
      invite: this.inviteFor(id),
      game: game ? this.gameView(game, id) : null,
      notice,
      error: null,
    };
  }

  private removePlayer(id: PlayerId, opponentNotice: string): void {
    const p = this.players.get(id);
    if (!p) return;
    if (p.gameId) {
      const game = this.games.get(p.gameId);
      if (game && !game.over) {
        const oppId = game.players.find((x) => x !== id);
        const opp = oppId ? this.players.get(oppId) : undefined;
        if (opp && opp.gameId === game.id) {
          opp.notice = opponentNotice;
          opp.gameId = null;
        }
        this.games.delete(game.id);
      } else if (game?.over && game.players.every((pid) => pid === id || this.players.get(pid)?.gameId !== game.id)) {
        this.games.delete(game.id);
      }
    }
    for (const [invId, inv] of this.invites) {
      if (inv.fromId === id || inv.toId === id) this.invites.delete(invId);
    }
    this.players.delete(id);
  }

  private publicPlayers(selfId: PlayerId): PublicPlayer[] {
    const out: PublicPlayer[] = [];
    for (const p of this.players.values()) {
      if (p.id === selfId || !p.name) continue;
      out.push({ id: p.id, name: p.name, status: p.gameId ? 'busy' : 'idle' });
    }
    return out;
  }

  private inviteFor(id: PlayerId): { inviteId: string; fromName: string } | null {
    for (const inv of this.invites.values()) {
      if (inv.toId === id) {
        const from = this.players.get(inv.fromId);
        if (from?.name) return { inviteId: inv.id, fromName: from.name };
      }
    }
    return null;
  }

  private gameView(game: Game, id: PlayerId): GameView {
    const oppId = game.players.find((x) => x !== id)!;
    const opp = this.players.get(oppId);
    return {
      board: game.board,
      yourMark: game.marks[id],
      yourTurn: !game.over && game.turn === game.marks[id],
      opponentName: opp?.name ?? 'opponent',
      over: game.over,
      result: game.result,
    };
  }
}
