import { motion, useReducedMotion } from 'motion/react';

// PageTransition (v3) — bọc nội dung mỗi trang: trang mới mờ + trượt nhẹ lên
// khi mount (240ms, ease chuẩn [.22,1,.36,1]). Khi người dùng bật
// prefers-reduced-motion thì hiển thị tĩnh hoàn toàn.
export const PAGE_EASE = [0.22, 1, 0.36, 1];

export default function PageTransition({ children, className = '' }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: PAGE_EASE }}
    >
      {children}
    </motion.div>
  );
}
