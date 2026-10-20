import { useCallback, useEffect, useRef, useState } from 'react';

/** Đọc giá trị từ localStorage, lỗi/không có thì trả về giá trị mặc định. */
function readValue(key, initialValue) {
  if (typeof window === 'undefined') return initialValue;
  try {
    const raw = window.localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : initialValue;
  } catch {
    // Dữ liệu hỏng hoặc trình duyệt chặn truy cập: dùng giá trị mặc định.
    return initialValue;
  }
}

/**
 * State React được đồng bộ hai chiều với localStorage (qua JSON).
 * - Khởi tạo lười (lazy) từ localStorage, an toàn với try/catch.
 * - `setValue` hỗ trợ truyền giá trị mới hoặc hàm updater như `useState`.
 * - Đồng bộ khi nhiều tab cùng sửa một key (sự kiện 'storage').
 *
 * @template T
 * @param {string} key - Khóa lưu trong localStorage.
 * @param {T} initialValue - Giá trị mặc định khi chưa có dữ liệu đã lưu.
 * @returns {[T, (value: T | ((prev: T) => T)) => void]} Cặp [giá trị, hàm set].
 *
 * @example
 * const [theme, setTheme] = useLocalStorage('hrm_theme', 'light');
 */
export function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => readValue(key, initialValue));

  // Giữ initialValue mới nhất cho trường hợp key thay đổi.
  const initialRef = useRef(initialValue);
  initialRef.current = initialValue;

  const setValue = useCallback(
    (value) => {
      setStoredValue((prev) => {
        const valueToStore = typeof value === 'function' ? value(prev) : value;
        try {
          if (typeof window !== 'undefined') {
            if (valueToStore === undefined) {
              window.localStorage.removeItem(key);
            } else {
              window.localStorage.setItem(key, JSON.stringify(valueToStore));
            }
          }
        } catch {
          // Hết quota hoặc chế độ riêng tư: vẫn giữ state trong bộ nhớ.
        }
        return valueToStore;
      });
    },
    [key],
  );

  // Khi key đổi, đọc lại giá trị tương ứng từ localStorage.
  useEffect(() => {
    setStoredValue(readValue(key, initialRef.current));
  }, [key]);

  // Đồng bộ khi tab khác thay đổi cùng key.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onStorage = (event) => {
      if (event.key !== key) return;
      if (event.newValue === null) {
        setStoredValue(initialRef.current);
        return;
      }
      try {
        setStoredValue(JSON.parse(event.newValue));
      } catch {
        // Bỏ qua dữ liệu không parse được.
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  return [storedValue, setValue];
}

export default useLocalStorage;
