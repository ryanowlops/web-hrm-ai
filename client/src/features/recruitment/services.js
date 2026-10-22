import api from '../../api/axiosClient';

/**
 * Service layer cho module Tuyển dụng + AI sàng lọc CV.
 * Mọi endpoint theo tài liệu kiến trúc (mục B3.2, B5.2, B6):
 *  - recruitment blueprint: /jobs, /candidates
 *  - ai blueprint:          /ai/cv-analyses, /ai/jobs/:id
 * Response danh sách chuẩn: { data: [...], meta: { page, limit, totalItems, totalPages } }
 * Lỗi chuẩn: { error: { code, message, details } }
 */

const unwrap = (res) => res.data;

/* ---------------------------------- Jobs --------------------------------- */

/** Danh sách tin tuyển dụng (phía HR). params: { page, limit, search, status, department_id }
 *  Trả nguyên body { data, meta } để trang dùng được meta phân trang
 *  (interceptor của axiosClient đã bóc response.data một lần). */
export async function listJobs(params = {}) {
  return api.get('/jobs', { params });
}

/** Chi tiết 1 tin tuyển dụng (kèm JD đầy đủ). */
export async function getJob(jobId) {
  return unwrap(await api.get(`/jobs/${jobId}`));
}

/** Tạo tin tuyển dụng mới. payload: { title, department_id, description, requirements, quantity, deadline, status } */
export async function createJob(payload) {
  return unwrap(await api.post('/jobs', payload));
}

/** Cập nhật tin tuyển dụng (sửa JD, hạn nộp, số lượng...). */
export async function updateJob(jobId, payload) {
  return unwrap(await api.patch(`/jobs/${jobId}`, payload));
}

/** Đóng tin tuyển dụng (không nhận CV nữa, vẫn xem được ứng viên). */
export async function closeJob(jobId) {
  return updateJob(jobId, { status: 'closed' });
}

/** Mở lại tin tuyển dụng đã đóng. */
export async function reopenJob(jobId) {
  return updateJob(jobId, { status: 'open' });
}

/** Xoá tin tuyển dụng (backend sẽ chặn nếu đã có ứng viên tuỳ chính sách). */
export async function deleteJob(jobId) {
  return unwrap(await api.delete(`/jobs/${jobId}`));
}

/* ------------------------------- Candidates ------------------------------ */

/**
 * Danh sách ứng viên.
 * params: { job_id, status, search, page, limit, sortBy: 'match_score'|'created_at'|'full_name', sortOrder }
 * Mỗi ứng viên có thể kèm match_score / latest_analysis (bản phân tích AI mới nhất) từ backend.
 */
export async function listCandidates(params = {}) {
  // Trả nguyên body { data, meta } như listJobs (giữ meta phân trang).
  return api.get('/candidates', { params });
}

/** Chi tiết 1 ứng viên (kèm link CV gốc + ghi chú HR). */
export async function getCandidate(candidateId) {
  return unwrap(await api.get(`/candidates/${candidateId}`));
}

/**
 * HR đổi trạng thái ứng viên + ghi chú.
 * Đây là quyết định CỦA HR — AI không bao giờ gọi hàm này (nguyên tắc human-in-loop, mục A6.4).
 * payload: { status: 'new'|'reviewing'|'interview'|'passed'|'rejected', hr_note?: string }
 */
export async function updateCandidateStatus(candidateId, payload) {
  return unwrap(await api.patch(`/candidates/${candidateId}/status`, payload));
}

/* ------------------------------ AI Screening ----------------------------- */

/**
 * Tạo job phân tích CV bằng AI cho 1 hoặc nhiều ứng viên của 1 vị trí.
 * Bất đồng bộ: backend trả 202 { job_id, status: 'pending', total }.
 * Lưu ý: 'job_id' trong response là ID của AI JOB (không phải tin tuyển dụng)
 * -> dùng getAiJob(aiJobId) để polling.
 * payload nhận vào: { jobId, candidateIds }
 */
export async function createCvAnalysis({ jobId, candidateIds }) {
  return unwrap(
    await api.post('/ai/cv-analyses', {
      job_id: jobId,
      candidate_ids: candidateIds,
    }),
  );
}

/**
 * Trạng thái 1 AI job (polling mỗi ~2.5s cho tới khi done/failed).
 * Trả về dạng: { id, status: 'pending'|'processing'|'done'|'failed',
 *                processed, total, error_code?, error?/message? }
 */
export async function getAiJob(aiJobId) {
  return unwrap(await api.get(`/ai/jobs/${aiJobId}`));
}

/**
 * Kết quả phân tích AI mới nhất của 1 ứng viên.
 * Dạng trả về (bảng cv_analyses): { match_score, matched_skills, missing_skills,
 *   experience_years_estimate, education_summary, strengths, concerns,
 *   summary, model_name, status, created_at }
 * 404 = ứng viên chưa được phân tích.
 */
export async function getCandidateAnalysis(candidateId) {
  return unwrap(await api.get(`/ai/candidates/${candidateId}/analysis`));
}

/* --------------------- AI tạo JD + Bộ câu hỏi (v6) ---------------------- */

/**
 * Sinh JD bằng AI (hoặc template dự phòng phía server khi AI không khả
 * dụng). payload: { title, department_id?, department_name?, level?,
 * skills?: string[], salary_note? }
 * Trả về { summary, responsibilities[], requirements[], benefits[],
 *          source: 'ai'|'template', title, level }
 * CHỈ sinh nội dung xem trước — không tạo/lưu tin tuyển dụng.
 */
export async function generateJd(payload) {
  return unwrap(await api.post('/jd/generate', payload));
}

/** Đọc bộ câu hỏi phỏng vấn của 1 tin. 404 = chưa tạo bộ câu hỏi. */
export async function getInterviewKit(jobId) {
  return unwrap(await api.get(`/jobs/${jobId}/interview-kit`));
}

/** Sinh/tái tạo bộ câu hỏi phỏng vấn bằng AI (mỗi lần tái tạo version +1). */
export async function generateInterviewKit(jobId) {
  return unwrap(await api.post(`/jobs/${jobId}/interview-kit/generate`));
}

/** HR lưu bản sửa tay của bộ câu hỏi. payload: questions = [{round, topic, question, rubric, weight}] */
export async function updateInterviewKit(jobId, questions) {
  return unwrap(await api.put(`/jobs/${jobId}/interview-kit`, { questions }));
}

/* ------------------------------- Phụ trợ -------------------------------- */

/** Danh sách phòng ban để chọn khi đăng tin (dùng chung API departments). */
export async function listDepartments() {
  const res = await api.get('/departments', { params: { page: 1, limit: 100 } });
  const body = res.data;
  return Array.isArray(body) ? body : body?.data ?? [];
}

/* ------------------------------ Xử lý lỗi -------------------------------- */

/** Mã lỗi cho thấy AI chưa được cấu hình / không khả dụng phía server. */
const AI_UNAVAILABLE_CODES = [
  'AI_NOT_CONFIGURED',
  'AI_UNAVAILABLE',
  'AI_PROVIDER_ERROR',
  'AI_QUOTA_EXCEEDED',
];

/** Lấy mã lỗi chuẩn hoá từ response backend (error.code) hoặc HTTP status. */
export function getErrorCode(error) {
  return (
    error?.response?.data?.error?.code ||
    error?.response?.data?.code ||
    (error?.response?.status ? `HTTP_${error.response.status}` : 'NETWORK_ERROR')
  );
}

/** Lỗi này có phải "AI chưa cấu hình / AI không khả dụng" không (HTTP 503 hoặc code AI_*). */
export function isAiUnavailable(error) {
  const code = String(getErrorCode(error) || '');
  const status = error?.response?.status;
  return (
    status === 503 ||
    AI_UNAVAILABLE_CODES.some((c) => code.toUpperCase().includes(c)) ||
    code.toUpperCase().startsWith('AI_')
  );
}

/**
 * Chuyển mọi lỗi API thành thông báo tiếng Việt thân thiện.
 * Ưu tiên: lỗi AI chưa cấu hình -> hướng dẫn cấu hình; còn lại dùng message của server nếu có.
 */
export function friendlyError(error, fallback = 'Đã có lỗi xảy ra, vui lòng thử lại.') {
  if (isAiUnavailable(error)) {
    return (
      'Tính năng AI chưa sẵn sàng: máy chủ chưa được cấu hình khóa AI (AI_API_KEY) ' +
      'hoặc dịch vụ AI đang tạm gián đoạn. Các chức năng tuyển dụng khác vẫn dùng bình thường — ' +
      'bạn vẫn có thể xem CV gốc và chấm thủ công. Vui lòng báo quản trị viên kiểm tra cấu hình AI.'
    );
  }
  const status = error?.response?.status;
  const serverMsg = error?.response?.data?.error?.message || error?.response?.data?.message;
  if (serverMsg) return serverMsg;
  if (status === 401) return 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.';
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (status === 404) return 'Không tìm thấy dữ liệu yêu cầu.';
  if (status === 409) return 'Dữ liệu bị xung đột, vui lòng tải lại trang rồi thử lại.';
  if (status === 413) return 'Tệp tải lên vượt quá dung lượng cho phép.';
  if (status === 422) return 'Dữ liệu chưa hợp lệ hoặc CV không trích xuất được nội dung.';
  if (status === 429) return 'Đã vượt hạn mức phân tích AI, vui lòng thử lại sau ít phút.';
  if (!error?.response) return 'Không kết nối được tới máy chủ, vui lòng kiểm tra mạng rồi thử lại.';
  return fallback;
}
