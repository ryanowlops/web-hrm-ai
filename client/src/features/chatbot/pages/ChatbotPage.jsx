import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  askChatbot,
  getChatHistory,
  listKbDocuments,
  uploadKbDocument,
  deleteKbDocument,
  friendlyError,
} from '../services';

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

/* ------------------------------- Icons (SVG nội bộ) ---------------------- */

const IconBot = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="7" width="18" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 7V4M12 4h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="8.5" cy="13" r="1.3" fill="currentColor" />
    <circle cx="15.5" cy="13" r="1.3" fill="currentColor" />
    <path d="M9 16.5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const IconSend = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4.5 12 20 4.5 13.5 20l-2.2-6.3L4.5 12Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M11.3 13.7 20 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const IconDoc = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M6 2.5h8L19 7.5v14H6v-19Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
    <path d="M13.5 2.5v5.5H19" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </svg>
);

const IconTrash = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 6.5h16M9.5 6V4h5v2M6.5 6.5l1 14h9l1-14M10 10.5v6M14 10.5v6"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/* --------------------------------- Style --------------------------------- */

const STYLE = `
.cb-layout { display: flex; gap: var(--space-6); align-items: flex-start; }
.cb-main { flex: 1; min-width: 0; }
.cb-card {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);
  display: flex; flex-direction: column; overflow: hidden;
}
.cb-scroll {
  height: min(58vh, 560px); overflow-y: auto; padding: var(--space-5);
  display: flex; flex-direction: column; gap: var(--space-4);
  background: var(--color-gray-50);
}
.cb-row { display: flex; gap: var(--space-3); animation: cbFadeUp var(--duration-slow) var(--ease-out) both; }
.cb-row.user { flex-direction: row-reverse; }
.cb-avatar {
  flex: 0 0 34px; width: 34px; height: 34px; border-radius: var(--radius-full);
  display: flex; align-items: center; justify-content: center;
  background: var(--color-accent-100); color: var(--color-accent-700);
  font-weight: var(--weight-semibold); font-size: var(--text-sm);
}
.cb-avatar.user { background: var(--color-primary-100); color: var(--color-primary-700); }
.cb-bubble {
  max-width: 78%; padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg); font-size: var(--text-sm);
  line-height: var(--leading-relaxed); white-space: pre-wrap; word-break: break-word;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-top-left-radius: var(--radius-sm);
}
.cb-bubble.user {
  background: var(--color-primary-600); color: var(--color-text-on-primary);
  border-color: var(--color-primary-600); border-radius: var(--radius-lg);
  border-top-right-radius: var(--radius-sm);
}
.cb-bubble.error { background: var(--color-danger-bg); border-color: var(--color-danger-border); color: var(--color-danger); }
.cb-time { margin-top: var(--space-1); font-size: var(--text-xs); color: var(--color-text-muted); }
.cb-row.user .cb-time { text-align: right; }
.cb-sources { margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px dashed var(--color-border); }
.cb-sources-title { font-size: var(--text-xs); font-weight: var(--weight-semibold); color: var(--color-text-secondary); margin-bottom: var(--space-2); }
.cb-source-chip {
  display: inline-flex; align-items: center; gap: var(--space-1);
  margin: 0 var(--space-2) var(--space-2) 0; padding: 2px var(--space-2);
  border-radius: var(--radius-full); background: var(--color-info-bg);
  border: 1px solid var(--color-info-border); color: var(--color-info);
  font-size: var(--text-xs); font-weight: var(--weight-medium);
}
.cb-typing { display: inline-flex; gap: 5px; align-items: center; padding: var(--space-1) 0; }
.cb-typing span {
  width: 7px; height: 7px; border-radius: var(--radius-full);
  background: var(--color-gray-400); animation: cbBounce 1s infinite ease-in-out;
}
.cb-typing span:nth-child(2) { animation-delay: 0.15s; }
.cb-typing span:nth-child(3) { animation-delay: 0.3s; }
.cb-chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.cb-chip {
  padding: var(--space-2) var(--space-3); border-radius: var(--radius-full);
  border: 1px solid var(--color-border-strong); background: var(--color-surface);
  font-size: var(--text-sm); color: var(--color-primary-700);
  transition: border-color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out);
}
.cb-chip:hover { border-color: var(--color-primary-400); background: var(--color-primary-50); }
.cb-inputbar {
  display: flex; gap: var(--space-3); align-items: flex-end;
  padding: var(--space-4); border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}
.cb-textarea {
  flex: 1; resize: none; max-height: 120px; padding: var(--space-3);
  border: 1px solid var(--color-border-strong); border-radius: var(--radius-md);
  font-size: var(--text-sm); line-height: var(--leading-normal);
}
.cb-textarea:focus { border-color: var(--color-primary-500); outline: 2px solid var(--color-primary-100); }
.cb-send {
  flex: 0 0 auto; width: 42px; height: 42px; border-radius: var(--radius-md);
  display: flex; align-items: center; justify-content: center;
  background: var(--color-primary-600); color: var(--color-text-on-primary);
  transition: background var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out);
}
.cb-send:hover:not(:disabled) { background: var(--color-primary-700); }
.cb-send:active:not(:disabled) { transform: scale(0.96); }
.cb-send:disabled { opacity: 0.5; cursor: not-allowed; }
.cb-side { flex: 0 0 330px; width: 330px; }
.cb-kb-card {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: var(--space-5);
  animation: cbFadeUp var(--duration-slow) var(--ease-out) both;
}
.cb-kb-title { font-size: var(--text-base); font-weight: var(--weight-semibold); margin-bottom: var(--space-1); }
.cb-field { margin-bottom: var(--space-3); }
.cb-label { display: block; font-size: var(--text-sm); font-weight: var(--weight-medium); margin-bottom: var(--space-1); }
.cb-input {
  width: 100%; padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-strong); border-radius: var(--radius-md); font-size: var(--text-sm);
}
.cb-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-4); border-radius: var(--radius-md);
  background: var(--color-primary-600); color: var(--color-text-on-primary);
  font-size: var(--text-sm); font-weight: var(--weight-medium);
  transition: background var(--duration-fast) var(--ease-out);
}
.cb-btn:hover:not(:disabled) { background: var(--color-primary-700); }
.cb-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.cb-btn.block { width: 100%; }
.cb-doc {
  display: flex; gap: var(--space-3); align-items: flex-start;
  padding: var(--space-3) 0; border-top: 1px solid var(--color-border);
}
.cb-doc:first-of-type { border-top: none; }
.cb-doc-info { flex: 1; min-width: 0; }
.cb-doc-name { font-size: var(--text-sm); font-weight: var(--weight-medium); overflow-wrap: anywhere; }
.cb-doc-meta { font-size: var(--text-xs); color: var(--color-text-muted); margin-top: 2px; }
.cb-badge {
  display: inline-block; padding: 1px var(--space-2); border-radius: var(--radius-full);
  font-size: var(--text-xs); font-weight: var(--weight-medium); border: 1px solid transparent;
}
.cb-badge.ready { background: var(--color-success-bg); color: var(--color-success); border-color: var(--color-success-border); }
.cb-badge.processing { background: var(--color-warning-bg); color: var(--color-warning); border-color: var(--color-warning-border); }
.cb-badge.failed { background: var(--color-danger-bg); color: var(--color-danger); border-color: var(--color-danger-border); }
.cb-icon-btn {
  flex: 0 0 auto; width: 30px; height: 30px; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center; color: var(--color-text-muted);
  transition: color var(--duration-fast), background var(--duration-fast);
}
.cb-icon-btn:hover { color: var(--color-danger); background: var(--color-danger-bg); }
.cb-alert {
  padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
  font-size: var(--text-sm); margin-bottom: var(--space-4); border: 1px solid transparent;
  animation: cbFadeUp var(--duration-base) var(--ease-out) both;
}
.cb-alert.error { background: var(--color-danger-bg); color: var(--color-danger); border-color: var(--color-danger-border); }
.cb-alert.success { background: var(--color-success-bg); color: var(--color-success); border-color: var(--color-success-border); }
.cb-empty { text-align: center; color: var(--color-text-secondary); padding: var(--space-8) var(--space-4); }
@keyframes cbFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes cbBounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.5; } 30% { transform: translateY(-4px); opacity: 1; } }
@media (max-width: 1024px) {
  .cb-layout { flex-direction: column; }
  .cb-side { flex: none; width: 100%; }
  .cb-bubble { max-width: 88%; }
}
`;

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

  return (
    <div>
      <style>{STYLE}</style>
      <h1 className="page-title">Chatbot HR</h1>
      <p className="page-subtitle">
        Hỏi đáp quy chế nội bộ công ty. Chatbot chỉ trả lời dựa trên tài liệu quy chế do HR cung
        cấp và luôn kèm nguồn trích dẫn — nếu tài liệu chưa có thông tin, chatbot sẽ báo rõ thay
        vì tự suy đoán.
      </p>

      <div className="cb-layout" style={{ marginTop: 'var(--space-6)' }}>
        {/* ------------------------------ Khung chat ------------------------------ */}
        <div className="cb-main">
          <div className="cb-card">
            <div className="cb-scroll" ref={scrollRef} aria-live="polite">
              {historyLoading && <div className="cb-empty">Đang tải lịch sử trò chuyện…</div>}

              {!historyLoading && messages.length === 0 && (
                <div className="cb-empty">
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-3)', color: 'var(--color-accent-700)' }}>
                    <IconBot />
                  </div>
                  <p style={{ fontWeight: 'var(--weight-medium)', color: 'var(--color-text)', marginBottom: 'var(--space-2)' }}>
                    Xin chào! Bạn muốn hỏi gì về quy chế công ty?
                  </p>
                  <p style={{ marginBottom: 'var(--space-4)' }}>Thử một câu hỏi mẫu:</p>
                  <div className="cb-chips" style={{ justifyContent: 'center' }}>
                    {SUGGESTIONS.map((s) => (
                      <button key={s} type="button" className="cb-chip" onClick={() => sendQuestion(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="cb-row user">
                    <div className="cb-avatar user" aria-hidden="true">{myInitial}</div>
                    <div>
                      <div className="cb-bubble user">{m.text}</div>
                      <div className="cb-time">{formatTime(m.createdAt)}</div>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="cb-row">
                    <div className="cb-avatar" aria-hidden="true"><IconBot /></div>
                    <div>
                      <div className={`cb-bubble${m.error ? ' error' : ''}`}>
                        {m.typing ? (
                          <span className="cb-typing" role="status" aria-label="Chatbot đang trả lời">
                            <span /><span /><span />
                          </span>
                        ) : (
                          m.text
                        )}
                        {!m.typing && m.sources && m.sources.length > 0 && (
                          <div className="cb-sources">
                            <div className="cb-sources-title">Nguồn trích dẫn</div>
                            {m.sources.map((s) => (
                              <span key={s.key} className="cb-source-chip" title={s.excerpt || undefined}>
                                <IconDoc />
                                {s.title}
                                {s.page != null && s.page !== '' ? ` · trang ${s.page}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {!m.typing && <div className="cb-time">{formatTime(m.createdAt)}</div>}
                    </div>
                  </div>
                ),
              )}
            </div>

            <form
              className="cb-inputbar"
              onSubmit={(e) => {
                e.preventDefault();
                sendQuestion();
              }}
            >
              <label className="sr-only" htmlFor="cb-question">Nhập câu hỏi về quy chế</label>
              <textarea
                id="cb-question"
                className="cb-textarea"
                rows={2}
                placeholder="Nhập câu hỏi về quy chế, nghỉ phép, phúc lợi… (Enter để gửi, Shift+Enter để xuống dòng)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
              />
              <button
                type="submit"
                className="cb-send"
                disabled={sending || !input.trim()}
                aria-label="Gửi câu hỏi"
                title="Gửi câu hỏi"
              >
                <IconSend />
              </button>
            </form>
          </div>
        </div>

        {/* --------------------------- Panel tài liệu KB --------------------------- */}
        {kbVisible && (
          <aside className="cb-side" aria-label="Quản lý tài liệu quy chế">
            <div className="cb-kb-card">
              <div className="cb-kb-title">Tài liệu quy chế (KB)</div>
              <p className="text-sm text-secondary" style={{ marginBottom: 'var(--space-4)' }}>
                Chỉ HR/Admin quản lý khu vực này. Tài liệu tải lên là nguồn duy nhất để chatbot
                trả lời — hãy giữ tài liệu luôn cập nhật.
              </p>

              {kbError && <div className="cb-alert error" role="alert">{kbError}</div>}
              {kbNotice && <div className="cb-alert success" role="status">{kbNotice}</div>}

              <form onSubmit={handleKbUpload}>
                <div className="cb-field">
                  <label className="cb-label" htmlFor="kb-title">Tên tài liệu (không bắt buộc)</label>
                  <input
                    id="kb-title"
                    className="cb-input"
                    type="text"
                    placeholder="VD: Quy chế nghỉ phép 2026"
                    value={kbTitle}
                    onChange={(e) => setKbTitle(e.target.value)}
                  />
                </div>
                <div className="cb-field">
                  <label className="cb-label" htmlFor="kb-file">File tài liệu (PDF/TXT, tối đa {KB_MAX_SIZE_MB} MB)</label>
                  <input
                    id="kb-file"
                    ref={fileInputRef}
                    className="cb-input"
                    type="file"
                    accept=".pdf,.txt,application/pdf,text/plain"
                    onChange={(e) => setKbFile(e.target.files?.[0] || null)}
                  />
                  {kbFile && (
                    <div className="text-xs text-muted" style={{ marginTop: 'var(--space-1)' }}>
                      Đã chọn: {kbFile.name} ({(kbFile.size / 1024).toFixed(0)} KB)
                    </div>
                  )}
                </div>
                <button type="submit" className="cb-btn block" disabled={kbUploading}>
                  {kbUploading ? 'Đang tải lên…' : 'Tải tài liệu lên'}
                </button>
              </form>

              <div style={{ marginTop: 'var(--space-5)' }}>
                <div className="cb-label" style={{ marginBottom: 'var(--space-2)' }}>
                  Tài liệu đã có ({kbDocs.length})
                </div>
                {kbLoading && kbDocs.length === 0 && (
                  <p className="text-sm text-muted">Đang tải danh sách…</p>
                )}
                {!kbLoading && kbDocs.length === 0 && (
                  <p className="text-sm text-muted">
                    Chưa có tài liệu nào. Tải quy chế nội bộ lên để chatbot bắt đầu trả lời được.
                  </p>
                )}
                {kbDocs.map((doc) => (
                  <div key={doc.id} className="cb-doc">
                    <div className="cb-doc-info">
                      <div className="cb-doc-name">{doc.title || 'Tài liệu không tên'}</div>
                      <div className="cb-doc-meta">
                        <span className={`cb-badge ${doc.status || 'processing'}`}>
                          {kbStatusLabel[doc.status] || 'Đang xử lý'}
                        </span>{' '}
                        · {formatDateTime(doc.created_at)}
                      </div>
                      {doc.status === 'failed' && (
                        <div className="text-xs" style={{ color: 'var(--color-danger)', marginTop: 2 }}>
                          Không trích xuất được nội dung — kiểm tra lại file hoặc xoá và tải bản khác.
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="cb-icon-btn"
                      onClick={() => handleKbDelete(doc)}
                      aria-label={`Xoá tài liệu ${doc.title || ''}`}
                      title="Xoá tài liệu"
                    >
                      <IconTrash />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
