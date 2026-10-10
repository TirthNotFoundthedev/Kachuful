import type { PublicGame, PublicPlayer } from '@kachuful/shared';

interface Props {
  players: PublicPlayer[];
  game: PublicGame;
  youId: string;
  secondsLeft: number | null;
  turnSeconds: number;
}

/** You first, then the others in turn order (the player on your left next), like sitting at the table. */
export function orderedFromMe(players: PublicPlayer[], mySeat: number): PublicPlayer[] {
  const n = players.length;
  return Array.from({ length: n }, (_, i) => players[(mySeat + i) % n]!);
}

export function SeatChip({
  player,
  game,
  isYou,
  secondsLeft,
  turnSeconds,
}: {
  player: PublicPlayer;
  game: PublicGame;
  isYou: boolean;
  secondsLeft: number | null;
  turnSeconds: number;
}) {
  const seat = player.seat;
  const active = game.turn === seat;
  const bid = game.bids[seat];
  const won = game.won[seat] ?? 0;
  const status = player.away ? (player.connected ? 'Auto-play' : 'Offline · auto-play') : null;
  const tookTrick = game.completedTrick?.winnerSeat === seat;
  const pct = active && secondsLeft !== null && turnSeconds > 0 ? Math.min(100, (secondsLeft / turnSeconds) * 100) : null;
  const onTrack = bid !== null && bid !== undefined && won === bid;
  const bust = bid !== null && bid !== undefined && won > bid;

  return (
    <div
      className={`relative flex min-w-[6.5rem] shrink-0 flex-col gap-0.5 overflow-hidden rounded-md border px-2.5 py-1.5 transition-colors ${
        active ? 'border-marigold bg-felt-700' : tookTrick ? 'border-felt-300 bg-felt-700/70' : 'border-felt-600 bg-felt-900/70'
      }`}
      aria-current={active ? 'true' : undefined}
      aria-label={`${player.name}${isYou ? ' (you)' : ''}${active ? ', to act' : ''}${seat === game.dealer ? ', dealer' : ''}. Bid ${bid ?? 'not yet'}, won ${won}, ${game.totals[seat] ?? 0} points`}
    >
      <div className="flex items-center gap-1.5">
        {active && <span className="sr-only">Turn: </span>}
        <span className={`truncate text-sm font-bold ${active ? 'text-marigold' : 'text-card'}`}>
          {isYou ? 'You' : player.name}
        </span>
        {seat === game.dealer && (
          <span className="rounded-sm bg-felt-950 px-1 text-[0.65rem] font-bold text-felt-300" title="Dealer (bids last)">
            D
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2 text-xs">
        <span className="tabular-nums">
          <span className="text-felt-300">Bid </span>
          <span className="font-bold text-card">{bid ?? '–'}</span>
        </span>
        <span className="tabular-nums">
          <span className="text-felt-300">Won </span>
          <span className={`font-bold ${bust ? 'text-danger' : onTrack ? 'text-marigold' : 'text-card'}`}>{won}</span>
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-bold text-card tabular-nums">{game.totals[seat] ?? 0} pts</span>
        <span className="text-felt-300 tabular-nums" title="Cards in hand">
          {game.handCounts[seat] ?? 0} cards
        </span>
      </div>
      {status && <span className="text-[0.65rem] font-bold text-danger">{status}</span>}
      {pct !== null && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-felt-950" aria-hidden>
          <div className="h-full bg-marigold transition-[width] duration-300 ease-linear" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export function SeatStrip({ players, game, youId, secondsLeft, turnSeconds }: Props) {
  const me = players.find((p) => p.id === youId);
  const ordered = me ? orderedFromMe(players, me.seat) : players;
  return (
    <div className="flex gap-2 overflow-x-auto px-3 py-1 [scrollbar-width:thin]" aria-label="Players in turn order">
      {ordered.map((p) => (
        <SeatChip
          key={p.id}
          player={p}
          game={game}
          isYou={p.id === youId}
          secondsLeft={secondsLeft}
          turnSeconds={turnSeconds}
        />
      ))}
    </div>
  );
}
