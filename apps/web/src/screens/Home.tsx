import { MAX_NAME_LENGTH, ROOM_CODE_LENGTH } from '@kachuful/shared';
import { type FormEvent, useState } from 'react';
import { SERVER_URL, setServerUrl } from '../config';
import { HowToPlay } from '../components/HowToPlay';
import { loadName } from '../net/session';
import { createRoom, joinRoom, useApp } from '../net/store';

export function Home() {
  const route = useApp((s) => s.route);
  const conn = useApp((s) => s.conn);
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState(route.name === 'home' ? (route.code ?? '') : '');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);
  const [serverInput, setServerInput] = useState(SERVER_URL);
  const invited = route.name === 'home' && Boolean(route.code);

  const trimmed = name.trim();
  const canAct = trimmed.length > 0 && conn === 'connected' && busy === null;

  async function run(kind: 'create' | 'join') {
    setBusy(kind);
    setError(null);
    const res = kind === 'create' ? await createRoom(trimmed) : await joinRoom(code, trimmed);
    if (!res.ok) setError(res.message);
    setBusy(null);
  }

  function onJoin(e: FormEvent) {
    e.preventDefault();
    if (canAct && code.trim().length >= 4) void run('join');
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 px-4 py-8">
      <header>
        <h1 className="font-display text-5xl font-extrabold tracking-tight text-card">Kachuful</h1>
        <p className="mt-2 text-lg">Bid the exact number of tricks you will take. Not one more, not one less.</p>
      </header>

      <div className="panel space-y-5 p-5">
        <div>
          <label htmlFor="name" className="label">
            Your name
          </label>
          <input
            id="name"
            className="input"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            autoComplete="nickname"
            placeholder="Name shown at the table"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {!invited && (
          <button type="button" className="btn-primary w-full" disabled={!canAct} onClick={() => void run('create')}>
            {busy === 'create' ? 'Creating…' : 'Create a room'}
          </button>
        )}

        <form onSubmit={onJoin} className="space-y-2">
          <label htmlFor="code" className="label">
            {invited ? 'You were invited to room' : 'Or join with a room code'}
          </label>
          <div className="flex gap-2">
            <input
              id="code"
              className="input font-display tracking-[0.2em] uppercase"
              value={code}
              maxLength={ROOM_CODE_LENGTH + 2}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="ABCDE"
              onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())}
            />
            <button
              type="submit"
              className={invited ? 'btn-primary shrink-0' : 'btn-quiet shrink-0'}
              disabled={!canAct || code.trim().length < 4}
            >
              {busy === 'join' ? 'Joining…' : 'Join'}
            </button>
          </div>
        </form>

        {error && (
          <p role="alert" className="font-bold text-danger">
            {error}
          </p>
        )}
        {conn !== 'connected' && <p className="text-sm text-felt-300">Connecting to the server…</p>}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <button type="button" className="text-base font-bold text-felt-200 underline underline-offset-4" onClick={() => setRulesOpen(true)}>
          How to play
        </button>
        <button type="button" className="text-base font-bold text-felt-200 underline underline-offset-4" onClick={() => setServerOpen((o) => !o)}>
          Server
        </button>
      </div>
      {serverOpen && (
        <form
          className="panel space-y-2 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!setServerUrl(serverInput)) setError('Enter a full server address, like https://example.trycloudflare.com');
          }}
        >
          <label htmlFor="server" className="label">
            Game server address
          </label>
          <div className="flex gap-2">
            <input
              id="server"
              className="input"
              value={serverInput}
              inputMode="url"
              autoCapitalize="none"
              autoComplete="off"
              onChange={(e) => setServerInput(e.target.value)}
            />
            <button type="submit" className="btn-quiet shrink-0">
              Connect
            </button>
          </div>
        </form>
      )}
      <HowToPlay open={rulesOpen} onClose={() => setRulesOpen(false)} decks={1} tieBreak="exactBids" />
    </main>
  );
}
