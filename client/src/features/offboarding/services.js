// Service layer cho module Nghi viec & ban giao (Offboarding).
// Khop contract backend (server/app/blueprints/offboarding/routes.py):
//   POST   /offboarding                    (HR/Admin) { employee_id, last_working_day, reason? }
//   GET    /offboarding?status=&department_id=&page=&limit=   -> { data: [...], meta }
//   GET    /offboarding/:id                chi tiet + tasks + % tien do
//   PATCH  /offboarding/tasks/:id          { is_done?, note? }
//   POST   /offboarding/:id/complete       (HR/Admin) chi khi 100% task xong
//   POST   /offboarding/:id/cancel         (HR/Admin)
// axiosClient interceptor da boc san body ({ data, meta }) — khong boc lai.
import api from '../../api/axiosClient';

export function currentRole() {
  try {
    const raw = localStorage.getItem('hrm_user');
    return raw ? JSON.parse(raw)?.role || '' : '';
  } catch {
    return '';
  }
}

/** Danh sach quy trinh nghi viec theo scope. GET /offboarding -> { data, meta } */
export async function getProcesses({ status, departmentId, page = 1, limit = 50 } = {}) {
  const params = { page, limit };
  if (status) params.status = status;
  if (departmentId) params.department_id = departmentId;
  return api.get('/offboarding', { params });
}

/** Tao quy trinh nghi viec (HR/Admin). payload: { employee_id, last_working_day, reason? } */
export async function createProcess(payload) {
  const body = await api.post('/offboarding', payload);
  return body?.data ?? body;
}

/** Chi tiet quy trinh kem checklist. GET /offboarding/:id */
export async function getProcess(id) {
  const body = await api.get(`/offboarding/${id}`);
  return body?.data ?? body;
}

/** Tick / bo tick dau viec. payload: { is_done?, note? } */
export async function updateTask(id, payload) {
  const body = await api.patch(`/offboarding/tasks/${id}`, payload);
  return body?.data ?? body;
}

/** Hoan tat quy trinh (HR/Admin) — backend tu choi neu chua xong 100%. */
export async function completeProcess(id) {
  const body = await api.post(`/offboarding/${id}/complete`);
  return body?.data ?? body;
}

/** Huy quy trinh (HR/Admin). */
export async function cancelProcess(id) {
  const body = await api.post(`/offboarding/${id}/cancel`);
  return body?.data ?? body;
}

// Chuan hoa loi API { error: { code, message, details } } thanh
// { message, fieldErrors } — cung pattern voi onboarding/services.
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
