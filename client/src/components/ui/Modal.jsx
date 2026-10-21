import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { SPRING_PANEL } from '../motion/Drawer.jsx';

// Modal v3 — mở bằng spring (stiffness 380, damping 34), nền mờ dần,
// đóng bằng Esc / nút X / click nền. Tôn trọng prefers-reduced-motion.
export default function Modal({ open = true, title, subtitle, onClose, children, actions, width = 'max-w-lg' }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
          <motion.button
            aria-label="Đóng"
            className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
          />
          <motion.div
            className={`relative max-h-[92vh] w-full ${width} overflow-hidden rounded-t-3xl bg-white shadow-pop sm:rounded-3xl`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 6 }}
            transition={reduce ? { duration: 0 } : SPRING_PANEL}
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">{title}</h2>
                {subtitle && <p className="mt-1 text-sm leading-relaxed text-slate-500">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                aria-label="Đóng hộp thoại"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </header>
            <div className="nice-scroll max-h-[calc(92vh-170px)] overflow-y-auto px-6 py-5">{children}</div>
            {actions && (
              <footer className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
                {actions}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
