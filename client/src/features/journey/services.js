// Service layer cho trang "Hành trình của tôi" (route /my-journey, v4 mục 3).
// Trang này là trang TIÊU THỤ: tổng hợp dữ liệu của chính người đăng nhập từ
// 3 nguồn có sẵn — chấm công (my-year), gắn kết (kudos của tôi) và
// gamification (điểm / huy hiệu / xếp hạng do Đội GAME cung cấp).
// axiosClient đã unwrap envelope { data: ... } ở interceptor; các hàm dưới
// vẫn chuẩn hoá phòng thủ để chịu được cả 2 dạng trả về.
import api from '../../api/axiosClient';

function unwrapMember(body) {
  if (
    body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    'data' in body &&
    body.data &&
    typeof body.data === 'object' &&
    !Array.isArray(body.data)
  ) {
    return body.data;
  }
  return body;
}

function unwrapList(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.items)) return body.items;
  return [];
}

export function parseApiError(err, fallback = 'Có lỗi xảy ra, vui lòng thử lại.') {
  return (
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    err?.message ||
    fallback
  );
}

/** GET /attendance/my-year?year=YYYY -> { year, days: [{date, status,
 *  check_in, check_out}], summary: {total_days, on_time_days, late_days,
 *  current_streak, best_streak} } — luôn là dữ liệu của chính người gọi. */
export async function getMyYear(year) {
  const res = await api.get('/attendance/my-year', {
    params: year ? { year } : {},
  });
  const body = unwrapMember(res) || {};
  return {
    year: body.year ?? year ?? new Date().getFullYear(),
    days: Array.isArray(body.days) ? body.days : [],
    summary: body.summary || {
      total_days: 0,
      on_time_days: 0,
      late_days: 0,
      current_streak: 0,
      best_streak: 0,
    },
  };
}

/** GET /gamification/my-points -> { balance, total_earned, total_spent, recent } */
export async function getMyPoints() {
  const res = await api.get('/gamification/my-points');
  return unwrapMember(res) || {};
}

/** GET /gamification/my-badges -> [{ key, name, emoji, description, earned, progress_text }] */
export async function getMyBadges() {
  const res = await api.get('/gamification/my-badges');
  return unwrapList(res);
}

/** GET /gamification/leaderboard?limit= -> [{ employee, department, total_earned, balance }] */
export async function getLeaderboard(limit = 10) {
  const res = await api.get('/gamification/leaderboard', { params: { limit } });
  return unwrapList(res);
}

/** GET /engagement/kudos/mine -> { received, given, received_count, given_count } */
export async function getMyKudos() {
  const res = await api.get('/engagement/kudos/mine');
  const body = unwrapMember(res) || {};
  return {
    receivedCount:
      body.received_count ?? (Array.isArray(body.received) ? body.received.length : 0),
    givenCount:
      body.given_count ?? (Array.isArray(body.given) ? body.given.length : 0),
  };
}
