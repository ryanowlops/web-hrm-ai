// Tiêu đề trang v4 (hợp đồng frontend-design-v4, mục 3 + 5.1): phẳng kiểu
// shadcn-admin — KHÔNG eyebrow, KHÔNG font hiển thị riêng, không trang trí.
// Trái: tiêu đề 20px semibold gray-900 + mô tả 14px gray-500.
// Phải: cụm nút hành động (trang tự xếp secondary trước, primary sau).
// Prop `eyebrow` vẫn nhận để tương thích API cũ nhưng không còn hiển thị.
export default function PageHeader({ eyebrow: _eyebrow, title, subtitle, actions, className = '' }) {
  return (
    <div className={`mb-6 flex flex-wrap items-center justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold leading-7 tracking-[-0.01em] text-gray-900">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm leading-relaxed text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
