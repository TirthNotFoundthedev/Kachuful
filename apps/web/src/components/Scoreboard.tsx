import { type PublicGame, type PublicPlayer, SUIT_INFO, trumpForRound } from '@kachuful/shared';
import { suitColorClass } from './PlayingCard';

interface Props {
  game: PublicGame;
  players: PublicPlayer[];
  youId: string;
}

/** Round-by-round table: bid / won and points for every player, plus running totals. */
export function Scoreboard({ game, players, youId }: Props) {
  const inProgress = game.phase === 'BIDDING' || game.phase === 'PLAYING';
  const rows = game.history.map((h) => ({ ...h, live: false }));
  if (inProgress) {
    rows.push({
      round: game.round,
      cards: game.cardsThisRound,
      trump: game.trump,
      dealer: game.dealer,
      bids: game.bids.map((b) => b ?? -1),
      won: game.won,
      points: [],
      live: true,
    });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm tabular-nums">
        <caption className="sr-only">Scores by round. Each cell shows bid / won and points.</caption>
        <thead>
          <tr className="border-b border-felt-600">
            <th scope="col" className="sticky left-0 bg-felt-900 px-2 py-1.5 text-left font-bold text-felt-300">
              Rd
            </th>
            {players.map((p) => (
              <th
                key={p.id}
                scope="col"
                className={`min-w-[4.25rem] px-2 py-1.5 text-right font-bold ${p.id === youId ? 'text-marigold' : 'text-card'}`}
              >
                <span className="block max-w-[6rem] truncate">{p.id === youId ? 'You' : p.name}</span>
              </th>
            ))}
          </tr>
          <tr className="border-b border-felt-600 bg-felt-950/50">
            <th scope="row" className="sticky left-0 bg-felt-950 px-2 py-1.5 text-left font-bold">
              Total
            </th>
            {players.map((p) => (
              <td key={p.id} className="px-2 py-1.5 text-right font-display text-base font-extrabold text-card">
                {game.totals[p.seat] ?? 0}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((row) => {
            const trump = trumpForRound(row.round);
            return (
              <tr key={row.round} className={`border-b border-felt-700/70 ${row.live ? 'bg-felt-700/40' : ''}`}>
                <th scope="row" className="sticky left-0 bg-felt-900 px-2 py-1 text-left font-normal whitespace-nowrap">
                  {row.round}
                  <span className={`ml-1 rounded bg-card px-0.5 ${suitColorClass(trump)}`} aria-label={SUIT_INFO[trump].name}>
                    {SUIT_INFO[trump].symbol}
                  </span>
                </th>
                {players.map((p) => {
                  const bid = row.bids[p.seat] ?? -1;
                  const won = row.won[p.seat] ?? 0;
                  const pts = row.points[p.seat];
                  const made = !row.live && bid === won;
                  return (
                    <td key={p.id} className="px-2 py-1 text-right whitespace-nowrap">
                      <span className="text-felt-300">
                        {bid < 0 ? '–' : bid}/{won}
                      </span>{' '}
                      {!row.live && <span className={made ? 'font-bold text-marigold' : 'text-felt-300'}>{pts}</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
