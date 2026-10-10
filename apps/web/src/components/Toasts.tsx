import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../net/store';

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={`max-w-md rounded-md border px-4 py-2 text-sm font-bold shadow-lg ${
              t.tone === 'error' ? 'border-danger/60 bg-felt-950 text-danger' : 'border-felt-500 bg-felt-950 text-card'
            }`}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ConnectionBanner() {
  const conn = useApp((s) => s.conn);
  const inRoom = useApp((s) => s.snapshot !== null);
  if (conn === 'connected' || !inRoom) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-0 z-[55] bg-danger px-4 py-2 text-center text-sm font-bold text-ink">
      Connection lost. Reconnecting and restoring your seat…
    </div>
  );
}
