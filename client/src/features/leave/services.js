// Service layer cho module Nghỉ phép (FR-06).
// Quy trình duyệt 2 cấp: Manager (cấp 1) -> HR (cấp cuối).
// Server là nguồn sự thật về số dư phép, trùng đơn và phân quyền duyệt;
// frontend chỉ validate sớm để hướng dẫn người dùng.
// Khớp contract backend (server/app/blueprints/leave/routes.py):
//   GET  /leave/types
//   GET  /leave/balance/me?year=
//   POST /leave/requests | GET /leave/requests?scope=&status=
//   POST /leave/requests/:id/manager-decision | /hr-decision  { decision, note }
//   POST /leave/requests/:id/cancel
//   GET  /leave/calendar?month=YYYY-MM
import api from '../../api/axiosClient';

const unwrap = (res) => (res && res.data !== undefined ? res.data : res);

function currentRole() {
  try {
    const raw = localStorage.getItem('hrm_user');
    return raw ? JSON.parse(raw)?.role || '' : '';
  } catch {
    return '';
  }
}

/** Các loại nghỉ đang áp dụng. GET /leave/types -> [{ id, name, paid, annual_quota_days }] */
export async function getLeaveTypes() {
  const res = unwrap(await api.get('/leave/types'));
  return Array.isArray(res) ? res : res.data || [];
}

/** Số dư phép của chính người dùng theo năm.
 *  GET /leave/balance/me?year=
 *  -> [{ leave_type_id, leave_type_name, total_days, used_days, remaining_days }] */
export async function getMyBalances(year) {
  const res = unwrap(await api.get('/leave/balance/me', { params: { year } }));
  return Array.isArray(res) ? res : res.data || [];
}

/** Tạo đơn nghỉ. POST /leave/requests
 *  payload: { leave_type_id, from_date, to_date, reason } */
export async function createRequest(payload) {
  return unwrap(await api.post('/leave/requests', payload));
}

/** Đơn nghỉ của chính người dùng. GET /leave/requests?scope=mine&page=&limit=&status= */
export async function getMyRequests({ page = 1, limit = 20, status } = {}) {
  const params = { scope: 'mine', page, limit };
  if (status) params.status = status;
  return unwrap(await api.get('/leave/requests', { params }));
}

/** Huỷ đơn của mình (chỉ khi còn pending / manager_approved).
 *  POST /leave/requests/:id/cancel */
export async function cancelRequest(id) {
  return unwrap(await api.post(`/leave/requests/${id}/cancel`));
}

/** Hàng đợi duyệt theo vai trò người dùng hiện tại:
 *  - Manager: đơn status=pending trong phòng mình (scope=team).
 *  - HR/Admin: đơn status=manager_approved (đã qua cấp 1).
 *  GET /leave/requests?status=&scope= */
export async function getPendingForMe({ page = 1, limit = 20 } = {}) {
  const role = currentRole();
  const params = { page, limit };
  if (role === 'manager') {
    params.status = 'pending';
    params.scope = 'team';
  } else if (role === 'hr' || role === 'admin') {
    params.status = 'manager_approved';
  }
  return unwrap(await api.get('/leave/requests', { params }));
}

// Đơn đang "pending" chờ cấp Manager; "manager_approved" chờ cấp HR.
function decisionPath(id, status) {
  return status === 'manager_approved'
    ? `/leave/requests/${id}/hr-decision`
    : `/leave/requests/${id}/manager-decision`;
}

/** Duyệt đơn theo đúng cấp dựa trên trạng thái hiện tại của đơn. */
export async function approveRequest(id, note, status) {
  return unwrap(
    await api.post(decisionPath(id, status), {
      decision: 'approved',
      note: note || undefined,
    }),
  );
}

/** Từ chối đơn (bắt buộc kèm lý do — server kiểm tra note khi rejected). */
export async function rejectRequest(id, reason, status) {
  return unwrap(
    await api.post(decisionPath(id, status), { decision: 'rejected', note: reason }),
  );
}

/** Lịch nghỉ đã duyệt trong tháng (của phòng mình / toàn công ty tuỳ quyền).
 *  GET /leave/calendar?month=YYYY-MM
 *  -> [{ id, employee_name, department_name, leave_type_name, from_date, to_date, days_count }] */
export async function getCalendar(month, year) {
  const mm = `${year}-${String(month).padStart(2, '0')}`;
  const res = unwrap(await api.get('/leave/calendar', { params: { month: mm } }));
  return Array.isArray(res) ? res : res.data || [];
}
