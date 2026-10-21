import { motion, useReducedMotion } from 'motion/react';

// Button chuẩn design system v4 (bám Untitled UI / shadcn-admin):
// phẳng hoàn toàn — không shadow nổi/glow, không nâng khi hover.
// variant: primary | accent | secondary | ghost | danger | dark
// size: sm | md | lg — chiều cao 36–40px, rounded-lg, chữ 14px medium.
const VARIANTS = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 focus-visible:ring-brand-600/25',
  accent:
    'bg-accent-500 text-white hover:bg-accent-600 active:bg-accent-700 focus-visible:ring-accent-500/30',
  secondary:
    'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 active:bg-gray-100 focus-visible:ring-brand-600/20',
  ghost:
    'bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200/60 focus-visible:ring-brand-600/20',
  danger:
    'bg-[#D92D20] text-white hover:bg-[#B42318] active:bg-[#912018] focus-visible:ring-[#F04438]/30',
  dark:
    'bg-gray-900 text-white hover:bg-gray-800 active:bg-gray-950 focus-visible:ring-gray-500/30',
};

const SIZES = {
  sm: 'h-9 px-3.5 text-[13px] rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-lg gap-2',
  lg: 'h-10 px-5 text-sm rounded-lg gap-2',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  disabled,
  ...props
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      whileTap={reduce || disabled || loading ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.12 }}
      className={`inline-flex select-none items-center justify-center font-medium
        transition-colors duration-150 active:scale-[.98]
        focus:outline-none focus-visible:ring-4 disabled:pointer-events-none disabled:opacity-55
        ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
        </svg>
      )}
      {children}
    </motion.button>
  );
}
