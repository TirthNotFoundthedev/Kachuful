import { useEffect, useState } from 'react';

/** Re-render every `intervalMs` while `active`; returns Date.now(). */
export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

/** Seconds left until a server-clock deadline, or null. */
export function secondsLeft(deadline: number | null, now: number, clockOffset: number): number | null {
  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - (now + clockOffset)) / 1000));
}
