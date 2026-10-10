/**
 * Pure, immutable Kachuful game state machine. No timers, no I/O.
 * Every transition returns a new state; the input state is never mutated.
 *
 *   BIDDING -> PLAYING -> (trick complete -> collectTrick)* -> ROUND_SCORE -> nextRound -> BIDDING ...
 *   ... -> ROUND_SCORE (final round) -> nextRound -> GAME_OVER
 *
 * The room lobby (LOBBY phase) lives in the server; the engine starts at the first deal.
 */
import type { Card, Suit } from './cards';
import {
  type Standing,
  type TieBreak,
  type TrickPlay,
  cardsForRound,
  deal,
  dealerForRound,
  firstToAct,
  forbiddenBidForLast,
  isValidDeckCount,
  isValidPlayerCount,
  leadSuitOf,
  legalCards,
  rankStandings,
  scoreRound,
  sum,
  totalRounds,
  trickWinnerSeat,
  trumpForRound,
  validBids,
} from './rules';
import { type RandomInt, secureRandomInt } from './rng';

export type GamePhase = 'BIDDING' | 'PLAYING' | 'ROUND_SCORE' | 'GAME_OVER';

export interface GameConfig {
  players: number;
  decks: number;
  tieBreak: TieBreak;
  /** Dealer of round 1 (0-based seat). */
  firstDealer: number;
  /** Override the round count (tests / short games). Defaults to floor(52*decks/players). */
  rounds?: number;
}

export interface CompletedTrick {
  trickNumber: number;
  leadSuit: Suit;
  plays: TrickPlay[];
  winnerSeat: number;
}

export interface RoundRecord {
  round: number;
  cards: number;
  trump: Suit;
  dealer: number;
  bids: number[];
  won: number[];
  points: number[];
}

export interface GameState {
  config: GameConfig;
  totalRounds: number;
  phase: GamePhase;
  /** 1-based round number. */
  round: number;
  cardsThisRound: number;
  trump: Suit;
  dealer: number;
  hands: Card[][];
  /** Indexed by seat; null until that seat has bid. */
  bids: (number | null)[];
  /** Seats in the order they bid this round (dealer last). */
  bidOrder: number[];
  won: number[];
  /** Seat whose action is awaited, or -1 when no one (trick resolving, round over). */
  turn: number;
  trick: TrickPlay[];
  trickLeader: number;
  /** 1-based number of the trick in progress. */
  trickNumber: number;
  /** Set once every seat has played to the trick; cleared by collectTrick. */
  completedTrick: CompletedTrick | null;
  lastTrick: CompletedTrick | null;
  history: RoundRecord[];
  totals: number[];
  exactBids: number[];
  standings: Standing[] | null;
}

export type EngineErrorCode =
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'INVALID_BID'
  | 'FORBIDDEN_BID'
  | 'CARD_NOT_IN_HAND'
  | 'MUST_FOLLOW_SUIT'
  | 'TRICK_RESOLVING'
  | 'INVALID_CONFIG';

export type EngineResult = { ok: true; state: GameState } | { ok: false; code: EngineErrorCode; message: string };

const fail = (code: EngineErrorCode, message: string): EngineResult => ({ ok: false, code, message });

function clone(state: GameState): GameState {
  return structuredClone(state);
}

function dealRound(state: GameState, round: number, randomInt: RandomInt): void {
  const { players, decks, firstDealer } = state.config;
  const cards = cardsForRound(round);
  const dealer = dealerForRound(round, firstDealer, players);
  const first = firstToAct(dealer, players);
  state.phase = 'BIDDING';
  state.round = round;
  state.cardsThisRound = cards;
  state.trump = trumpForRound(round);
  state.dealer = dealer;
  state.hands = deal(players, cards, decks, dealer, randomInt);
  state.bids = Array.from({ length: players }, () => null);
  state.bidOrder = Array.from({ length: players }, (_, i) => (first + i) % players);
  state.won = Array.from({ length: players }, () => 0);
  state.turn = first;
  state.trick = [];
  state.trickLeader = first;
  state.trickNumber = 1;
  state.completedTrick = null;
  state.lastTrick = null;
}

export function createGame(config: GameConfig, randomInt: RandomInt = secureRandomInt): EngineResult {
  const { players, decks, firstDealer } = config;
  if (!isValidPlayerCount(players)) return fail('INVALID_CONFIG', `Player count must be valid, got ${players}`);
  if (!isValidDeckCount(decks)) return fail('INVALID_CONFIG', `Deck count must be valid, got ${decks}`);
  if (!Number.isInteger(firstDealer) || firstDealer < 0 || firstDealer >= players) {
    return fail('INVALID_CONFIG', `First dealer must be a seat, got ${firstDealer}`);
  }
  const maxRounds = totalRounds(players, decks);
  const rounds = config.rounds === undefined ? maxRounds : Math.min(Math.max(1, config.rounds), maxRounds);
  const state: GameState = {
    config: { ...config, rounds },
    totalRounds: rounds,
    phase: 'BIDDING',
    round: 1,
    cardsThisRound: 1,
    trump: 'S',
    dealer: firstDealer,
    hands: [],
    bids: [],
    bidOrder: [],
    won: [],
    turn: -1,
    trick: [],
    trickLeader: 0,
    trickNumber: 1,
    completedTrick: null,
    lastTrick: null,
    history: [],
    totals: Array.from({ length: players }, () => 0),
    exactBids: Array.from({ length: players }, () => 0),
    standings: null,
  };
  dealRound(state, 1, randomInt);
  return { ok: true, state };
}

/** True if `seat` is the final bidder this round (the dealer). */
export function isLastBidder(state: GameState, seat: number): boolean {
  return state.bidOrder[state.bidOrder.length - 1] === seat;
}

function placedBids(state: GameState): number[] {
  return state.bids.filter((b): b is number => b !== null);
}

/** Bids the given seat could legally make right now (empty if it is not their bid). */
export function allowedBids(state: GameState, seat: number): number[] {
  if (state.phase !== 'BIDDING' || state.turn !== seat) return [];
  return validBids(state.cardsThisRound, placedBids(state), isLastBidder(state, seat));
}

/** The forbidden number for the last bidder, if the restriction applies to `seat` now. */
export function forbiddenBid(state: GameState, seat: number): number | null {
  if (state.phase !== 'BIDDING' || state.turn !== seat || !isLastBidder(state, seat)) return null;
  const f = forbiddenBidForLast(sum(placedBids(state)), state.cardsThisRound);
  // If lifting the restriction was needed (fallback), report no forbidden number.
  return f !== null && allowedBids(state, seat).includes(f) ? null : f;
}

export function placeBid(state: GameState, seat: number, bid: number): EngineResult {
  if (state.phase !== 'BIDDING') return fail('WRONG_PHASE', 'It is not the bidding phase.');
  if (state.turn !== seat) return fail('NOT_YOUR_TURN', 'It is not your turn to bid.');
  if (!Number.isInteger(bid) || bid < 0 || bid > state.cardsThisRound) {
    return fail('INVALID_BID', `Bid must be between 0 and ${state.cardsThisRound}.`);
  }
  if (!allowedBids(state, seat).includes(bid)) {
    return fail(
      'FORBIDDEN_BID',
      `As the last bidder you cannot bid ${bid}: total bids cannot equal ${state.cardsThisRound}.`,
    );
  }
  const next = clone(state);
  next.bids[seat] = bid;
  const idx = next.bidOrder.indexOf(seat);
  if (idx === next.bidOrder.length - 1) {
    next.phase = 'PLAYING';
    next.turn = next.trickLeader;
  } else {
    next.turn = next.bidOrder[idx + 1]!;
  }
  return { ok: true, state: next };
}

export function currentLeadSuit(state: GameState): Suit | null {
  return leadSuitOf(state.trick);
}

/** Ids of cards `seat` may play right now (empty if it is not their turn to play). */
export function legalCardIds(state: GameState, seat: number): string[] {
  if (state.phase !== 'PLAYING' || state.turn !== seat || state.completedTrick) return [];
  return legalCards(state.hands[seat] ?? [], currentLeadSuit(state)).map((c) => c.id);
}

export function playCard(state: GameState, seat: number, cardId: string): EngineResult {
  if (state.phase !== 'PLAYING') return fail('WRONG_PHASE', 'Cards can only be played during a trick.');
  if (state.completedTrick) return fail('TRICK_RESOLVING', 'Wait for the trick to be collected.');
  if (state.turn !== seat) return fail('NOT_YOUR_TURN', 'It is not your turn to play.');
  const hand = state.hands[seat] ?? [];
  const card = hand.find((c) => c.id === cardId);
  if (!card) return fail('CARD_NOT_IN_HAND', 'That card is not in your hand.');
  const lead = currentLeadSuit(state);
  if (!legalCards(hand, lead).some((c) => c.id === cardId)) {
    return fail('MUST_FOLLOW_SUIT', 'You must follow the lead suit when you can.');
  }

  const next = clone(state);
  next.hands[seat] = next.hands[seat]!.filter((c) => c.id !== cardId);
  next.trick.push({ seat, card });
  const players = next.config.players;
  if (next.trick.length === players) {
    next.completedTrick = {
      trickNumber: next.trickNumber,
      leadSuit: next.trick[0]!.card.suit,
      plays: next.trick,
      winnerSeat: trickWinnerSeat(next.trick, next.trump),
    };
    next.turn = -1;
  } else {
    next.turn = (seat + 1) % players;
  }
  return { ok: true, state: next };
}

/**
 * Award the completed trick. The winner leads the next trick; after the last trick the round
 * is scored and the phase becomes ROUND_SCORE.
 */
export function collectTrick(state: GameState): EngineResult {
  if (state.phase !== 'PLAYING' || !state.completedTrick) return fail('WRONG_PHASE', 'No completed trick to collect.');
  const next = clone(state);
  const done = next.completedTrick!;
  next.won[done.winnerSeat]! += 1;
  next.lastTrick = done;
  next.completedTrick = null;
  next.trick = [];

  if (next.hands.every((h) => h.length === 0)) {
    const bids = next.bids.map((b) => b ?? 0);
    const points = bids.map((b, seat) => scoreRound(b, next.won[seat]!));
    next.history.push({
      round: next.round,
      cards: next.cardsThisRound,
      trump: next.trump,
      dealer: next.dealer,
      bids,
      won: [...next.won],
      points,
    });
    points.forEach((p, seat) => {
      next.totals[seat]! += p;
      if (bids[seat] === next.won[seat]) next.exactBids[seat]! += 1;
    });
    next.phase = 'ROUND_SCORE';
    next.turn = -1;
  } else {
    next.trickLeader = done.winnerSeat;
    next.trickNumber += 1;
    next.turn = done.winnerSeat;
  }
  return { ok: true, state: next };
}

/** Leave ROUND_SCORE: deal the next round, or finish the game after the last round. */
export function nextRound(state: GameState, randomInt: RandomInt = secureRandomInt): EngineResult {
  if (state.phase !== 'ROUND_SCORE') return fail('WRONG_PHASE', 'The round is not over yet.');
  const next = clone(state);
  if (next.round >= next.totalRounds) {
    next.phase = 'GAME_OVER';
    next.turn = -1;
    next.standings = rankStandings(next.totals, next.exactBids, next.config.tieBreak);
    return { ok: true, state: next };
  }
  dealRound(next, next.round + 1, randomInt);
  return { ok: true, state: next };
}

/** Seats sharing rank 1 at game over. */
export function winners(state: GameState): number[] {
  return (state.standings ?? []).filter((s) => s.rank === 1).map((s) => s.seat);
}
