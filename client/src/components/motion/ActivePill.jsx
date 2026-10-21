import { motion, useReducedMotion } from 'motion/react';

// ActivePill (v3) — nền/gạch chọn dùng layoutId: khi mục đang chọn thay đổi
// (tab, nav sidebar), khung chọn TRƯỢT sang vị trí mới bằng spring thay vì
// nhảy. Dùng: bọc mục đang active bằng <ActivePill layoutId="nav-active" />
// đặt absolute phía sau nội dung. Tôn trọng reduced-motion.
export default function ActivePill({ layoutId, className = '' }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden="true"
      layoutId={layoutId}
      className={className}
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 480, damping: 38 }}
    />
  );
}
