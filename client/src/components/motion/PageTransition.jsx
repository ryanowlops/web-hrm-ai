import { motion, useReducedMotion } from 'motion/react';

// PageTransition (v4) — bọc nội dung mỗi trang: mờ dần + trượt lên rất nhẹ
// (opacity 0→1, y 4px, 150ms) theo hợp đồng v4 mục 6 — giảm liều chuyển động,
// không còn hiệu ứng trượt dài kiểu v3. Khi người dùng bật
// prefers-reduced-motion thì hiển thị tĩnh hoàn toàn.
export const PAGE_EASE = [0.22, 1, 0.36, 1];

export default function PageTransition({ children, className = '' }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: PAGE_EASE }}
    >
      {children}
    </motion.div>
  );
}
