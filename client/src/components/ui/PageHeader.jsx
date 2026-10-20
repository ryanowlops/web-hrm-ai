// Tiêu đề trang chuẩn enterprise: eyebrow (tuỳ chọn) + title + subtitle + actions.
export default function PageHeader({ eyebrow, title, subtitle, actions, className = '' }) {
  return (
    <div className={`mb-6 flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600">{eyebrow}</p>
        )}
        <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-slate-900 lg:text-[30px]">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}
