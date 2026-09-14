import type { Board, GameResult, Mark } from '../game/game.js';

/** A player is dropped after this long without a tool call. */
export const PRESENCE_TTL_MS = 30_000;
/** Pending invites disappear after this long. */
export const INVITE_TTL_MS = 60_000;
/** A finished round stays visible this long before the next round starts. */
export const REMATCH_DELAY_MS = 3_000;
export const MAX_NAME = 24;

export type PlayerId = string;
export type Phase = 'name' | 'lobby' | 'game';

export interface PublicPlayer {
  id: PlayerId;
  name: string;
  /** Four digits; `name#tag` is unique among registered players. */
  tag: string;
  status: 'idle' | 'busy';
}

export interface InviteView {
  inviteId: string;
  /** The other party's handle: the sender for received invites, the target for sent ones. */
  name: string;
  tag: string;
  /** Milliseconds left, computed at view time; the client counts down locally. */
  expiresIn: number;
}

export interface GameView {
  /** 1-based; increments on every automatic rematch. */
  round: number;
  board: Board;
  yourMark: Mark;
  yourTurn: boolean;
  opponentName: string;
  opponentTag: string;
  yourScore: number;
  opponentScore: number;
  /** True during the pause between a finished round and the next one. */
  over: boolean;
  result: GameResult | null;
}

export type LobbyEvent =
  | { type: 'opponent-left' }
  | { type: 'invite-declined'; name: string; tag: string }
  | { type: 'invite-expired'; name: string; tag: string }
  | { type: 'invite-cancelled'; name: string; tag: string; reason: 'by-sender' | 'in-match' };

export interface PlayerView {
  phase: Phase;
  you: { id: PlayerId; name: string | null; tag: string | null };
  /** Registered players, including you. */
  onlineCount: number;
  players: PublicPlayer[];
  invites: { sent: InviteView[]; received: InviteView[] };
  game: GameView | null;
  /** Drained on every view: each event is delivered exactly once. */
  events: LobbyEvent[];
  /** Transient error of the mutation that produced this view; merged in by the handlers. */
  error: string | null;
}
