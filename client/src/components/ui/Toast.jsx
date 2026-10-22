import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Alert } from './feedback.jsx';

// Toast tối giản theo design system v4: góc phải dưới, tự ẩn sau 4 giây,
// dùng đúng tone của Alert (nền nhạt + border cùng tông + icon ngữ nghĩa).
// Cách dùng: const toast = useToast(); toast.success('Đã lưu.');
const ToastContext = createContext(null);
let toastSeq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message, tone = 'success') => {
      if (!message) return;
      toastSeq += 1;
      const id = toastSeq;
      // Giữ tối đa 4 toast một lúc để tránh che khuất nội dung.
      setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
      timersRef.current.set(id, setTimeout(() => dismiss(id), 4000));
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      toast,
      success: (message) => toast(message, 'success'),
      error: (message) => toast(message, 'error'),
      warning: (message) => toast(message, 'warning'),
      info: (message) => toast(message, 'info'),
      dismiss,
    }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[min(92vw,380px)] flex-col gap-2"
        aria-live="polite"
      >
        {toasts.map((item) => (
          <div key={item.id} className="animate-fade-in pointer-events-auto relative">
            <Alert tone={item.tone} className="shadow-lg">
              <span className="block pr-5">{item.message}</span>
            </Alert>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Đóng thông báo"
              className="absolute right-2 top-2 rounded-md p-1 opacity-60 transition hover:bg-black/5 hover:opacity-100"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast phải được dùng bên trong <ToastProvider>.');
  return ctx;
}

export default ToastProvider;
