// Service layer cho module Báo cáo (Đợt mở rộng v2 — Đội F).
// Backend: server/app/blueprints/stats/routes.py (chỉ HR/Admin/Manager xem được,
// Manager chỉ thấy số liệu phòng ban của mình):
//   GET /stats/reports/summary?month=&year=
//   GET /stats/reports/export?type=attendance|payroll|leave&month=&year=  -> CSV
import axiosClient from '../../api/axiosClient';

// axiosClient đã qua interceptor: hàm gọi nhận về response.data trực tiếp.
function unwrap(res) {
  if (res && typeof res === 'object' && 'data' in res && ('status' in res || 'headers' in res)) {
    return res.data;
  }
  return res;
}

/** Tổng hợp báo cáo tháng: headcount theo phòng, chấm công, nghỉ phép theo loại,
 *  chi phí lương theo phòng (từ kỳ lương của tháng hoặc kỳ gần nhất trước đó). */
export async function getReportSummary({ month, year } = {}) {
  const res = await axiosClient.get('/stats/reports/summary', { params: { month, year } });
  return unwrap(res);
}

const CSV_FILENAMES = {
  attendance: 'baocao-cham-cong',
  payroll: 'baocao-luong',
  leave: 'baocao-nghi-phep',
};

/** Tải file CSV qua blob (axiosClient tự gắn Authorization Bearer token). */
export async function downloadReportCsv(type, { month, year } = {}) {
  const blob = await axiosClient.get('/stats/reports/export', {
    params: { type, month, year },
    responseType: 'blob',
  });
  const data = blob instanceof Blob ? blob : new Blob([blob], { type: 'text/csv;charset=utf-8' });
  const url = window.URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  const mm = String(month).padStart(2, '0');
  link.download = `${CSV_FILENAMES[type] || 'baocao'}-${year}-${mm}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function parseApiError(err, fallback = 'Đã xảy ra lỗi, vui lòng thử lại.') {
  const apiError = err?.response?.data?.error;
  return { message: apiError?.message || fallback };
}
