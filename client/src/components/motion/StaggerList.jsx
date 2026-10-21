import { motion, useReducedMotion } from 'motion/react';

// StaggerList + StaggerItem (v3) — danh sách xuất hiện nối tiếp khi dữ liệu về.
// Cách dùng: <StaggerList> bọc ngoài, mỗi phần tử con là <StaggerItem>.
// Stagger 40ms/phần tử; StaggerItem tự giới hạn hiệu ứng ở 12 phần tử đầu
// (delay tối đa 12 × 40ms) để danh sách dài không bị chậm.
// Tôn trọng prefers-reduced-motion: hiển thị tĩnh.
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1], delay: Math.min(i, 12) * 0.0 },
  }),
};

export function StaggerItem({ children, className = '', index = 0 }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={item} custom={index}>
      {children}
    </motion.div>
  );
}

export default function StaggerList({ children, className = '' }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={container} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}
