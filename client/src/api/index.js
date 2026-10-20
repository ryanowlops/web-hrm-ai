import api from './axiosClient';

export { default as api } from './axiosClient';
export {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  getAccessToken,
  getRefreshToken,
  saveTokens,
  clearTokens,
} from './axiosClient';

// ---------------------------------------------------------------------------
// auth — /api/v1/auth và thông tin người dùng hiện tại /api/v1/users/me
// Lưu ý: các hàm ở đây trả về phần data đã được axiosClient bóc sẵn
// (không phải AxiosResponse). Endpoint auth có thể trả token ở cấp ngoài cùng
// hoặc trong { data: ... } — trang đăng nhập nên đọc cả 2 dạng.
// ---------------------------------------------------------------------------
export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  changePassword: (currentPassword, newPassword) =>
    api.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    }),
  me: () => api.get('/users/me'),
};

// ---------------------------------------------------------------------------
// stats — /api/v1/stats (Dashboard & báo cáo)
// ---------------------------------------------------------------------------
export const statsApi = {
  overview: (params) => api.get('/stats/overview', { params }),
};

// ---------------------------------------------------------------------------
// notifications — /api/v1/notifications
// ---------------------------------------------------------------------------
export const notificationsApi = {
  list: (params) => api.get('/notifications', { params }),
  unreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.post('/notifications/read-all'),
};

// Các module còn lại (employees, departments, attendance, leave, payroll,
// recruitment, ai, kb/chat) được từng feature tự gọi trực tiếp qua `api`
// (axiosClient) trong thư mục features/<module>/ của chúng.
export default api;
