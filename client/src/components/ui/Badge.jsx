// Huy hiệu trạng thái v4 — ánh xạ tone sang bộ màu ngữ nghĩa Untitled UI
// (hợp đồng thiết kế mục 2): success #ECFDF3/#067647 · warning #FFFAEB/#B54708
// · error #FEF3F2/#B42318 · info = brand · neutral = gray · violet giữ tím nhạt.
// tone: slate | blue | green | amber | red | violet | teal
const TONES = {
  slate: { chip: 'bg-gray-100 text-gray-700 ring-gray-200', dot: 'bg-gray-500' },
  blue: { chip: 'bg-brand-50 text-brand-700 ring-brand-200', dot: 'bg-brand-600' },
  green: { chip: 'bg-[#ECFDF3] text-[#067647] ring-[#ABEFC6]', dot: 'bg-[#12B76A]' },
  amber: { chip: 'bg-[#FFFAEB] text-[#B54708] ring-[#FEDF89]', dot: 'bg-[#F79009]' },
  red: { chip: 'bg-[#FEF3F2] text-[#B42318] ring-[#FECDCA]', dot: 'bg-[#F04438]' },
  violet: { chip: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500' },
  teal: { chip: 'bg-accent-50 text-accent-700 ring-accent-100', dot: 'bg-accent-500' },
};

export default function Badge({ tone = 'slate', dot = false, className = '', children }) {
  const t = TONES[tone] || TONES.slate;
  return (
    <span className={`ui-badge ${t.chip} ${className}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />}
      {children}
    </span>
  );
}
