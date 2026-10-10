export interface HandLayoutInput {
  count: number;
  containerWidth: number;
  cardWidth: number;
  /** Minimum visible slice of an overlapped card before switching to two rows. */
  minStep: number;
  /** Largest gap between card origins (cards spaced out when few). */
  maxStep: number;
}

export interface HandLayout {
  rows: number[][]; // card indexes per row
  step: number;
}

/**
 * One overlapped row while each card keeps at least `minStep` px visible,
 * otherwise two rows (needed for 26-card hands on a phone).
 */
export function layoutHand({ count, containerWidth, cardWidth, minStep, maxStep }: HandLayoutInput): HandLayout {
  const all = Array.from({ length: count }, (_, i) => i);
  if (count <= 1) return { rows: [all], step: maxStep };
  const stepFor = (n: number) => Math.min(maxStep, (containerWidth - cardWidth) / Math.max(1, n - 1));
  const single = stepFor(count);
  if (single >= minStep) return { rows: [all], step: single };
  const firstRow = Math.ceil(count / 2);
  return { rows: [all.slice(0, firstRow), all.slice(firstRow)], step: Math.max(4, stepFor(firstRow)) };
}
