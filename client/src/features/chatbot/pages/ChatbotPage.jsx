import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  askChatbot,
  executeChatAction,
  getChatHistory,
  listKbDocuments,
  uploadKbDocument,
  deleteKbDocument,
  reindexKbDocument,
  embedMissingKbChunks,
  friendlyError,
} from '../services';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
  Textarea,
} from '../../../components/ui';
import { StaggerList, StaggerItem, AnimatedNumber } from '../../../components/motion';
import {
  IconFileText,
  IconSend,
  IconSparkles,
  IconTrash,
} from '../../../components/icons.jsx';

/**
 * Trang Chatbot HR (FR-10, route /chatbot).
 * - Mọi vai trò đã đăng nhập: hỏi đáp quy chế nội bộ (RAG), câu trả lời hiển
 *   thị kèm nguồn trích dẫn (tên tài liệu + trang) ở ngay dưới nội dung.
 * - Lịch sử chat của chính người dùng được tải lại khi mở trang.
 * - HR/Admin thấy thêm panel "Tài liệu quy chế (KB)": upload PDF/TXT,
 *   theo dõi trạng thái xử lý (processing -> ready/failed), xoá tài liệu.
 *   Phân quyền thật nằm ở backend — nếu API trả 403, panel tự ẩn.
 */

const SUGGESTIONS = [
  'Tôi có bao nhiêu ngày phép năm?',
  'Quy trình xin nghỉ phép gồm những bước nào?',
  'Chính sách phúc lợi của công ty gồm những gì?',
  'Quy định về giờ làm việc và đi muộn?',
];

/** Câu hỏi tra DỮ LIỆU THẬT (tool layer, mục 5.1) — chips cố định trên ô nhập,
 * bấm là gửi ngay; chatbot tra theo đúng quyền của người đang đăng nhập. */
const LIVE_SUGGESTIONS = [
  'Tôi còn bao nhiêu ngày phép?',
  'Phiếu lương tháng này của tôi',
  'Hôm nay ai đang nghỉ phép?',
  'Chấm công tháng này của tôi',
];

/** Hành động chatbot có thể ĐỀ XUẤT (v5 mục A) — bấm chip là gửi câu mẫu;
 * chatbot soạn THẺ HÀNH ĐỘNG, người dùng bấm "Xác nhận thực hiện" trên
 * thẻ thì hệ thống mới thay đổi dữ liệu (luồng 2 bước an toàn). Chip
 * duyệt đơn chỉ hiện với vai trò có cấp duyệt. */
const ACTION_SUGGESTIONS = [
  { text: 'Xin nghỉ phép giúp tôi…', roles: null },
  { text: 'Duyệt đơn đang chờ của team tôi', roles: ['manager', 'hr', 'admin'] },
];

const KB_MAX_SIZE_MB = 10;

/** Nhãn hiển thị chế độ truy hồi RAG mà backend đã dùng cho 1 câu trả lời. */
const RETRIEVAL_MODE_LABELS = {
  hybrid_rerank: 'Truy hồi: Lai + xếp hạng lại',
  hybrid: 'Truy hồi: Lai (vector + từ khoá)',
  embedding: 'Truy hồi: Vector',
  keyword: 'Truy hồi: Từ khoá',
};

function getStoredUser() {
  try {
    const raw = localStorage.getItem('hrm_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Chuẩn hoá 1 nguồn trích dẫn từ backend về dạng hiển thị thống nhất. */
function normalizeSource(s, idx) {
  return {
    key: `${s?.document_id ?? s?.title ?? 'src'}-${idx}`,
    title: s?.document_title || s?.title || s?.document || 'Tài liệu nội bộ',
    page: s?.page_no ?? s?.page ?? null,
    excerpt: s?.chunk_text || s?.excerpt || s?.text || '',
  };
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  return sameDay
    ? time
    : `${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} · ${time}`;
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

/* --------------------------------- Trang --------------------------------- */

export default function ChatbotPage() {
  const currentUser = useMemo(getStoredUser, []);
  const role = String(currentUser?.role || '').toLowerCase();
  const canManageKbByRole = role === 'admin' || role === 'hr';
  const myInitial = (currentUser?.full_name || currentUser?.email || 'B').trim().charAt(0).toUpperCase();

  const [messages, setMessages] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const [kbVisible, setKbVisible] = useState(canManageKbByRole);
  const [kbDocs, setKbDocs] = useState([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbTitle, setKbTitle] = useState('');
  const [kbFile, setKbFile] = useState(null);
  const [kbUploading, setKbUploading] = useState(false);
  const [kbBusyId, setKbBusyId] = useState(null);
  const [kbError, setKbError] = useState('');
  const [kbNotice, setKbNotice] = useState('');

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  /* ------------------------------ Lịch sử chat ---------------------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { items } = await getChatHistory({ page: 1, limit: 30 });
        if (cancelled) return;
        const pairs = [...items].sort(
          (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0),
        );
        const flat = [];
        pairs.forEach((log, i) => {
          flat.push({
            id: `h-${log.id ?? i}-q`,
            role: 'user',
            text: log.question || '',
            createdAt: log.created_at,
          });
          flat.push({
            id: `h-${log.id ?? i}-a`,
            role: 'bot',
            text: log.answer || '',
            sources: Array.isArray(log.sources) ? log.sources.map(normalizeSource) : [],
            mode: log.mode || null,
            // Thẻ hành động đã đề xuất trong lịch sử: hiển thị dạng chỉ
            // đọc (không thực thi lại từ lịch sử — nhắn lại để soạn thẻ mới).
            action: log.action || null,
            actionState: log.action ? 'history' : undefined,
            createdAt: log.created_at,
          });
        });
        setMessages(flat);
      } catch {
        // Không tải được lịch sử không chặn việc chat mới.
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* --------------------------- Tự cuộn xuống cuối ------------------------- */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  /* ------------------------------- Tài liệu KB ---------------------------- */
  const loadKbDocs = useCallback(async () => {
    if (!canManageKbByRole) return;
    setKbLoading(true);
    try {
      const { items } = await listKbDocuments({ page: 1, limit: 50 });
      setKbDocs(items);
      setKbVisible(true);
    } catch (err) {
      // Backend từ chối quyền (403) -> ẩn panel, không làm phiền người dùng.
      if (err?.response?.status === 403) setKbVisible(false);
    } finally {
      setKbLoading(false);
    }
  }, [canManageKbByRole]);

  useEffect(() => {
    loadKbDocs();
  }, [loadKbDocs]);

  // Còn tài liệu đang xử lý nền -> tự tải lại danh sách mỗi 4 giây.
  const hasProcessing = kbDocs.some((d) => d.status === 'processing');
  useEffect(() => {
    if (!hasProcessing) return undefined;
    const t = setInterval(loadKbDocs, 4000);
    return () => clearInterval(t);
  }, [hasProcessing, loadKbDocs]);

  async function handleKbUpload(e) {
    e.preventDefault();
    setKbError('');
    setKbNotice('');
    if (!kbFile) {
      setKbError('Vui lòng chọn file tài liệu (PDF hoặc TXT).');
      return;
    }
    const lower = kbFile.name.toLowerCase();
    if (!lower.endsWith('.pdf') && !lower.endsWith('.txt')) {
      setKbError('Chỉ hỗ trợ file PDF hoặc TXT.');
      return;
    }
    if (kbFile.size > KB_MAX_SIZE_MB * 1024 * 1024) {
      setKbError(`File vượt quá ${KB_MAX_SIZE_MB} MB, vui lòng chọn file nhỏ hơn.`);
      return;
    }
    setKbUploading(true);
    try {
      await uploadKbDocument({ title: kbTitle, file: kbFile });
      setKbTitle('');
      setKbFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setKbNotice('Đã tải tài liệu lên. Hệ thống đang xử lý (trích text + tạo embedding) — trạng thái sẽ tự cập nhật.');
      await loadKbDocs();
    } catch (err) {
      setKbError(friendlyError(err, 'Tải tài liệu lên thất bại, vui lòng thử lại.'));
    } finally {
      setKbUploading(false);
    }
  }

  async function handleKbReindex(doc) {
    setKbError('');
    setKbNotice('');
    setKbBusyId(doc.id);
    try {
      const result = await reindexKbDocument(doc.id);
      setKbNotice(
        result?.rebuilt
          ? `Đã lập chỉ mục lại "${doc.title}" — đã tạo embedding cho ${result.embeddedChunks ?? 0} đoạn trích.`
          : `Đã bổ sung embedding còn thiếu cho "${doc.title}".`,
      );
      await loadKbDocs();
    } catch (err) {
      setKbError(friendlyError(err, 'Lập chỉ mục lại thất bại, vui lòng thử lại.'));
    } finally {
      setKbBusyId(null);
    }
  }

  async function handleEmbedMissing() {
    setKbError('');
    setKbNotice('');
    setKbBusyId('embed-missing');
    try {
      const result = await embedMissingKbChunks();
      setKbNotice(
        result?.total
          ? `Đã tạo embedding cho ${result.embedded}/${result.total} đoạn còn thiếu${result.failed ? ` (${result.failed} đoạn chưa tạo được)` : ''}.`
          : 'Mọi đoạn trích đã có embedding, không cần bổ sung.',
      );
      await loadKbDocs();
    } catch (err) {
      setKbError(friendlyError(err, 'Tạo embedding bổ sung thất bại, vui lòng thử lại.'));
    } finally {
      setKbBusyId(null);
    }
  }

  async function handleKbDelete(doc) {
    if (!window.confirm(`Xoá tài liệu "${doc.title}"? Chatbot sẽ không còn dùng tài liệu này để trả lời.`)) return;
    setKbError('');
    setKbNotice('');
    try {
      await deleteKbDocument(doc.id);
      setKbDocs((prev) => prev.filter((d) => d.id !== doc.id));
      setKbNotice('Đã xoá tài liệu.');
    } catch (err) {
      setKbError(friendlyError(err, 'Xoá tài liệu thất bại, vui lòng thử lại.'));
    }
  }

  /* --------------------------------- Gửi hỏi ------------------------------ */
  async function sendQuestion(raw) {
    const question = (raw ?? input).trim();
    if (!question || sending) return;
    setInput('');
    const stamp = new Date().toISOString();
    const userMsg = { id: `u-${Date.now()}`, role: 'user', text: question, createdAt: stamp };
    const typingId = `t-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: typingId, role: 'bot', typing: true, createdAt: stamp },
    ]);
    setSending(true);
    try {
      const { answer, sources, mode, retrievalMode, action } = await askChatbot(question);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === typingId
            ? {
                ...m,
                typing: false,
                text: answer || 'Chatbot chưa trả về nội dung, vui lòng thử lại.',
                sources: sources.map(normalizeSource),
                mode: mode || null,
                retrievalMode: retrievalMode || null,
                action: action || null,
                actionState: action ? 'pending' : undefined,
                actionError: '',
              }
            : m,
        ),
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === typingId
            ? { ...m, typing: false, error: true, text: friendlyError(err, 'Không gửi được câu hỏi, vui lòng thử lại.') }
            : m,
        ),
      );
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuestion();
    }
  }

  /* -------------------- Thẻ hành động (v5 mục A, 2 bước) ------------------ */
  // Xác nhận: gọi execute — backend kiểm tra lại quyền + nghiệp vụ; thành
  // công thì thẻ chuyển "Đã thực hiện" và chèn tin nhắn kết quả vào luồng
  // chat; lỗi nghiệp vụ thì hiện Alert trong thẻ, giữ nút để thử lại.
  async function handleActionConfirm(msg) {
    if (!msg.action || msg.actionState === 'executing' || msg.actionState === 'done') return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id ? { ...m, actionState: 'executing', actionError: '' } : m,
      ),
    );
    try {
      const { resultText } = await executeChatAction(msg.action.type, msg.action.payload);
      setMessages((prev) => [
        ...prev.map((m) =>
          m.id === msg.id ? { ...m, actionState: 'done', actionError: '' } : m,
        ),
        {
          id: `r-${Date.now()}`,
          role: 'bot',
          text: resultText || 'Đã thực hiện xong hành động.',
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? {
                ...m,
                actionState: 'pending',
                actionError: friendlyError(err, 'Thực hiện hành động thất bại, vui lòng thử lại.'),
              }
            : m,
        ),
      );
    }
  }

  // Huỷ: chỉ đổi trạng thái ở FE — không gọi execute nên không có tác dụng phụ.
  function handleActionCancel(msgId) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, actionState: 'cancelled', actionError: '' } : m,
      ),
    );
  }

  const kbStatusLabel = { processing: 'Đang xử lý', ready: 'Sẵn sàng', failed: 'Lỗi xử lý' };
  const kbStatusTone = { processing: 'amber', ready: 'green', failed: 'red' };

  return (
    <div className="page-shell">
      <PageHeader
        title="Chatbot HR"
        subtitle="Hỏi đáp quy chế nội bộ dựa trên tài liệu do HR cung cấp, luôn kèm nguồn trích dẫn. Bạn cũng có thể hỏi dữ liệu của chính mình (ngày phép, phiếu lương, chấm công) — chatbot tra trực tiếp từ hệ thống theo đúng quyền truy cập của bạn."
      />

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        {/* ------------------------------ Khung chat ------------------------------ */}
        <div className="min-w-0 flex-1">
          <Card className="flex flex-col overflow-hidden">
            {/* Header khung chat — phẳng: tên chatbot + Badge AI, không trang trí */}
            <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-5 py-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
                <IconSparkles size={18} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-sm font-semibold text-gray-900">
                    Chatbot HR
                  </h2>
                  <Badge tone="blue">AI</Badge>
                </div>
                <p className="mt-0.5 text-[13px] text-gray-500">
                  Sẵn sàng — trả lời dựa trên tài liệu quy chế, kèm nguồn trích dẫn
                </p>
              </div>
            </div>

            {/* Vùng tin nhắn */}
            <div
              className="nice-scroll flex h-[clamp(400px,58vh,600px)] flex-col gap-4 overflow-y-auto bg-gray-50 px-5 py-5"
              ref={scrollRef}
              aria-live="polite"
            >
              {historyLoading && (
                <div className="space-y-4" aria-label="Đang tải lịch sử trò chuyện…">
                  <div className="flex gap-3">
                    <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                    <Skeleton className="h-16 w-2/3 rounded-xl" />
                  </div>
                  <div className="flex flex-row-reverse gap-3">
                    <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                    <Skeleton className="h-12 w-1/2 rounded-xl" />
                  </div>
                  <div className="flex gap-3">
                    <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                    <Skeleton className="h-20 w-3/5 rounded-xl" />
                  </div>
                </div>
              )}

              {!historyLoading && messages.length === 0 && (
                <EmptyState
                  icon={<IconSparkles size={26} />}
                  title="Xin chào! Bạn muốn hỏi gì về quy chế công ty?"
                  description="Thử một câu hỏi mẫu:"
                  action={
                    <div className="flex max-w-xl flex-wrap justify-center gap-2">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors duration-150 hover:border-brand-600 hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/20"
                          onClick={() => sendQuestion(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  }
                />
              )}

              {messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="msg-in flex flex-row-reverse gap-3">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[13px] font-semibold text-gray-700"
                      aria-hidden="true"
                    >
                      {myInitial}
                    </div>
                    <div className="min-w-0 max-w-[85%] sm:max-w-[78%]">
                      <div className="whitespace-pre-wrap break-words rounded-xl bg-brand-600 px-4 py-3 text-sm leading-relaxed text-white">
                        {m.text}
                      </div>
                      <div className="mt-1 text-right text-[11px] font-medium text-gray-400">
                        {formatTime(m.createdAt)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="msg-in flex gap-3">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white"
                      aria-hidden="true"
                    >
                      <IconSparkles size={16} />
                    </div>
                    <div className="min-w-0 max-w-[85%] sm:max-w-[78%]">
                      <div
                        className={`whitespace-pre-wrap break-words rounded-xl px-4 py-3 text-sm leading-relaxed ${
                          m.error
                            ? 'bg-[#FEF3F2] text-[#B42318]'
                            : 'bg-gray-100 text-gray-900'
                        }`}
                      >
                        {m.typing ? (
                          <span className="inline-flex items-center gap-1.5 py-1" role="status" aria-label="Chatbot đang trả lời">
                            <span className="typing-dot h-[7px] w-[7px] rounded-full bg-gray-400" />
                            <span className="typing-dot h-[7px] w-[7px] rounded-full bg-gray-400" />
                            <span className="typing-dot h-[7px] w-[7px] rounded-full bg-gray-400" />
                          </span>
                        ) : (
                          m.text
                        )}
                        {!m.typing && m.sources && m.sources.length > 0 && (
                          <div className="mt-3 border-t border-gray-200 pt-3">
                            <div className="mb-2 text-xs font-semibold text-gray-500">
                              Nguồn trích dẫn
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {m.sources.map((s) => (
                                <span
                                  key={s.key}
                                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-white px-2 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200"
                                  title={s.excerpt || undefined}
                                >
                                  <IconFileText size={12} />
                                  {s.title}
                                  {s.page != null && s.page !== '' ? ` · trang ${s.page}` : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      {!m.typing && m.action && (
                        <div className="mt-2 rounded-xl border border-gray-200 bg-white p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">
                              {m.action.title}
                            </span>
                            {m.actionState === 'done' && <Badge tone="green">Đã thực hiện</Badge>}
                            {m.actionState === 'cancelled' && <Badge tone="slate">Đã huỷ</Badge>}
                            {m.actionState === 'history' && <Badge tone="slate">Từ lịch sử</Badge>}
                          </div>
                          {m.action.summary && (
                            <p className="mt-1 text-sm leading-relaxed text-gray-600">
                              {m.action.summary}
                            </p>
                          )}
                          {Array.isArray(m.action.details) && m.action.details.length > 0 && (
                            <dl className="mt-3 space-y-1.5">
                              {m.action.details.map((d, di) => (
                                <div key={di} className="flex gap-2 text-sm">
                                  <dt className="w-32 shrink-0 text-gray-500">{d.label}</dt>
                                  <dd className="min-w-0 font-medium text-gray-900">{d.value}</dd>
                                </div>
                              ))}
                            </dl>
                          )}
                          {m.actionError && (
                            <Alert tone="error" className="mt-3">{m.actionError}</Alert>
                          )}
                          {(m.actionState === 'pending' || m.actionState === 'executing') && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="primary"
                                loading={m.actionState === 'executing'}
                                onClick={() => handleActionConfirm(m)}
                              >
                                Xác nhận thực hiện
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={m.actionState === 'executing'}
                                onClick={() => handleActionCancel(m.id)}
                              >
                                Huỷ
                              </Button>
                            </div>
                          )}
                          {m.actionState === 'history' && (
                            <p className="mt-3 text-xs leading-relaxed text-gray-500">
                              Thẻ hành động từ lịch sử trò chuyện — không thực hiện lại
                              từ đây. Muốn thực hiện, hãy nhắn lại yêu cầu để chatbot
                              soạn thẻ mới.
                            </p>
                          )}
                        </div>
                      )}
                      {!m.typing && (
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-gray-400">
                          <span>{formatTime(m.createdAt)}</span>
                          {!m.error && m.mode === 'action' && (
                            <Badge tone="violet">Hành động chờ xác nhận</Badge>
                          )}
                          {!m.error && m.mode === 'live_data' && (
                            <Badge tone="teal">Dữ liệu trực tiếp</Badge>
                          )}
                          {!m.error &&
                            m.mode !== 'live_data' &&
                            m.retrievalMode &&
                            RETRIEVAL_MODE_LABELS[m.retrievalMode] && (
                              <span className="text-gray-500">
                                · {RETRIEVAL_MODE_LABELS[m.retrievalMode]}
                              </span>
                            )}
                        </div>
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>

            {/* Chips hành động (v5 mục A) — chatbot soạn thẻ, xác nhận mới chạy */}
            <div className="border-t border-gray-200 bg-white px-4 pt-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Hành động nhanh — chatbot soạn sẵn, bạn xác nhận mới thực hiện
              </div>
              <div className="flex flex-wrap gap-2">
                {ACTION_SUGGESTIONS.filter(
                  (s) => !s.roles || s.roles.includes(role),
                ).map((s) => (
                  <button
                    key={s.text}
                    type="button"
                    disabled={sending}
                    className="rounded-lg border border-brand-600 bg-brand-50 px-2.5 py-1.5 text-[13px] font-medium text-brand-700 transition-colors duration-150 hover:bg-brand-600 hover:text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/20 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => sendQuestion(s.text)}
                  >
                    {s.text}
                  </button>
                ))}
              </div>
            </div>

            {/* Chips tra dữ liệu trực tiếp (tool layer) — ngay trên ô nhập */}
            <div className="bg-white px-4 pt-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Tra dữ liệu của bạn
              </div>
              <div className="flex flex-wrap gap-2">
                {LIVE_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={sending}
                    className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[13px] font-medium text-gray-700 transition-colors duration-150 hover:border-brand-600 hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/20 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => sendQuestion(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Thanh nhập cố định ở đáy khung chat */}
            <form
              className="flex items-end gap-3 bg-white px-4 py-4"
              onSubmit={(e) => {
                e.preventDefault();
                sendQuestion();
              }}
            >
              <label className="sr-only" htmlFor="cb-question">Nhập câu hỏi về quy chế</label>
              <Textarea
                id="cb-question"
                className="max-h-[120px] flex-1 resize-none"
                rows={2}
                placeholder="Nhập câu hỏi về quy chế, nghỉ phép, phúc lợi… (Enter để gửi, Shift+Enter để xuống dòng)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
              />
              <Button
                type="submit"
                variant="primary"
                className="h-10 w-10 shrink-0 rounded-lg px-0"
                disabled={sending || !input.trim()}
                aria-label="Gửi câu hỏi"
                title="Gửi câu hỏi"
              >
                <IconSend size={18} />
              </Button>
            </form>
          </Card>
        </div>

        {/* --------------------------- Panel tài liệu KB --------------------------- */}
        {kbVisible && (
          <aside className="w-full shrink-0 xl:w-[340px]" aria-label="Quản lý tài liệu quy chế">
            <Card>
              <CardHeader
                title="Tài liệu quy chế (KB)"
                subtitle="Chỉ HR/Admin quản lý khu vực này. Tài liệu tải lên là nguồn duy nhất để chatbot trả lời — hãy giữ tài liệu luôn cập nhật."
              />
              <CardBody>
                {kbError && (
                  <Alert tone="error" className="mb-4">{kbError}</Alert>
                )}
                {kbNotice && (
                  <Alert tone="success" className="mb-4">{kbNotice}</Alert>
                )}

                <form onSubmit={handleKbUpload} className="space-y-4">
                  <div>
                    <label className="ui-label" htmlFor="kb-title">Tên tài liệu (không bắt buộc)</label>
                    <Input
                      id="kb-title"
                      type="text"
                      placeholder="VD: Quy chế nghỉ phép 2026"
                      value={kbTitle}
                      onChange={(e) => setKbTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="ui-label" htmlFor="kb-file">File tài liệu (PDF/TXT, tối đa {KB_MAX_SIZE_MB} MB)</label>
                    <input
                      id="kb-file"
                      ref={fileInputRef}
                      className="ui-input"
                      type="file"
                      accept=".pdf,.txt,application/pdf,text/plain"
                      onChange={(e) => setKbFile(e.target.files?.[0] || null)}
                    />
                    {kbFile && (
                      <div className="mt-1.5 text-xs leading-relaxed text-gray-500">
                        Đã chọn: {kbFile.name} ({(kbFile.size / 1024).toFixed(0)} KB)
                      </div>
                    )}
                  </div>
                  <Button type="submit" variant="primary" className="w-full" loading={kbUploading}>
                    {kbUploading ? 'Đang tải lên…' : 'Tải tài liệu lên'}
                  </Button>
                </form>

                <Button
                  type="button"
                  variant="secondary"
                  className="mt-4 w-full"
                  loading={kbBusyId === 'embed-missing'}
                  onClick={handleEmbedMissing}
                >
                  Bổ sung embedding còn thiếu
                </Button>
                <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
                  Dùng sau khi máy chủ vừa được cấu hình khoá AI — tạo vector
                  cho các đoạn trích đang ở chế độ từ khoá để bật truy hồi lai.
                </p>

                <div className="mt-6">
                  <div className="ui-label mb-2">
                    Tài liệu đã có (<AnimatedNumber value={kbDocs.length} />)
                  </div>
                  {kbLoading && kbDocs.length === 0 && (
                    <div className="space-y-2.5" aria-hidden="true">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  )}
                  {!kbLoading && kbDocs.length === 0 && (
                    <EmptyState
                      icon={<IconFileText size={26} />}
                      title="Chưa có tài liệu nào"
                      description="Tải quy chế nội bộ lên bằng biểu mẫu phía trên để chatbot bắt đầu trả lời được."
                    />
                  )}
                  <StaggerList>
                  {kbDocs.map((doc, i) => (
                    <StaggerItem key={doc.id} index={i}>
                    <div className="flex items-start gap-3 border-t border-gray-100 py-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                        <IconFileText size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 [overflow-wrap:anywhere]">
                          {doc.title || 'Tài liệu không tên'}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-gray-500">
                          <Badge tone={kbStatusTone[doc.status] || 'amber'} dot>
                            {kbStatusLabel[doc.status] || 'Đang xử lý'}
                          </Badge>
                          <span>{formatDateTime(doc.created_at)}</span>
                        </div>
                        {doc.status === 'failed' && (
                          <div className="mt-1.5 text-xs leading-relaxed text-[#B42318]">
                            Không trích xuất được nội dung — kiểm tra lại file hoặc xoá và tải bản khác.
                          </div>
                        )}
                        {doc.status === 'ready' && (
                          <button
                            type="button"
                            className="mt-1.5 text-xs font-medium text-brand-700 transition-colors duration-150 hover:text-brand-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/20 disabled:cursor-not-allowed disabled:text-gray-400"
                            onClick={() => handleKbReindex(doc)}
                            disabled={kbBusyId !== null}
                          >
                            {kbBusyId === doc.id ? 'Đang lập chỉ mục lại…' : 'Lập chỉ mục lại'}
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors duration-150 hover:bg-[#FEF3F2] hover:text-[#B42318] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#F04438]/20"
                        onClick={() => handleKbDelete(doc)}
                        aria-label={`Xoá tài liệu ${doc.title || ''}`}
                        title="Xoá tài liệu"
                      >
                        <IconTrash size={16} />
                      </button>
                    </div>
                    </StaggerItem>
                  ))}
                  </StaggerList>
                </div>
              </CardBody>
            </Card>
          </aside>
        )}
      </div>
    </div>
  );
}
