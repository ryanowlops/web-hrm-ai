import api from '../../api/axiosClient';

/**
 * Service cho "AI kiểm tra CV" trên trang tuyển dụng CÔNG KHAI (v5 mục E).
 * Endpoint: POST /public/cv-check — KHÔNG cần đăng nhập, backend KHÔNG
 * lưu CV/kết quả (phân tích tức thời). Hai dạng gửi:
 *  - JSON { job_id, cv_text } khi ứng viên dán nội dung CV;
 *  - multipart { job_id, cv: File } khi ứng viên tải file PDF/TXT.
 * Kết quả: { job_id, job_title, score, verdict, strengths[], improvements[],
 *            matched_keywords[], missing_keywords[], source: 'ai'|'heuristic' }
 * Lỗi chuẩn: { error: { code, message, details } } — dùng friendlyError
 * của feature public để hiển thị như các luồng khác trên trang.
 */

const bodyOf = (res) =>
  res && typeof res === 'object' && 'config' in res && 'status' in res ? res.data : res;

/** Kiểm tra CV dạng văn bản dán trực tiếp. */
export async function checkCvText(jobId, cvText) {
  const body = bodyOf(await api.post('/public/cv-check', { job_id: jobId, cv_text: cvText }));
  return body?.data ?? body;
}

/** Kiểm tra CV bằng file tải lên (PDF/TXT, tối đa 5 MB — backend kiểm tra lại). */
export async function checkCvFile(jobId, file) {
  const form = new FormData();
  form.append('job_id', String(jobId));
  form.append('cv', file);
  const body = bodyOf(
    await api.post('/public/cv-check', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  );
  return body?.data ?? body;
}
