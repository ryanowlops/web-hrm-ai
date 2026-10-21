// Service layer cho module Tài sản (assets).
// File này ở client/src/features/assets/ nên api ở ../../api/axiosClient.
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

// ---- Danh mục tài sản (HR / Admin / Manager) ----

export async function getAssets(params = {}) {
  const res = await axiosClient.get('/assets', { params });
  return unwrapList(unwrap(res));
}

export async function createAsset(payload) {
  const res = await axiosClient.post('/assets', payload);
  return unwrapMember(unwrap(res));
}

export async function updateAsset(id, payload) {
  const res = await axiosClient.patch(`/assets/${id}`, payload);
  return unwrapMember(unwrap(res));
}

// ---- Cấp phát / thu hồi ----

export async function assignAsset(assetId, payload) {
  const res = await axiosClient.post(`/assets/${assetId}/assign`, payload);
  return unwrapMember(unwrap(res));
}

export async function returnAssignment(assignmentId, payload = {}) {
  const res = await axiosClient.post(`/assignments/${assignmentId}/return`, payload);
  return unwrapMember(unwrap(res));
}

// ---- Phía nhân viên + lịch sử ----

export async function getMyAssets() {
  const res = await axiosClient.get('/assets/my');
  return unwrapList(unwrap(res));
}

export async function getAssetHistory(assetId) {
  const res = await axiosClient.get(`/assets/${assetId}/history`);
  return unwrapList(unwrap(res));
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
