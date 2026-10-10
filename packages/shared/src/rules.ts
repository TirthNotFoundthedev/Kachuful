import {
  CARDS_PER_DECK,
  LONG_GAME_ROUNDS,
  MAX_DECKS,
  MAX_PLAYERS,
  MIN_DECKS,
  MIN_PLAYERS,
  POINTS_PER_BID,
  ZERO_BID_POINTS,
} from './constants';
import { type Card, type Suit, RANKS, SUITS, TRUMP_ORDER, makeCard, rankValue } from './cards';
import { type RandomInt, secureRandomInt, shuffleInPlace } from './rng';

// ---------------------------------------------------------------------------
// Shoe and dealing
// ---------------------------------------------------------------------------

export function isValidDeckCount(decks: number): boolean {
  return Number.isInteger(decks) && decks >= MIN_DECKS && decks <= MAX_DECKS;
}

export function isValidPlayerCount(players: number): boolean {
  return Number.isInteger(players) && players >= MIN_PLAYERS && players <= MAX_PLAYERS;
}

/** Unshuffled shoe of `decks` standard 52-card decks. */
export function buildShoe(decks: number): Card[] {
  if (!Number.isInteger(decks) || decks < 1) throw new RangeError(`Invalid deck count: ${decks}`);
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push(makeCard(rank, suit, d));
    }
  }
  return cards;
}

export function shuffledShoe(decks: number, randomInt: RandomInt = secureRandomInt): Card[] {
  return shuffleInPlace(buildShoe(decks), randomInt);
}

/** n = floor(52 * decks / players). */
export function totalRounds(players: number, decks: number): number {
  if (players <= 0) return 0;
  return Math.floor((CARDS_PER_DECK * decks) / players);
}

/** Round r (1-based) deals r cards to each player. */
export function cardsForRound(round: number): number {
  return round;
}

/** Trump suit for a 1-based round: S, D, C, H, S, ... */
export function trumpForRound(round: number): Suit {
  return TRUMP_ORDER[(round - 1) % TRUMP_ORDER.length]!;
}

/** Dealer for a 1-based round given the round-1 dealer. Rotates one seat to the left each round. */
export function dealerForRound(round: number, firstDealer: number, players: number): number {
  return (firstDealer + round - 1) % players;
}

/** The seat to the dealer's left bids first and leads the first trick. */
export function firstToAct(dealer: number, players: number): number {
  return (dealer + 1) % players;
}

/**
 * Deal `cardsEach` cards to each of `players` seats from a fresh shuffled shoe,
 * one at a time starting left of the dealer (as at a real table).
 */
export function deal(
  players: number,
  cardsEach: number,
  decks: number,
  dealer: number,
  randomInt: RandomInt = secureRandomInt,
): Card[][] {
  const shoe = shuffledShoe(decks, randomInt);
  if (players * cardsEach > shoe.length) {
    throw new RangeError(`Cannot deal ${cardsEach} cards to ${players} players from ${decks} deck(s)`);
  }
  const hands: Card[][] = Array.from({ length: players }, () => []);
  let next = 0;
  for (let c = 0; c < cardsEach; c++) {
    for (let i = 0; i < players; i++) {
      const seat = (dealer + 1 + i) % players;
      hands[seat]!.push(shoe[next++]!);
    }
  }
  return hands;
}

export interface SetupSummary {
  players: number;
  decks: number;
  rounds: number;
  totalCards: number;
  /** Cards never dealt even in the final (largest) round. */
  unusedCards: number;
  warnings: string[];
  canStart: boolean;
}

/** Lobby helper: round count and warnings for a player/deck combination. */
export function setupSummary(players: number, decks: number): SetupSummary {
  const totalCards = CARDS_PER_DECK * decks;
  const rounds = totalRounds(players, decks);
  const unusedCards = players > 0 ? totalCards - rounds * players : totalCards;
  const warnings: string[] = [];
  if (players < MIN_PLAYERS) warnings.push(`Need at least ${MIN_PLAYERS} players to start.`);
  if (players > MAX_PLAYERS) warnings.push(`At most ${MAX_PLAYERS} players are allowed.`);
  if (players >= MIN_PLAYERS && unusedCards > 0) {
    warnings.push(
      `${unusedCards} card${unusedCards === 1 ? '' : 's'} will stay undealt in the last round (${totalCards} cards / ${players} players).`,
    );
  }
  if (rounds > LONG_GAME_ROUNDS) {
    warnings.push(`Long game: ${rounds} rounds, roughly ${estimateMinutes(players, rounds)} minutes.`);
  }
  return {
    players,
    decks,
    rounds,
    totalCards,
    unusedCards,
    warnings,
    canStart: isValidPlayerCount(players) && isValidDeckCount(decks) && rounds >= 1,
  };
}

/** Rough play time: every card played takes ~2.5 s at a lively table. */
export function estimateMinutes(players: number, rounds: number): number {
  const cardsPlayed = ((rounds * (rounds + 1)) / 2) * players;
  return Math.max(1, Math.round((cardsPlayed * 2.5) / 60));
}

// ---------------------------------------------------------------------------
// Bidding
// ---------------------------------------------------------------------------

/**
 * The number the last bidder may not choose, because it would make the total of all bids
 * equal the cards per player. Returns null if that number is outside 0..cardsThisRound
 * (the other bids already exceed it), meaning there is no restriction.
 */
export function forbiddenBidForLast(otherBidsTotal: number, cardsThisRound: number): number | null {
  const forbidden = cardsThisRound - otherBidsTotal;
  return forbidden >= 0 && forbidden <= cardsThisRound ? forbidden : null;
}

/**
 * Valid bids for a player.
 * - `placedBids`: bids already made this round (in order), excluding this player.
 * - `isLast`: true for the final bidder (the dealer).
 *
 * Fallback: if the restriction would leave no legal number (impossible for r >= 1, since 0..r
 * has at least two values and only one is forbidden), the restriction is lifted. This keeps the
 * engine total even if constants are changed.
 */
export function validBids(cardsThisRound: number, placedBids: readonly number[], isLast: boolean): number[] {
  const all = Array.from({ length: cardsThisRound + 1 }, (_, i) => i);
  if (!isLast) return all;
  const forbidden = forbiddenBidForLast(sum(placedBids), cardsThisRound);
  const allowed = all.filter((b) => b !== forbidden);
  return allowed.length > 0 ? allowed : all;
}

export function isValidBid(
  bid: number,
  cardsThisRound: number,
  placedBids: readonly number[],
  isLast: boolean,
): boolean {
  return Number.isInteger(bid) && validBids(cardsThisRound, placedBids, isLast).includes(bid);
}

// ---------------------------------------------------------------------------
// Play
// ---------------------------------------------------------------------------

export interface TrickPlay {
  seat: number;
  card: Card;
}

/** Lead suit = suit of the first card in the trick, or null for an empty trick. */
export function leadSuitOf(plays: readonly TrickPlay[]): Suit | null {
  return plays[0]?.card.suit ?? null;
}

/** Follow-suit rule: if you hold the lead suit you must play it; otherwise anything goes. */
export function legalCards(hand: readonly Card[], leadSuit: Suit | null): Card[] {
  if (leadSuit === null) return [...hand];
  const following = hand.filter((c) => c.suit === leadSuit);
  return following.length > 0 ? following : [...hand];
}

export function isLegalPlay(hand: readonly Card[], cardId: string, leadSuit: Suit | null): boolean {
  return legalCards(hand, leadSuit).some((c) => c.id === cardId);
}

/**
 * Priority class of a card in a trick: 2 = trump, 1 = lead suit, 0 = other suit.
 * Class 0 cards can never win because the leader's card is always lead suit (or trump),
 * but the rule's third tier is kept so the comparison is total.
 */
function priorityClass(card: Card, leadSuit: Suit, trump: Suit): number {
  if (card.suit === trump) return 2;
  if (card.suit === leadSuit) return 1;
  return 0;
}

/**
 * Index (into `plays`) of the winning play.
 * 1. Highest trump. 2. Else highest of the lead suit. 3. Else highest of any other suit.
 * Tie rule: identical priority and rank (two identical cards with 2+ decks) -> the later play wins.
 */
export function trickWinnerIndex(plays: readonly TrickPlay[], trump: Suit): number {
  if (plays.length === 0) throw new Error('Cannot pick a winner of an empty trick');
  const leadSuit = plays[0]!.card.suit;
  let best = 0;
  for (let i = 1; i < plays.length; i++) {
    const a = plays[i]!.card;
    const b = plays[best]!.card;
    const pa = priorityClass(a, leadSuit, trump);
    const pb = priorityClass(b, leadSuit, trump);
    // ">=" on rank implements "later player wins" for exact ties.
    if (pa > pb || (pa === pb && rankValue(a.rank) >= rankValue(b.rank))) best = i;
  }
  return best;
}

export function trickWinnerSeat(plays: readonly TrickPlay[], trump: Suit): number {
  return plays[trickWinnerIndex(plays, trump)]!.seat;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Exact bid: bid * 11 (bid 0 scores 10). Missed bid: 0. */
export function scoreRound(bid: number, won: number): number {
  if (bid !== won) return 0;
  return bid === 0 ? ZERO_BID_POINTS : bid * POINTS_PER_BID;
}

export type TieBreak = 'shared' | 'exactBids';

export interface Standing {
  seat: number;
  total: number;
  exactBids: number;
  /** 1-based; tied players share a rank. */
  rank: number;
}

/**
 * Final standings, best first.
 * - 'shared': equal totals share the rank (joint winners).
 * - 'exactBids': equal totals are split by the number of rounds bid exactly; still-equal players share.
 */
export function rankStandings(
  totals: readonly number[],
  exactBids: readonly number[],
  tieBreak: TieBreak,
): Standing[] {
  const rows = totals.map((total, seat) => ({ seat, total, exactBids: exactBids[seat] ?? 0, rank: 0 }));
  const key = (r: (typeof rows)[number]) => (tieBreak === 'exactBids' ? [r.total, r.exactBids] : [r.total]);
  rows.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) {
      if (kb[i]! !== ka[i]!) return kb[i]! - ka[i]!;
    }
    return a.seat - b.seat;
  });
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    const tied = prev && key(prev).every((v, k) => v === key(row)[k]);
    row.rank = tied ? prev.rank : i + 1;
  });
  return rows;
}

export function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
