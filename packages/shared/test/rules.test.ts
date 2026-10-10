import { describe, expect, it } from 'vitest';
import {
  type Card,
  type Rank,
  type Suit,
  type TrickPlay,
  buildShoe,
  cardsForRound,
  dealerForRound,
  deal,
  firstToAct,
  forbiddenBidForLast,
  isLegalPlay,
  isValidBid,
  legalCards,
  makeCard,
  parseCardId,
  rankStandings,
  scoreRound,
  secureRandomInt,
  seededRandomInt,
  setupSummary,
  shuffleInPlace,
  shuffledShoe,
  sortHand,
  totalRounds,
  trickWinnerIndex,
  trickWinnerSeat,
  trumpForRound,
  validBids,
} from '../src';

const c = (rank: Rank, suit: Suit, deck = 0): Card => makeCard(rank, suit, deck);
const plays = (...cards: Card[]): TrickPlay[] => cards.map((card, seat) => ({ seat, card }));

describe('shoe', () => {
  it.each([1, 2])('builds %i deck(s) of unique cards', (decks) => {
    const shoe = buildShoe(decks);
    expect(shoe).toHaveLength(52 * decks);
    expect(new Set(shoe.map((x) => x.id)).size).toBe(52 * decks);
  });

  it('has exactly `decks` copies of each face', () => {
    const shoe = buildShoe(2);
    const aceSpades = shoe.filter((x) => x.rank === 'A' && x.suit === 'S');
    expect(aceSpades.map((x) => x.id).sort()).toEqual(['AS#0', 'AS#1']);
  });

  it('rejects invalid deck counts', () => {
    expect(() => buildShoe(0)).toThrow();
    expect(() => buildShoe(1.5)).toThrow();
  });

  it('shuffle is a permutation', () => {
    const shoe = shuffledShoe(2, seededRandomInt(7));
    expect(shoe).toHaveLength(104);
    expect(new Set(shoe.map((x) => x.id)).size).toBe(104);
    expect(shoe.map((x) => x.id)).not.toEqual(buildShoe(2).map((x) => x.id));
  });

  it('Fisher-Yates with crypto RNG is roughly uniform', () => {
    const counts = [0, 0, 0];
    const perms = new Map<string, number>();
    for (let i = 0; i < 6000; i++) {
      const arr = shuffleInPlace([0, 1, 2], secureRandomInt);
      counts[arr[0]!]! += 1;
      const k = arr.join('');
      perms.set(k, (perms.get(k) ?? 0) + 1);
    }
    expect(perms.size).toBe(6);
    for (const n of perms.values()) expect(n).toBeGreaterThan(800);
    for (const n of counts) expect(n).toBeGreaterThan(1700);
  });

  it('secureRandomInt stays in range and validates input', () => {
    for (let i = 0; i < 1000; i++) {
      const v = secureRandomInt(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
    expect(() => secureRandomInt(0)).toThrow();
  });
});

describe('card ids', () => {
  it('round-trips through parseCardId', () => {
    for (const card of buildShoe(2)) expect(parseCardId(card.id)).toEqual(card);
  });
  it('rejects garbage', () => {
    expect(parseCardId('ZZ#0')).toBeNull();
    expect(parseCardId('AS')).toBeNull();
    expect(parseCardId('1S#0')).toBeNull();
  });
  it('sortHand groups suits with trump first and high cards first', () => {
    const sorted = sortHand([c('2', 'S'), c('A', 'D'), c('K', 'S'), c('3', 'D')], 'D');
    expect(sorted.map((x) => x.id)).toEqual(['AD#0', '3D#0', 'KS#0', '2S#0']);
  });
});

describe('rounds, trump and dealer', () => {
  it.each([
    [4, 1, 13],
    [4, 2, 26],
    [3, 1, 17],
    [3, 2, 34],
    [5, 1, 10],
    [6, 2, 17],
    [7, 1, 7],
    [10, 1, 5],
    [10, 2, 10],
  ])('%i players, %i deck(s) -> %i rounds', (p, d, n) => {
    expect(totalRounds(p, d)).toBe(n);
  });

  it('round r deals r cards', () => {
    expect(cardsForRound(1)).toBe(1);
    expect(cardsForRound(26)).toBe(26);
  });

  it('trump cycles S, D, C, H', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 13, 26].map(trumpForRound)).toEqual(['S', 'D', 'C', 'H', 'S', 'D', 'C', 'H', 'S', 'D']);
  });

  it('dealer rotates and the player to the left acts first', () => {
    expect(dealerForRound(1, 2, 4)).toBe(2);
    expect(dealerForRound(2, 2, 4)).toBe(3);
    expect(dealerForRound(3, 2, 4)).toBe(0);
    expect(firstToAct(3, 4)).toBe(0);
    expect(firstToAct(1, 4)).toBe(2);
  });

  it('deals r cards to each player with no duplicates', () => {
    const hands = deal(4, 26, 2, 0, seededRandomInt(3));
    expect(hands.map((h) => h.length)).toEqual([26, 26, 26, 26]);
    expect(new Set(hands.flat().map((x) => x.id)).size).toBe(104);
  });

  it('refuses to deal more cards than the shoe holds', () => {
    expect(() => deal(4, 14, 1, 0)).toThrow();
  });
});

describe('setupSummary', () => {
  it('4 players 1 deck: 13 rounds, nothing unused, no warnings', () => {
    const s = setupSummary(4, 1);
    expect(s).toMatchObject({ rounds: 13, unusedCards: 0, canStart: true, warnings: [] });
  });
  it('warns about unused cards', () => {
    const s = setupSummary(5, 1);
    expect(s.rounds).toBe(10);
    expect(s.unusedCards).toBe(2);
    expect(s.warnings.join(' ')).toMatch(/2 cards will stay undealt/);
  });
  it('warns about long games', () => {
    const s = setupSummary(4, 2);
    expect(s.rounds).toBe(26);
    expect(s.warnings.join(' ')).toMatch(/Long game: 26 rounds/);
  });
  it('blocks starting with too few players', () => {
    expect(setupSummary(2, 1).canStart).toBe(false);
    expect(setupSummary(11, 2).canStart).toBe(false);
  });
});

describe('bidding', () => {
  it('non-last bidders may bid anything 0..r', () => {
    expect(validBids(3, [], false)).toEqual([0, 1, 2, 3]);
    expect(validBids(3, [3, 3], false)).toEqual([0, 1, 2, 3]);
  });

  it('last bidder cannot make the total equal r', () => {
    // round 3, others bid 1 + 1 -> 1 is forbidden
    expect(forbiddenBidForLast(2, 3)).toBe(1);
    expect(validBids(3, [1, 1, 0], true)).toEqual([0, 2, 3]);
    expect(isValidBid(1, 3, [1, 1, 0], true)).toBe(false);
    expect(isValidBid(2, 3, [1, 1, 0], true)).toBe(true);
  });

  it('round 1: others bid 0 -> last bidder cannot bid 1', () => {
    expect(validBids(1, [0, 0, 0], true)).toEqual([0]);
  });

  it('round 1: someone bid 1 -> last bidder cannot bid 0', () => {
    expect(validBids(1, [1, 0, 0], true)).toEqual([1]);
  });

  it('no restriction once others already exceed r', () => {
    expect(forbiddenBidForLast(5, 3)).toBeNull();
    expect(validBids(3, [2, 2, 1], true)).toEqual([0, 1, 2, 3]);
  });

  it('there is always at least one legal bid for the last player', () => {
    for (let r = 1; r <= 26; r++) {
      for (let others = 0; others <= r * 9; others++) {
        expect(validBids(r, [others], true).length).toBeGreaterThan(0);
      }
    }
  });

  it('rejects non-integers and out of range', () => {
    expect(isValidBid(1.5, 3, [], false)).toBe(false);
    expect(isValidBid(-1, 3, [], false)).toBe(false);
    expect(isValidBid(4, 3, [], false)).toBe(false);
  });
});

describe('follow suit', () => {
  const hand = [c('A', 'S'), c('2', 'S'), c('K', 'H'), c('5', 'D')];

  it('anything may be led', () => {
    expect(legalCards(hand, null)).toHaveLength(4);
  });
  it('must follow the lead suit when holding it', () => {
    expect(legalCards(hand, 'S').map((x) => x.id)).toEqual(['AS#0', '2S#0']);
    expect(isLegalPlay(hand, 'KH#0', 'S')).toBe(false);
    expect(isLegalPlay(hand, '2S#0', 'S')).toBe(true);
  });
  it('void in lead suit -> any card, including trump', () => {
    expect(legalCards(hand, 'C')).toHaveLength(4);
  });
  it('rejects cards not in hand', () => {
    expect(isLegalPlay(hand, 'QS#0', null)).toBe(false);
  });
});

describe('trick winner', () => {
  it('highest lead-suit card wins without trump', () => {
    expect(trickWinnerSeat(plays(c('10', 'H'), c('K', 'H'), c('2', 'H'), c('A', 'D')), 'S')).toBe(1);
  });

  it('any trump beats the lead suit', () => {
    expect(trickWinnerSeat(plays(c('A', 'H'), c('2', 'S'), c('K', 'H')), 'S')).toBe(1);
  });

  it('highest trump wins among trumps', () => {
    expect(trickWinnerSeat(plays(c('A', 'H'), c('2', 'S'), c('J', 'S'), c('3', 'S')), 'S')).toBe(2);
  });

  it('off-suit high cards never beat the lead suit', () => {
    expect(trickWinnerSeat(plays(c('2', 'C'), c('A', 'D'), c('A', 'H')), 'S')).toBe(0);
  });

  it('lead with trump: highest trump wins', () => {
    expect(trickWinnerSeat(plays(c('5', 'S'), c('A', 'H'), c('9', 'S')), 'S')).toBe(2);
  });

  it('tie rule: identical trump cards -> later player wins', () => {
    expect(trickWinnerSeat(plays(c('3', 'H'), c('A', 'S', 0), c('A', 'S', 1), c('K', 'S')), 'S')).toBe(2);
  });

  it('tie rule: identical lead-suit cards -> later player wins', () => {
    expect(trickWinnerSeat(plays(c('Q', 'D', 0), c('2', 'D'), c('Q', 'D', 1)), 'C')).toBe(2);
  });

  it('tie rule: the leader can be beaten by an identical later card', () => {
    expect(trickWinnerIndex(plays(c('A', 'H', 1), c('A', 'H', 0)), 'S')).toBe(1);
  });

  it('tie rule does not let an identical off-suit card win', () => {
    // Two K♦ discarded on a club lead: the club still wins.
    expect(trickWinnerSeat(plays(c('2', 'C'), c('K', 'D', 0), c('K', 'D', 1)), 'S')).toBe(0);
  });

  it('respects actual seats, not array positions', () => {
    const t: TrickPlay[] = [
      { seat: 2, card: c('5', 'C') },
      { seat: 3, card: c('9', 'C') },
      { seat: 0, card: c('7', 'C') },
    ];
    expect(trickWinnerSeat(t, 'H')).toBe(3);
  });

  it('single-card trick (round 1 lead) is won by the leader', () => {
    expect(trickWinnerSeat([{ seat: 1, card: c('2', 'D') }], 'S')).toBe(1);
  });

  it('throws on an empty trick', () => {
    expect(() => trickWinnerIndex([], 'S')).toThrow();
  });
});

describe('scoring', () => {
  it.each([
    [4, 4, 44],
    [1, 1, 11],
    [0, 0, 10],
    [13, 13, 143],
    [3, 2, 0],
    [0, 1, 0],
    [2, 5, 0],
  ])('bid %i won %i -> %i', (bid, won, pts) => {
    expect(scoreRound(bid, won)).toBe(pts);
  });
});

describe('standings', () => {
  it('orders by total, sharing rank on ties (shared)', () => {
    const s = rankStandings([50, 80, 80, 10], [3, 2, 5, 1], 'shared');
    expect(s.map((x) => [x.seat, x.rank])).toEqual([
      [1, 1],
      [2, 1],
      [0, 3],
      [3, 4],
    ]);
  });

  it('breaks ties by exact bids (exactBids)', () => {
    const s = rankStandings([50, 80, 80, 10], [3, 2, 5, 1], 'exactBids');
    expect(s.map((x) => [x.seat, x.rank])).toEqual([
      [2, 1],
      [1, 2],
      [0, 3],
      [3, 4],
    ]);
  });

  it('still shares when exact bids are also equal', () => {
    const s = rankStandings([80, 80], [4, 4], 'exactBids');
    expect(s.map((x) => x.rank)).toEqual([1, 1]);
  });
});
