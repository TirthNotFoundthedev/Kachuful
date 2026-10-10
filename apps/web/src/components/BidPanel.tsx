import type { PrivateView, PublicGame, PublicPlayer } from '@kachuful/shared';
import { useEffect, useState } from 'react';

interface Props {
  game: PublicGame;
  priv: PrivateView;
  players: PublicPlayer[];
  youId: string;
  mySeat: number;
  onBid: (bid: number) => void;
}

export function BidPanel({ game, priv, players, youId, mySeat, onBid }: Props) {
  const myTurn = game.phase === 'BIDDING' && game.turn === mySeat;
  const [choice, setChoice] = useState<number | null>(null);
  const r = game.cardsThisRound;
  const bidsSoFar = game.bids.reduce<number>((a, b) => a + (b ?? 0), 0);
  const isDealer = game.dealer === mySeat;

  useEffect(() => setChoice(null), [game.round, myTurn]);

  // Number keys bid on desktop (0-9).
  useEffect(() => {
    if (!myTurn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (/^[0-9]$/.test(e.key)) {
        const n = Number(e.key);
        if (priv.allowedBids.includes(n)) setChoice(n);
      } else if (e.key === 'Enter' && choice !== null && document.activeElement?.tagName !== 'BUTTON') {
        onBid(choice);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [myTurn, priv.allowedBids, choice, onBid]);

  return (
    <section aria-label="Bidding" className="flex w-full max-w-xl flex-col items-center gap-3 px-3">
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
        {game.bidOrder.map((seat) => {
          const p = players[seat]!;
          const b = game.bids[seat];
          return (
            <span key={seat} className={game.turn === seat ? 'font-bold text-marigold' : ''}>
              {p.id === youId ? 'You' : p.name}: <span className="font-bold text-card tabular-nums">{b ?? (game.turn === seat ? '…' : '–')}</span>
            </span>
          );
        })}
      </div>
      <p className="text-sm text-felt-300">
        Bids so far: <span className="font-bold text-card">{bidsSoFar}</span> of {r} tricks
      </p>

      {myTurn ? (
        <div className="panel w-full space-y-3 p-3">
          <h2 className="text-center text-lg font-bold text-marigold">How many tricks will you win?</h2>
          <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Your bid">
            {Array.from({ length: r + 1 }, (_, n) => {
              const forbidden = priv.forbiddenBid === n;
              const allowed = priv.allowedBids.includes(n);
              const sel = choice === n;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  disabled={!allowed}
                  aria-label={forbidden ? `${n}, not allowed: total bids would equal ${r}` : String(n)}
                  onClick={() => setChoice(n)}
                  onDoubleClick={() => allowed && onBid(n)}
                  className={`relative flex size-12 flex-col items-center justify-center rounded-md border text-xl font-bold tabular-nums ${
                    sel
                      ? 'border-marigold bg-marigold text-ink'
                      : forbidden
                        ? 'border-danger/60 bg-felt-950/60 text-felt-300 line-through decoration-2 decoration-danger'
                        : 'border-felt-500 bg-felt-950/50 text-card hover:border-marigold'
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          {priv.forbiddenBid !== null && (
            <p className="text-center text-sm">
              <span className="font-bold text-danger">{priv.forbiddenBid} is not allowed.</span> As dealer you bid last,
              and the total of all bids can&apos;t equal {r}.
            </p>
          )}
          <button
            type="button"
            className="btn-primary w-full text-lg"
            disabled={choice === null}
            onClick={() => choice !== null && onBid(choice)}
          >
            {choice === null ? 'Choose a number' : `Bid ${choice}`}
          </button>
        </div>
      ) : (
        <p className="text-center text-base" role="status">
          {game.phase === 'BIDDING' && game.turn >= 0 ? (
            <>
              Waiting for <span className="font-bold text-card">{players[game.turn]?.name}</span> to bid
              {game.turn === game.dealer ? ' (dealer, last)' : ''}…
            </>
          ) : null}
          {isDealer && game.bids[mySeat] === null && game.turn !== mySeat && (
            <span className="mt-1 block text-sm text-felt-300">You are the dealer: you bid last.</span>
          )}
        </p>
      )}
    </section>
  );
}
