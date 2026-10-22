// Service layer cho module Briefing — báo cáo điều hành AI (v6 mục 4).
// File này ở client/src/features/briefing/ nên api ở ../../api/axiosClient.
// Interceptor của axiosClient đã bóc envelope {data} -> ở đây chỉ đọc kết quả.
import api from '../../api/axiosClient';

// POST /briefing/generate {period, ref_date?} -> briefing đầy đủ (numbers + prose + source)
export async function generateBriefing({ period, refDate } = {}) {
  const payload = { period };
  if (refDate) payload.ref_date = refDate;
  const body = await api.post('/briefing/generate', payload);
  return body?.data ?? body;
}

// GET /briefing/latest?period= -> briefing mới nhất của kỳ (404 nếu chưa có)
export async function getLatestBriefing(period) {
  const body = await api.get('/briefing/latest', { params: { period } });
  return body?.data ?? body;
}

// GET /briefing/history?period=&limit= -> danh sách báo cáo đã tạo
export async function getBriefingHistory({ period, limit = 20 } = {}) {
  const params = { limit };
  if (period) params.period = period;
  const body = await api.get('/briefing/history', { params });
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
