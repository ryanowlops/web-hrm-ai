// Service layer cho module Cửa hàng quà & Điểm thưởng (Gamification).
// File này ở client/src/features/rewards/ nên api ở ../../api/axiosClient.
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

// ---- Điểm thưởng ----

/** { balance, total_earned, total_spent, recent: [ledger...] } */
export async function getMyPoints() {
  const res = await axiosClient.get('/gamification/my-points');
  return unwrapMember(unwrap(res));
}

/** Top nhân viên theo tổng điểm đã kiếm: [{ employee, department, total_earned, balance }] */
export async function getLeaderboard(limit = 10) {
  const res = await axiosClient.get('/gamification/leaderboard', { params: { limit } });
  return unwrapList(unwrap(res));
}

/** Huy hiệu của tôi (tính tại chỗ): [{ key, name, emoji, description, earned, progress_text }] */
export async function getMyBadges() {
  const res = await axiosClient.get('/gamification/my-badges');
  return unwrapList(unwrap(res));
}

// ---- Cửa hàng quà ----

/** Catalog quà đang mở đổi, kèm affordable theo số dư của người gọi. */
export async function getRewards() {
  const res = await axiosClient.get('/gamification/rewards');
  return unwrapList(unwrap(res));
}

/** Toàn bộ catalog kể cả đã khoá — chỉ HR/Admin dùng cho panel quản lý. */
export async function getAllRewards() {
  const res = await axiosClient.get('/gamification/rewards', { params: { all: 1 } });
  return unwrapList(unwrap(res));
}

export async function createReward(payload) {
  const res = await axiosClient.post('/gamification/rewards', payload);
  return unwrapMember(unwrap(res));
}

export async function updateReward(id, payload) {
  const res = await axiosClient.patch(`/gamification/rewards/${id}`, payload);
  return unwrapMember(unwrap(res));
}

// ---- Đổi quà ----

export async function createRedemption(rewardId) {
  const res = await axiosClient.post('/gamification/redemptions', { reward_id: rewardId });
  return unwrapMember(unwrap(res));
}

export async function getRedemptions(params = {}) {
  const res = await axiosClient.get('/gamification/redemptions', { params });
  return unwrapList(unwrap(res));
}

export async function decideRedemption(id, decision, note) {
  const res = await axiosClient.post(`/gamification/redemptions/${id}/decision`, {
    decision,
    note: note || undefined,
  });
  return unwrapMember(unwrap(res));
}

// Chuẩn hoá lỗi API { error: { code, message, details } } cho form.
export function parseApiError(err, fallback = 'Đã xảy ra lỗi, vui lòng thử lại.') {
  const apiError = err?.response?.data?.error;
  const result = { message: apiError?.message || fallback, code: apiError?.code || null, fieldErrors: {} };
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
