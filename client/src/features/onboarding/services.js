// Service layer cho module Hoi nhap (Onboarding).
// Khop contract backend (server/app/blueprints/onboarding/routes.py):
//   GET    /onboarding/templates                 (HR/Admin)
//   POST   /onboarding/templates                 (HR/Admin)
//   PATCH  /onboarding/templates/:id             (HR/Admin)
//   GET    /onboarding/plans?status=&department_id=&page=&limit=
//   POST   /onboarding/plans                     (HR/Admin) { employee_id, template_id? }
//   GET    /onboarding/plans/:id                 chi tiet + tasks + % tien do
//   GET    /onboarding/my-plan                   plan cua chinh toi (khong co -> data: null)
//   GET    /onboarding/my-tasks                  task duoc giao cho toi / trong plan cua toi
//   PATCH  /onboarding/tasks/:id                 { status?, note?, assignee_id? }
//   POST   /onboarding/tasks/:id/verify          (HR/Admin) xac nhan task loai document
import api from '../../api/axiosClient';

const unwrap = (res) => (res && res.data !== undefined ? res.data : res);

export function currentRole() {
  try {
    const raw = localStorage.getItem('hrm_user');
    return raw ? JSON.parse(raw)?.role || '' : '';
  } catch {
    return '';
  }
}

// --- Templates ---------------------------------------------------------------

/** Danh sach mau hoi nhap kem task mau. GET /onboarding/templates -> [...] */
export async function getTemplates() {
  const res = unwrap(await api.get('/onboarding/templates'));
  return Array.isArray(res) ? res : res.data || [];
}

/** Tao mau moi. payload: { name, department_id?, position_id?, is_active?, tasks: [...] } */
export async function createTemplate(payload) {
  const res = unwrap(await api.post('/onboarding/templates', payload));
  return res?.data ?? res;
}

/** Sua mau; gui tasks la thay toan bo danh sach task mau. */
export async function updateTemplate(id, payload) {
  const res = unwrap(await api.patch(`/onboarding/templates/${id}`, payload));
  return res?.data ?? res;
}

// --- Plans -------------------------------------------------------------------

/** Bang theo doi ke hoach. GET /onboarding/plans -> { data: [...], meta } */
export async function getPlans({ status, departmentId, page = 1, limit = 50 } = {}) {
  const params = { page, limit };
  if (status) params.status = status;
  if (departmentId) params.department_id = departmentId;
  return unwrap(await api.get('/onboarding/plans', { params }));
}

/** Sinh plan thu cong cho 1 nhan vien (HR). payload: { employee_id, template_id? } */
export async function createPlan(payload) {
  const res = unwrap(await api.post('/onboarding/plans', payload));
  return res?.data ?? res;
}

/** Chi tiet plan kem tasks. GET /onboarding/plans/:id */
export async function getPlan(id) {
  const res = unwrap(await api.get(`/onboarding/plans/${id}`));
  return res?.data ?? res;
}

/** Plan cua chinh nguoi dang dang nhap; null neu chua co. GET /onboarding/my-plan */
export async function getMyPlan() {
  const res = unwrap(await api.get('/onboarding/my-plan'));
  return res?.data ?? null;
}

// --- Tasks -------------------------------------------------------------------

/** Moi task duoc giao cho toi + task trong plan cua toi. GET /onboarding/my-tasks -> [...] */
export async function getMyTasks() {
  const res = unwrap(await api.get('/onboarding/my-tasks'));
  return Array.isArray(res) ? res : res.data || [];
}

/** Cap nhat task. payload: { status?, note?, assignee_id? }
 *  status dat duoc: pending | in_progress | done | skipped */
export async function updateTask(id, payload) {
  const res = unwrap(await api.patch(`/onboarding/tasks/${id}`, payload));
  return res?.data ?? res;
}

/** HR xac nhan task loai ho so (document). POST /onboarding/tasks/:id/verify */
export async function verifyTask(id) {
  const res = unwrap(await api.post(`/onboarding/tasks/${id}/verify`));
  return res?.data ?? res;
}

// Chuan hoa loi API { error: { code, message, details } } thanh
// { message, fieldErrors } — cung pattern voi employees/services.
export function parseApiError(err, fallback = 'Đã xảy ra lỗi, vui lòng thử lại.') {
  const apiError = err?.response?.data?.error;
  const result = { message: apiError?.message || fallback, fieldErrors: {} };
  const details = apiError?.details;
  if (Array.isArray(details)) {
    details.forEach((d) => {
      if (d && typeof d === 'object' && d.field) {
        result.fieldErrors[d.field] = d.message || 'Dữ liệu không hợp lệ';
      }
    });
  }
  return result;
}
