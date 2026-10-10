import { useEffect } from 'react';
import { ConnectionBanner, Toasts } from './components/Toasts';
import { navigate, useApp, wakeServer } from './net/store';
import { Game } from './screens/Game';
import { GameOver } from './screens/GameOver';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { WakingServer } from './screens/WakingServer';

function Centered({ text }: { text: string }) {
  return (
    <main className="flex min-h-full items-center justify-center px-4" role="status" aria-live="polite">
      <p className="text-lg">{text}</p>
    </main>
  );
}

function Screen() {
  const wake = useApp((s) => s.wake);
  const conn = useApp((s) => s.conn);
  const route = useApp((s) => s.route);
  const session = useApp((s) => s.session);
  const snapshot = useApp((s) => s.snapshot);

  // A room link without a seat for that room becomes an invite on the home screen.
  const hasSeat = route.name === 'room' && session?.code === route.code;
  useEffect(() => {
    if (route.name === 'room' && !hasSeat) navigate({ name: 'home', code: route.code }, true);
  }, [route, hasSeat]);

  if (conn !== 'connected' && !snapshot && (wake === 'waking' || wake === 'failed')) return <WakingServer />;
  if (conn !== 'connected' && !snapshot) return <Centered text="Connecting…" />;

  if (route.name === 'room' && hasSeat) {
    if (!snapshot || snapshot.code !== route.code) return <Centered text="Rejoining your seat…" />;
    if (snapshot.phase === 'LOBBY') return <Lobby snap={snapshot} />;
    if (snapshot.phase === 'GAME_OVER') return <GameOver snap={snapshot} />;
    return <Game snap={snapshot} />;
  }
  return <Home />;
}

export function App() {
  useEffect(() => {
    void wakeServer();
  }, []);
  return (
    <>
      <Screen />
      <Toasts />
      <ConnectionBanner />
    </>
  );
}
