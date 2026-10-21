import { motion, useReducedMotion } from 'motion/react';

// CheckMotion (v3) — dấu tick hoàn thành việc: vòng tròn + nét check tự vẽ
// (350ms) khi `done` chuyển sang true. Dùng cho onboarding / duyệt đơn.
export default function CheckMotion({ done = false, size = 22 }) {
  const reduce = useReducedMotion();
  const dur = reduce ? 0 : 0.35;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <motion.circle
        cx="12"
        cy="12"
        r="10"
        stroke={done ? '#0DB795' : '#CBD5E1'}
        strokeWidth="2"
        initial={false}
        animate={{ scale: done && !reduce ? [1, 1.18, 1] : 1 }}
        transition={{ duration: dur }}
        style={{ originX: '12px', originY: '12px' }}
      />
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
