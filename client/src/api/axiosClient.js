import axios from 'axios';

// Khóa lưu token ở localStorage — mọi nơi trong app phải dùng đúng 2 khóa này.
export const ACCESS_TOKEN_KEY = 'hrm_access_token';
export const REFRESH_TOKEN_KEY = 'hrm_refresh_token';

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function saveTokens({ accessToken, refreshToken } = {}) {
  if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// Response của backend có thể bọc trong { data: ... } (quy ước danh sách/thành công)
// hoặc trả thẳng object (ví dụ endpoint auth). Hàm này lấy phần dữ liệu thật.
function unwrapPayload(payload) {
  if (payload && typeof payload === 'object' && 'data' in payload && payload.data !== undefined) {
    return payload.data;
  }
  return payload;
}

const api = axios.create({
  // Production (Vercel): đặt VITE_API_BASE_URL=https://<backend>/api/v1.
  // Local: để trống, Vite proxy chuyển /api về backend 5000.
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Gắn access token vào mọi request (nếu đã đăng nhập).
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Refresh token dùng chung 1 promise cho mọi request 401 xảy ra đồng thời,
// tránh gọi /auth/refresh nhiều lần song song.
let refreshPromise = null;

function requestNewAccessToken() {
  if (!refreshPromise) {
    const refreshToken = getRefreshToken();
    refreshPromise = axios
      .post('/api/v1/auth/refresh', null, {
        headers: refreshToken ? { Authorization: `Bearer ${refreshToken}` } : {},
        timeout: 15000,
      })
      .then((res) => {
        const payload = unwrapPayload(res.data) || {};
        const accessToken = payload.access_token || payload.accessToken;
        const newRefreshToken = payload.refresh_token || payload.refreshToken;
        if (!accessToken) throw new Error('Phản hồi refresh không có access token');
        saveTokens({ accessToken, refreshToken: newRefreshToken });
        return accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function forceReLogin() {
  clearTokens();
  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

// Mọi hàm gọi qua `api` đều nhận về response.data (đã qua interceptor này),
// không phải AxiosResponse đầy đủ. Lỗi sẽ reject với error.response.data.error
// theo quy ước backend: { error: { code, message, details } }.
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const url = originalRequest?.url || '';
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/refresh');

    // Access token hết hạn: thử refresh đúng 1 lần cho request này rồi gọi lại.
    if (status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      if (getRefreshToken()) {
        try {
          const newAccessToken = await requestNewAccessToken();
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return api(originalRequest);
        } catch {
          forceReLogin();
        }
      } else {
        forceReLogin();
      }
    }

    return Promise.reject(error);
  },
);

export default api;
