// Service layer cho module Vinh danh (Kudos + Cột mốc).
// File này ở client/src/features/kudos/ nên api ở ../../api/axiosClient.
// API: /api/v1/engagement (kudos, leaderboard, milestones).
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

export async function getKudos(params = {}) {
  const res = await axiosClient.get('/engagement/kudos', { params });
  return unwrapList(res);
}

export async function createKudo(payload) {
  const res = await axiosClient.post('/engagement/kudos', payload);
  return unwrapMember(res);
}

export async function getKudosLeaderboard(month) {
  const res = await axiosClient.get('/engagement/kudos/leaderboard', {
    params: month ? { month } : {},
  });
  return unwrapMember(res);
}

export async function getMyKudos() {
  const res = await axiosClient.get('/engagement/kudos/mine');
  return unwrapMember(res);
}

export async function getMilestones(month) {
  const res = await axiosClient.get('/engagement/milestones', {
    params: month ? { month } : {},
  });
  return unwrapMember(res);
}

export function parseApiError(err, fallback = 'Đã xảy ra lỗi, vui lòng thử lại.') {
  return (
    err?.response?.data?.error?.message ||
    err?.data?.error?.message ||
    err?.message ||
    fallback
  );
}
