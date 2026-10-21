// Service layer cho module People AI — điểm nguy cơ nghỉ việc (mục 5.3).
// File này ở client/src/features/attrition/ nên api ở ../../api/axiosClient.
// Interceptor của axiosClient đã bóc envelope ngoài -> body ở đây là
// {"data": {...}} trả về từ backend; chỉ đọc .data, không bóc lại.
import api from '../../api/axiosClient';

// GET /people-ai/attrition-risk?department_id=&level=
// -> { generated_at, window_days, items: [{employee, score, level, level_label, factors}], summary: {high, medium, low} }
export async function getAttritionRisk({ departmentId, level } = {}) {
  const params = {};
  if (departmentId) params.department_id = departmentId;
  if (level) params.level = level;
  const body = await api.get('/people-ai/attrition-risk', { params });
  return body?.data ?? body;
}

export function parseApiError(err, fallback = 'Đã xảy ra lỗi. Vui lòng thử lại.') {
  const apiMessage = err?.responseData?.error?.message || err?.response?.data?.error?.message;
  if (apiMessage) return apiMessage;
  if (err?.response?.status === 403) return 'Bạn không có quyền xem dữ liệu này.';
  if (err?.code === 'ERR_NETWORK' || err?.message === 'Network Error') {
    return 'Không kết nối được tới máy chủ. Kiểm tra backend đã chạy chưa rồi thử lại.';
  }
  return err?.message || fallback;
}
