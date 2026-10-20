// Service layer cho module Nhân viên + Hợp đồng.
// File này ở client/src/features/employees/ nên api ở ../../api/axiosClient.
import axiosClient from '../../api/axiosClient';

// axiosClient có thể trả nguyên response (axios) hoặc body đã unwrap sẵn
// tùy interceptor — chuẩn hoá ở đây để page chỉ làm việc với body JSON.
function unwrap(res) {
  if (res && typeof res === 'object' && 'data' in res && ('status' in res || 'headers' in res)) {
    return res.data;
  }
  return res;
}

// Body của 1 bản ghi có thể là object thuần hoặc bọc trong { data: {...} }.
function unwrapMember(body) {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body && body.data && typeof body.data === 'object') {
    return body.data;
  }
  return body;
}

// Body danh sách theo quy ước B6: { data: [...], meta: { page, limit, totalItems, totalPages } }
function unwrapList(body) {
  if (Array.isArray(body)) return { items: body, meta: null };
  return { items: body?.data ?? [], meta: body?.meta ?? null };
}

export async function getEmployees(params = {}) {
  const res = await axiosClient.get('/employees', { params });
  return unwrapList(unwrap(res));
}

export async function getEmployee(id) {
  const res = await axiosClient.get(`/employees/${id}`);
  return unwrapMember(unwrap(res));
}

export async function createEmployee(payload) {
  const res = await axiosClient.post('/employees', payload);
  return unwrapMember(unwrap(res));
}

export async function updateEmployee(id, payload) {
  const res = await axiosClient.patch(`/employees/${id}`, payload);
  return unwrapMember(unwrap(res));
}

export async function deleteEmployee(id) {
  const res = await axiosClient.delete(`/employees/${id}`);
  return unwrap(res);
}

// ---- Hợp đồng (nằm dưới /employees/:id/contracts theo blueprint employees) ----

export async function getContracts(employeeId) {
  const res = await axiosClient.get(`/employees/${employeeId}/contracts`);
  return unwrapList(unwrap(res)).items;
}

export async function createContract(employeeId, payload) {
  const res = await axiosClient.post(`/employees/${employeeId}/contracts`, payload);
  return unwrapMember(unwrap(res));
}

// Chuẩn hoá lỗi API { error: { code, message, details } } thành
// { message, fieldErrors: { field: message } } để form hiển thị lỗi tại trường.
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
