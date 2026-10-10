/**
 * Typed Socket.IO protocol shared by client and server.
 * Clients only send intents; the server answers with an ack and broadcasts
 * per-player snapshots (`room:state`) that never contain other players' hands.
 */
import type { Card, Suit } from './cards';
import type { CompletedTrick, GamePhase, RoundRecord } from './engine';
import type { SetupSummary, Standing, TieBreak, TrickPlay } from './rules';

export type RoomPhase = 'LOBBY' | GamePhase;

export interface RoomSettings {
  decks: number;
  tieBreak: TieBreak;
  /** Seconds per turn before auto-play. 0 disables the timer (bots still cover disconnected players). */
  turnSeconds: number;
}

export interface PublicPlayer {
  id: string;
  name: string;
  seat: number;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  /** Auto-play is acting for this player (timed out or disconnected). */
  away: boolean;
}

export interface PublicGame {
  phase: GamePhase;
  round: number;
  totalRounds: number;
  cardsThisRound: number;
  trump: Suit;
  dealer: number;
  /** Seat to act, -1 if none. */
  turn: number;
  bidOrder: number[];
  bids: (number | null)[];
  won: number[];
  handCounts: number[];
  trick: TrickPlay[];
  leadSuit: Suit | null;
  trickNumber: number;
  completedTrick: CompletedTrick | null;
  lastTrick: CompletedTrick | null;
  history: RoundRecord[];
  totals: number[];
  exactBids: number[];
  standings: Standing[] | null;
  /** Epoch ms when the current turn auto-plays, or null if untimed. */
  turnDeadline: number | null;
  /** Epoch ms when the round summary auto-advances. */
  nextRoundAt: number | null;
}

export interface PrivateView {
  hand: Card[];
  legalCardIds: string[];
  allowedBids: number[];
  /** Number the last bidder may not choose, when the restriction applies to you now. */
  forbiddenBid: number | null;
}

export interface RoomSnapshot {
  /** Increments on every change; clients ignore older snapshots. */
  version: number;
  serverNow: number;
  code: string;
  hostId: string;
  phase: RoomPhase;
  settings: RoomSettings;
  players: PublicPlayer[];
  youId: string;
  setup: SetupSummary;
  game: PublicGame | null;
  private: PrivateView | null;
  /** Player ids that asked to skip the round summary. */
  continueVotes: string[];
}

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_IN_PROGRESS'
  | 'NOT_HOST'
  | 'NOT_IN_ROOM'
  | 'INVALID_SESSION'
  | 'CANNOT_START'
  | 'RATE_LIMITED'
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'INVALID_BID'
  | 'FORBIDDEN_BID'
  | 'CARD_NOT_IN_HAND'
  | 'MUST_FOLLOW_SUIT'
  | 'TRICK_RESOLVING'
  | 'INVALID_CONFIG'
  | 'INTERNAL';

export type Ack<T = undefined> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string };
export type AckFn<T = undefined> = (res: Ack<T>) => void;

export interface Session {
  code: string;
  playerId: string;
  /** Secret proving seat ownership on reconnect. Never broadcast. */
  token: string;
}

export interface ClientToServerEvents {
  'room:create': (p: { name: string }, ack: AckFn<Session>) => void;
  'room:join': (p: { code: string; name: string }, ack: AckFn<Session>) => void;
  'room:resume': (p: Session, ack: AckFn<Session>) => void;
  'room:leave': (ack: AckFn) => void;
  'lobby:settings': (p: Partial<RoomSettings>, ack: AckFn) => void;
  'lobby:ready': (p: { ready: boolean }, ack: AckFn) => void;
  'lobby:kick': (p: { playerId: string }, ack: AckFn) => void;
  'lobby:addBot': (ack: AckFn) => void;
  'lobby:start': (ack: AckFn) => void;
  'game:bid': (p: { bid: number; actionId: string }, ack: AckFn) => void;
  'game:play': (p: { cardId: string; actionId: string }, ack: AckFn) => void;
  'game:continue': (ack: AckFn) => void;
  'player:back': (ack: AckFn) => void;
  'room:playAgain': (ack: AckFn) => void;
}

export interface ServerToClientEvents {
  'room:state': (s: RoomSnapshot) => void;
  'room:kicked': (p: { reason: string }) => void;
  'room:notice': (p: { message: string }) => void;
}
