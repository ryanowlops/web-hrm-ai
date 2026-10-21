import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';

// Modal v4 — bám template thật (Untitled UI / shadcn-admin): nền phủ
// gray-950/50 phẳng (không blur trang trí), panel trắng rounded-xl,
// border gray-200, shadow-lg nhẹ. Mở/đóng: scale .98 -> 1 + fade 160ms.
// Đóng bằng Esc / nút X / click nền. Tôn trọng prefers-reduced-motion.
// API giữ nguyên: open, title, subtitle, onClose, children, actions, width.
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

  const fade = { duration: reduce ? 0 : 0.16, ease: 'easeOut' };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
          <motion.button
            aria-label="Đóng"
            className="absolute inset-0 bg-gray-950/50"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
          />
          <motion.div
            className={`relative max-h-[92vh] w-full ${width} overflow-hidden rounded-t-xl border border-gray-200 bg-white shadow-lg sm:rounded-xl`}
            initial={{ opacity: 0, scale: reduce ? 1 : 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.98 }}
            transition={fade}
          >
            <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{title}</h2>
                {subtitle && <p className="mt-1 text-sm leading-relaxed text-gray-500">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                aria-label="Đóng hộp thoại"
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-50 hover:text-gray-600"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <div className="nice-scroll max-h-[calc(92vh-170px)] overflow-y-auto px-6 py-5">{children}</div>
            {actions && (
              <footer className="flex flex-wrap items-center justify-end gap-2.5 border-t border-gray-200 bg-gray-50 px-6 py-4">
                {actions}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
