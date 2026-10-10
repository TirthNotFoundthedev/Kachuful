import type { RoomSnapshot } from '@kachuful/shared';
import { Scoreboard } from '../components/Scoreboard';
import { request } from '../net/socket';
import { leaveRoom, send } from '../net/store';

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function GameOver({ snap }: { snap: RoomSnapshot }) {
  const game = snap.game!;
  const standings = game.standings ?? [];
  const isHost = snap.hostId === snap.youId;
  const rankCounts = new Map<number, number>();
  for (const s of standings) rankCounts.set(s.rank, (rankCounts.get(s.rank) ?? 0) + 1);
  const winners = standings.filter((s) => s.rank === 1).map((s) => snap.players[s.seat]!);
  const youWon = winners.some((w) => w.id === snap.youId);
  const headline =
    winners.length > 1
      ? `${winners.map((w) => (w.id === snap.youId ? 'You' : w.name)).join(' & ')} share the win`
      : youWon
        ? 'You win'
        : `${winners[0]?.name ?? ''} wins`;

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-5 px-4 py-6">
      <header>
        <p className="text-sm font-bold text-felt-300">
          Game over · {game.totalRounds} rounds · {snap.settings.decks} deck{snap.settings.decks > 1 ? 's' : ''}
        </p>
        <h1 className="font-display text-4xl font-extrabold text-card sm:text-5xl">{headline}</h1>
      </header>

      <ol className="space-y-2" aria-label="Final standings">
        {standings.map((s) => {
          const p = snap.players[s.seat]!;
          const tied = (rankCounts.get(s.rank) ?? 0) > 1;
          return (
            <li
              key={s.seat}
              className={`flex items-center gap-4 rounded-lg border px-4 py-3 ${
                s.rank === 1 ? 'border-marigold bg-felt-700' : 'border-felt-600 bg-felt-900/70'
              }`}
            >
              <span className={`w-16 font-display text-2xl font-extrabold ${s.rank === 1 ? 'text-marigold' : 'text-felt-300'}`}>
                {tied ? `=${ordinal(s.rank)}` : ordinal(s.rank)}
              </span>
              <span className="min-w-0 flex-1 truncate text-lg font-bold text-card">
                {p.id === snap.youId ? 'You' : p.name}
              </span>
              <span className="text-right">
                <span className="block font-display text-2xl font-extrabold text-card tabular-nums">{s.total}</span>
                <span className="block text-xs text-felt-300">{s.exactBids} exact bids</span>
              </span>
            </li>
          );
        })}
      </ol>
      {snap.settings.tieBreak === 'exactBids' && (
        <p className="text-sm text-felt-300">Equal totals are ranked by exact bids; players equal on both share the place.</p>
      )}

      <div className="flex flex-wrap gap-3">
        {isHost ? (
          <button type="button" className="btn-primary flex-1" onClick={() => void send(request('room:playAgain'))}>
            Play again with this table
          </button>
        ) : (
          <p className="flex-1 self-center text-sm">The host can start a new game with the same table.</p>
        )}
        <button type="button" className="btn-quiet" onClick={() => void leaveRoom()}>
          Leave
        </button>
      </div>

      <section className="panel p-3" aria-labelledby="final-scores">
        <h2 id="final-scores" className="mb-2 text-lg font-bold text-card">
          Every round
        </h2>
        <Scoreboard game={game} players={snap.players} youId={snap.youId} />
      </section>
    </main>
  );
}
