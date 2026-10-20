import api from '../../api/axiosClient';

/**
 * Service layer cho module Quản trị tài khoản (FR-01, blueprint users).
 * Endpoint theo tài liệu kiến trúc (mục B3.2, B6):
 *  - GET   /users           danh sách tài khoản (phân trang, tìm kiếm)
 *  - PATCH /users/:id       đổi vai trò (role) / khoá-mở tài khoản (is_active)
 * Phân quyền THẬT nằm ở backend: Admin quản lý toàn bộ; HR chỉ xem được
 * trong giới hạn backend cho phép — trang chỉ hiển thị đúng dữ liệu trả về.
 * Response danh sách chuẩn: { data: [...], meta: { page, limit, totalItems, totalPages } }
 * Lỗi chuẩn: { error: { code, message, details } }
 */

const bodyOf = (res) =>
  res && typeof res === 'object' && 'config' in res && 'status' in res ? res.data : res;

/** Chuẩn hoá response danh sách -> { items, meta } */
function toList(res) {
  const body = bodyOf(res);
  if (Array.isArray(body)) return { items: body, meta: null };
  if (body && Array.isArray(body.data)) return { items: body.data, meta: body.meta || null };
  return { items: [], meta: null };
}

/**
 * Danh sách tài khoản người dùng.
 * params: { page, limit, search, role }
 * Mỗi user: { id, email, full_name, role: admin|hr|manager|employee,
 *             is_active, employee_id, created_at }
 */
export async function listUsers({ page = 1, limit = 20, search = '', role = '' } = {}) {
  const params = { page, limit };
  if (search) params.search = search;
  if (role) params.role = role;
  return toList(await api.get('/users', { params }));
}

/**
 * Đổi vai trò của 1 tài khoản (chỉ Admin — backend kiểm tra lại).
 * PATCH /users/:id { role }
 */
export async function updateUserRole(userId, role) {
  const body = bodyOf(await api.patch(`/users/${userId}`, { role }));
  return body?.data ?? body;
}

/**
 * Khoá / mở khoá 1 tài khoản. Tài khoản bị khoá không đăng nhập được nữa
 * nhưng dữ liệu nghiệp vụ liên quan vẫn giữ nguyên.
 * PATCH /users/:id { is_active }
 */
export async function setUserActive(userId, isActive) {
  const body = bodyOf(await api.patch(`/users/${userId}`, { is_active: isActive }));
  return body?.data ?? body;
}

/* ------------------------------ Xử lý lỗi -------------------------------- */

/** Chuyển lỗi API thành thông báo tiếng Việt thân thiện (ưu tiên message của server). */
export function friendlyError(error, fallback = 'Đã có lỗi xảy ra, vui lòng thử lại.') {
  const status = error?.response?.status;
  const serverMsg = error?.response?.data?.error?.message || error?.response?.data?.message;
  if (serverMsg) return serverMsg;
  if (status === 401) return 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.';
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (status === 404) return 'Không tìm thấy tài khoản yêu cầu.';
  if (status === 409) return 'Thao tác bị xung đột với dữ liệu hiện tại, vui lòng tải lại danh sách rồi thử lại.';
  if (!error?.response) return 'Không kết nối được tới máy chủ, vui lòng kiểm tra mạng rồi thử lại.';
  return fallback;
}
