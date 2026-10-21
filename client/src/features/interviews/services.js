// Service layer cho Phỏng vấn thử với AI (feature-expansion-v5 mục B).
// File ở client/src/features/interviews/ nên api ở ../../api/axiosClient.
//
// Backend: blueprint interviews — /interviews/start | /interviews/:id |
// /interviews/:id/answer | /interviews/:id/finish | /interviews/mine.
// Khách chưa đăng nhập: start trả access_token — mọi lần gọi sau gửi kèm
// header X-Session-Token. User đã đăng nhập: axiosClient tự gắn JWT.
import api from '../../api/axiosClient';
import { listOpenJobs, friendlyError } from '../public/services';

export { listOpenJobs, friendlyError };

const bodyOf = (res) =>
  res && typeof res === 'object' && 'config' in res && 'status' in res ? res.data : res;

const memberOf = (res) => {
  const body = bodyOf(res);
  return body?.data ?? body;
};

function tokenConfig(sessionToken) {
  return sessionToken ? { headers: { 'X-Session-Token': sessionToken } } : undefined;
}

/**
 * Bắt đầu phiên phỏng vấn.
 * payload: { jobId, guestName?, guestEmail? } (khách mới cần 2 trường sau).
 * Trả: { session_id, access_token?, job: {id, title}, total_questions,
 *        first_question: { order_no, question } }
 */
export async function startInterview({ jobId, guestName, guestEmail }) {
  const payload = { job_id: jobId };
  if (guestName) payload.guest_name = guestName;
  if (guestEmail) payload.guest_email = guestEmail;
  return memberOf(await api.post('/interviews/start', payload));
}

/** Trạng thái phiên: tiến độ + câu hiện tại; finished thì kèm báo cáo. */
export async function getInterview(sessionId, sessionToken) {
  return memberOf(await api.get(`/interviews/${sessionId}`, tokenConfig(sessionToken)));
}

/** Gửi câu trả lời cho câu hiện tại -> { done, next_question? , ... } */
export async function answerInterview(sessionId, answer, sessionToken) {
  return memberOf(
    await api.post(`/interviews/${sessionId}/answer`, { answer }, tokenConfig(sessionToken)),
  );
}

/** Kết thúc + chấm điểm -> báo cáo đầy đủ (session dict kèm questions/summary). */
export async function finishInterview(sessionId, sessionToken) {
  return memberOf(await api.post(`/interviews/${sessionId}/finish`, {}, tokenConfig(sessionToken)));
}

/** Các phiên gần đây của user đã đăng nhập. */
export async function getMyInterviews() {
  const body = bodyOf(await api.get('/interviews/mine'));
  return Array.isArray(body?.data) ? body.data : [];
}
