// Service layer cho module Chấm công (FR-05).
// Mọi request đi qua axiosClient dùng chung (baseURL /api/v1, gắn JWT,
// xử lý refresh token 401). Trả về response.data đã được unwrap ở interceptor
// nếu có; để an toàn, các hàm dưới đây tự chuẩn hoá cả 2 trường hợp.
import api from '../../api/axiosClient';

const unwrap = (res) => (res && res.data !== undefined ? res.data : res);

/** Trạng thái chấm công của chính người dùng trong hôm nay.
 *  GET /attendance/today
 *  -> { date, check_in_at, check_out_at, status, note } | null khi chưa check-in */
export async function getToday() {
  return unwrap(await api.get('/attendance/today'));
}

/** POST /attendance/check-in  -> bản ghi attendance hôm nay sau khi check-in */
export async function checkIn() {
  return unwrap(await api.post('/attendance/check-in'));
}

/** POST /attendance/check-out -> bản ghi attendance hôm nay sau khi check-out */
export async function checkOut() {
  return unwrap(await api.post('/attendance/check-out'));
}

/** Bảng công tháng của chính người dùng.
 *  GET /attendance/monthly?month=&year=&mine=1
 *  -> { data: [record...], summary: { workdays, late, on_leave, absent, missing_checkout } } */
export async function getMyMonthly(month, year) {
  // Body gồm { data, summary, meta } — interceptor đã bóc response.data,
  // KHÔNG unwrap thêm (unwrap sẽ chỉ còn mảng data và làm mất summary).
  return api.get('/attendance/monthly', { params: { month, year, mine: 1 } });
}

/** Bảng công tháng toàn công ty / theo phòng (HR, Admin, Manager-phạm vi phòng).
 *  GET /attendance/monthly?month=&year=&department_id=&employee_id=&page=&limit=
 *  -> { data: [ { employee, summary }... ], meta } */
export async function getTeamMonthly({ month, year, departmentId, employeeId, page = 1, limit = 50 }) {
  const params = { month, year, page, limit };
  if (departmentId) params.department_id = departmentId;
  if (employeeId) params.employee_id = employeeId;
  // Giữ nguyên body { data, meta } như getMyMonthly.
  return api.get('/attendance/monthly', { params });
}

/** Danh sách phòng ban cho bộ lọc (chỉ gọi khi có quyền; lỗi -> []). */
export async function getDepartments() {
  try {
    const res = unwrap(await api.get('/departments', { params: { limit: 100 } }));
    return Array.isArray(res) ? res : res.data || [];
  } catch {
    return [];
  }
}

/** Danh sách nhân viên cho bộ lọc (chỉ gọi khi có quyền; lỗi -> []). */
export async function getEmployees({ departmentId, search } = {}) {
  try {
    const params = { limit: 100 };
    if (departmentId) params.department_id = departmentId;
    if (search) params.search = search;
    const res = unwrap(await api.get('/employees', { params }));
    return Array.isArray(res) ? res : res.data || [];
  } catch {
    return [];
  }
}
