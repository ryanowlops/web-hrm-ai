// Service layer cho module Lịch nghỉ lễ.
// File này ở client/src/features/holidays/ nên api ở ../../api/axiosClient.
// API: /api/v1/holidays (GET list: lọc ?year=, sắp theo ngày; POST/DELETE: admin/hr).
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

export async function getHolidays(params = {}) {
  const res = await axiosClient.get('/holidays', { params });
  return unwrapList(res);
}

export async function createHoliday(payload) {
  const res = await axiosClient.post('/holidays', payload);
  return unwrapMember(res);
}

export async function deleteHoliday(id) {
  const res = await axiosClient.delete(`/holidays/${id}`);
  return res;
}
