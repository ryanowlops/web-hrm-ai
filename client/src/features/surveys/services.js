// Service layer cho module Khảo sát gắn kết (pulse survey + eNPS).
// File này ở client/src/features/surveys/ nên api ở ../../api/axiosClient.
// API: /api/v1/engagement/surveys — đáp án ẩn danh, mỗi user trả lời 1 lần.
import axiosClient from '../../api/axiosClient';

// axiosClient trả về body đã unwrap sẵn (response.data) qua interceptor.
function unwrapMember(body) {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body && body.data && typeof body.data === 'object') {
    return body.data;
  }
  return body;
}

function unwrapList(body) {
  if (Array.isArray(body)) return body;
  return body?.data ?? [];
}

export async function getSurveys() {
  const res = await axiosClient.get('/engagement/surveys');
  return unwrapList(res);
}

export async function createSurvey(payload) {
  const res = await axiosClient.post('/engagement/surveys', payload);
  return unwrapMember(res);
}

export async function respondSurvey(id, answers) {
  const res = await axiosClient.post(`/engagement/surveys/${id}/responses`, { answers });
  return unwrapMember(res);
}

export async function getSurveyResults(id) {
  const res = await axiosClient.get(`/engagement/surveys/${id}/results`);
  return unwrapMember(res);
}

export async function closeSurvey(id) {
  const res = await axiosClient.post(`/engagement/surveys/${id}/close`);
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
