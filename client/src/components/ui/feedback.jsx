import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import Button from './Button.jsx';

// Thành phần phản hồi v4 — bám Untitled UI: phẳng, thang gray, màu ngữ
// nghĩa nền nhạt + border cùng tông + icon. Spinner, Skeleton,
// TableSkeleton, EmptyState, Alert. API/props giữ nguyên như v3.
export function Spinner({ className = 'h-5 w-5 text-brand-600' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`animate-pulse rounded bg-gray-100 ${className}`} aria-hidden="true" />;
}

// Độ rộng thanh dữ liệu luân phiên theo vị trí để skeleton trông như
// bảng thật (không dùng số ngẫu nhiên — render ổn định).
const CELL_WIDTHS = ['w-2/3', 'w-1/2', 'w-3/4', 'w-2/5', 'w-3/5'];

export function TableSkeleton({ rows = 5, cols = 4 }) {
  return (
    <div aria-hidden="true">
      {/* Hàng tiêu đề giả — cùng cấu trúc thead của bảng thật */}
      <div className="flex items-center gap-4 border-b border-gray-200 bg-gray-50 px-4 py-3">
        {Array.from({ length: cols }).map((_, c) => (
          <div key={c} className="flex flex-1 items-center gap-3">
            {c === 0 && <Skeleton className="h-8 w-8 shrink-0 rounded-full" />}
            <Skeleton className="h-3 flex-1" />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-gray-100 px-4 py-3 last:border-b-0">
          {Array.from({ length: cols }).map((_, c) =>
            c === 0 ? (
              // Ô đầu: avatar tròn + 2 dòng (tên / thông tin phụ) như ô tên thật
              <div key={c} className="flex flex-1 items-center gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ) : (
              <div key={c} className="flex-1">
                <Skeleton className={`h-3.5 ${CELL_WIDTHS[(r + c) % CELL_WIDTHS.length]}`} />
              </div>
            ),
          )}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-400">
          {icon}
        </div>
      )}
      <h4 className="text-[15px] font-semibold text-gray-900">{title}</h4>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-gray-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// Màu ngữ nghĩa theo hợp đồng v4 (mục 2): nền nhạt + chữ đậm + border cùng tông.
const ALERT_TONES = {
  success: 'border-[#A6F4C5] bg-[#ECFDF3] text-[#067647]',
  warning: 'border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]',
  error: 'border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]',
  info: 'border-brand-200 bg-brand-50 text-brand-700',
};

const ALERT_ICONS = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
  info: Info,
};

export function Alert({ tone = 'info', children, className = '' }) {
  if (!children) return null;
  const Icon = ALERT_ICONS[tone] || Info;
  return (
    <div role="alert" className={`relative rounded-lg border px-4 py-3 pl-11 text-sm leading-relaxed ${ALERT_TONES[tone] || ALERT_TONES.info} ${className}`}>
      <span className="absolute left-4 top-[14px]" aria-hidden="true">
        <Icon size={18} />
      </span>
      {children}
    </div>
  );
}

// Banner lỗi tải dữ liệu dùng chung: Alert tone error + nút "Thử lại" gọi
// onRetry — thay cho các banner lỗi trơ (không có cách phục hồi) ở các trang.
export function LoadError({ message, onRetry, className = '' }) {
  if (!message) return null;
  return (
    <Alert tone="error" className={className}>
      <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="min-w-0 flex-1">{message}</span>
        {onRetry && (
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            Thử lại
          </Button>
        )}
      </span>
    </Alert>
  );
}
