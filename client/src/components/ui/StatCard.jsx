import AnimatedNumber from '../motion/AnimatedNumber.jsx';

// Thẻ số liệu v4 (hợp đồng frontend-design-v4, mục 3 + 5.4): phẳng kiểu
// shadcn-admin — thẻ trắng border gray-200 rounded-xl + shadow-card siêu nhẹ,
// KHÔNG vòng ring màu, KHÔNG shadow nổi/hover nâng thẻ.
// Bố cục: nhãn 13px gray-500 (icon nếu có nằm ô 36px phẳng ở góc phải),
// số 24px semibold tabular-nums gray-900, dòng phụ 13px gray-500.
// Prop `tone` vẫn nhận để tương thích API cũ nhưng không còn nhuộm màu icon.
export default function StatCard({ icon, label, value, sub, tone: _tone = 'blue', className = '' }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-5 shadow-card ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="pt-1.5 text-[13px] text-gray-500">{label}</p>
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-gray-50 text-gray-600">
            {icon}
          </div>
        )}
      </div>
      <p className="mt-1 text-2xl font-semibold leading-8 tracking-[-0.01em] text-gray-900 tabular-nums">
        {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
      </p>
      {sub && <p className="mt-1 text-[13px] leading-snug text-gray-500">{sub}</p>}
    </div>
  );
}
