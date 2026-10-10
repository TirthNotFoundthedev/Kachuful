import { type Card, type Suit, SUIT_INFO, cardLabel } from '@kachuful/shared';
import { AnimatePresence, motion } from 'motion/react';
import { type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { layoutHand } from '../lib/handLayout';
import { PlayingCard } from './PlayingCard';

interface Props {
  cards: Card[];
  legalIds: ReadonlySet<string>;
  /** True when it is your turn to play a card. */
  canPlay: boolean;
  leadSuit: Suit | null;
  onPlay: (cardId: string) => void;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function cardWidthFor(containerWidth: number): number {
  const shortScreen = typeof window !== 'undefined' && window.innerHeight < 520;
  if (shortScreen) return 50;
  if (containerWidth < 420) return 58;
  if (containerWidth < 700) return 66;
  if (containerWidth < 1100) return 78;
  return 88;
}

export function Hand({ cards, legalIds, canPlay, leadSuit, onPlay }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [selected, setSelected] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  // The parent remounts Hand per deal (key=dealKey); stagger only during the deal itself.
  const [dealing, setDealing] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setDealing(false), 400 + cards.length * 35);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cw = cardWidthFor(width);
  const layout = useMemo(
    // Leave room for rotated corners at the fan's edges; keep big hands compact rather than screen-wide.
    () => layoutHand({ count: cards.length, containerWidth: Math.max(width - cw * 0.35, cw), cardWidth: cw, minStep: cw * 0.36, maxStep: cards.length > 10 ? cw * 0.62 : cw + 6 }),
    [cards.length, width, cw],
  );

  // Drop the selection when it stops being playable (turn passed, card gone, new trick).
  useEffect(() => {
    if (selected && (!canPlay || !legalIds.has(selected))) setSelected(null);
  }, [selected, canPlay, legalIds]);

  useEffect(() => {
    setFocusIdx((i) => Math.min(i, Math.max(0, cards.length - 1)));
  }, [cards.length]);

  function choose(card: Card) {
    if (!canPlay) return;
    if (!legalIds.has(card.id)) return;
    if (selected === card.id) {
      onPlay(card.id);
      setSelected(null);
    } else {
      setSelected(card.id);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (cards.length === 0) return;
    let next = focusIdx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(cards.length - 1, focusIdx + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, focusIdx - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = cards.length - 1;
    else if (e.key === 'Escape') {
      setSelected(null);
      return;
    } else return;
    e.preventDefault();
    setFocusIdx(next);
    buttons.current[next]?.focus();
  }

  const selectedCard = cards.find((c) => c.id === selected) ?? null;
  const cardH = Math.round(cw * 1.4);
  const lift = Math.round(cw * 0.22);
  const mustFollow = canPlay && leadSuit !== null && cards.some((c) => c.suit === leadSuit);

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex min-h-11 items-center justify-center gap-3 text-sm">
        {canPlay && selectedCard ? (
          <button type="button" className="btn-primary min-w-40 text-lg" onClick={() => { onPlay(selectedCard.id); setSelected(null); }}>
            Play {cardLabel(selectedCard)}
          </button>
        ) : canPlay ? (
          <p className="font-bold text-marigold">
            {mustFollow && leadSuit ? `Your turn: play a ${SUIT_INFO[leadSuit].name.slice(0, -1).toLowerCase()} ${SUIT_INFO[leadSuit].symbol}` : 'Your turn: pick a card'}
          </p>
        ) : null}
      </div>

      <div
        ref={ref}
        role="listbox"
        aria-label={`Your hand, ${cards.length} cards`}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="flex w-full flex-col items-center"
        style={{ gap: layout.rows.length > 1 ? 6 : 0 }}
      >
        {layout.rows.map((row, r) => {
          const rowWidth = cw + layout.step * Math.max(0, row.length - 1);
          const mid = (row.length - 1) / 2;
          const fan = layout.rows.length === 1 && row.length > 1;
          return (
            <div key={r} className="relative" style={{ width: rowWidth, height: cardH + (fan ? Math.ceil(lift * 1.7) : 4) }}>
              <AnimatePresence>
                {row.map((idx, i) => {
                  const card = cards[idx]!;
                  const legal = legalIds.has(card.id);
                  const isSel = selected === card.id;
                  const spread = fan ? Math.min(2.2, 14 / row.length) : 0; // at most ~14° across the whole fan
                  const rotate = fan ? (i - mid) * spread : 0;
                  const arc = fan ? Math.abs(i - mid) ** 2 * (lift / Math.max(1, mid * mid)) * 0.6 : 0;
                  return (
                    <motion.button
                      key={card.id}
                      ref={(el) => {
                        buttons.current[idx] = el;
                      }}
                      layoutId={card.id}
                      type="button"
                      role="option"
                      aria-selected={isSel}
                      aria-disabled={!canPlay || !legal}
                      aria-label={`${cardLabel(card)}${canPlay && !legal ? ', cannot play: follow the lead suit' : ''}`}
                      tabIndex={idx === focusIdx ? 0 : -1}
                      onFocus={() => setFocusIdx(idx)}
                      onClick={() => choose(card)}
                      className="group absolute top-0 left-0 rounded-(--radius-card) focus-visible:outline-offset-0"
                      style={{ zIndex: i + 1, transformOrigin: '50% 120%' }}
                      initial={{ opacity: 0, y: -120, x: rowWidth / 2 - cw / 2, rotate: 0 }}
                      animate={{
                        opacity: 1,
                        x: i * layout.step,
                        y: (fan ? lift : 2) + arc - (isSel ? lift : 0),
                        rotate,
                        transition: { type: 'spring', stiffness: 380, damping: 32, delay: dealing ? idx * 0.035 : 0 },
                      }}
                      exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    >
                      {/* Hover lift lives on an inner element so the hit target never moves under the pointer. */}
                      <div
                        className={`transition-transform duration-150 ${canPlay && legal && !isSel ? 'group-hover:-translate-y-2' : ''}`}
                      >
                        <PlayingCard
                          card={card}
                          width={cw}
                          dimmed={canPlay && !legal}
                          className={isSel ? 'ring-4 ring-marigold' : canPlay && legal ? 'ring-1 ring-marigold/70' : ''}
                        />
                      </div>
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
