// Service layer cho module Thông báo công ty.
// File này ở client/src/features/announcements/ nên api ở ../../api/axiosClient.
// API: /api/v1/announcements (GET list: ghim trước, mới trước; POST/PATCH/DELETE: HR/Admin).
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

export async function getAnnouncements(params = {}) {
  const res = await axiosClient.get('/announcements', { params });
  return unwrapList(res);
}

export async function createAnnouncement(payload) {
  const res = await axiosClient.post('/announcements', payload);
  return unwrapMember(res);
}

export async function updateAnnouncement(id, payload) {
  const res = await axiosClient.patch(`/announcements/${id}`, payload);
  return unwrapMember(res);
}

export async function deleteAnnouncement(id) {
  const res = await axiosClient.delete(`/announcements/${id}`);
  return res;
}
