import { type CompletedTrick, type PublicGame, type PublicPlayer, type TrickPlay, SUIT_INFO } from '@kachuful/shared';
import { AnimatePresence, motion } from 'motion/react';
import { PlayingCard, suitColorClass } from './PlayingCard';

interface Props {
  game: PublicGame;
  players: PublicPlayer[];
  youId: string;
  compact: boolean;
}

export function TrickCards({
  plays,
  players,
  youId,
  winnerSeat,
  width,
  animate = true,
}: {
  plays: TrickPlay[];
  players: PublicPlayer[];
  youId: string;
  winnerSeat: number | null;
  width: number;
  animate?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-center gap-x-2 gap-y-3">
      <AnimatePresence>
        {plays.map((p, i) => {
          const player = players[p.seat];
          const isWinner = winnerSeat === p.seat;
          const isYou = player?.id === youId;
          return (
            <motion.div
              key={p.card.id}
              layoutId={animate && isYou ? p.card.id : undefined}
              initial={animate && !isYou ? { opacity: 0, y: -60, scale: 0.9 } : false}
              animate={{ opacity: 1, y: isWinner ? -6 : 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="flex flex-col items-center gap-1"
              style={{ width: width + 12 }}
            >
              <PlayingCard
                card={p.card}
                width={width}
                className={isWinner ? 'ring-4 ring-marigold' : ''}
              />
              <span className={`max-w-full truncate text-xs ${isWinner ? 'font-bold text-marigold' : 'text-felt-200'}`}>
                {i === 0 ? '▸ ' : ''}
                {isYou ? 'You' : (player?.name ?? '?')}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function TrickArea({ game, players, youId, compact }: Props) {
  const completed: CompletedTrick | null = game.completedTrick;
  const plays = completed?.plays ?? game.trick;
  const lead = completed?.leadSuit ?? game.leadSuit;
  const winner = completed ? players[completed.winnerSeat] : null;
  const width = compact ? 52 : players.length > 6 ? 62 : 74;

  return (
    <section aria-label="Current trick" className="flex w-full flex-col items-center gap-3">
      <div className="flex min-h-7 items-center gap-3 text-sm">
        <span className="text-felt-300">
          Trick {Math.min(game.trickNumber, game.cardsThisRound)} of {game.cardsThisRound}
        </span>
        {lead && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-felt-500 bg-felt-950/60 px-2 py-0.5">
            <span className="text-felt-300">Lead</span>
            <span className={`rounded bg-card px-1 font-bold ${suitColorClass(lead)}`}>{SUIT_INFO[lead].symbol}</span>
            <span className="font-bold text-card">{SUIT_INFO[lead].name}</span>
          </span>
        )}
      </div>
      <div className="flex min-h-[7.5rem] w-full items-center justify-center" aria-live="polite">
        {plays.length === 0 ? (
          <p className="text-felt-300">
            {game.turn >= 0 ? `${players[game.turn]?.id === youId ? 'You lead' : `${players[game.turn]?.name ?? ''} leads`} this trick` : ''}
          </p>
        ) : (
          <TrickCards plays={plays} players={players} youId={youId} winnerSeat={completed?.winnerSeat ?? null} width={width} />
        )}
      </div>
      <p className="min-h-6 text-center font-bold text-card" role="status">
        {winner ? `${winner.id === youId ? 'You take' : `${winner.name} takes`} the trick` : ''}
      </p>
    </section>
  );
}
