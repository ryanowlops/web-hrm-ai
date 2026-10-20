import api from '../../api/axiosClient';

/**
 * Payroll API — khớp docs/architecture.md mục B6:
 *   GET    /api/v1/payroll/periods                 -> { data: [...], meta: { page, limit, totalItems, totalPages } }
 *   POST   /api/v1/payroll/periods                 -> tạo kỳ lương { month, year, standardWorkdays }
 *   POST   /api/v1/payroll/periods/:id/calculate   -> tính lương cho cả kỳ (sinh payroll_items)
 *   POST   /api/v1/payroll/periods/:id/lock        -> chốt kỳ (status = locked, không sửa được nữa)
 *   GET    /api/v1/payroll/periods/:id/items       -> bảng lương chi tiết, phân trang
 *   GET    /api/v1/payroll/my-payslip              -> phiếu lương của chính người dùng (kỳ đã chốt)
 *
 * axiosClient đã có baseURL chứa /api/v1 nên ở đây chỉ dùng path /payroll/...
 */

export function getPeriods(params = {}) {
  return api.get('/payroll/periods', { params });
}

export function createPeriod({ month, year, standardWorkdays }) {
  return api.post('/payroll/periods', { month, year, standardWorkdays });
}

export function calculatePeriod(periodId) {
  return api.post(`/payroll/periods/${periodId}/calculate`);
}

export function lockPeriod(periodId) {
  return api.post(`/payroll/periods/${periodId}/lock`);
}

export function getPeriodItems(periodId, params = {}) {
  return api.get(`/payroll/periods/${periodId}/items`, { params });
}

/**
 * Phiếu lương của người đang đăng nhập.
 * @param {number|string} [periodId] - nếu bỏ trống, backend trả phiếu của kỳ đã chốt mới nhất.
 * Backend chỉ trả dữ liệu khi kỳ đã chốt (locked); kỳ chưa chốt -> 404.
 */
export function getMyPayslip(periodId) {
  const params = periodId ? { period_id: periodId } : {};
  return api.get('/payroll/my-payslip', { params });
}
