/**
 * format.js — Hàm định dạng hiển thị dùng chung toàn app.
 * Mọi hàm đều "chịu" giá trị null/undefined/NaN: trả về "—" thay vì ném lỗi.
 */

const PLACEHOLDER = '—';

const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('vi-VN');

const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Ép về số hữu hạn; không hợp lệ thì trả về null. */
function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Chuyển chuỗi ngày về đối tượng Date hợp lệ (hoặc null).
 * Chuỗi date-only "yyyy-mm-dd" được hiểu theo giờ địa phương để tránh lệch ngày.
 */
function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dateOnly) {
    const d = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Định dạng tiền Việt Nam Đồng, ví dụ: 15284000 -> "15.284.000 ₫".
 * @param {number|string|null|undefined} value Số tiền cần định dạng.
 * @returns {string} Chuỗi tiền đã định dạng, hoặc "—" nếu không hợp lệ.
 */
export function formatVND(value) {
  const n = toFiniteNumber(value);
  if (n === null) return PLACEHOLDER;
  return vndFormatter.format(Math.round(n));
}

/**
 * Định dạng số có dấu phân cách hàng nghìn kiểu vi-VN, ví dụ: 1234567 -> "1.234.567".
 * @param {number|string|null|undefined} value Số cần định dạng.
 * @returns {string} Chuỗi số đã định dạng, hoặc "—" nếu không hợp lệ.
 */
export function formatNumber(value) {
  const n = toFiniteNumber(value);
  if (n === null) return PLACEHOLDER;
  return numberFormatter.format(n);
}

/**
 * Định dạng ngày theo kiểu dd/mm/yyyy, ví dụ: "2026-10-21" -> "21/10/2026".
 * @param {string|Date|null|undefined} value Ngày dạng ISO hoặc đối tượng Date.
 * @returns {string} Chuỗi ngày đã định dạng, hoặc "—" nếu không hợp lệ.
 */
export function formatDate(value) {
  const d = toDate(value);
  if (!d) return PLACEHOLDER;
  return dateFormatter.format(d);
}

/**
 * Định dạng ngày giờ theo kiểu dd/mm/yyyy HH:mm (24 giờ).
 * @param {string|Date|null|undefined} value Thời điểm dạng ISO hoặc đối tượng Date.
 * @returns {string} Chuỗi ngày giờ đã định dạng, hoặc "—" nếu không hợp lệ.
 */
export function formatDateTime(value) {
  const d = toDate(value);
  if (!d) return PLACEHOLDER;
  return `${dateFormatter.format(d)} ${timeFormatter.format(d)}`;
}

/**
 * Lấy 2 chữ cái viết tắt cho avatar từ họ tên (chữ đầu của từ đầu và từ cuối),
 * ví dụ: "Phạm Thị Lan" -> "PL". Tên trống trả về "?".
 * @param {string|null|undefined} name Họ tên đầy đủ.
 * @returns {string} 1–2 ký tự viết hoa.
 */
export function initials(name) {
  if (!name || typeof name !== 'string') return '?';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

/**
 * Nối các class có điều kiện thành một chuỗi (phong cách clsx rút gọn).
 * Nhận chuỗi/số, mảng lồng nhau, hoặc object { tenClass: điềuKiện }.
 * @param {...(string|number|Array|Object|null|undefined|false)} classes Các class đầu vào.
 * @returns {string} Chuỗi class đã nối bằng khoảng trắng.
 */
export function cx(...classes) {
  const out = [];
  const collect = (item) => {
    if (!item) return;
    if (typeof item === 'string' || typeof item === 'number') {
      out.push(String(item));
    } else if (Array.isArray(item)) {
      item.forEach(collect);
    } else if (typeof item === 'object') {
      Object.keys(item).forEach((key) => {
        if (item[key]) out.push(key);
      });
    }
  };
  classes.forEach(collect);
  return out.join(' ');
}

export default formatVND;
