// Service layer cho module Đào tạo (Training).
// File này ở client/src/features/training/ nên api ở ../../api/axiosClient.
import axiosClient from '../../api/axiosClient';

function unwrap(res) {
  if (res && typeof res === 'object' && 'data' in res && ('status' in res || 'headers' in res)) {
    return res.data;
  }
  return res;
}

function unwrapMember(body) {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body && body.data && typeof body.data === 'object') {
    return body.data;
  }
  return body;
}

function unwrapList(body) {
  if (Array.isArray(body)) return { items: body, meta: null };
  return { items: body?.data ?? [], meta: body?.meta ?? null };
}

// ---- Khoá học ----

export async function getCourses(params = {}) {
  const res = await axiosClient.get('/training/courses', { params });
  return unwrapList(unwrap(res));
}

export async function getCourse(id) {
  const res = await axiosClient.get(`/training/courses/${id}`);
  return unwrapMember(unwrap(res));
}

export async function createCourse(payload) {
  const res = await axiosClient.post('/training/courses', payload);
  return unwrapMember(unwrap(res));
}

export async function updateCourse(id, payload) {
  const res = await axiosClient.patch(`/training/courses/${id}`, payload);
  return unwrapMember(unwrap(res));
}

export async function deleteCourse(id) {
  const res = await axiosClient.delete(`/training/courses/${id}`);
  return unwrap(res);
}

// ---- Ghi danh ----

export async function getCourseEnrollments(courseId) {
  const res = await axiosClient.get(`/training/courses/${courseId}/enrollments`);
  return unwrapList(unwrap(res));
}

// Trả { items: [enrollment...], meta: { created, skipped_employee_ids } }
export async function enrollEmployees(courseId, employeeIds) {
  const res = await axiosClient.post(`/training/courses/${courseId}/enroll`, {
    employee_ids: employeeIds,
  });
  const body = unwrap(res);
  return { items: body?.data ?? [], meta: body?.meta ?? null };
}

export async function getMyCourses() {
  const res = await axiosClient.get('/training/my');
  return unwrapList(unwrap(res));
}

export async function updateEnrollment(id, payload) {
  const res = await axiosClient.patch(`/training/enrollments/${id}`, payload);
  return unwrapMember(unwrap(res));
}

// Chuẩn hoá lỗi API { error: { code, message, details } } cho form.
export function parseApiError(err, fallback = 'Đã xảy ra lỗi, vui lòng thử lại.') {
  const apiError = err?.response?.data?.error;
  const result = { message: apiError?.message || fallback, fieldErrors: {} };
  const details = apiError?.details;
  if (Array.isArray(details)) {
    details.forEach((d) => {
      if (d && typeof d === 'object' && d.field) result.fieldErrors[d.field] = d.message || 'Dữ liệu không hợp lệ';
    });
  } else if (details && typeof details === 'object') {
    Object.entries(details).forEach(([field, msgs]) => {
      result.fieldErrors[field] = Array.isArray(msgs) ? msgs[0] : String(msgs);
    });
  }
  return result;
}
