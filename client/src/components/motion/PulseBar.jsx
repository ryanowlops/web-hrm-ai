import { motion, useReducedMotion } from 'motion/react';

// PulseBar (v3) — "thanh nhịp" ngang: phần đã hoàn thành vẽ dần theo giá trị
// thật (800ms), kèm các mốc (milestones) dạng chấm + nhãn thời gian.
// Đây là phần tử nhận diện "Nhịp nhân sự" của Dashboard / hero.
// milestones: [{ at: 0..1, label: '07:30', done: bool }]
export default function PulseBar({ value = 0, milestones = [], height = 10, className = '' }) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={className}>
      <div className="relative" style={{ height }}>
        <div className="absolute inset-0 rounded-full bg-white/15" />
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent-400 via-accent-500 to-brand-400"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={reduce ? { duration: 0 } : { duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
        {milestones.map((m, i) => (
          <motion.span
            key={i}
            className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ${
              m.done ? 'bg-accent-400 ring-accent-300/50' : 'bg-navy-800 ring-white/40'
            }`}
            style={{ left: `${Math.max(0, Math.min(100, (m.at || 0) * 100))}%` }}
            initial={reduce ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={reduce ? { duration: 0 } : { delay: 0.15 + i * 0.12, type: 'spring', stiffness: 380, damping: 20 }}
          />
        ))}
      </div>
      {milestones.length > 0 && (
        <div className="relative mt-2 h-4">
          {milestones.map((m, i) => (
            <span
              key={i}
              className={`tnum absolute -translate-x-1/2 text-[11px] font-semibold ${m.done ? 'text-accent-300' : 'text-slate-400'}`}
              style={{ left: `${Math.max(2, Math.min(98, (m.at || 0) * 100))}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
