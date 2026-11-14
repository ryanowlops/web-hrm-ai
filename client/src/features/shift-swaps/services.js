// Service layer cho module Đổi ca làm việc.
// File này ở client/src/features/shift-swaps/ nên api ở ../../api/axiosClient.
// API: /api/v1/shift-swaps (GET list ?status= ?mine=1; POST tạo đơn;
// GET /<id>; POST /<id>/approve, /reject, /cancel).
import axiosClient from '../../api/axiosClient';

// axiosClient trả về body đã unwrap sẵn (response.data) qua interceptor.
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

export async function getShiftSwaps(params = {}) {
  const res = await axiosClient.get('/shift-swaps', { params });
  return unwrapList(res);
}

export async function getShiftSwap(id) {
  const res = await axiosClient.get(`/shift-swaps/${id}`);
  return unwrapMember(res);
}

export async function createShiftSwap(payload) {
  const res = await axiosClient.post('/shift-swaps', payload);
  return unwrapMember(res);
}

export async function approveShiftSwap(id) {
  const res = await axiosClient.post(`/shift-swaps/${id}/approve`, {});
  return unwrapMember(res);
}

export async function rejectShiftSwap(id, payload = {}) {
  const res = await axiosClient.post(`/shift-swaps/${id}/reject`, payload);
  return unwrapMember(res);
}

export async function cancelShiftSwap(id) {
  const res = await axiosClient.post(`/shift-swaps/${id}/cancel`, {});
  return unwrapMember(res);
}
