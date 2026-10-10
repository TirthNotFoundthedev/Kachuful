import { type Card, type Suit, SUIT_INFO, cardName } from '@kachuful/shared';

interface Props {
  card: Pick<Card, 'rank' | 'suit'>;
  /** Card width in px; height follows the 5:7 ratio. */
  width: number;
  dimmed?: boolean;
  className?: string;
}

const COURT: Record<string, string> = { J: 'J', Q: 'Q', K: 'K' };

export function suitColorClass(suit: Suit): string {
  return SUIT_INFO[suit].color === 'red' ? 'text-suit-red' : 'text-suit-black';
}

/** CSS/SVG playing card face. Suit is always shown as a symbol, never colour alone. */
export function PlayingCard({ card, width, dimmed = false, className = '' }: Props) {
  const { symbol } = SUIT_INFO[card.suit];
  const color = suitColorClass(card.suit);
  const court = COURT[card.rank];
  return (
    <div
      role="img"
      aria-label={cardName(card)}
      className={`relative shrink-0 overflow-hidden rounded-(--radius-card) border border-card-edge bg-card shadow-[0_1px_2px_rgb(0_0_0/0.35)] ${color} ${dimmed ? 'brightness-[0.62] saturate-50' : ''} ${className}`}
      style={{ width, height: Math.round(width * 1.4), fontSize: width / 4.6 }}
    >
      <div className="absolute top-[0.25em] left-[0.3em] flex flex-col items-center leading-none">
        <span className="font-display text-[1.05em] font-extrabold tracking-tight">{card.rank}</span>
        <span className="text-[0.95em]">{symbol}</span>
      </div>
      <div className="absolute right-[0.3em] bottom-[0.25em] flex rotate-180 flex-col items-center leading-none">
        <span className="font-display text-[1.05em] font-extrabold tracking-tight">{card.rank}</span>
        <span className="text-[0.95em]">{symbol}</span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        {court ? (
          <div className="flex h-[52%] w-[46%] flex-col items-center justify-center rounded-[0.2em] border-[0.08em] border-current/40">
            <span className="font-display text-[1.6em] leading-none font-extrabold">{court}</span>
            <span className="text-[1.1em] leading-none">{symbol}</span>
          </div>
        ) : (
          <span className={card.rank === 'A' ? 'text-[2.6em] leading-none' : 'text-[2em] leading-none'}>{symbol}</span>
        )}
      </div>
    </div>
  );
}

/** Face-down card back with a simple lattice pattern. */
export function CardBack({ width, className = '' }: { width: number; className?: string }) {
  return (
    <div
      aria-hidden
      className={`shrink-0 rounded-(--radius-card) border border-card-edge bg-card p-[3px] ${className}`}
      style={{ width, height: Math.round(width * 1.4) }}
    >
      <svg viewBox="0 0 50 70" className="size-full rounded-[0.3rem]" preserveAspectRatio="none">
        <defs>
          <pattern id="lattice" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="#134432" />
            <path d="M0 4h8M4 0v8" stroke="#2a7357" strokeWidth="1.2" />
          </pattern>
        </defs>
        <rect width="50" height="70" fill="url(#lattice)" />
      </svg>
    </div>
  );
}

export function SuitBadge({ suit, className = '' }: { suit: Suit; className?: string }) {
  const info = SUIT_INFO[suit];
  return (
    <span
      className={`inline-flex size-[1.6em] items-center justify-center rounded-full bg-card leading-none ${suitColorClass(suit)} ${className}`}
      aria-hidden
    >
      {info.symbol}
    </span>
  );
}
