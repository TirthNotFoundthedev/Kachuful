import { CARDS_PER_DECK, type TieBreak, SUIT_INFO, TRUMP_ORDER } from '@kachuful/shared';
import { Modal } from './Modal';
import { suitColorClass } from './PlayingCard';

interface Props {
  open: boolean;
  onClose: () => void;
  decks: number;
  tieBreak: TieBreak;
  players?: number;
}

export function HowToPlay({ open, onClose, decks, tieBreak, players }: Props) {
  const total = CARDS_PER_DECK * decks;
  const rounds = players ? Math.floor(total / players) : null;
  return (
    <Modal open={open} onClose={onClose} title="How to play">
      <div className="space-y-4 text-[0.95rem] leading-relaxed">
        <section>
          <h3 className="font-bold text-card">The deal</h3>
          <p>
            This table uses {decks === 1 ? 'one deck' : `${decks} decks`} ({total} cards). Round 1 deals 1 card each,
            round 2 deals 2, and so on
            {rounds ? `, up to ${rounds} cards in round ${rounds}` : ''}. Ace is high. The dealer moves one seat left
            every round.
          </p>
        </section>
        <section>
          <h3 className="font-bold text-card">Trump (Sir)</h3>
          <p className="flex flex-wrap items-center gap-x-1">
            Trump cycles every round:
            {TRUMP_ORDER.map((s, i) => (
              <span key={s} className="inline-flex items-center gap-1">
                <span className={`rounded bg-card px-1 ${suitColorClass(s)}`}>{SUIT_INFO[s].symbol}</span>
                {SUIT_INFO[s].name} ({SUIT_INFO[s].localName}){i < 3 ? ',' : ', then repeat.'}
              </span>
            ))}
          </p>
        </section>
        <section>
          <h3 className="font-bold text-card">Bidding</h3>
          <p>
            Look at your cards and say how many tricks you will win. The player left of the dealer bids first; the
            dealer bids last and <strong>may not pick the number that makes all bids add up to the cards dealt</strong>
            . So someone always misses.
          </p>
        </section>
        <section>
          <h3 className="font-bold text-card">Playing a trick</h3>
          <p>
            The first card sets the lead suit. You must follow the lead suit if you can; if you can&apos;t, play
            anything, including trump. The highest trump wins; if no trump was played, the highest card of the lead
            suit wins. The winner leads next.
          </p>
          {decks > 1 && (
            <p className="mt-2">
              <strong>Two identical cards</strong> (e.g. both A♠ in a trick): the one played <strong>later</strong>{' '}
              wins.
            </p>
          )}
        </section>
        <section>
          <h3 className="font-bold text-card">Scoring</h3>
          <p>
            Win exactly your bid: bid × 11 points (a bid of 0 made scores 10). Miss by any amount: 0. Highest total
            after the last round wins.{' '}
            {tieBreak === 'exactBids'
              ? 'Equal totals are split by who hit their bid in more rounds; if that is equal too, the win is shared.'
              : 'Equal totals share the placing.'}
          </p>
        </section>
        <section>
          <h3 className="font-bold text-card">Controls</h3>
          <p>
            Tap a card to select it, then tap Play (or tap it again). On a keyboard: arrow keys move, Enter selects
            and plays, number keys bid.
          </p>
        </section>
      </div>
    </Modal>
  );
}
