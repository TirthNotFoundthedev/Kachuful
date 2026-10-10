import { type RoomSnapshot, sortHand } from '@kachuful/shared';
import { LayoutGroup } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BidPanel } from '../components/BidPanel';
import { Hand } from '../components/Hand';
import { HowToPlay } from '../components/HowToPlay';
import { LastTrick } from '../components/LastTrick';
import { Modal } from '../components/Modal';
import { RoundSummary } from '../components/RoundSummary';
import { Scoreboard } from '../components/Scoreboard';
import { SeatStrip } from '../components/Seats';
import { TopBar } from '../components/TopBar';
import { TrickArea } from '../components/TrickArea';
import { sfx } from '../lib/sound';
import { secondsLeft, useNow } from '../lib/useNow';
import { newActionId, request } from '../net/socket';
import { leaveRoom, send, useApp } from '../net/store';

function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** Sound cues derived from snapshot changes. */
function useGameSounds(snap: RoomSnapshot, mySeat: number) {
  const prev = useRef<RoomSnapshot | null>(null);
  useEffect(() => {
    const p = prev.current?.game;
    const g = snap.game;
    prev.current = snap;
    if (!p || !g) return;
    if (g.round !== p.round) sfx.deal();
    else if (g.trick.length > p.trick.length || (g.completedTrick && !p.completedTrick)) sfx.card();
    if (g.completedTrick && !p.completedTrick) setTimeout(sfx.trickWon, 250);
    if (g.phase === 'ROUND_SCORE' && p.phase !== 'ROUND_SCORE') sfx.roundEnd();
    if (g.turn === mySeat && p.turn !== mySeat && (g.phase === 'BIDDING' || g.phase === 'PLAYING')) sfx.yourTurn();
  }, [snap, mySeat]);
}

export function Game({ snap }: { snap: RoomSnapshot }) {
  const game = snap.game!;
  const priv = snap.private;
  const clockOffset = useApp((s) => s.clockOffset);
  const me = snap.players.find((p) => p.id === snap.youId)!;
  const mySeat = me.seat;
  const wide = useMediaQuery('(min-width: 1024px)');
  const short = useMediaQuery('(max-height: 520px)');

  const [scoresOpen, setScoresOpen] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const pending = useRef(false);

  useGameSounds(snap, mySeat);

  const timed = game.turnDeadline !== null || game.nextRoundAt !== null;
  const now = useNow(timed, 250);
  const turnLeft = secondsLeft(game.turnDeadline, now, clockOffset);
  const summaryLeft = secondsLeft(game.nextRoundAt, now, clockOffset);

  const hand = useMemo(() => sortHand(priv?.hand ?? [], game.trump), [priv?.hand, game.trump]);
  const legal = useMemo(() => new Set(priv?.legalCardIds ?? []), [priv?.legalCardIds]);
  const myTurnToPlay = game.phase === 'PLAYING' && game.turn === mySeat && !game.completedTrick;

  // One in-flight intent at a time guards against double taps; the server dedupes as well.
  const play = useCallback(async (cardId: string) => {
    if (pending.current) return;
    pending.current = true;
    await send(request('game:play', { cardId, actionId: newActionId() }));
    pending.current = false;
  }, []);

  const bid = useCallback(async (n: number) => {
    if (pending.current) return;
    pending.current = true;
    await send(request('game:bid', { bid: n, actionId: newActionId() }));
    pending.current = false;
  }, []);

  const humans = snap.players.filter((p) => !p.isBot && p.connected).length;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar
        game={game}
        code={snap.code}
        showScoresButton={!wide}
        onScores={() => setScoresOpen(true)}
        onLastTrick={() => setLastOpen(true)}
        onRules={() => setRulesOpen(true)}
        onLeave={() => setLeaveOpen(true)}
      />

      {me.away && (
        <div role="alert" className="mx-3 mb-1 flex items-center justify-between gap-3 rounded-md bg-danger px-3 py-2 text-sm font-bold text-ink">
          <span>Auto-play is covering your turns.</span>
          <button type="button" className="rounded bg-ink px-3 py-1.5 text-card" onClick={() => void send(request('player:back'))}>
            I&apos;m back
          </button>
        </div>
      )}

      <SeatStrip
        players={snap.players}
        game={game}
        youId={snap.youId}
        secondsLeft={turnLeft}
        turnSeconds={snap.settings.turnSeconds}
      />

      <LayoutGroup>
        <div className="flex min-h-0 flex-1">
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto py-2">
              {game.phase === 'BIDDING' && priv ? (
                <BidPanel game={game} priv={priv} players={snap.players} youId={snap.youId} mySeat={mySeat} onBid={(n) => void bid(n)} />
              ) : (
                <TrickArea game={game} players={snap.players} youId={snap.youId} compact={short} />
              )}
              {!myTurnToPlay && game.phase === 'PLAYING' && game.turn >= 0 && (
                <p className="mt-1 text-sm text-felt-300" role="status">
                  Waiting for <span className="font-bold text-card">{snap.players[game.turn]?.name}</span>
                  {turnLeft !== null ? ` · ${turnLeft}s` : ''}
                </p>
              )}
              {game.turn === mySeat && turnLeft !== null && (game.phase === 'BIDDING' || myTurnToPlay) && (
                <p className={`mt-1 text-sm font-bold tabular-nums ${turnLeft <= 5 ? 'text-danger' : 'text-felt-300'}`} role="timer">
                  {turnLeft}s left
                </p>
              )}
            </div>

            <div className="shrink-0 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <Hand
                key={`${game.round}`}
                cards={hand}
                legalIds={legal}
                canPlay={myTurnToPlay}
                leadSuit={game.leadSuit}
                onPlay={(id) => void play(id)}
              />
            </div>
          </main>

          {wide && (
            <aside className="w-[min(30rem,36vw)] shrink-0 overflow-y-auto border-l border-felt-700 bg-felt-900/60 p-3" aria-label="Scoreboard">
              <h2 className="mb-2 font-bold text-card">Scoreboard</h2>
              <Scoreboard game={game} players={snap.players} youId={snap.youId} />
            </aside>
          )}
        </div>
      </LayoutGroup>

      {game.phase === 'ROUND_SCORE' && (
        <RoundSummary
          game={game}
          players={snap.players}
          youId={snap.youId}
          secondsLeft={summaryLeft}
          voted={snap.continueVotes.includes(snap.youId)}
          votes={snap.continueVotes.length}
          humans={humans}
          onContinue={() => void send(request('game:continue'))}
        />
      )}

      <Modal open={scoresOpen && !wide} onClose={() => setScoresOpen(false)} title="Scoreboard" wide>
        <Scoreboard game={game} players={snap.players} youId={snap.youId} />
      </Modal>
      <LastTrick open={lastOpen} onClose={() => setLastOpen(false)} trick={game.lastTrick} players={snap.players} youId={snap.youId} />
      <HowToPlay
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        decks={snap.settings.decks}
        tieBreak={snap.settings.tieBreak}
        players={snap.players.length}
      />
      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="Leave the game?"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-quiet" onClick={() => setLeaveOpen(false)}>
              Stay
            </button>
            <button type="button" className="btn-primary" onClick={() => void leaveRoom()}>
              Leave
            </button>
          </div>
        }
      >
        <p>A bot will take over your seat so the others can finish. You can&apos;t rejoin this game.</p>
      </Modal>
    </div>
  );
}
