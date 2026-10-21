import { motion, useReducedMotion } from 'motion/react';

// ProgressRing (v3) — vòng tiến độ % vẽ theo giá trị thật (800ms ease-out).
// Dùng cho OKR / onboarding / hiệu suất. Tôn trọng reduced-motion.
export default function ProgressRing({
  value = 0,
  size = 84,
  stroke = 8,
  color = '#274FEA',
  track = '#E2E8F0',
  label,
  sub,
  labelClassName = 'text-slate-900',
  subClassName = 'text-slate-500',
}) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (c * pct) / 100 }}
          transition={reduce ? { duration: 0 } : { duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`tnum font-display text-lg font-extrabold leading-none ${labelClassName}`}>{label ?? `${Math.round(pct)}%`}</span>
        {sub ? <span className={`mt-0.5 text-[10px] font-medium ${subClassName}`}>{sub}</span> : null}
      </div>
    </div>
  );
}
