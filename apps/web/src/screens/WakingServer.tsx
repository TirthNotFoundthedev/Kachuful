import { useApp, wakeServer } from '../net/store';
import { useNow } from '../lib/useNow';

/** Shown while the free Render instance cold-starts (it sleeps after ~15 idle minutes). */
export function WakingServer() {
  const wake = useApp((s) => s.wake);
  const startedAt = useApp((s) => s.wakeStartedAt);
  const now = useNow(wake === 'waking', 1000);
  const elapsed = Math.max(0, Math.round((now - startedAt) / 1000));

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-5 px-4 py-10">
      <h1 className="font-display text-4xl font-extrabold text-card">Kachuful</h1>
      {wake === 'failed' ? (
        <div className="panel space-y-4 p-5" role="alert">
          <h2 className="text-xl font-bold text-card">The game server is not answering</h2>
          <p>It may be down or your network may be blocking it. Try again in a minute.</p>
          <button type="button" className="btn-primary w-full" onClick={() => void wakeServer()}>
            Try again
          </button>
        </div>
      ) : (
        <div className="panel space-y-3 p-5" role="status" aria-live="polite">
          <h2 className="text-xl font-bold text-card">Waking up the game server</h2>
          <p>
            The server sleeps when nobody is playing. The first visit after a break takes up to a minute while it
            starts.
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-felt-950">
            <div
              className="h-full rounded-full bg-marigold transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.min(95, (elapsed / 60) * 100)}%` }}
            />
          </div>
          <p className="text-sm text-felt-300">{elapsed}s elapsed</p>
        </div>
      )}
    </main>
  );
}
