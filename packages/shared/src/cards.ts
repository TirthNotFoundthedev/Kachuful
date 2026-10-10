export const SUITS = ['S', 'D', 'C', 'H'] as const;
export type Suit = (typeof SUITS)[number];

/** Ranks low to high. Ace is high. */
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  /** Unique within a shoe, e.g. "AS#0" and "AS#1" are the two aces of spades in a 2-deck game. */
  id: string;
  suit: Suit;
  rank: Rank;
  /** Which physical deck the card came from (0-based). */
  deck: number;
}

/** Trump ("Sir") cycles Spades -> Diamonds -> Clubs -> Hearts. Same order as SUITS. */
export const TRUMP_ORDER: readonly Suit[] = SUITS;

export interface SuitInfo {
  symbol: string;
  name: string;
  /** Hindi / Gujarati name used at the table. */
  localName: string;
  color: 'red' | 'black';
}

export const SUIT_INFO: Record<Suit, SuitInfo> = {
  S: { symbol: '♠', name: 'Spades', localName: 'Kadi', color: 'black' },
  D: { symbol: '♦', name: 'Diamonds', localName: 'Charkat', color: 'red' },
  C: { symbol: '♣', name: 'Clubs', localName: 'Phuli', color: 'black' },
  H: { symbol: '♥', name: 'Hearts', localName: 'Laal', color: 'red' },
};

/** 0 for '2' up to 12 for 'A'. */
export function rankValue(rank: Rank): number {
  return RANKS.indexOf(rank);
}

export function makeCard(rank: Rank, suit: Suit, deck = 0): Card {
  return { id: `${rank}${suit}#${deck}`, rank, suit, deck };
}

/** Parse a card id produced by makeCard. Returns null if malformed. */
export function parseCardId(id: string): Card | null {
  const match = /^(10|[2-9JQKA])([SDCH])#(\d+)$/.exec(id);
  if (!match) return null;
  return makeCard(match[1] as Rank, match[2] as Suit, Number(match[3]));
}

/** True when two cards are the same face (suit and rank), regardless of deck. */
export function sameFace(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function cardLabel(card: Pick<Card, 'rank' | 'suit'>): string {
  return `${card.rank}${SUIT_INFO[card.suit].symbol}`;
}

export function cardName(card: Pick<Card, 'rank' | 'suit'>): string {
  const rankNames: Partial<Record<Rank, string>> = { J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' };
  return `${rankNames[card.rank] ?? card.rank} of ${SUIT_INFO[card.suit].name}`;
}

/**
 * Sort for display: suits grouped with alternating colours (S, H, C, D), high cards first.
 * Optionally puts the trump suit first.
 */
export function sortHand(cards: readonly Card[], trump?: Suit): Card[] {
  const baseOrder: Suit[] = ['S', 'H', 'C', 'D'];
  const order = trump ? [trump, ...baseOrder.filter((s) => s !== trump)] : baseOrder;
  return [...cards].sort((a, b) => {
    const s = order.indexOf(a.suit) - order.indexOf(b.suit);
    if (s !== 0) return s;
    const r = rankValue(b.rank) - rankValue(a.rank);
    if (r !== 0) return r;
    return a.deck - b.deck;
  });
}
