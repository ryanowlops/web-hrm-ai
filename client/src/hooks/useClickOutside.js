import { useEffect, useRef } from 'react';

/**
 * Gọi `handler` khi người dùng click/tap ra ngoài phần tử được gắn `ref`.
 * Thường dùng để đóng dropdown, popover, menu...
 * Tuỳ chọn: đóng thêm khi nhấn phím Escape.
 *
 * @param {import('react').RefObject<HTMLElement>} ref - Ref của phần tử cần theo dõi.
 * @param {(event: Event) => void} handler - Hàm chạy khi click ra ngoài (hoặc nhấn Esc).
 * @param {object} [options]
 * @param {boolean} [options.escapeKey=true] - Có bắt phím Escape hay không.
 * @param {boolean} [options.enabled=true] - Bật/tắt việc lắng nghe sự kiện.
 *
 * @example
 * const menuRef = useRef(null);
 * useClickOutside(menuRef, () => setOpen(false));
 * return <div ref={menuRef}>...</div>;
 */
export function useClickOutside(ref, handler, options = {}) {
  const { escapeKey = true, enabled = true } = options;

  // Giữ handler mới nhất để không phải đăng ký lại sự kiện mỗi lần render.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;

    const handlePointerDown = (event) => {
      const element = ref?.current;
      if (!element || element.contains(event.target)) return;
      handlerRef.current(event);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') handlerRef.current(event);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    if (escapeKey) document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      if (escapeKey) document.removeEventListener('keydown', handleKeyDown);
    };
  }, [ref, escapeKey, enabled]);
}

export default useClickOutside;
