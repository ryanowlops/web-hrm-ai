import api from '../../api/axiosClient';

/**
 * Service layer cho module Chatbot HR (FR-10) + quản lý tài liệu tri thức (KB).
 * Endpoint theo tài liệu kiến trúc (mục B3.2, B5.3, B6):
 *  - kb blueprint:   POST /chat/ask, GET /chat/history
 *                    GET/POST /kb/documents, DELETE /kb/documents/:id
 * Response danh sách chuẩn: { data: [...], meta: { page, limit, totalItems, totalPages } }
 * Lỗi chuẩn: { error: { code, message, details } }
 *
 * axiosClient có thể đã unwrap (trả thẳng body) hoặc chưa — các hàm dưới đây
 * tự chuẩn hoá cả 2 trường hợp để không phụ thuộc interceptor.
 */

// Nhận diện axios response "thô" (có config/status) để lấy body; nếu
// interceptor đã unwrap thì res chính là body.
const bodyOf = (res) =>
  res && typeof res === 'object' && 'config' in res && 'status' in res ? res.data : res;

/** Chuẩn hoá response danh sách -> { items, meta } */
function toList(res) {
  const body = bodyOf(res);
  if (Array.isArray(body)) return { items: body, meta: null };
  if (body && Array.isArray(body.data)) return { items: body.data, meta: body.meta || null };
  return { items: [], meta: null };
}

/* --------------------------------- Chat ---------------------------------- */

/**
 * Hỏi chatbot HR (RAG + tool layer tra dữ liệu thật, mục 5.1).
 * POST /chat/ask { question }
 * -> { answer, sources: [ { document_title|title, page_no|page, chunk_text|excerpt } ],
 *      mode, retrieval_mode }
 * mode: 'live_data' khi chatbot tra DỮ LIỆU THẬT theo quyền người hỏi qua
 * tool layer (ngày phép, phiếu lương, chấm công... — sources rỗng, trang
 * gắn badge "Dữ liệu trực tiếp"); 'rag' khi trả lời từ tài liệu quy chế.
 * retrieval_mode: chế độ truy hồi chi tiết của luồng RAG (hybrid_rerank |
 * hybrid | embedding | keyword | none) — trang hiển thị nhãn "Truy hồi".
 * Nếu tài liệu không có thông tin, backend trả câu từ chối mẫu kèm sources rỗng.
 */
const RETRIEVAL_MODES = ['hybrid_rerank', 'hybrid', 'embedding', 'keyword', 'none'];

export async function askChatbot(question) {
  const body = bodyOf(await api.post('/chat/ask', { question }));
  const payload = body?.data ?? body ?? {};
  let mode = payload.mode || 'rag';
  let retrievalMode = payload.retrieval_mode || null;
  // Tương thích ngược: response cũ trả mode là chính chế độ truy hồi.
  if (RETRIEVAL_MODES.includes(mode)) {
    retrievalMode = retrievalMode || mode;
    mode = 'rag';
  }
  return {
    answer: payload.answer || '',
    sources: Array.isArray(payload.sources) ? payload.sources : [],
    mode,
    retrievalMode,
  };
}

/**
 * Lịch sử chat của CHÍNH người dùng đang đăng nhập.
 * GET /chat/history?page=&limit=
 * -> { items: [ { id, question, answer, sources, created_at } ], meta }
 * (thứ tự do backend quyết định; trang sẽ sắp xếp lại theo thời gian tăng dần)
 */
export async function getChatHistory({ page = 1, limit = 30 } = {}) {
  return toList(await api.get('/chat/history', { params: { page, limit } }));
}

/* ------------------------------ Tài liệu KB ------------------------------ */

/**
 * Danh sách tài liệu quy chế (chỉ HR/Admin quản lý).
 * GET /kb/documents -> items: { id, title, file_url, status: processing|ready|failed, created_at }
 */
export async function listKbDocuments({ page = 1, limit = 50 } = {}) {
  return toList(await api.get('/kb/documents', { params: { page, limit } }));
}

/**
 * Upload tài liệu quy chế mới (PDF/TXT). Backend sẽ trích text, chia chunk
 * và tạo embedding ở tiến trình nền — trạng thái tài liệu đi từ
 * processing -> ready/failed, trang tự tải lại danh sách để cập nhật.
 */
export async function uploadKbDocument({ title, file }) {
  const form = new FormData();
  form.append('file', file);
  if (title && title.trim()) form.append('title', title.trim());
  const body = bodyOf(
    await api.post('/kb/documents', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  );
  return body?.data ?? body;
}

/** Xoá 1 tài liệu quy chế (kèm toàn bộ chunk/embedding của nó ở backend). */
export async function deleteKbDocument(documentId) {
  return bodyOf(await api.delete(`/kb/documents/${documentId}`));
}

/**
 * Lập chỉ mục lại 1 tài liệu (HR/Admin).
 * POST /kb/documents/:id/reindex — backend đọc lại file gốc, chia chunk và
 * tạo embedding lại từ đầu (mất file gốc thì chỉ bổ sung embedding thiếu).
 * -> tài liệu đã serialize + { rebuilt, embeddedChunks, failedChunks }
 */
export async function reindexKbDocument(documentId) {
  const body = bodyOf(await api.post(`/kb/documents/${documentId}/reindex`));
  return body?.data ?? body;
}

/**
 * Tạo embedding cho MỌI chunk trong KB chưa có embedding (HR/Admin).
 * POST /kb/embed-missing -> { total, embedded, failed }
 * Dùng sau khi server vừa được cấu hình AI_API_KEY/model embedding.
 */
export async function embedMissingKbChunks() {
  const body = bodyOf(await api.post('/kb/embed-missing'));
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
  if (status === 404) return 'Không tìm thấy dữ liệu yêu cầu.';
  if (status === 413) return 'Tệp tải lên vượt quá dung lượng cho phép.';
  if (status === 429) return 'Bạn đang thao tác quá nhanh, vui lòng thử lại sau ít phút.';
  if (status === 503)
    return 'Tính năng AI đang tạm gián đoạn hoặc chưa được cấu hình khóa AI trên máy chủ. Vui lòng thử lại sau hoặc liên hệ HR/quản trị viên.';
  if (!error?.response) return 'Không kết nối được tới máy chủ, vui lòng kiểm tra mạng rồi thử lại.';
  return fallback;
}
