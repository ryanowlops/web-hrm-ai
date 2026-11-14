// Service layer cho module Kỷ luật nhân viên.
// File này ở client/src/features/disciplinary/ nên api ở ../../api/axiosClient.
// API: /api/v1/disciplinary (GET list, POST create;
// GET /disciplinary/<id>; POST /disciplinary/<id>/resolve: {resolved_note}).
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

export async function getDisciplinaryList(params = {}) {
  const res = await axiosClient.get('/disciplinary', { params });
  return unwrapList(res);
}

export async function getDisciplinary(id) {
  const res = await axiosClient.get(`/disciplinary/${id}`);
  return unwrapMember(res);
}

export async function createDisciplinary(payload) {
  const res = await axiosClient.post('/disciplinary', payload);
  return unwrapMember(res);
}

export async function resolveDisciplinary(id, payload) {
  const res = await axiosClient.post(`/disciplinary/${id}/resolve`, payload);
  return unwrapMember(res);
}
