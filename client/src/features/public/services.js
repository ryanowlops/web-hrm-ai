import api from '../../api/axiosClient';

/**
 * Service layer cho trang Tuyển dụng CÔNG KHAI (khách chưa đăng nhập, FR-08).
 * Các request ở đây KHÔNG kèm token — axiosClient phải hoạt động bình thường
 * khi chưa có phiên đăng nhập (không tự chuyển hướng về trang login).
 * Endpoint theo tài liệu kiến trúc (mục B3.2, B5.4, B6):
 *  - GET  /jobs?status=open        danh sách tin đang mở
 *  - GET  /jobs/:id                chi tiết 1 tin (JD đầy đủ)
 *  - POST /jobs/:id/apply          nộp hồ sơ: multipart { full_name, email, phone, cv }
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
 * Danh sách tin tuyển dụng ĐANG MỞ (chỉ tin public cho khách).
 * Mỗi tin: { id, title, department_id, department?: { name }, description,
 *            requirements, quantity, deadline, status, created_at }
 */
export async function listOpenJobs({ page = 1, limit = 100 } = {}) {
  return toList(await api.get('/jobs', { params: { status: 'open', page, limit } }));
}

/** Chi tiết 1 tin tuyển dụng (JD + yêu cầu đầy đủ để hiển thị trước khi ứng tuyển). */
export async function getPublicJob(jobId) {
  const body = bodyOf(await api.get(`/jobs/${jobId}`));
  return body?.data ?? body;
}

/**
 * Nộp hồ sơ ứng tuyển kèm file CV (PDF, tối đa 5 MB — validate ở client trước,
 * backend vẫn kiểm tra lại độc lập: định dạng, magic bytes, dung lượng).
 * Thành công -> bản ghi ứng viên vừa tạo (status: 'new').
 */
export async function applyToJob(jobId, { fullName, email, phone, cvFile }) {
  const form = new FormData();
  form.append('full_name', fullName.trim());
  form.append('email', email.trim());
  form.append('phone', phone.trim());
  form.append('cv', cvFile);
  const body = bodyOf(
    await api.post(`/jobs/${jobId}/apply`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  );
  return body?.data ?? body;
}

/* ------------------------------ Xử lý lỗi -------------------------------- */

/** Chuyển lỗi API thành thông báo tiếng Việt thân thiện (ưu tiên message của server). */
export function friendlyError(error, fallback = 'Đã có lỗi xảy ra, vui lòng thử lại.') {
  const status = error?.response?.status;
  const serverMsg = error?.response?.data?.error?.message || error?.response?.data?.message;
  if (serverMsg) return serverMsg;
  if (status === 404) return 'Tin tuyển dụng không còn tồn tại.';
  if (status === 409) return 'Có vẻ bạn đã ứng tuyển vị trí này trước đó. HR sẽ liên hệ nếu hồ sơ phù hợp.';
  if (status === 413) return 'File CV vượt quá 5 MB, vui lòng nén hoặc giảm dung lượng file rồi thử lại.';
  if (status === 422) return 'Hồ sơ chưa hợp lệ — file CV phải là PDF có nội dung đọc được.';
  if (status === 429) return 'Bạn đang gửi quá nhanh, vui lòng đợi ít phút rồi thử lại.';
  if (!error?.response) return 'Không kết nối được tới máy chủ, vui lòng kiểm tra mạng rồi thử lại.';
  return fallback;
}
