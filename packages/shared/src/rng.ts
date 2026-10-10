/**
 * Random source used by the engine. Returns an integer in [0, maxExclusive).
 * Injected so tests can be deterministic and production can use crypto.
 */
export type RandomInt = (maxExclusive: number) => number;

interface CryptoLike {
  getRandomValues<T extends ArrayBufferView | null>(array: T): T;
}

function getCrypto(): CryptoLike {
  const c = (globalThis as { crypto?: CryptoLike }).crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error('Web Crypto getRandomValues is not available in this runtime');
  }
  return c;
}

/**
 * Unbiased cryptographically secure integer in [0, maxExclusive) using rejection sampling
 * over 32-bit values. Works in browsers and Node >= 19 (globalThis.crypto).
 */
export const secureRandomInt: RandomInt = (maxExclusive) => {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 2 ** 32) {
    throw new RangeError(`maxExclusive must be an integer in [1, 2^32], got ${maxExclusive}`);
  }
  const crypto = getCrypto();
  const buf = new Uint32Array(1);
  const limit = 2 ** 32 - (2 ** 32 % maxExclusive);
  for (;;) {
    crypto.getRandomValues(buf);
    const v = buf[0]!;
    if (v < limit) return v % maxExclusive;
  }
};

/** Deterministic PRNG (mulberry32) for tests and replays. Not for production shuffles. */
export function seededRandomInt(seed: number): RandomInt {
  let a = seed >>> 0;
  return (maxExclusive) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(r * maxExclusive);
  };
}

/** In-place Fisher-Yates shuffle. */
export function shuffleInPlace<T>(items: T[], randomInt: RandomInt = secureRandomInt): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}
