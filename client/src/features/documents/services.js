// Service layer cho module Hồ sơ điện tử + Giấy xác nhận (documents).
// File này ở client/src/features/documents/ nên api ở ../../api/axiosClient.
// API: /api/v1/documents (kho tài liệu theo scope) + /documents/certificates.
// axiosClient đã bóc sẵn response.data qua interceptor — ở đây chỉ bóc
// lớp { data, meta } của body theo quy ước B6, không bóc 2 lần.
import axiosClient from '../../api/axiosClient';

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

function saveBlob(blob, filename) {
  const data = blob instanceof Blob ? blob : new Blob([blob]);
  const url = window.URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// ---- Kho tài liệu ----

export async function getDocuments(params = {}) {
  const res = await axiosClient.get('/documents', { params });
  return unwrapList(res);
}

export async function uploadDocument(formData) {
  const res = await axiosClient.post('/documents', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return unwrapMember(res);
}

export async function deleteDocument(id) {
  const res = await axiosClient.delete(`/documents/${id}`);
  return res;
}

export async function downloadDocument(id, filename) {
  const blob = await axiosClient.get(`/documents/${id}/download`, {
    responseType: 'blob',
  });
  saveBlob(blob, filename || `tai-lieu-${id}`);
}

export async function getExpiringDocuments(params = {}) {
  const res = await axiosClient.get('/documents/expiring', { params });
  return unwrapList(res);
}

// ---- Giấy xác nhận ----

export async function getCertificates(params = {}) {
  const res = await axiosClient.get('/documents/certificates', { params });
  return unwrapList(res);
}

export async function createCertificate(payload) {
  const res = await axiosClient.post('/documents/certificates', payload);
  return unwrapMember(res);
}

export async function decideCertificate(id, payload) {
  const res = await axiosClient.post(`/documents/certificates/${id}/decision`, payload);
  return unwrapMember(res);
}

export async function downloadCertificate(id) {
  const blob = await axiosClient.get(`/documents/certificates/${id}/download`, {
    responseType: 'blob',
  });
  saveBlob(blob, `giay-xac-nhan-${id}.txt`);
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
