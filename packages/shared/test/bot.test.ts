import { describe, expect, it } from 'vitest';
import { type Card, type Rank, type Suit, chooseBotBid, chooseBotCard, makeCard } from '../src';

const c = (rank: Rank, suit: Suit, deck = 0): Card => makeCard(rank, suit, deck);

describe('bot bidding', () => {
  it('bids high with strong trumps', () => {
    const hand = [c('A', 'S'), c('K', 'S'), c('Q', 'S'), c('A', 'H'), c('2', 'D')];
    const bid = chooseBotBid({ hand, trump: 'S', players: 4, cardsThisRound: 5, allowed: [0, 1, 2, 3, 4, 5] });
    expect(bid).toBeGreaterThanOrEqual(3);
  });

  it('bids zero with a weak hand', () => {
    const hand = [c('2', 'S'), c('3', 'H'), c('4', 'D'), c('6', 'C')];
    expect(chooseBotBid({ hand, trump: 'D', players: 4, cardsThisRound: 4, allowed: [0, 1, 2, 3, 4] })).toBe(0);
  });

  it('never picks a forbidden number', () => {
    const hand = [c('2', 'S')];
    expect(chooseBotBid({ hand, trump: 'D', players: 4, cardsThisRound: 1, allowed: [1] })).toBe(1);
  });
});

describe('bot play', () => {
  const base = { trump: 'S' as Suit, players: 4, seat: 3 };

  it('always follows suit', () => {
    const hand = [c('A', 'S'), c('2', 'H'), c('K', 'H')];
    const card = chooseBotCard({ ...base, hand, trick: [{ seat: 0, card: c('5', 'H') }], bid: 0, won: 0 });
    expect(card.suit).toBe('H');
  });

  it('when it needs tricks and plays last, wins as cheaply as possible', () => {
    const hand = [c('A', 'H'), c('9', 'H'), c('3', 'H')];
    const trick = [
      { seat: 0, card: c('5', 'H') },
      { seat: 1, card: c('8', 'H') },
      { seat: 2, card: c('2', 'H') },
    ];
    expect(chooseBotCard({ ...base, hand, trick, bid: 1, won: 0 }).id).toBe('9H#0');
  });

  it('when it has enough tricks, ducks with the highest losing card', () => {
    const hand = [c('A', 'H'), c('7', 'H'), c('3', 'H')];
    const trick = [{ seat: 0, card: c('8', 'H') }];
    expect(chooseBotCard({ ...base, hand, trick, bid: 0, won: 0 }).id).toBe('7H#0');
  });

  it('ruffs with the lowest trump when void and chasing', () => {
    const hand = [c('K', 'S'), c('4', 'S'), c('3', 'D')];
    const trick = [
      { seat: 0, card: c('5', 'H') },
      { seat: 1, card: c('A', 'H') },
      { seat: 2, card: c('2', 'H') },
    ];
    expect(chooseBotCard({ ...base, hand, trick, bid: 1, won: 0 }).id).toBe('4S#0');
  });

  it('knows a later identical card wins (2 decks)', () => {
    const hand = [c('A', 'S', 1), c('2', 'D')];
    const trick = [
      { seat: 0, card: c('5', 'H') },
      { seat: 1, card: c('A', 'S', 0) },
      { seat: 2, card: c('2', 'H') },
    ];
    // Void in hearts, chasing: the second A♠ beats the first.
    expect(chooseBotCard({ ...base, hand, trick, bid: 1, won: 0 }).id).toBe('AS#1');
  });
});
