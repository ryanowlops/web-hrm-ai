import { motion, useReducedMotion } from 'motion/react';

// ActivePill (v4) — nền/gạch chọn dùng layoutId: khi mục đang chọn thay đổi
// (tab, nav sidebar), khung chọn trượt sang vị trí mới thay vì nhảy.
// v4 giảm liều: tween ease-out 180ms thay cho spring nảy của v3 (hợp đồng
// mục 6). Dùng: bọc mục đang active bằng <ActivePill layoutId="nav-active" />
// đặt absolute phía sau nội dung. Tôn trọng reduced-motion.
export default function ActivePill({ layoutId, className = '' }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden="true"
      layoutId={layoutId}
      className={className}
      transition={reduce ? { duration: 0 } : { duration: 0.18, ease: [0, 0, 0.2, 1] }}
    />
  );
}
