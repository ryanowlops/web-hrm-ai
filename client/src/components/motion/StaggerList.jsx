import { motion, useReducedMotion } from 'motion/react';

// StaggerList + StaggerItem (v4) — danh sách xuất hiện nối tiếp NHẸ theo hợp
// đồng v4 mục 6: step 25ms/phần tử và CHỈ animate tối đa 6 phần tử đầu
// (StaggerItem có index >= 6 hiển thị tĩnh ngay) để danh sách dài không bị
// chậm/khoe hiệu ứng. Cách dùng giữ nguyên v3: <StaggerList> bọc ngoài,
// mỗi phần tử con là <StaggerItem index={i}>.
// Tôn trọng prefers-reduced-motion: hiển thị tĩnh.
const MAX_ANIMATED = 6;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.025 } },
};

const item = {
  hidden: { opacity: 0, y: 6 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
  },
};

export function StaggerItem({ children, className = '', index = 0 }) {
  const reduce = useReducedMotion();
  if (reduce || index >= MAX_ANIMATED) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={item}>
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
