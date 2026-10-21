// PulseBar — DEPRECATED từ v4: KHÔNG trang nào được dùng nữa (hợp đồng
// frontend-design-v4.md mục 1 & 6 cấm thanh nhịp/timeline trang trí).
// File + export này chỉ giữ lại để tương thích import cũ không bị vỡ;
// component render TĨNH hoàn toàn (đã bỏ mọi animation, kể cả hiệu ứng
// vẽ dần/spring của v3) và bỏ cả dải gradient. Đừng dùng cho trang mới.
export default function PulseBar({ value = 0, milestones = [], height = 10, className = '' }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={className}>
      <div className="relative" style={{ height }}>
        <div className="absolute inset-0 rounded-full bg-slate-200" />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-brand-500"
          style={{ width: `${pct}%` }}
        />
        {milestones.map((m, i) => (
          <span
            key={i}
            className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ${
              m.done ? 'bg-accent-400 ring-accent-300/50' : 'bg-slate-400 ring-white/60'
            }`}
            style={{ left: `${Math.max(0, Math.min(100, (m.at || 0) * 100))}%` }}
          />
        ))}
      </div>
      {milestones.length > 0 && (
        <div className="relative mt-2 h-4">
          {milestones.map((m, i) => (
            <span
              key={i}
              className={`tnum absolute -translate-x-1/2 text-[11px] font-semibold ${m.done ? 'text-accent-600' : 'text-slate-400'}`}
              style={{ left: `${Math.max(2, Math.min(98, (m.at || 0) * 100))}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
