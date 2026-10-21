// Service layer cho module Ca làm (Shifts) — /api/v1/shifts.
// File này ở client/src/features/shifts/ nên api ở ../../api/axiosClient
// (interceptor đã bóc response.data một lần; tại đây chỉ lấy tiếp envelope
// { data, meta } của backend — không bóc lặp dữ liệu nghiệp vụ).
import axiosClient from '../../api/axiosClient';

function unwrap(res) {
  if (res && typeof res === 'object' && 'data' in res && ('status' in res || 'headers' in res)) {
    return res.data;
  }
  return res;
}

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

// ---- Định nghĩa ca ----

export async function getDefinitions(params = {}) {
  const res = await axiosClient.get('/shifts/definitions', { params });
  return unwrapList(unwrap(res));
}

export async function createDefinition(payload) {
  const res = await axiosClient.post('/shifts/definitions', payload);
  return unwrapMember(unwrap(res));
}

export async function updateDefinition(id, payload) {
  const res = await axiosClient.patch(`/shifts/definitions/${id}`, payload);
  return unwrapMember(unwrap(res));
}

export async function deleteDefinition(id) {
  const res = await axiosClient.delete(`/shifts/definitions/${id}`);
  return unwrapMember(unwrap(res));
}

// ---- Lịch ca tuần + gán ca ----

// Trả thẳng object tuần { start_date, end_date, days[], rows[], definitions[] }.
export async function getWeek(params = {}) {
  const res = await axiosClient.get('/shifts/week', { params });
  return unwrapMember(unwrap(res));
}

export async function upsertAssignment(payload) {
  const res = await axiosClient.post('/shifts/assignments', payload);
  return unwrapMember(unwrap(res));
}

export async function deleteAssignment(id) {
  const res = await axiosClient.delete(`/shifts/assignments/${id}`);
  return unwrap(res);
}

export async function getMySchedule(month) {
  const res = await axiosClient.get('/shifts/my-schedule', { params: { month } });
  return unwrapList(unwrap(res));
}

// ---- Tăng ca ----

export async function getOvertime(params = {}) {
  const res = await axiosClient.get('/shifts/overtime', { params });
  return unwrapList(unwrap(res));
}

export async function createOvertime(payload) {
  const res = await axiosClient.post('/shifts/overtime', payload);
  return unwrapMember(unwrap(res));
}

export async function decideOvertime(id, stage, payload) {
  const res = await axiosClient.post(`/shifts/overtime/${id}/${stage}-decision`, payload);
  return unwrapMember(unwrap(res));
}

// ---- Giải trình chấm công ----

export async function getCorrections(params = {}) {
  const res = await axiosClient.get('/shifts/corrections', { params });
  return unwrapList(unwrap(res));
}

export async function createCorrection(payload) {
  const res = await axiosClient.post('/shifts/corrections', payload);
  return unwrapMember(unwrap(res));
}

export async function decideCorrection(id, stage, payload) {
  const res = await axiosClient.post(`/shifts/corrections/${id}/${stage}-decision`, payload);
  return unwrapMember(unwrap(res));
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
