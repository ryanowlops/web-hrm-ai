// Service layer cho module Nghỉ phép (FR-06).
// Quy trình duyệt 2 cấp: Manager (cấp 1) -> HR (cấp cuối).
// Server là nguồn sự thật về số dư phép, trùng đơn và phân quyền duyệt;
// frontend chỉ validate sớm để hướng dẫn người dùng.
import api from '../../api/axiosClient';

const unwrap = (res) => (res && res.data !== undefined ? res.data : res);

/** Các loại nghỉ đang áp dụng. GET /leave/types -> [{ id, name, paid, annual_quota_days }] */
export async function getLeaveTypes() {
  const res = unwrap(await api.get('/leave/types'));
  return Array.isArray(res) ? res : res.data || [];
}

/** Số dư phép của chính người dùng theo năm.
 *  GET /leave/balances?year=
 *  -> [{ leave_type_id, leave_type_name, paid, total_days, used_days, remaining_days }] */
export async function getMyBalances(year) {
  const res = unwrap(await api.get('/leave/balances', { params: { year } }));
  return Array.isArray(res) ? res : res.data || [];
}

/** Tạo đơn nghỉ. POST /leave/requests
 *  payload: { leave_type_id, from_date, to_date, reason } */
export async function createRequest(payload) {
  return unwrap(await api.post('/leave/requests', payload));
}

/** Đơn nghỉ của chính người dùng. GET /leave/requests?mine=1&page=&limit=&status= */
export async function getMyRequests({ page = 1, limit = 20, status } = {}) {
  const params = { mine: 1, page, limit };
  if (status) params.status = status;
  return unwrap(await api.get('/leave/requests', { params }));
}

/** Huỷ đơn của mình (chỉ khi còn pending / manager_approved).
 *  POST /leave/requests/:id/cancel */
export async function cancelRequest(id) {
  return unwrap(await api.post(`/leave/requests/${id}/cancel`));
}

/** Hàng đợi duyệt theo vai trò người dùng hiện tại:
 *  - Manager: đơn status=pending của nhân viên trong phòng mình.
 *  - HR/Admin: đơn status=manager_approved (chờ duyệt cấp cuối).
 *  Server tự lọc theo JWT; frontend không tự quyết quyền.
 *  GET /leave/requests?pending_for_me=1 */
export async function getPendingForMe({ page = 1, limit = 20 } = {}) {
  return unwrap(await api.get('/leave/requests', { params: { pending_for_me: 1, page, limit } }));
}

/** Duyệt đơn. POST /leave/requests/:id/approve  body: { note? } */
export async function approveRequest(id, note) {
  return unwrap(await api.post(`/leave/requests/${id}/approve`, { note: note || undefined }));
}

/** Từ chối đơn (bắt buộc kèm lý do). POST /leave/requests/:id/reject  body: { reason } */
export async function rejectRequest(id, reason) {
  return unwrap(await api.post(`/leave/requests/${id}/reject`, { reason }));
}

/** Lịch nghỉ đã duyệt trong tháng (của phòng mình / toàn công ty tuỳ quyền).
 *  GET /leave/calendar?month=&year=
 *  -> [{ id, employee_name, department_name, leave_type_name, from_date, to_date, days_count }] */
export async function getCalendar(month, year) {
  const res = unwrap(await api.get('/leave/calendar', { params: { month, year } }));
  return Array.isArray(res) ? res : res.data || [];
}
