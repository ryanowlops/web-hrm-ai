import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  askChatbot,
  getChatHistory,
  listKbDocuments,
  uploadKbDocument,
  deleteKbDocument,
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

const KB_MAX_SIZE_MB = 10;

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
      const { answer, sources } = await askChatbot(question);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === typingId
            ? {
                ...m,
                typing: false,
                text: answer || 'Chatbot chưa trả về nội dung, vui lòng thử lại.',
                sources: sources.map(normalizeSource),
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

  const kbStatusLabel = { processing: 'Đang xử lý', ready: 'Sẵn sàng', failed: 'Lỗi xử lý' };
  const kbStatusTone = { processing: 'amber', ready: 'green', failed: 'red' };

  return (
    <div className="page-shell">
      <PageHeader
        title="Chatbot HR"
        subtitle="Hỏi đáp quy chế nội bộ công ty. Chatbot chỉ trả lời dựa trên tài liệu quy chế do HR cung cấp và luôn kèm nguồn trích dẫn — nếu tài liệu chưa có thông tin, chatbot sẽ báo rõ thay vì tự suy đoán."
      />

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        {/* ------------------------------ Khung chat ------------------------------ */}
        <div className="min-w-0 flex-1">
          <Card className="flex flex-col overflow-hidden">
            {/* Header khung chat */}
            <div className="flex items-center gap-3.5 border-b border-slate-100 bg-white px-5 py-4">
              <div className="relative shrink-0">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-500 text-white shadow-[0_8px_16px_-6px_rgba(13,183,149,.6)] ring-4 ring-accent-50">
                  <IconSparkles size={22} />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-[15px] font-bold tracking-[-0.01em] text-slate-900">
                  Chatbot HR
                </h2>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <span className="h-2 w-2 animate-pulse-soft rounded-full bg-emerald-500" aria-hidden="true" />
                  Sẵn sàng
                </p>
              </div>
            </div>

            {/* Vùng tin nhắn */}
            <div
              className="nice-scroll flex h-[clamp(400px,58vh,600px)] flex-col gap-4 overflow-y-auto bg-slate-50/70 px-5 py-5"
              ref={scrollRef}
              aria-live="polite"
            >
              {historyLoading && (
                <div className="space-y-4" aria-label="Đang tải lịch sử trò chuyện…">
                  <div className="flex gap-3">
                    <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                    <Skeleton className="h-16 w-2/3 rounded-2xl" />
                  </div>
                  <div className="flex flex-row-reverse gap-3">
                    <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                    <Skeleton className="h-12 w-1/2 rounded-2xl" />
                  </div>
                  <div className="flex gap-3">
                    <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                    <Skeleton className="h-20 w-3/5 rounded-2xl" />
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
                          className="rounded-full border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-brand-700 shadow-sm transition-all duration-200 ease-spring hover:-translate-y-px hover:border-brand-400 hover:bg-brand-50 hover:shadow-lift active:translate-y-0 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25"
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
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 ring-1 ring-inset ring-brand-200/60"
                      aria-hidden="true"
                    >
                      {myInitial}
                    </div>
                    <div className="min-w-0 max-w-[85%] sm:max-w-[78%]">
                      <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-brand-600 px-4 py-3 text-sm leading-relaxed text-white shadow-[0_6px_16px_-8px_rgba(39,79,234,.55)]">
                        {m.text}
                      </div>
                      <div className="mt-1 text-right text-[11px] font-medium text-slate-400">
                        {formatTime(m.createdAt)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="msg-in flex gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-500 text-white shadow-[0_6px_14px_-6px_rgba(13,183,149,.6)]"
                      aria-hidden="true"
                    >
                      <IconSparkles size={18} />
                    </div>
                    <div className="min-w-0 max-w-[85%] sm:max-w-[78%]">
                      <div
                        className={`whitespace-pre-wrap break-words rounded-2xl rounded-tl-md px-4 py-3 text-sm leading-relaxed shadow-card ${
                          m.error
                            ? 'border border-rose-200 bg-rose-50 text-rose-700'
                            : 'border border-slate-200/90 bg-white text-slate-800'
                        }`}
                      >
                        {m.typing ? (
                          <span className="inline-flex items-center gap-1.5 py-1" role="status" aria-label="Chatbot đang trả lời">
                            <span className="typing-dot h-[7px] w-[7px] rounded-full bg-slate-400" />
                            <span className="typing-dot h-[7px] w-[7px] rounded-full bg-slate-400" />
                            <span className="typing-dot h-[7px] w-[7px] rounded-full bg-slate-400" />
                          </span>
                        ) : (
                          m.text
                        )}
                        {!m.typing && m.sources && m.sources.length > 0 && (
                          <div className="mt-3 border-t border-dashed border-slate-200 pt-3">
                            <div className="mb-2 text-xs font-semibold text-slate-500">
                              Nguồn trích dẫn
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {m.sources.map((s) => (
                                <span
                                  key={s.key}
                                  className="ui-badge bg-accent-50 text-accent-700 ring-accent-600/20"
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
                      {!m.typing && (
                        <div className="mt-1 text-[11px] font-medium text-slate-400">
                          {formatTime(m.createdAt)}
                        </div>
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>

            {/* Thanh nhập cố định ở đáy khung chat */}
            <form
              className="flex items-end gap-3 border-t border-slate-100 bg-white px-4 py-4"
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
                className="h-[42px] w-[42px] shrink-0 rounded-full px-0"
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
            <Card className="animate-fade-up">
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
                      <div className="mt-1.5 text-xs leading-relaxed text-slate-400">
                        Đã chọn: {kbFile.name} ({(kbFile.size / 1024).toFixed(0)} KB)
                      </div>
                    )}
                  </div>
                  <Button type="submit" variant="primary" className="w-full" loading={kbUploading}>
                    {kbUploading ? 'Đang tải lên…' : 'Tải tài liệu lên'}
                  </Button>
                </form>

                <div className="mt-6">
                  <div className="ui-label mb-2">
                    Tài liệu đã có ({kbDocs.length})
                  </div>
                  {kbLoading && kbDocs.length === 0 && (
                    <div className="space-y-2.5" aria-hidden="true">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  )}
                  {!kbLoading && kbDocs.length === 0 && (
                    <p className="text-sm leading-relaxed text-slate-400">
                      Chưa có tài liệu nào. Tải quy chế nội bộ lên để chatbot bắt đầu trả lời được.
                    </p>
                  )}
                  {kbDocs.map((doc) => (
                    <div key={doc.id} className="flex items-start gap-3 border-t border-slate-100 py-3 first:border-t-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600 ring-1 ring-inset ring-accent-100">
                        <IconFileText size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-800 [overflow-wrap:anywhere]">
                          {doc.title || 'Tài liệu không tên'}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                          <Badge tone={kbStatusTone[doc.status] || 'amber'} dot>
                            {kbStatusLabel[doc.status] || 'Đang xử lý'}
                          </Badge>
                          <span>{formatDateTime(doc.created_at)}</span>
                        </div>
                        {doc.status === 'failed' && (
                          <div className="mt-1.5 text-xs leading-relaxed text-rose-600">
                            Không trích xuất được nội dung — kiểm tra lại file hoặc xoá và tải bản khác.
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition duration-200 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-500/25"
                        onClick={() => handleKbDelete(doc)}
                        aria-label={`Xoá tài liệu ${doc.title || ''}`}
                        title="Xoá tài liệu"
                      >
                        <IconTrash size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </aside>
        )}
      </div>
    </div>
  );
}
