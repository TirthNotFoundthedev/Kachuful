import { type PublicGame, SUIT_INFO } from '@kachuful/shared';
import { useSyncExternalStore } from 'react';
import { setSoundEnabled, soundEnabled, subscribeSound } from '../lib/sound';
import { suitColorClass } from './PlayingCard';

interface Props {
  game: PublicGame;
  code: string;
  onScores: () => void;
  onLastTrick: () => void;
  onRules: () => void;
  onLeave: () => void;
  showScoresButton: boolean;
}

function Icon({ d, label }: { d: string; label: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <title>{label}</title>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TopBar({ game, code, onScores, onLastTrick, onRules, onLeave, showScoresButton }: Props) {
  const sound = useSyncExternalStore(subscribeSound, soundEnabled);
  const trump = SUIT_INFO[game.trump];
  return (
    <header className="flex items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1">
      <div
        className="flex shrink-0 items-center gap-2 rounded-md border border-felt-500 bg-felt-950/70 py-1 pr-2.5 pl-1"
        aria-label={`Trump this round: ${trump.name} (${trump.localName})`}
      >
        <span className={`flex size-9 items-center justify-center rounded bg-card text-2xl leading-none sm:size-10 sm:text-3xl ${suitColorClass(game.trump)}`} aria-hidden>
          {trump.symbol}
        </span>
        <span className="leading-tight">
          <span className="block text-[0.65rem] font-bold whitespace-nowrap text-felt-300 uppercase">Trump</span>
          <span className="block font-bold whitespace-nowrap text-card">
            {trump.name} <span className="hidden font-normal text-felt-300 sm:inline">{trump.localName}</span>
          </span>
        </span>
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate font-bold text-card">
          <span className="hidden sm:inline">Round </span>
          {game.round}/{game.totalRounds}
        </p>
        <p className="truncate text-xs text-felt-300">
          {game.cardsThisRound} card{game.cardsThisRound > 1 ? 's' : ''}
          <span className="hidden sm:inline"> · Room {code}</span>
        </p>
      </div>
      <nav className="flex shrink-0 gap-1 sm:gap-1.5 [&>button]:size-9 sm:[&>button]:size-11" aria-label="Game menu">
        {showScoresButton && (
          <button type="button" className="btn-icon" onClick={onScores} aria-label="Scoreboard" title="Scoreboard">
            <Icon label="Scoreboard" d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
          </button>
        )}
        <button type="button" className="btn-icon" onClick={onLastTrick} aria-label="Last trick" title="Last trick">
          <Icon label="Last trick" d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
        </button>
        <button
          type="button"
          className="btn-icon"
          onClick={() => setSoundEnabled(!sound)}
          aria-pressed={sound}
          aria-label={sound ? 'Sound on' : 'Sound off'}
          title={sound ? 'Sound on' : 'Sound off'}
        >
          <Icon label="Sound" d={sound ? 'M4 9v6h4l5 4V5L8 9H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11' : 'M4 9v6h4l5 4V5L8 9H4zM17 9l5 6M22 9l-5 6'} />
        </button>
        <button type="button" className="btn-icon" onClick={onRules} aria-label="How to play" title="How to play">
          <Icon label="How to play" d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" />
        </button>
        <button type="button" className="btn-icon" onClick={onLeave} aria-label="Leave game" title="Leave game">
          <Icon label="Leave" d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11" />
        </button>
      </nav>
    </header>
  );
}
