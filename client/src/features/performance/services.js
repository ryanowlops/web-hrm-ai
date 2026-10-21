// Service layer cho module Hiệu suất (KPI/OKR).
// Khớp contract backend (server/app/blueprints/performance/routes.py):
//   GET    /performance/cycles | POST /performance/cycles
//   PATCH  /performance/cycles/:id/status
//   GET    /performance/suggestions?position=&department=
//   GET    /performance/objectives?cycle_id=&employee_id=&department_id=&status=
//   POST   /performance/objectives | GET/PATCH/DELETE /performance/objectives/:id
//   POST   /performance/objectives/:id/submit | /approve | /return
//   POST   /performance/key-results/:id/check-in | GET /performance/key-results/:id/check-ins
//   POST   /performance/reviews | GET /performance/reviews?cycle_id=&employee_id=
//   GET    /performance/dashboard?cycle_id=
// Server là nguồn sự thật về điểm số, trạng thái và phân quyền/scope;
// frontend chỉ hiển thị và validate sớm.
import api from '../../api/axiosClient';

// axiosClient có thể trả nguyên response (axios) hoặc body đã unwrap sẵn
// tùy interceptor — chuẩn hoá ở đây để page chỉ làm việc với body JSON.
function unwrap(res) {
  if (res && typeof res === 'object' && 'data' in res && ('status' in res || 'headers' in res)) {
    return res.data;
  }
  return res;
}

// Body danh sách theo quy ước: { data: [...] } hoặc mảng thuần.
function unwrapList(body) {
  if (Array.isArray(body)) return body;
  return body?.data ?? [];
}

// Body 1 bản ghi: object thuần hoặc bọc trong { data: {...} }.
function unwrapMember(body) {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body && body.data && typeof body.data === 'object') {
    return body.data;
  }
  return body;
}

/* ---------------- Chu kỳ đánh giá ---------------- */

/** Danh sách chu kỳ. GET /performance/cycles -> [{ id, name, start_date, end_date, status }] */
export async function getCycles() {
  return unwrapList(unwrap(await api.get('/performance/cycles')));
}

/** Tạo chu kỳ (HR/Admin). POST /performance/cycles { name, start_date, end_date } */
export async function createCycle(payload) {
  return unwrapMember(unwrap(await api.post('/performance/cycles', payload)));
}

/** Đổi trạng thái chu kỳ (HR/Admin). PATCH /performance/cycles/:id/status { status } */
export async function updateCycleStatus(id, status) {
  return unwrapMember(unwrap(await api.patch(`/performance/cycles/${id}/status`, { status })));
}

/* ---------------- Gợi ý mẫu ---------------- */

/** Gợi ý mục tiêu + KR mẫu theo chức vụ/phòng ban của người dùng.
 *  GET /performance/suggestions -> { position, department, matched_group, suggestions: [...] } */
export async function getSuggestions(params = {}) {
  return unwrapMember(unwrap(await api.get('/performance/suggestions', { params })));
}

/* ---------------- Mục tiêu + Key Result ---------------- */

/** Danh sách mục tiêu theo scope của người gọi.
 *  GET /performance/objectives?cycle_id=&employee_id=(id|'me')&department_id=&status=
 *  Mỗi mục tiêu kèm key_results[] (có progress) và score 0-100. */
export async function getObjectives(params = {}) {
  return unwrapList(unwrap(await api.get('/performance/objectives', { params })));
}

/** Chi tiết 1 mục tiêu. GET /performance/objectives/:id */
export async function getObjective(id) {
  return unwrapMember(unwrap(await api.get(`/performance/objectives/${id}`)));
}

/** Tạo mục tiêu + KR. POST /performance/objectives
 *  payload: { cycle_id, employee_id?, department_id?, title, description?, weight?, key_results: [...] } */
export async function createObjective(payload) {
  return unwrapMember(unwrap(await api.post('/performance/objectives', payload)));
}

/** Sửa mục tiêu (chỉ khi draft). PATCH /performance/objectives/:id */
export async function updateObjective(id, payload) {
  return unwrapMember(unwrap(await api.patch(`/performance/objectives/${id}`, payload)));
}

/** Huỷ mục tiêu (xoá mềm -> cancelled, chỉ khi draft). DELETE /performance/objectives/:id */
export async function deleteObjective(id) {
  return unwrapMember(unwrap(await api.delete(`/performance/objectives/${id}`)));
}

/** Gửi duyệt mục tiêu (draft -> pending). POST /performance/objectives/:id/submit */
export async function submitObjective(id) {
  return unwrapMember(unwrap(await api.post(`/performance/objectives/${id}/submit`)));
}

/** Duyệt mục tiêu (pending -> active). POST /performance/objectives/:id/approve */
export async function approveObjective(id) {
  return unwrapMember(unwrap(await api.post(`/performance/objectives/${id}/approve`)));
}

/** Trả lại mục tiêu (pending -> draft). POST /performance/objectives/:id/return { note } */
export async function returnObjective(id, note) {
  return unwrapMember(unwrap(await api.post(`/performance/objectives/${id}/return`, { note: note || undefined })));
}

/** Check-in tiến độ 1 KR. POST /performance/key-results/:id/check-in { new_value, note }
 *  -> bản ghi check-in kèm objective_score và key_result mới. */
export async function checkInKeyResult(keyResultId, payload) {
  return unwrapMember(unwrap(await api.post(`/performance/key-results/${keyResultId}/check-in`, payload)));
}

/** Lịch sử check-in của 1 KR. GET /performance/key-results/:id/check-ins */
export async function getCheckins(keyResultId) {
  return unwrapList(unwrap(await api.get(`/performance/key-results/${keyResultId}/check-ins`)));
}

/* ---------------- Đánh giá ---------------- */

/** Danh sách đánh giá theo scope. GET /performance/reviews?cycle_id=&employee_id= */
export async function getReviews(params = {}) {
  return unwrapList(unwrap(await api.get('/performance/reviews', { params })));
}

/** Gửi/cập nhật đánh giá. POST /performance/reviews
 *  payload: { cycle_id, review_type: 'self'|'manager', employee_id?, score?, comment?, status? } */
export async function createReview(payload) {
  return unwrapMember(unwrap(await api.post('/performance/reviews', payload)));
}

/* ---------------- Dashboard + dữ liệu phụ trợ ---------------- */

/** Tổng hợp hiệu suất 1 chu kỳ. GET /performance/dashboard?cycle_id=
 *  -> { cycle, summary, employees, by_department, rating_distribution } */
export async function getDashboard(cycleId) {
  const params = cycleId ? { cycle_id: cycleId } : {};
  return unwrapMember(unwrap(await api.get('/performance/dashboard', { params })));
}

/** Danh sách nhân viên (dùng cho form tạo mục tiêu / chấm điểm của Manager/HR).
 *  GET /employees?limit= — theo scope của backend. */
export async function getEmployees(params = {}) {
  const body = unwrap(await api.get('/employees', { params: { limit: 100, ...params } }));
  return unwrapList(body);
}
