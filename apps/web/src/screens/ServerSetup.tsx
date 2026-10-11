import { useState } from 'react';
import { SERVER_DOWNLOAD_URL, SERVER_GUIDE_URL, setServerUrl } from '../config';

/** Address box plus the "host your own" option. Shared by the first-visit screen and the failed-connection screen. */
export function ServerChoice({ initial = '' }: { initial?: string }) {
  const [input, setInput] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <form
        className="panel space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || !setServerUrl(input)) setError('Enter a full server address, like https://some-words.trycloudflare.com');
        }}
      >
        <h2 className="text-xl font-bold text-card">Join a friend's server</h2>
        <p>
          If someone sent you a game link, open that link instead. Otherwise paste the server address the host's
          <code className="mx-1">server.exe</code> window shows.
        </p>
        <label htmlFor="server-address" className="label">
          Server address
        </label>
        <div className="flex gap-2">
          <input
            id="server-address"
            className="input"
            value={input}
            inputMode="url"
            autoCapitalize="none"
            autoComplete="off"
            placeholder="https://some-words.trycloudflare.com"
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
          />
          <button type="submit" className="btn-primary shrink-0">
            Connect
          </button>
        </div>
        {error && (
          <p role="alert" className="font-bold text-danger">
            {error}
          </p>
        )}
      </form>

      <div className="panel space-y-3 p-5">
        <h2 className="text-xl font-bold text-card">Host your own game</h2>
        <p>
          Download <code>server.exe</code> and run it on a Windows laptop. It prints a link to share with your friends.
          Open that link to play.
        </p>
        <a className="btn-quiet block w-full text-center" href={SERVER_DOWNLOAD_URL}>
          Download server.exe
        </a>
        <a
          className="block text-sm font-bold text-felt-200 underline underline-offset-4"
          href={SERVER_GUIDE_URL}
          target="_blank"
          rel="noreferrer"
        >
          Step-by-step setup guide on GitHub
        </a>
      </div>
    </>
  );
}

/** Shown on the hosted site when the visitor has no server link and has not entered an address yet. */
export function ServerSetup() {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-5 px-4 py-10">
      <header>
        <h1 className="font-display text-5xl font-extrabold tracking-tight text-card">Kachuful</h1>
        <p className="mt-2 text-lg">Games run on a server one of the players hosts. Pick how you want to connect.</p>
      </header>
      <ServerChoice />
    </main>
  );
}
