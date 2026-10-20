// Thẻ số liệu cho dashboard: icon trong ô màu, nhãn, giá trị lớn, dòng phụ.
const TONES = {
  blue: 'bg-brand-50 text-brand-600 ring-brand-100',
  teal: 'bg-accent-50 text-accent-600 ring-accent-100',
  amber: 'bg-amber-50 text-amber-600 ring-amber-100',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100',
  rose: 'bg-rose-50 text-rose-600 ring-rose-100',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default function StatCard({ icon, label, value, sub, tone = 'blue', className = '' }) {
  return (
    <div className={`ui-card ui-card-hover flex items-start gap-4 p-5 ${className}`}>
      {icon && (
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${TONES[tone] || TONES.blue}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-slate-500">{label}</p>
        <p className="mt-1 truncate text-[26px] font-extrabold leading-none tracking-[-0.02em] text-slate-900">{value}</p>
        {sub && <p className="mt-1.5 text-[13px] leading-snug text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}
