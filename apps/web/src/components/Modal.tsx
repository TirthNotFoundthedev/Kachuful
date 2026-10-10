import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useEffect, useId, useRef } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({ open, title, onClose, children, footer, wide = false }: Props) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-felt-950/75 p-0 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
        >
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={`panel flex max-h-[88dvh] w-full flex-col rounded-b-none bg-felt-900 outline-none sm:rounded-b-lg ${wide ? 'sm:max-w-3xl' : 'sm:max-w-md'}`}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-felt-700 px-4 py-3">
              <h2 id={titleId} className="font-display text-xl font-extrabold text-card">
                {title}
              </h2>
              {onClose && (
                <button type="button" className="btn-icon size-9" onClick={onClose} aria-label="Close">
                  <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
                    <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
            <div className="overflow-y-auto px-4 py-4">{children}</div>
            {footer && <div className="border-t border-felt-700 px-4 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
