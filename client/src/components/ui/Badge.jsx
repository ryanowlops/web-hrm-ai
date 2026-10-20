// Huy hiệu trạng thái. tone: slate | blue | green | amber | red | violet | teal
const TONES = {
  slate: 'bg-slate-100 text-slate-600 ring-slate-600/15',
  blue: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/25',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  teal: 'bg-accent-50 text-accent-700 ring-accent-600/20',
};

export default function Badge({ tone = 'slate', dot = false, className = '', children }) {
  return (
    <span className={`ui-badge ${TONES[tone] || TONES.slate} ${className}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
