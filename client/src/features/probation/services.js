// Service layer cho module Quản lý thử việc.
// File này ở client/src/features/probation/ nên api ở ../../api/axiosClient.
// API: /api/v1/probation (GET list; POST /probation/<contract_id>/evaluate:
// {decision: pass|fail|extend, notes, extend_days}).
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

export async function getProbationList(params = {}) {
  const res = await axiosClient.get('/probation', { params });
  return unwrapList(res);
}

export async function evaluateProbation(contractId, payload) {
  const res = await axiosClient.post(`/probation/${contractId}/evaluate`, payload);
  return unwrapMember(res);
}
