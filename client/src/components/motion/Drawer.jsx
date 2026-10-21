import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

// Drawer (v3) — panel trượt từ phải bằng spring (stiffness 380, damping 34),
// nền mờ dần. Đóng bằng Esc / click nền / nút X. Tôn trọng reduced-motion.
export const SPRING_PANEL = { type: 'spring', stiffness: 380, damping: 34 };

export default function Drawer({ open = false, title, subtitle, onClose, children, width = 'max-w-md' }) {
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
        <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={title}>
          <motion.button
            aria-label="Đóng"
            className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
          />
          <motion.aside
            className={`absolute right-0 top-0 flex h-full w-full ${width} flex-col bg-white shadow-pop`}
            initial={reduce ? { opacity: 0 } : { x: '100%' }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: '100%' }}
            transition={reduce ? { duration: 0 } : SPRING_PANEL}
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">{title}</h2>
                {subtitle && <p className="mt-1 text-sm leading-relaxed text-slate-500">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                aria-label="Đóng panel"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </header>
            <div className="nice-scroll flex-1 overflow-y-auto px-6 py-5">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
