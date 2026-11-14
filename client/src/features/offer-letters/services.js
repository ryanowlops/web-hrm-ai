// Service layer cho module Thư mời nhận việc (Offer Letter).
// File này ở client/src/features/offer-letters/ nên api ở ../../api/axiosClient.
// API: /api/v1/offer-letters (GET list: lọc ?status= & ?candidate_id=;
// POST tạo; POST /<id>/send | /respond | /withdraw).
import axiosClient from '../../api/axiosClient';
import { listCandidates, listJobs } from '../recruitment/services';

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

export async function getOfferLetters(params = {}) {
  const res = await axiosClient.get('/offer-letters', { params });
  return unwrapList(res);
}

export async function getOfferLetter(id) {
  const res = await axiosClient.get(`/offer-letters/${id}`);
  return unwrapMember(res);
}

export async function createOfferLetter(payload) {
  const res = await axiosClient.post('/offer-letters', payload);
  return unwrapMember(res);
}

export async function sendOfferLetter(id) {
  const res = await axiosClient.post(`/offer-letters/${id}/send`, {});
  return unwrapMember(res);
}

export async function respondOfferLetter(id, decision) {
  const res = await axiosClient.post(`/offer-letters/${id}/respond`, { decision });
  return unwrapMember(res);
}

export async function withdrawOfferLetter(id) {
  const res = await axiosClient.post(`/offer-letters/${id}/withdraw`, {});
  return unwrapMember(res);
}

// Ứng viên + tin tuyển dụng cho ô chọn trong modal tạo thư mời.
// recruitment services trả nguyên body { data, meta } nên bóc data ở đây.
export async function getCandidatesForSelect(params = { limit: 100 }) {
  const body = await listCandidates(params);
  return Array.isArray(body) ? body : body?.data ?? [];
}

export async function getJobsForSelect(params = { limit: 100 }) {
  const body = await listJobs(params);
  return Array.isArray(body) ? body : body?.data ?? [];
}
