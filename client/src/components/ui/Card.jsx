// Card + CardHeader chuẩn design system v2.
export function Card({ className = '', hover = false, children, ...props }) {
  return (
    <section
      className={`ui-card ${hover ? 'ui-card-hover' : ''} ${className}`}
      {...props}
    >
      {children}
    </section>
  );
}

export function CardHeader({ title, subtitle, actions, className = '' }) {
  return (
    <header className={`flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 ${className}`}>
      <div className="min-w-0">
        <h3 className="truncate text-[15px] font-bold tracking-[-0.01em] text-slate-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function CardBody({ className = '', children }) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

export default Card;
