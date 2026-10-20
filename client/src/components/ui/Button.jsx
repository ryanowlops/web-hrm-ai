// Button chuẩn design system v2.
// variant: primary | accent | secondary | ghost | danger | dark
// size: sm | md | lg
const VARIANTS = {
  primary:
    'bg-brand-600 text-white shadow-[0_6px_16px_-6px_rgba(39,79,234,.55)] hover:bg-brand-700 active:bg-brand-800 focus-visible:ring-brand-500/40',
  accent:
    'bg-accent-500 text-white shadow-[0_6px_16px_-6px_rgba(13,183,149,.55)] hover:bg-accent-600 active:bg-accent-700 focus-visible:ring-accent-500/40',
  secondary:
    'bg-white text-slate-700 border border-slate-300 shadow-sm hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100 focus-visible:ring-brand-500/30',
  ghost:
    'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200/70 focus-visible:ring-brand-500/30',
  danger:
    'bg-rose-600 text-white shadow-[0_6px_16px_-6px_rgba(225,29,72,.5)] hover:bg-rose-700 active:bg-rose-800 focus-visible:ring-rose-500/40',
  dark:
    'bg-navy-900 text-white hover:bg-navy-800 active:bg-navy-950 focus-visible:ring-navy-700/40',
};

const SIZES = {
  sm: 'h-9 px-3.5 text-[13px] rounded-lg gap-1.5',
  md: 'h-[42px] px-[18px] text-sm rounded-xl gap-2',
  lg: 'h-12 px-6 text-[15px] rounded-xl gap-2',
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
  return (
    <button
      className={`inline-flex select-none items-center justify-center font-semibold tracking-[0.01em]
        transition-all duration-200 ease-spring hover:-translate-y-px active:translate-y-0 active:scale-[.99]
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
    </button>
  );
}
