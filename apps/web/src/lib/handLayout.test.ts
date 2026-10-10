import { describe, expect, it } from 'vitest';
import { layoutHand } from './handLayout';

const base = { cardWidth: 60, minStep: 22, maxStep: 64 };

describe('layoutHand', () => {
  it('spaces few cards at max step', () => {
    const l = layoutHand({ ...base, count: 3, containerWidth: 360 });
    expect(l.rows).toHaveLength(1);
    expect(l.step).toBe(64);
  });

  it('overlaps a 13-card hand in one row on a 360px phone', () => {
    const l = layoutHand({ ...base, count: 13, containerWidth: 344 });
    expect(l.rows).toHaveLength(1);
    expect(l.step).toBeCloseTo(284 / 12);
    expect(l.step * 12 + 60).toBeLessThanOrEqual(344);
  });

  it('splits a 26-card hand into two rows on a phone', () => {
    const l = layoutHand({ ...base, count: 26, containerWidth: 344 });
    expect(l.rows.map((r) => r.length)).toEqual([13, 13]);
    expect(l.step * 12 + 60).toBeLessThanOrEqual(344);
  });

  it('keeps 26 cards in one row on a laptop', () => {
    const l = layoutHand({ ...base, cardWidth: 84, count: 26, containerWidth: 1100 });
    expect(l.rows).toHaveLength(1);
  });

  it('handles empty and single hands', () => {
    expect(layoutHand({ ...base, count: 0, containerWidth: 300 }).rows).toEqual([[]]);
    expect(layoutHand({ ...base, count: 1, containerWidth: 300 }).rows).toEqual([[0]]);
  });
});
