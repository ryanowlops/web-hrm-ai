// Service layer cho module Chấm công QR + GPS (v6 gói 3, mục 1).
// API: /api/v1/checkin — today-qr/config/logs chỉ HR/Admin; scan cho mọi
// nhân viên đã đăng nhập. axiosClient trả về body (response.data) qua
// interceptor; lỗi reject với error.response.data.error {code,message,details}.
import axiosClient from '../../api/axiosClient';

function unwrapMember(body) {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body) {
    return body.data;
  }
  return body;
}

export async function getTodayQr() {
  const res = await axiosClient.get('/checkin/today-qr');
  return unwrapMember(res);
}

export async function getCheckinConfig() {
  const res = await axiosClient.get('/checkin/config');
  return unwrapMember(res);
}

export async function updateCheckinConfig(payload) {
  const res = await axiosClient.put('/checkin/config', payload);
  return unwrapMember(res);
}

export async function getCheckinLogs(params = {}) {
  const res = await axiosClient.get('/checkin/logs', { params });
  return { items: res?.data ?? [], date: res?.date ?? null };
}

export async function scanCheckin(payload) {
  const res = await axiosClient.post('/checkin/scan', payload);
  return unwrapMember(res);
}
