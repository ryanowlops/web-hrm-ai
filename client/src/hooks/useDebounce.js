import { useEffect, useState } from 'react';

/**
 * Trả về phiên bản "chậm nhịp" của một giá trị: chỉ cập nhật
 * khi giá trị gốc ngừng thay đổi trong khoảng `delay` mili-giây.
 * Dùng cho ô tìm kiếm, bộ lọc... để tránh gọi API liên tục.
 *
 * @template T
 * @param {T} value - Giá trị cần debounce.
 * @param {number} [delay=300] - Thời gian chờ (ms) sau lần thay đổi cuối.
 * @returns {T} Giá trị đã debounce.
 *
 * @example
 * const debouncedKeyword = useDebounce(keyword, 400);
 */
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timerId = setTimeout(() => setDebouncedValue(value), delay);
    // Hủy hẹn giờ khi value/delay đổi hoặc component unmount.
    return () => clearTimeout(timerId);
  }, [value, delay]);

  return debouncedValue;
}

export default useDebounce;
