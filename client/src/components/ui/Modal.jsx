import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';

// Modal v4 — bám template thật (Untitled UI / shadcn-admin): nền phủ
// gray-950/50 phẳng (không blur trang trí), panel trắng rounded-xl,
// border gray-200, shadow-lg nhẹ. Mở/đóng: scale .98 -> 1 + fade 160ms.
// Đóng bằng Esc / nút X / click nền. Tôn trọng prefers-reduced-motion.
// Quản lý focus: mở thì focus vào panel, Tab bị giữ vòng trong panel,
// đóng thì trả focus về phần tử đã mở modal.
// API giữ nguyên: open, title, subtitle, onClose, children, actions, width.
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ open = true, title, subtitle, onClose, children, actions, width = 'max-w-lg' }) {
  const reduce = useReducedMotion();
  const panelRef = useRef(null);
  const restoreRef = useRef(null);
  // Đọc onClose qua ref để effect chỉ chạy theo trạng thái open: nhiều nơi
  // truyền onClose là hàm inline (đổi identity mỗi lần render) — nếu effect
  // phụ thuộc vào nó, việc khôi phục/đặt focus sẽ chạy liên tục và cướp
  // focus khỏi ô nhập trong các form modal.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;

    const getFocusables = () => {
      const panel = panelRef.current;
      if (!panel) return [];
      return Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
    };

    const onKey = (e) => {
      if (e.key === 'Escape') {
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const list = getFocusables();
      if (list.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';

    // Đưa focus vào panel ngay khi mở (sau một tick để panel kịp mount).
    const focusTimer = setTimeout(() => {
      panelRef.current?.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      clearTimeout(focusTimer);
      const prev = restoreRef.current;
      restoreRef.current = null;
      if (prev && typeof prev.focus === 'function') prev.focus();
    };
  }, [open]);

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
            ref={panelRef}
            tabIndex={-1}
            className={`relative max-h-[92vh] w-full ${width} overflow-hidden rounded-t-xl border border-gray-200 bg-white shadow-lg outline-none sm:rounded-xl`}
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
