import { Fragment, cloneElement, isValidElement, useId } from 'react';

// Ô nhập liệu chuẩn design system v4 (hợp đồng frontend-design-v4, mục 3):
// cao 40px, border gray-300, rounded-lg, nền trắng, chữ gray-900,
// placeholder gray-400, focus = border brand-600 + ring brand-600/20.
const BASE_CLS =
  'w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-colors placeholder:text-gray-400 hover:border-gray-400 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500';

// Trạng thái lỗi (mục 2): border error #F04438, giữ nguyên khi hover/focus.
const ERROR_CLS =
  'border-[#F04438] hover:border-[#F04438] focus:border-[#F04438] focus:ring-[#F04438]/20';

const CHEVRON_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23667085' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.75rem center',
  backgroundSize: '16px 16px',
};

export function FormField({ label, error, hint, children, className = '' }) {
  const autoId = useId();
  // Nối label với ô nhập: nếu child là một phần tử duy nhất chưa có id,
  // gán id tự sinh bằng cloneElement và cho label trỏ htmlFor tới id đó.
  // Child đã có id riêng / không phải phần tử đơn -> giữ nguyên.
  const singleChild =
    isValidElement(children) && children.type !== Fragment ? children : null;
  const fieldId = singleChild ? singleChild.props.id || autoId : undefined;
  const content =
    singleChild && !singleChild.props.id ? cloneElement(singleChild, { id: fieldId }) : children;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      {content}
      {hint && !error && <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">{hint}</p>}
      {error && <p className="mt-1.5 text-[13px] font-medium text-[#B42318]">{error}</p>}
    </div>
  );
}

export function Input({ className = '', error, ...props }) {
  return <input className={`h-10 ${BASE_CLS} ${error ? ERROR_CLS : ''} ${className}`} {...props} />;
}

export function Select({ className = '', error, style, children, ...props }) {
  return (
    <select
      className={`h-10 appearance-none pr-9 ${BASE_CLS} ${error ? ERROR_CLS : ''} ${className}`}
      style={{ ...CHEVRON_STYLE, ...style }}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className = '', error, rows = 3, ...props }) {
  return (
    <textarea
      rows={rows}
      className={`resize-y py-2.5 leading-relaxed ${BASE_CLS} ${error ? ERROR_CLS : ''} ${className}`}
      {...props}
    />
  );
}
