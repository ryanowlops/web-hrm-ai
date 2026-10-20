import axios from 'axios';
import api from '../../api/axiosClient';

// ============================================================
// Auth service — Web HRM tích hợp AI
// API: POST /auth/login | /auth/refresh | /auth/logout  (Flask, /api/v1)
// Token lưu ở localStorage theo khóa chuẩn của dự án:
//   hrm_access_token / hrm_refresh_token, thông tin user ở hrm_user.
// api (axiosClient) trả về response.data nên các hàm dưới đây
// nhận trực tiếp body JSON của API.
// Định dạng lỗi API: { error: { code, message, details } }
// ============================================================

export const ACCESS_TOKEN_KEY = 'hrm_access_token';
export const REFRESH_TOKEN_KEY = 'hrm_refresh_token';
export const USER_KEY = 'hrm_user';

// ---------- Quản lý phiên đăng nhập (localStorage) ----------

export function saveSession({ accessToken, refreshToken, user } = {}) {
  if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  return Boolean(getAccessToken());
}

// ---------- Chuẩn hoá dữ liệu / lỗi ----------

// Chấp nhận cả camelCase (accessToken) lẫn snake_case (access_token),
// và cả trường hợp body được bọc trong { data: ... }.
function extractSession(payload) {
  const body = payload?.data ?? payload ?? {};
  return {
    accessToken: body.accessToken || body.access_token || '',
    refreshToken: body.refreshToken || body.refresh_token || '',
    user: body.user || body.currentUser || null,
  };
}

// Đưa lỗi Axios/API về dạng thống nhất:
// { status, code, message, fieldErrors: { <field>: <thông báo tiếng Việt> } }
export function normalizeApiError(err) {
  const response = err?.response;
  const apiError = response?.data?.error || {};

  const fieldErrors = {};
  const details = apiError.details;
  if (Array.isArray(details)) {
    details.forEach((d) => {
      if (d && d.field) {
        fieldErrors[d.field] = d.message || d.msg || 'Dữ liệu chưa hợp lệ.';
      }
    });
  } else if (details && typeof details === 'object') {
    Object.entries(details).forEach(([field, value]) => {
      fieldErrors[field] = Array.isArray(value) ? value[0] : String(value);
    });
  }

  return {
    status: response?.status || 0,
    code: apiError.code || (response ? 'SERVER_ERROR' : 'NETWORK_ERROR'),
    message: apiError.message || '',
    fieldErrors,
  };
}

// ---------- Gọi API ----------

/**
 * Đăng nhập bằng email + mật khẩu.
 * Thành công: lưu token + user vào localStorage, trả về { accessToken, refreshToken, user }.
 * Thất bại: throw lỗi đã chuẩn hoá (xem normalizeApiError).
 */
export async function login(email, password) {
  let payload;
  try {
    payload = await api.post('/auth/login', { email, password });
  } catch (err) {
    throw normalizeApiError(err);
  }
  const session = extractSession(payload);
  if (!session.accessToken) {
    throw {
      status: 0,
      code: 'INVALID_RESPONSE',
      message: 'Máy chủ trả về dữ liệu đăng nhập không hợp lệ.',
      fieldErrors: {},
    };
  }
  saveSession(session);
  return session;
}

/**
 * Làm mới access token bằng refresh token đã lưu.
 * Đúng quy ước của axiosClient: refresh token gửi qua header
 * "Authorization: Bearer <refresh_token>" (Flask-JWT-Extended đọc ở server),
 * nên hàm này dùng axios gốc thay vì instance `api` (vốn tự gắn access token).
 * Trong app, interceptor của axiosClient đã tự refresh khi gặp 401 —
 * hàm này dành cho các trường hợp cần chủ động làm mới phiên.
 * Thành công: cập nhật token (giữ refresh token cũ nếu server không cấp mới).
 * Thất bại: throw lỗi đã chuẩn hoá.
 */
export async function refresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw {
      status: 401,
      code: 'NO_REFRESH_TOKEN',
      message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
      fieldErrors: {},
    };
  }
  let payload;
  try {
    const res = await axios.post('/api/v1/auth/refresh', null, {
      headers: { Authorization: `Bearer ${refreshToken}` },
      timeout: 15000,
    });
    payload = res.data;
  } catch (err) {
    throw normalizeApiError(err);
  }
  const session = extractSession(payload);
  if (!session.accessToken) {
    throw {
      status: 0,
      code: 'INVALID_RESPONSE',
      message: 'Máy chủ trả về dữ liệu làm mới phiên không hợp lệ.',
      fieldErrors: {},
    };
  }
  saveSession({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken || refreshToken,
    user: session.user || getCurrentUser(),
  });
  return session;
}

/**
 * Đăng xuất: gọi API thu hồi phiên (best-effort, lỗi mạng vẫn tiếp tục —
 * access token đang gắn trong header theo quy ước chung của app)
 * và luôn xoá phiên ở phía client.
 */
export async function logout() {
  try {
    await api.post('/auth/logout');
  } catch {
    // Bỏ qua lỗi: mục tiêu chính là xoá phiên ở client.
  } finally {
    clearSession();
  }
}
