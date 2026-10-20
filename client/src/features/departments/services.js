// Service layer cho module Phòng ban + Chức vụ.
// File này ở client/src/features/departments/ nên api ở ../../api/axiosClient.
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

// ---- Phòng ban ----

export async function getDepartments(params = {}) {
  const res = await axiosClient.get('/departments', { params });
  return unwrapList(unwrap(res));
}

export async function createDepartment(payload) {
  const res = await axiosClient.post('/departments', payload);
  return unwrapMember(unwrap(res));
}

export async function updateDepartment(id, payload) {
  const res = await axiosClient.patch(`/departments/${id}`, payload);
  return unwrapMember(unwrap(res));
}

export async function deleteDepartment(id) {
  const res = await axiosClient.delete(`/departments/${id}`);
  return unwrap(res);
}

// ---- Chức vụ (thuộc blueprint departments, lọc theo department_id) ----

export async function getPositions(params = {}) {
  const res = await axiosClient.get('/positions', { params });
  return unwrapList(unwrap(res));
}

export async function createPosition(payload) {
  const res = await axiosClient.post('/positions', payload);
  return unwrapMember(unwrap(res));
}

export async function updatePosition(id, payload) {
  const res = await axiosClient.patch(`/positions/${id}`, payload);
  return unwrapMember(unwrap(res));
}

export async function deletePosition(id) {
  const res = await axiosClient.delete(`/positions/${id}`);
  return unwrap(res);
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
