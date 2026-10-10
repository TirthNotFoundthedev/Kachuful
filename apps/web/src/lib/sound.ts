/** Tiny synthesized sound effects (no audio assets). */
const KEY = 'kachuful.sound';

let enabled = (() => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
})();
let ctx: AudioContext | null = null;
const subs = new Set<() => void>();

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  subs.forEach((s) => s());
}

export function subscribeSound(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

// Browsers only allow audio after a user gesture: create the context on the first tap or key press.
if (typeof window !== 'undefined') {
  const unlock = () => {
    try {
      ctx ??= new AudioContext();
      if (ctx.state === 'suspended') void ctx.resume();
    } catch {
      /* audio unavailable */
    }
  };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });
}

function tone(freq: number, durationMs: number, type: OscillatorType = 'sine', gain = 0.08, delayMs = 0): void {
  if (!enabled || !ctx) return;
  try {
    const t0 = ctx.currentTime + delayMs / 1000;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durationMs / 1000 + 0.05);
  } catch {
    /* audio unavailable */
  }
}

export const sfx = {
  card: () => tone(320, 90, 'triangle', 0.07),
  yourTurn: () => {
    tone(660, 140, 'sine', 0.07);
    tone(880, 180, 'sine', 0.06, 120);
  },
  trickWon: () => tone(520, 160, 'triangle', 0.06),
  deal: () => tone(240, 60, 'square', 0.025),
  roundEnd: () => {
    tone(523, 160, 'sine', 0.06);
    tone(659, 160, 'sine', 0.06, 140);
    tone(784, 260, 'sine', 0.06, 280);
  },
};
