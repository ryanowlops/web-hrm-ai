// Ô nhập liệu chuẩn design system v2 (dùng class .ui-input/.ui-select/.ui-textarea).
export function FormField({ label, error, hint, children, className = '' }) {
  return (
    <div className={className}>
      {label && <label className="ui-label">{label}</label>}
      {children}
      {hint && !error && <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{hint}</p>}
      {error && <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}

export function Input({ className = '', ...props }) {
  return <input className={`ui-input ${className}`} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`ui-select ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className = '', rows = 3, ...props }) {
  return <textarea rows={rows} className={`ui-textarea ${className}`} {...props} />;
}
