import { motion, useReducedMotion } from 'motion/react';

// CheckMotion (v4) — dấu tick hoàn thành việc: nét check tự vẽ nhẹ (300ms)
// khi `done` chuyển sang true. v4 bỏ hiệu ứng nảy (scale vòng tròn) của v3
// theo hợp đồng mục 6 — chuyển động phẳng, không phô. Dùng cho
// onboarding / duyệt đơn. Tôn trọng prefers-reduced-motion.
export default function CheckMotion({ done = false, size = 22 }) {
  const reduce = useReducedMotion();
  const dur = reduce ? 0 : 0.3;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke={done ? '#0DB795' : '#CBD5E1'} strokeWidth="2" />
      {done && (
        <motion.path
          d="M8 12.5 10.8 15.2 16 9.5"
          stroke="#0DB795"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: dur, ease: 'easeOut' }}
        />
      )}
    </svg>
  );
}
