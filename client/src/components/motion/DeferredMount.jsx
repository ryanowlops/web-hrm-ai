import { useEffect, useState } from 'react';

// DeferredMount — chỉ gắn children sau khi trình duyệt đã vẽ xong khung trang
// (requestIdleCallback, dự phòng setTimeout 120ms). Dùng để trì hoãn các khối
// nặng như biểu đồ: trang hiện khung + số liệu trước cho cảm giác tức thì,
// biểu đồ nạp sau trong lúc máy rảnh. Trong thời gian chờ, render `fallback`
// (thường là Skeleton giữ nguyên chiều cao để trang không bị nhảy).
export default function DeferredMount({ children, fallback = null, timeout = 800 }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const mark = () => {
      if (!cancelled) setReady(true);
    };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = window.requestIdleCallback(mark, { timeout });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const timer = setTimeout(mark, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [timeout]);

  return ready ? children : fallback;
}
