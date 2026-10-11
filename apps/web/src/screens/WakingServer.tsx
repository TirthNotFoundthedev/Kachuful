import { useApp, wakeServer } from '../net/store';
import { useNow } from '../lib/useNow';
import { SERVER_URL, WAKE_GIVE_UP_MS } from '../config';
import { ServerChoice } from './ServerSetup';

/** Shown while the game server has not answered yet, and with a way out when it never does. */
export function WakingServer() {
  const wake = useApp((s) => s.wake);
  const startedAt = useApp((s) => s.wakeStartedAt);
  const now = useNow(wake === 'waking', 1000);
  const elapsed = Math.max(0, Math.round((now - startedAt) / 1000));

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-5 px-4 py-10">
      <h1 className="font-display text-4xl font-extrabold text-card">Kachuful</h1>
      {wake === 'failed' ? (
        <>
          <div className="panel space-y-4 p-5" role="alert">
            <h2 className="text-xl font-bold text-card">The game server is not answering</h2>
            <p>
              <span className="break-all">{SERVER_URL}</span> may be closed. Each run of server.exe gets a new
              address, so ask the host for the latest link, or enter a different server below.
            </p>
            <button type="button" className="btn-primary w-full" onClick={() => void wakeServer()}>
              Try again
            </button>
          </div>
          <ServerChoice />
        </>
      ) : (
        <div className="panel space-y-3 p-5" role="status" aria-live="polite">
          <h2 className="text-xl font-bold text-card">Connecting to the game server</h2>
          <p className="break-all">{SERVER_URL}</p>
          <div className="h-2 overflow-hidden rounded-full bg-felt-950">
            <div
              className="h-full rounded-full bg-marigold transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.min(95, ((elapsed * 1000) / WAKE_GIVE_UP_MS) * 100)}%` }}
            />
          </div>
          <p className="text-sm text-felt-300">{elapsed}s elapsed</p>
        </div>
      )}
    </main>
  );
}
