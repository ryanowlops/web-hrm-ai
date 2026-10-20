import { useEffect, useState } from 'react';

/**
 * Theo dõi một media query CSS và trả về `true` khi query khớp.
 * Tự cập nhật khi kích thước màn hình/thiết bị thay đổi.
 *
 * @param {string} query - Media query, ví dụ '(max-width: 768px)'.
 * @returns {boolean} `true` nếu query đang khớp.
 *
 * @example
 * const isMobile = useMediaQuery('(max-width: 768px)');
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    // Môi trường không có window (SSR, test) mặc định là false.
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const mediaQueryList = window.matchMedia(query);
    // Đồng bộ lại ngay khi query thay đổi.
    setMatches(mediaQueryList.matches);

    const onChange = (event) => setMatches(event.matches);
    mediaQueryList.addEventListener('change', onChange);
    return () => mediaQueryList.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export default useMediaQuery;
