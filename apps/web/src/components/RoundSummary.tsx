import { type PublicGame, type PublicPlayer, SUIT_INFO } from '@kachuful/shared';
import { Modal } from './Modal';

interface Props {
  game: PublicGame;
  players: PublicPlayer[];
  youId: string;
  secondsLeft: number | null;
  voted: boolean;
  votes: number;
  humans: number;
  onContinue: () => void;
}

export function RoundSummary({ game, players, youId, secondsLeft, voted, votes, humans, onContinue }: Props) {
  const rec = game.history[game.history.length - 1];
  if (!rec) return null;
  const last = game.round >= game.totalRounds;
  const rows = players
    .map((p) => ({ p, bid: rec.bids[p.seat]!, won: rec.won[p.seat]!, pts: rec.points[p.seat]!, total: game.totals[p.seat]! }))
    .sort((a, b) => b.total - a.total);

  return (
    <Modal
      open
      title={`Round ${rec.round} of ${game.totalRounds}`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-felt-300" aria-live="polite">
            {secondsLeft !== null ? `${last ? 'Results' : 'Next deal'} in ${secondsLeft}s` : ''}
            {voted && humans > 1 ? ` · ${votes}/${humans} ready` : ''}
          </span>
          <button type="button" className="btn-primary" disabled={voted} onClick={onContinue}>
            {voted ? 'Waiting…' : last ? 'See results' : 'Next round'}
          </button>
        </div>
      }
    >
      <p className="mb-3 text-sm">
        {rec.cards} card{rec.cards > 1 ? 's' : ''} each · Trump {SUIT_INFO[rec.trump].symbol} {SUIT_INFO[rec.trump].name}
      </p>
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-felt-300">
            <th scope="col" className="py-1 text-left">Player</th>
            <th scope="col" className="py-1 text-right">Bid</th>
            <th scope="col" className="py-1 text-right">Won</th>
            <th scope="col" className="py-1 text-right">Points</th>
            <th scope="col" className="py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, bid, won, pts, total }) => (
            <tr key={p.id} className="border-t border-felt-700">
              <th scope="row" className={`py-1.5 text-left font-bold ${p.id === youId ? 'text-marigold' : 'text-card'}`}>
                {p.id === youId ? 'You' : p.name}
              </th>
              <td className="text-right">{bid}</td>
              <td className="text-right">{won}</td>
              <td className={`text-right font-bold ${bid === won ? 'text-marigold' : 'text-felt-300'}`}>
                {bid === won ? `+${pts}` : 'missed'}
              </td>
              <td className="text-right font-display text-base font-extrabold text-card">{total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
