import { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'motion/react';

// AnimatedNumber (v4) — số liệu đếm lên nhanh (~400ms, ease-out) khi xuất hiện
// hoặc khi giá trị thay đổi. format: hàm định dạng (mặc định toLocaleString vi-VN).
// Tôn trọng reduced-motion: đặt giá trị ngay, không đếm.
export default function AnimatedNumber({ value, format, className = '' }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const fmt = format || ((n) => Math.round(n).toLocaleString('vi-VN'));
  const numeric = Number(value);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (!Number.isFinite(numeric)) {
      node.textContent = value == null ? '—' : String(value);
      return undefined;
    }
    if (reduce) {
      node.textContent = fmt(numeric);
      return undefined;
    }
    const controls = animate(0, numeric, {
      duration: 0.4,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = fmt(v);
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numeric, reduce]);

  return (
    <span ref={ref} className={`tnum ${className}`}>
      {Number.isFinite(numeric) ? fmt(reduce ? numeric : 0) : value == null ? '—' : String(value)}
    </span>
  );
}
