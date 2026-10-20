// Thành phần phản hồi: Spinner, Skeleton, EmptyState, Alert.
export function Spinner({ className = 'h-5 w-5 text-brand-600' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`ui-skeleton ${className}`} aria-hidden="true" />;
}

export function TableSkeleton({ rows = 5, cols = 4 }) {
  return (
    <div className="space-y-2.5 p-4" aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-9 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex animate-fade-in flex-col items-center justify-center px-6 py-12 text-center">
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 ring-1 ring-inset ring-brand-100">
          {icon}
        </div>
      )}
      <h4 className="text-[15px] font-bold text-slate-800">{title}</h4>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const ALERT_TONES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  info: 'border-brand-200 bg-brand-50 text-brand-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
};

export function Alert({ tone = 'info', children, className = '' }) {
  if (!children) return null;
  return (
    <div role="alert" className={`animate-fade-in rounded-xl border px-4 py-3 text-sm font-medium leading-relaxed ${ALERT_TONES[tone]} ${className}`}>
      {children}
    </div>
  );
}
