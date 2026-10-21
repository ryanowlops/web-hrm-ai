// Tiêu đề trang v3: bỏ eyebrow uppercase (chrome mẫu của v2) — tiêu đề
// Be Vietnam Pro, sentence case, kèm một dòng mô tả đúng việc sắp làm.
export default function PageHeader({ eyebrow, title, subtitle, actions, className = '' }) {
  return (
    <div className={`mb-6 flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[13px] font-semibold normal-case tracking-normal text-brand-600">{eyebrow}</p>
        )}
        <h1 className="font-display text-[28px] font-bold leading-tight text-slate-900 lg:text-[32px]">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}
