/**
 * Simple heuristic bot. Uses only what a human in that seat could see:
 * its own hand, the trump, the bids and the cards on the table.
 */
import { type Card, type Suit, rankValue } from './cards';
import { type TrickPlay, legalCards, trickWinnerSeat } from './rules';

export interface BotBidInput {
  hand: readonly Card[];
  trump: Suit;
  players: number;
  cardsThisRound: number;
  /** Bids the bot may choose from (forbidden number already removed). */
  allowed: readonly number[];
}

/** Rough chance a card takes a trick. */
function trickValue(card: Card, trump: Suit, trumpCount: number, suitCount: number, players: number): number {
  const v = rankValue(card.rank); // 0 ('2') .. 12 ('A')
  const crowd = players >= 6 ? 0.75 : 1; // more players -> more chances to be beaten
  if (card.suit === trump) {
    if (v === 12) return 1;
    if (v === 11) return 0.9 * crowd;
    if (v === 10) return (trumpCount >= 3 ? 0.75 : 0.5) * crowd;
    if (v >= 7) return (trumpCount >= 4 ? 0.55 : 0.3) * crowd;
    return trumpCount >= 5 ? 0.35 : 0.1;
  }
  // Side-suit honours are worth less when the suit is long (others will run out and trump it).
  const lengthPenalty = suitCount >= 4 ? 0.5 : suitCount === 3 ? 0.8 : 1;
  if (v === 12) return 0.8 * lengthPenalty * crowd;
  if (v === 11) return (suitCount >= 2 ? 0.45 : 0.25) * lengthPenalty * crowd;
  if (v === 10 && suitCount >= 3) return 0.15 * crowd;
  return 0;
}

export function chooseBotBid({ hand, trump, players, cardsThisRound, allowed }: BotBidInput): number {
  const bySuit = new Map<Suit, number>();
  for (const c of hand) bySuit.set(c.suit, (bySuit.get(c.suit) ?? 0) + 1);
  const trumpCount = bySuit.get(trump) ?? 0;
  let expected = 0;
  for (const c of hand) expected += trickValue(c, trump, trumpCount, bySuit.get(c.suit) ?? 0, players);
  // Void side suits let long trumps ruff.
  const voids = (['S', 'D', 'C', 'H'] as Suit[]).filter((s) => s !== trump && !bySuit.has(s)).length;
  if (trumpCount >= 2 && cardsThisRound >= 4) expected += Math.min(voids, trumpCount - 1) * 0.4;

  const target = Math.max(0, Math.min(cardsThisRound, Math.round(expected)));
  const options = allowed.length > 0 ? allowed : [target];
  // Nearest allowed bid; on a tie prefer the lower (safer) number.
  return [...options].sort((a, b) => Math.abs(a - expected) - Math.abs(b - expected) || a - b)[0]!;
}

export interface BotPlayInput {
  hand: readonly Card[];
  trump: Suit;
  trick: readonly TrickPlay[];
  seat: number;
  bid: number;
  won: number;
  players: number;
}

function wouldWin(card: Card, input: BotPlayInput): boolean {
  const plays = [...input.trick, { seat: input.seat, card }];
  return trickWinnerSeat(plays, input.trump) === input.seat;
}

/** Strength used for "cheapest" / "most expensive" choices: trumps outrank everything. */
function strength(card: Card, trump: Suit): number {
  return rankValue(card.rank) + (card.suit === trump ? 100 : 0);
}

export function chooseBotCard(input: BotPlayInput): Card {
  const lead = input.trick[0]?.card.suit ?? null;
  const legal = legalCards(input.hand, lead);
  if (legal.length === 1) return legal[0]!;
  const asc = [...legal].sort((a, b) => strength(a, input.trump) - strength(b, input.trump));
  const lowest = asc[0]!;
  const highest = asc[asc.length - 1]!;
  const needMore = input.won < input.bid;
  const lastToPlay = input.trick.length === input.players - 1;

  if (input.trick.length === 0) {
    // Leading: chase tricks with the best card, otherwise lead low.
    if (!needMore) return lowest;
    const nonTrumpAces = asc.filter((c) => c.suit !== input.trump && c.rank === 'A');
    return nonTrumpAces[0] ?? highest;
  }

  const winners = asc.filter((c) => wouldWin(c, input));
  if (needMore) {
    if (winners.length === 0) return lowest;
    // Last to play: cheapest winner is guaranteed. Otherwise take a solid margin with the strongest winner
    // only when it is a top card; else cheapest winner.
    if (lastToPlay) return winners[0]!;
    const top = winners[winners.length - 1]!;
    return rankValue(top.rank) >= 11 ? top : winners[0]!;
  }
  // Avoid winning: dump the highest card that still loses; if every card wins, play the lowest.
  const losers = asc.filter((c) => !wouldWin(c, input));
  return losers.length > 0 ? losers[losers.length - 1]! : lowest;
}
