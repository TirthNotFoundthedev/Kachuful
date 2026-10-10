import { describe, expect, it } from 'vitest';
import {
  type GameState,
  allowedBids,
  chooseBotBid,
  chooseBotCard,
  collectTrick,
  createGame,
  forbiddenBid,
  legalCardIds,
  makeCard,
  nextRound,
  placeBid,
  playCard,
  scoreRound,
  seededRandomInt,
  winners,
} from '../src';

function unwrap(res: ReturnType<typeof placeBid>): GameState {
  if (!res.ok) throw new Error(`${res.code}: ${res.message}`);
  return res.state;
}

function newGame(players: number, decks: number, seed = 1, firstDealer = 0, rounds?: number): GameState {
  return unwrap(createGame({ players, decks, tieBreak: 'shared', firstDealer, ...(rounds ? { rounds } : {}) }, seededRandomInt(seed)));
}

/** Drive a full game with bots at every seat, checking invariants along the way. */
function playOut(state: GameState, seed: number): GameState {
  const rng = seededRandomInt(seed);
  let s = state;
  let guard = 0;
  while (s.phase !== 'GAME_OVER') {
    if (++guard > 100_000) throw new Error('game did not terminate');
    if (s.phase === 'BIDDING') {
      const seat = s.turn;
      const allowed = allowedBids(s, seat);
      expect(allowed.length).toBeGreaterThan(0);
      const bid = chooseBotBid({
        hand: s.hands[seat]!,
        trump: s.trump,
        players: s.config.players,
        cardsThisRound: s.cardsThisRound,
        allowed,
      });
      s = unwrap(placeBid(s, seat, bid));
      if (s.phase === 'PLAYING') {
        const total = s.bids.reduce<number>((a, b) => a + (b ?? 0), 0);
        expect(total).not.toBe(s.cardsThisRound);
      }
    } else if (s.phase === 'PLAYING') {
      if (s.completedTrick) {
        s = unwrap(collectTrick(s));
        continue;
      }
      const seat = s.turn;
      const card = chooseBotCard({
        hand: s.hands[seat]!,
        trump: s.trump,
        trick: s.trick,
        seat,
        bid: s.bids[seat]!,
        won: s.won[seat]!,
        players: s.config.players,
      });
      expect(legalCardIds(s, seat)).toContain(card.id);
      s = unwrap(playCard(s, seat, card.id));
    } else if (s.phase === 'ROUND_SCORE') {
      const rec = s.history[s.history.length - 1]!;
      expect(rec.won.reduce((a, b) => a + b, 0)).toBe(rec.cards);
      rec.points.forEach((p, i) => expect(p).toBe(scoreRound(rec.bids[i]!, rec.won[i]!)));
      s = unwrap(nextRound(s, rng));
    }
  }
  return s;
}

describe('createGame', () => {
  it('starts round 1 with 1 card each, spades trump, left of dealer to bid', () => {
    const s = newGame(4, 1, 1, 2);
    expect(s).toMatchObject({ phase: 'BIDDING', round: 1, cardsThisRound: 1, trump: 'S', dealer: 2, turn: 3, totalRounds: 13 });
    expect(s.bidOrder).toEqual([3, 0, 1, 2]);
    expect(s.hands.map((h) => h.length)).toEqual([1, 1, 1, 1]);
  });

  it('2 decks with 4 players gives 26 rounds', () => {
    expect(newGame(4, 2).totalRounds).toBe(26);
  });

  it('rejects bad config', () => {
    expect(createGame({ players: 2, decks: 1, tieBreak: 'shared', firstDealer: 0 }).ok).toBe(false);
    expect(createGame({ players: 4, decks: 3, tieBreak: 'shared', firstDealer: 0 }).ok).toBe(false);
    expect(createGame({ players: 4, decks: 1, tieBreak: 'shared', firstDealer: 4 }).ok).toBe(false);
  });
});

describe('bidding flow', () => {
  it('rejects out-of-turn bids and wrong phase actions', () => {
    const s = newGame(4, 1, 1, 0); // seat 1 bids first
    expect(placeBid(s, 0, 0)).toMatchObject({ ok: false, code: 'NOT_YOUR_TURN' });
    expect(playCard(s, 1, s.hands[1]![0]!.id)).toMatchObject({ ok: false, code: 'WRONG_PHASE' });
    expect(placeBid(s, 1, 2)).toMatchObject({ ok: false, code: 'INVALID_BID' });
  });

  it('enforces the dealer restriction and reports the forbidden number', () => {
    let s = newGame(4, 1, 1, 0);
    s = unwrap(placeBid(s, 1, 0));
    s = unwrap(placeBid(s, 2, 0));
    s = unwrap(placeBid(s, 3, 0));
    expect(s.turn).toBe(0);
    expect(forbiddenBid(s, 0)).toBe(1);
    expect(allowedBids(s, 0)).toEqual([0]);
    expect(placeBid(s, 0, 1)).toMatchObject({ ok: false, code: 'FORBIDDEN_BID' });
    s = unwrap(placeBid(s, 0, 0));
    expect(s.phase).toBe('PLAYING');
    expect(s.turn).toBe(1);
  });

  it('does not mutate the input state', () => {
    const s = newGame(4, 1);
    const snapshot = JSON.stringify(s);
    placeBid(s, s.turn, 0);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('duplicate bid is rejected (turn has moved on)', () => {
    let s = newGame(4, 1, 1, 0);
    s = unwrap(placeBid(s, 1, 1));
    expect(placeBid(s, 1, 1)).toMatchObject({ ok: false, code: 'NOT_YOUR_TURN' });
  });
});

describe('trick flow', () => {
  function forcedRound2(): GameState {
    // Build a deterministic round-2 state by hand: 3 players, trump Diamonds.
    let s = newGame(3, 1, 5, 0, 3);
    // finish round 1 with bots
    while (s.round === 1) {
      if (s.phase === 'BIDDING') s = unwrap(placeBid(s, s.turn, allowedBids(s, s.turn)[0]!));
      else if (s.phase === 'PLAYING') s = s.completedTrick ? unwrap(collectTrick(s)) : unwrap(playCard(s, s.turn, legalCardIds(s, s.turn)[0]!));
      else s = unwrap(nextRound(s, seededRandomInt(9)));
    }
    expect(s.trump).toBe('D');
    expect(s.dealer).toBe(1);
    s.hands = [
      [makeCard('A', 'S'), makeCard('2', 'D')],
      [makeCard('K', 'S'), makeCard('3', 'C')],
      [makeCard('5', 'H'), makeCard('Q', 'S')],
    ];
    return s;
  }

  it('enforces follow suit, resolves trump, and winner leads next', () => {
    let s = forcedRound2();
    // bid order: 2, 0, 1
    s = unwrap(placeBid(s, 2, 0));
    s = unwrap(placeBid(s, 0, 1));
    expect(allowedBids(s, 1)).toEqual([0, 2]);
    s = unwrap(placeBid(s, 1, 0));
    expect(s.turn).toBe(2);
    s = unwrap(playCard(s, 2, 'QS#0')); // lead spades
    expect(legalCardIds(s, 0)).toEqual(['AS#0']);
    expect(playCard(s, 0, '2D#0')).toMatchObject({ ok: false, code: 'MUST_FOLLOW_SUIT' });
    expect(playCard(s, 0, 'KH#0')).toMatchObject({ ok: false, code: 'CARD_NOT_IN_HAND' });
    s = unwrap(playCard(s, 0, 'AS#0'));
    s = unwrap(playCard(s, 1, 'KS#0'));
    expect(s.completedTrick?.winnerSeat).toBe(0);
    expect(s.turn).toBe(-1);
    expect(playCard(s, 2, '5H#0')).toMatchObject({ ok: false, code: 'TRICK_RESOLVING' });
    s = unwrap(collectTrick(s));
    expect(s.won).toEqual([1, 0, 0]);
    expect(s.turn).toBe(0);
    expect(s.lastTrick?.plays).toHaveLength(3);
    // trick 2: seat 0 leads 2D (trump); others void -> anything
    s = unwrap(playCard(s, 0, '2D#0'));
    expect(legalCardIds(s, 1)).toEqual(['3C#0']);
    s = unwrap(playCard(s, 1, '3C#0'));
    s = unwrap(playCard(s, 2, '5H#0'));
    s = unwrap(collectTrick(s));
    expect(s.phase).toBe('ROUND_SCORE');
    const rec = s.history[1]!;
    expect(rec.won).toEqual([2, 0, 0]);
    expect(rec.points).toEqual([0, 10, 10]);
  });
});

describe('full games', () => {
  it.each([
    [4, 1, 13],
    [4, 2, 26],
    [3, 1, 17],
    [5, 1, 10],
    [7, 2, 14],
    [10, 1, 5],
  ])('%i players / %i deck(s) play all %i rounds', (players, decks, rounds) => {
    const end = playOut(newGame(players, decks, players * 10 + decks, players - 1), 42);
    expect(end.history).toHaveLength(rounds);
    expect(end.history.map((h) => h.cards)).toEqual(Array.from({ length: rounds }, (_, i) => i + 1));
    expect(end.history.map((h) => h.trump).slice(0, 5)).toEqual(['S', 'D', 'C', 'H', 'S']);
    // dealer rotates
    end.history.forEach((h, i) => expect(h.dealer).toBe((players - 1 + i) % players));
    // totals match history
    end.totals.forEach((t, seat) => expect(t).toBe(end.history.reduce((a, h) => a + h.points[seat]!, 0)));
    expect(end.standings).toHaveLength(players);
    expect(winners(end).length).toBeGreaterThan(0);
    expect(nextRound(end)).toMatchObject({ ok: false, code: 'WRONG_PHASE' });
  });
});
