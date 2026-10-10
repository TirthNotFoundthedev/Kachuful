import {
  MAX_DECKS,
  MAX_PLAYERS,
  MIN_DECKS,
  MIN_PLAYERS,
  type RoomSettings,
  type RoomSnapshot,
  TURN_TIMER_OPTIONS,
  type TieBreak,
  estimateMinutes,
  totalRounds,
} from '@kachuful/shared';
import { useState } from 'react';
import { serverQuery } from '../config';
import { HowToPlay } from '../components/HowToPlay';
import { request } from '../net/socket';
import { leaveRoom, send, toast } from '../net/store';

export function Lobby({ snap }: { snap: RoomSnapshot }) {
  const me = snap.players.find((p) => p.id === snap.youId);
  const isHost = snap.hostId === snap.youId;
  const [rulesOpen, setRulesOpen] = useState(false);
  const shareUrl = `${window.location.origin}/r/${snap.code}${serverQuery()}`;
  const n = snap.players.length;
  const notReady = snap.players.filter((p) => !p.ready);
  const startBlocker =
    n < MIN_PLAYERS
      ? `Need ${MIN_PLAYERS - n} more player${MIN_PLAYERS - n === 1 ? '' : 's'}. Add bots to fill seats.`
      : notReady.length > 0
        ? `Waiting for ${notReady.map((p) => p.name).join(', ')}`
        : null;

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Kachuful', text: `Join my Kachuful table: ${snap.code}`, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      toast('Invite link copied');
    } catch {
      /* cancelled */
    }
  }

  const setSettings = (patch: Partial<RoomSettings>) => void send(request('lobby:settings', patch));

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-felt-300">Room code</p>
          <p className="font-display text-5xl font-extrabold tracking-[0.12em] text-card" aria-label={`Room code ${snap.code.split('').join(' ')}`}>
            {snap.code}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-primary" onClick={() => void share()}>
            Invite
          </button>
          <button type="button" className="btn-quiet" onClick={() => setRulesOpen(true)}>
            Rules
          </button>
          <button type="button" className="btn-quiet" onClick={() => void leaveRoom()}>
            Leave
          </button>
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-[1fr_minmax(0,20rem)]">
        <section className="panel p-4" aria-labelledby="players-h">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="players-h" className="text-lg font-bold text-card">
              Players
            </h2>
            <span className="text-sm text-felt-300">
              {n} / {MAX_PLAYERS}
            </span>
          </div>
          <ol className="space-y-2">
            {snap.players.map((p) => (
              <li key={p.id} className="flex min-h-12 items-center gap-3 rounded-md bg-felt-950/50 px-3 py-2">
                <span className="w-5 text-right text-sm text-felt-300">{p.seat + 1}</span>
                <span className="min-w-0 flex-1 truncate font-bold text-card">
                  {p.name}
                  {p.id === snap.youId && <span className="font-normal text-felt-300"> (you)</span>}
                </span>
                {p.isHost && <span className="rounded bg-felt-700 px-2 py-0.5 text-xs font-bold">Host</span>}
                {!p.connected && <span className="text-xs font-bold text-danger">offline</span>}
                {!p.isBot && !p.isHost && (
                  <span className={`text-sm font-bold ${p.ready ? 'text-marigold' : 'text-felt-300'}`}>
                    {p.ready ? 'Ready' : 'Not ready'}
                  </span>
                )}
                {isHost && p.id !== snap.youId && (
                  <button
                    type="button"
                    className="btn-icon size-9"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => void send(request('lobby:kick', { playerId: p.id }))}
                  >
                    <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
                      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ol>
          {isHost && n < MAX_PLAYERS && (
            <button type="button" className="btn-quiet mt-3 w-full" onClick={() => void send(request('lobby:addBot'))}>
              Add a bot
            </button>
          )}
          {n < MIN_PLAYERS && (
            <p className="mt-3 text-sm">
              Share the code or link with friends. You need {MIN_PLAYERS} to {MAX_PLAYERS} players; bots can fill
              empty seats.
            </p>
          )}
        </section>

        <section className="panel space-y-4 p-4" aria-labelledby="settings-h">
          <h2 id="settings-h" className="text-lg font-bold text-card">
            Table settings
          </h2>

          <fieldset>
            <legend className="label">Decks</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Number of decks">
              {Array.from({ length: MAX_DECKS - MIN_DECKS + 1 }, (_, i) => MIN_DECKS + i).map((d) => {
                const selected = snap.settings.decks === d;
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!isHost}
                    onClick={() => setSettings({ decks: d })}
                    className={`rounded-md border px-3 py-2 text-left disabled:cursor-default ${
                      selected ? 'border-marigold bg-felt-700 text-card' : 'border-felt-600 bg-felt-950/50'
                    } ${!isHost && !selected ? 'opacity-50' : ''}`}
                  >
                    <span className="block font-bold">
                      {d} deck{d > 1 ? 's' : ''}
                    </span>
                    <span className="block text-sm text-felt-300">
                      {n >= MIN_PLAYERS ? `${totalRounds(n, d)} rounds` : `${52 * d} cards`}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="rounded-md bg-felt-950/50 p-3">
            <p className="text-card">
              <span className="font-display text-3xl font-extrabold">{snap.setup.rounds}</span> rounds
              {snap.setup.rounds > 0 && (
                <span className="text-felt-300">
                  {' '}
                  · about {estimateMinutes(Math.max(n, 1), snap.setup.rounds)} min
                </span>
              )}
            </p>
            {snap.setup.warnings.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-marigold">
                {snap.setup.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label htmlFor="tiebreak" className="label">
              If totals tie
            </label>
            <select
              id="tiebreak"
              className="input text-base"
              disabled={!isHost}
              value={snap.settings.tieBreak}
              onChange={(e) => setSettings({ tieBreak: e.target.value as TieBreak })}
            >
              <option value="exactBids">Most exact bids wins</option>
              <option value="shared">Shared win</option>
            </select>
          </div>

          <div>
            <label htmlFor="timer" className="label">
              Turn timer
            </label>
            <select
              id="timer"
              className="input text-base"
              disabled={!isHost}
              value={snap.settings.turnSeconds}
              onChange={(e) => setSettings({ turnSeconds: Number(e.target.value) })}
            >
              {TURN_TIMER_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === 0 ? 'No timer' : `${s} seconds, then auto-play`}
                </option>
              ))}
            </select>
          </div>
          {!isHost && <p className="text-sm text-felt-300">Only the host can change settings.</p>}
        </section>
      </div>

      <div className="sticky bottom-0 -mx-4 border-t border-felt-700 bg-felt-900/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {isHost ? (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="btn-primary w-full text-lg"
              disabled={startBlocker !== null}
              onClick={() => void send(request('lobby:start'))}
            >
              Start game
            </button>
            {startBlocker && <p className="text-center text-sm text-felt-300">{startBlocker}</p>}
          </div>
        ) : (
          <button
            type="button"
            className={me?.ready ? 'btn-quiet w-full text-lg' : 'btn-primary w-full text-lg'}
            onClick={() => void send(request('lobby:ready', { ready: !me?.ready }))}
          >
            {me?.ready ? 'Not ready' : "I'm ready"}
          </button>
        )}
      </div>

      <HowToPlay
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        decks={snap.settings.decks}
        tieBreak={snap.settings.tieBreak}
        players={n >= MIN_PLAYERS ? n : undefined}
      />
    </main>
  );
}
