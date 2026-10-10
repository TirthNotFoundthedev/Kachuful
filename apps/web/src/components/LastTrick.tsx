import type { CompletedTrick, PublicPlayer } from '@kachuful/shared';
import { Modal } from './Modal';
import { TrickCards } from './TrickArea';

export function LastTrick({
  open,
  onClose,
  trick,
  players,
  youId,
}: {
  open: boolean;
  onClose: () => void;
  trick: CompletedTrick | null;
  players: PublicPlayer[];
  youId: string;
}) {
  const winner = trick ? players[trick.winnerSeat] : null;
  return (
    <Modal open={open} onClose={onClose} title="Last trick">
      {trick ? (
        <div className="space-y-3">
          <TrickCards plays={trick.plays} players={players} youId={youId} winnerSeat={trick.winnerSeat} width={64} animate={false} />
          <p className="text-center font-bold text-card">
            {winner?.id === youId ? 'You' : winner?.name} took trick {trick.trickNumber}.
          </p>
        </div>
      ) : (
        <p>No trick has been completed this round yet.</p>
      )}
    </Modal>
  );
}
