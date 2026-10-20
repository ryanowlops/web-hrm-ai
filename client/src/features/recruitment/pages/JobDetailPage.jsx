import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getJob,
  closeJob,
  reopenJob,
  listCandidates,
  getCandidate,
  updateCandidateStatus,
  createCvAnalysis,
  getAiJob,
  getCandidateAnalysis,
  friendlyError,
  isAiUnavailable,
} from '../services';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Select,
  Skeleton,
  Spinner,
  TableSkeleton,
  Textarea,
} from '../../../components/ui';
import { IconFileText, IconSparkles, IconUsers, IconX } from '../../../components/icons.jsx';

/* ------------------------------ Hằng số UI ------------------------------- */

const CANDIDATE_STATUS = {
  new: { label: 'Mới nộp', tone: 'blue' },
  reviewing: { label: 'Đang xem xét', tone: 'amber' },
  interview: { label: 'Mời phỏng vấn', tone: 'violet' },
  passed: { label: 'Đạt', tone: 'green' },
  rejected: { label: 'Đã loại', tone: 'red' },
};

const STATUS_OPTIONS = Object.entries(CANDIDATE_STATUS).map(([value, v]) => ({
  value,
  label: v.label,
}));

const AI_POLL_INTERVAL_MS = 2500;
const AI_BATCH_LIMIT = 20; // khớp giới hạn mặc định phía server (mục A6.1)

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Điểm AI của ứng viên: ưu tiên trường match_score phẳng, sau đó bản phân tích nhúng kèm. */
function getScore(candidate) {
  const s =
    candidate?.match_score ??
    candidate?.latest_analysis?.match_score ??
    candidate?.ai_analysis?.match_score ??
    null;
  return typeof s === 'number' ? s : null;
}

function scoreTone(score) {
  if (score == null) return { text: 'text-slate-400', bar: 'bg-slate-200', ring: '#cbd5e1' };
  if (score >= 75) return { text: 'text-emerald-600', bar: 'bg-emerald-500', ring: '#10b981' };
  if (score >= 50) return { text: 'text-amber-600', bar: 'bg-amber-500', ring: '#f59e0b' };
  return { text: 'text-rose-500', bar: 'bg-rose-500', ring: '#f43f5e' };
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
}

/* ------------------------- Vòng tròn điểm AI (SVG) ------------------------ */

function ScoreRing({ score, size = 76 }) {
  const tone = scoreTone(score);
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = score == null ? 0 : (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone.ring}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-lg font-bold leading-none ${tone.text}`}>{score == null ? '—' : score}</span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">/ 100</span>
      </div>
    </div>
  );
}

function ScoreBar({ score }) {
  const tone = scoreTone(score);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full transition-all duration-700 ${tone.bar}`}
        style={{ width: `${score == null ? 0 : Math.max(0, Math.min(100, score))}%` }}
      />
    </div>
  );
}

function SkillChips({ items, tone }) {
  if (!items?.length) return <p className="text-sm text-slate-400">Không có dữ liệu.</p>;
  const cls =
    tone === 'ok'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
      : 'bg-rose-50 text-rose-600 ring-rose-600/20';
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s, i) => (
        <span key={`${s}-${i}`} className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${cls}`}>
          {s}
        </span>
      ))}
    </div>
  );
}

/* --------------------------- Panel chi tiết UV ---------------------------- */

function CandidateDrawer({
  candidate,
  analysis,
  analysisLoading,
  analysisError,
  onClose,
  onSaved,
}) {
  const [status, setStatus] = useState('new');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    if (candidate) {
      setStatus(candidate.status ?? 'new');
      setNote(candidate.hr_note ?? '');
      setSaveError('');
      setSavedMsg('');
    }
  }, [candidate]);

  if (!candidate) return null;

  const score = analysis?.match_score ?? getScore(candidate);
  const a = analysis ?? candidate.latest_analysis ?? candidate.ai_analysis ?? null;
  const statusMeta = CANDIDATE_STATUS[candidate.status] ?? CANDIDATE_STATUS.new;

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    setSavedMsg('');
    try {
      await updateCandidateStatus(candidate.id, { status, hr_note: note });
      setSavedMsg('Đã lưu quyết định của HR.');
      onSaved?.({ ...candidate, status, hr_note: note });
    } catch (err) {
      setSaveError(friendlyError(err, 'Không lưu được thay đổi.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in justify-end bg-navy-950/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="nice-scroll h-full w-full max-w-xl animate-slide-in overflow-y-auto bg-white shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/95 px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-sm font-bold uppercase text-white shadow-[0_6px_16px_-6px_rgba(39,79,234,.55)]">
              {initials(candidate.full_name)}
            </div>
            <div>
              <h2 className="text-base font-bold tracking-[-0.01em] text-slate-900">{candidate.full_name}</h2>
              <p className="text-xs text-slate-500">Nộp ngày {formatDate(candidate.created_at)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Đóng chi tiết"
          >
            <IconX size={18} />
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          {/* Liên hệ + CV gốc */}
          <section>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
              Thông tin ứng viên
            </h3>
            <div className="space-y-1 text-sm text-slate-700">
              <p>
                <span className="text-slate-400">Email:</span> {candidate.email || '—'}
              </p>
              <p>
                <span className="text-slate-400">Điện thoại:</span> {candidate.phone || '—'}
              </p>
              <p className="flex items-center gap-2">
                <span className="text-slate-400">Trạng thái hiện tại:</span>
                <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
              </p>
            </div>
            {candidate.cv_file_url ? (
              <a
                href={candidate.cv_file_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-spring hover:-translate-y-px hover:bg-navy-800"
              >
                <IconFileText size={16} />
                Xem CV gốc (PDF)
              </a>
            ) : (
              <p className="mt-3 text-sm text-slate-400">Ứng viên chưa có file CV.</p>
            )}
          </section>

          {/* Kết quả AI — khu vực nhấn accent (teal) */}
          <section className="rounded-2xl border border-accent-500/25 bg-accent-50/60 p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2.5 text-sm font-bold text-slate-900">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500 text-white shadow-[0_6px_16px_-6px_rgba(13,183,149,.55)]">
                  <IconSparkles size={17} />
                </span>
                Kết quả AI sàng lọc
              </h3>
              <Badge tone="amber">AI gợi ý — HR quyết định</Badge>
            </div>

            {analysisLoading ? (
              <div className="space-y-3 py-1">
                <div className="flex items-center gap-2.5 text-sm font-medium text-accent-700">
                  <Spinner className="h-5 w-5 text-accent-600" />
                  <span className="animate-pulse-soft">Đang tải kết quả phân tích...</span>
                </div>
                <Skeleton className="h-20 w-full bg-white/70" />
                <Skeleton className="h-4 w-2/3 bg-white/70" />
                <Skeleton className="h-4 w-1/2 bg-white/70" />
              </div>
            ) : analysisError ? (
              <div className="rounded-xl bg-white px-3.5 py-3 text-sm leading-relaxed text-slate-600 ring-1 ring-accent-500/15">
                {analysisError}
              </div>
            ) : !a ? (
              <p className="py-2 text-sm leading-relaxed text-slate-500">
                Ứng viên này chưa được AI phân tích. Đóng panel, chọn ứng viên trong danh sách rồi bấm
                "Phân tích AI" để nhận gợi ý điểm phù hợp, kỹ năng khớp/thiếu và nhận xét.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <ScoreRing score={score} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-700">Mức độ phù hợp với JD</p>
                    <div className="mt-2">
                      <ScoreBar score={score} />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {a.experience_years_estimate != null &&
                        `Kinh nghiệm ước lượng: ~${a.experience_years_estimate} năm · `}
                      {a.education_summary && `Học vấn: ${a.education_summary} · `}
                      Phân tích lúc {formatDateTime(a.created_at)}
                      {a.model_name ? ` · Model: ${a.model_name}` : ''}
                    </p>
                  </div>
                </div>

                {a.summary && (
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                      Tóm tắt nhận xét
                    </p>
                    <p className="text-sm leading-relaxed text-slate-700">{a.summary}</p>
                  </div>
                )}

                <div>
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    Kỹ năng khớp với JD
                  </p>
                  <SkillChips items={a.matched_skills} tone="ok" />
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                    Kỹ năng còn thiếu
                  </p>
                  <SkillChips items={a.missing_skills} tone="miss" />
                </div>

                {a.strengths?.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                      Điểm mạnh
                    </p>
                    <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
                      {a.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {a.concerns?.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                      Điểm cần lưu ý
                    </p>
                    <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
                      {a.concerns.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <Alert tone="warning">
                  Điểm và nhận xét trên do AI gợi ý dựa trên nội dung CV, có thể chưa chính xác. Hãy
                  đọc CV gốc trước khi ra quyết định — trạng thái ứng viên chỉ thay đổi khi HR thao
                  tác ở mục bên dưới.
                </Alert>
              </div>
            )}
          </section>

          {/* Quyết định của HR */}
          <section>
            <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
              Quyết định của HR
            </h3>
            <FormField label="Trạng thái ứng viên">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Ghi chú của HR" className="mt-4">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Ví dụ: CV mạnh về Flask, hẹn phỏng vấn vòng 1 thứ 5 tuần này..."
              />
            </FormField>

            {saveError && (
              <Alert tone="error" className="mt-3">
                {saveError}
              </Alert>
            )}
            {savedMsg && (
              <Alert tone="success" className="mt-3">
                {savedMsg}
              </Alert>
            )}

            <Button
              variant="primary"
              onClick={handleSave}
              loading={saving}
              className="mt-4 w-full"
            >
              {saving ? 'Đang lưu...' : 'Lưu trạng thái & ghi chú'}
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- Page ---------------------------------- */

export default function JobDetailPage() {
  const { jobId } = useParams();

  const [job, setJob] = useState(null);
  const [jobLoading, setJobLoading] = useState(true);
  const [jobError, setJobError] = useState('');
  const [toggling, setToggling] = useState(false);

  const [candidates, setCandidates] = useState([]);
  const [candLoading, setCandLoading] = useState(true);
  const [candError, setCandError] = useState('');

  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('match_score');
  const [selected, setSelected] = useState(() => new Set());

  // Trạng thái job AI đang chạy (polling)
  const [aiJob, setAiJob] = useState(null); // { id, status, processed, total }
  const [aiBanner, setAiBanner] = useState(null); // { type: 'success'|'error', text }
  const pollRef = useRef(null);
  const aiRunning = aiJob && ['pending', 'processing', 'running', 'queued'].includes(aiJob.status);

  // Drawer chi tiết ứng viên
  const [drawerCandidate, setDrawerCandidate] = useState(null);
  const [drawerAnalysis, setDrawerAnalysis] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState('');

  const loadJob = useCallback(async () => {
    setJobLoading(true);
    setJobError('');
    try {
      setJob(await getJob(jobId));
    } catch (err) {
      setJobError(friendlyError(err, 'Không tải được thông tin vị trí tuyển dụng.'));
    } finally {
      setJobLoading(false);
    }
  }, [jobId]);

  const loadCandidates = useCallback(async () => {
    setCandLoading(true);
    setCandError('');
    try {
      const res = await listCandidates({
        job_id: jobId,
        status: statusFilter || undefined,
        sortBy,
        sortOrder: 'desc',
        page: 1,
        limit: 100,
      });
      const list = Array.isArray(res) ? res : res?.data ?? [];
      // Dự phòng: nếu backend chưa sắp xếp theo điểm AI thì FE xếp lại phía client.
      if (sortBy === 'match_score') {
        list.sort((x, y) => (getScore(y) ?? -1) - (getScore(x) ?? -1));
      }
      setCandidates(list);
    } catch (err) {
      setCandError(friendlyError(err, 'Không tải được danh sách ứng viên.'));
    } finally {
      setCandLoading(false);
    }
  }, [jobId, statusFilter, sortBy]);

  useEffect(() => {
    loadJob();
  }, [loadJob]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  /* ------------------------------ Polling AI ------------------------------ */

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const finishAiJob = useCallback(
    (finalJob) => {
      stopPolling();
      if (finalJob.status === 'done' || finalJob.status === 'completed') {
        setAiBanner({
          type: 'success',
          text: `AI đã phân tích xong ${finalJob.processed ?? finalJob.total ?? ''} CV. Danh sách đã được cập nhật và sắp xếp theo điểm phù hợp — nhớ đọc CV gốc trước khi quyết định nhé.`,
        });
        setSelected(new Set());
        loadCandidates();
      } else {
        setAiBanner({
          type: 'error',
          text:
            finalJob.error_message ||
            finalJob.message ||
            'AI phân tích không thành công. Bạn vẫn có thể xem CV gốc và chấm thủ công, hoặc thử phân tích lại sau.',
        });
      }
      setAiJob(null);
    },
    [loadCandidates, stopPolling],
  );

  const startPolling = useCallback(
    (aiJobId) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const current = await getAiJob(aiJobId);
          const status = current?.status ?? 'processing';
          if (['done', 'completed', 'failed', 'error'].includes(status)) {
            finishAiJob({ ...current, status });
          } else {
            setAiJob({
              id: aiJobId,
              status,
              processed: current?.processed ?? current?.done_count ?? 0,
              total: current?.total ?? current?.total_count ?? 0,
            });
          }
        } catch (err) {
          stopPolling();
          setAiJob(null);
          setAiBanner({
            type: 'error',
            text: friendlyError(err, 'Mất kết nối khi theo dõi tiến trình phân tích AI. Hãy tải lại danh sách để xem kết quả mới nhất.'),
          });
        }
      }, AI_POLL_INTERVAL_MS);
    },
    [finishAiJob, stopPolling],
  );

  const handleAnalyze = async () => {
    const ids = [...selected];
    if (ids.length === 0 || aiRunning) return;
    if (ids.length > AI_BATCH_LIMIT) {
      setAiBanner({
        type: 'error',
        text: `Mỗi lượt chỉ phân tích tối đa ${AI_BATCH_LIMIT} CV. Bạn đang chọn ${ids.length} ứng viên — hãy bỏ bớt rồi thử lại.`,
      });
      return;
    }
    setAiBanner(null);
    try {
      const created = await createCvAnalysis({ jobId, candidateIds: ids });
      const aiJobId = created?.job_id ?? created?.id ?? created?.ai_job_id;
      if (!aiJobId) throw new Error('NO_AI_JOB_ID');
      setAiJob({ id: aiJobId, status: created?.status ?? 'pending', processed: 0, total: ids.length });
      startPolling(aiJobId);
    } catch (err) {
      setAiBanner({
        type: 'error',
        text: isAiUnavailable(err)
          ? friendlyError(err)
          : friendlyError(err, 'Không khởi động được phân tích AI. Vui lòng thử lại sau.'),
      });
    }
  };

  /* ------------------------------ Thao tác khác ---------------------------- */

  const handleToggleJobStatus = async () => {
    if (!job) return;
    setToggling(true);
    try {
      const updated = job.status === 'open' ? await closeJob(job.id) : await reopenJob(job.id);
      setJob((prev) => ({ ...prev, ...(updated && typeof updated === 'object' ? updated : {}), status: job.status === 'open' ? 'closed' : 'open' }));
    } catch (err) {
      setAiBanner({ type: 'error', text: friendlyError(err, 'Không đổi được trạng thái tin tuyển dụng.') });
    } finally {
      setToggling(false);
    }
  };

  const openDrawer = async (candidate) => {
    setDrawerCandidate(candidate);
    setDrawerAnalysis(null);
    setDrawerError('');
    setDrawerLoading(true);
    try {
      const [fresh, analysis] = await Promise.allSettled([
        getCandidate(candidate.id),
        getCandidateAnalysis(candidate.id),
      ]);
      if (fresh.status === 'fulfilled' && fresh.value) setDrawerCandidate(fresh.value);
      if (analysis.status === 'fulfilled') {
        setDrawerAnalysis(analysis.value?.data ?? analysis.value ?? null);
      } else if (analysis.reason?.response?.status === 503 || isAiUnavailable(analysis.reason)) {
        setDrawerError(
          'Chưa xem được kết quả AI: tính năng AI chưa được cấu hình trên máy chủ. Bạn vẫn xem được CV gốc và chấm thủ công.',
        );
      }
      // 404 = chưa phân tích -> để trống, drawer hiển thị hướng dẫn (không phải lỗi)
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleCandidateSaved = (updated) => {
    setDrawerCandidate(updated);
    setCandidates((list) => list.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
  };

  /* -------------------------------- Chọn nhiều ----------------------------- */

  const allSelected = candidates.length > 0 && candidates.every((c) => selected.has(c.id));
  const toggleOne = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) => {
      if (candidates.every((c) => prev.has(c.id))) return new Set();
      return new Set(candidates.map((c) => c.id));
    });

  const counts = useMemo(() => {
    const map = { all: candidates.length };
    for (const c of candidates) map[c.status] = (map[c.status] ?? 0) + 1;
    return map;
  }, [candidates]);

  /* --------------------------------- Render -------------------------------- */

  if (jobLoading) {
    return (
      <div className="page-shell">
        <Skeleton className="h-5 w-44" />
        <Card className="mt-4 p-6">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="mt-3 h-4 w-1/3" />
          <Skeleton className="mt-6 h-3.5 w-full" />
          <Skeleton className="mt-2 h-3.5 w-5/6" />
          <Skeleton className="mt-2 h-3.5 w-2/3" />
        </Card>
        <Card className="mt-5">
          <TableSkeleton rows={4} cols={4} />
        </Card>
      </div>
    );
  }

  if (jobError || !job) {
    return (
      <div className="page-shell">
        <div className="max-w-3xl">
          <Link
            to="/recruitment"
            className="text-sm font-semibold text-brand-700 transition hover:text-brand-600 hover:underline"
          >
            ← Quay lại danh sách tuyển dụng
          </Link>
          <Alert tone="error" className="mt-4">
            {jobError || 'Không tìm thấy vị trí tuyển dụng này.'}
          </Alert>
        </div>
      </div>
    );
  }

  const aiProgress =
    aiJob?.total > 0 ? Math.round(((aiJob.processed ?? 0) / aiJob.total) * 100) : 0;

  return (
    <div className="page-shell">
      <Link
        to="/recruitment"
        className="text-sm font-semibold text-brand-700 transition hover:text-brand-600 hover:underline"
      >
        ← Quay lại danh sách tuyển dụng
      </Link>

      {/* -------- Thông tin JD -------- */}
      <Card className="mt-3">
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-slate-900">
                  {job.title}
                </h1>
                {job.status === 'open' ? (
                  <Badge tone="green" dot>
                    Đang tuyển
                  </Badge>
                ) : (
                  <Badge tone="slate" dot>
                    Đã đóng
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {(job.department_name ?? job.department?.name) && `${job.department_name ?? job.department.name} · `}
                Tuyển {job.quantity ?? 1} người · Hạn nộp: {formatDate(job.deadline)} ·{' '}
                {candidates.length} ứng viên
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleToggleJobStatus}
              loading={toggling}
              className="shrink-0"
            >
              {toggling ? 'Đang xử lý...' : job.status === 'open' ? 'Đóng tin' : 'Mở lại tin'}
            </Button>
          </div>

          {job.description && (
            <div className="mt-6">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                Mô tả công việc
              </h2>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                {job.description}
              </p>
            </div>
          )}
          {job.requirements && (
            <div className="mt-5 rounded-xl border border-accent-500/20 bg-accent-50/50 px-4 py-3.5">
              <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-accent-700">
                <IconSparkles size={14} />
                Yêu cầu ứng viên{' '}
                <span className="font-semibold normal-case tracking-normal text-slate-400">
                  (chuẩn để AI đối chiếu CV)
                </span>
              </h2>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                {job.requirements}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* -------- Banner kết quả AI / lỗi -------- */}
      {aiBanner && (
        <div className="relative mt-4 animate-scale-in">
          <Alert tone={aiBanner.type === 'success' ? 'success' : 'error'} className="pr-10 shadow-card">
            {aiBanner.text}
          </Alert>
          <button
            onClick={() => setAiBanner(null)}
            className="absolute right-3 top-3 rounded-md p-1 text-current opacity-60 transition hover:bg-black/5 hover:opacity-100"
            aria-label="Đóng thông báo"
          >
            <IconX size={15} />
          </button>
        </div>
      )}

      {/* -------- Thanh tiến trình khi AI đang chạy -------- */}
      {aiRunning && (
        <div className="mt-4 animate-fade-in rounded-2xl border border-accent-500/30 bg-accent-50 px-5 py-4 shadow-card">
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 animate-pulse-soft items-center justify-center rounded-xl bg-accent-500 text-white shadow-[0_6px_16px_-6px_rgba(13,183,149,.55)]">
              <IconSparkles size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  AI đang phân tích CV... {aiJob.processed ?? 0}/{aiJob.total ?? '?'} ứng viên
                </p>
                <span className="animate-pulse-soft text-sm font-bold text-accent-700">
                  {aiProgress}%
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Quá trình chạy nền — bạn cứ để trang này mở, danh sách sẽ tự cập nhật khi phân tích
                xong. Có thể mất vài chục giây mỗi CV.
              </p>
              <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-accent-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent-400 to-accent-600 transition-all duration-500"
                  style={{ width: `${Math.max(aiProgress, 6)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------- Toolbar ứng viên -------- */}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-[-0.01em] text-slate-900">
          Ứng viên <span className="text-sm font-medium text-slate-400">({counts.all})</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="text-sm text-slate-500" htmlFor="sortBy">
            Sắp xếp:
          </label>
          <Select
            id="sortBy"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="w-52"
          >
            <option value="match_score">Điểm AI cao → thấp</option>
            <option value="created_at">Mới nộp nhất</option>
            <option value="full_name">Tên A → Z</option>
          </Select>
          <Button
            variant="accent"
            onClick={handleAnalyze}
            disabled={selected.size === 0}
            loading={aiRunning}
          >
            <IconSparkles size={17} />
            {aiRunning
              ? 'AI đang chạy...'
              : `Phân tích AI${selected.size > 0 ? ` (${selected.size} đã chọn)` : ''}`}
          </Button>
        </div>
      </div>

      {/* Lọc theo trạng thái */}
      <div className="mt-3.5 flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter('')}
          className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ring-1 ring-inset transition-all duration-200 ease-spring ${
            statusFilter === ''
              ? 'bg-navy-900 text-white ring-navy-900 shadow-sm'
              : 'bg-white text-slate-600 ring-slate-300 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          Tất cả ({counts.all})
        </button>
        {STATUS_OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => setStatusFilter(o.value)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ring-1 ring-inset transition-all duration-200 ease-spring ${
              statusFilter === o.value
                ? 'bg-navy-900 text-white ring-navy-900 shadow-sm'
                : 'bg-white text-slate-600 ring-slate-300 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {o.label} ({counts[o.value] ?? 0})
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-400">
        Chọn 1 hoặc nhiều ứng viên rồi bấm "Phân tích AI" (tối đa {AI_BATCH_LIMIT} CV/lượt). Điểm AI
        chỉ là gợi ý tham khảo — HR là người ra quyết định cuối cùng.
      </p>

      {/* -------- Danh sách ứng viên -------- */}
      {candError && (
        <Alert tone="error" className="mt-4">
          {candError}
        </Alert>
      )}

      {candLoading ? (
        <Card className="mt-4">
          <TableSkeleton rows={4} cols={4} />
        </Card>
      ) : candidates.length === 0 ? (
        <Card className="mt-4 animate-fade-in">
          <EmptyState
            icon={<IconUsers size={26} />}
            title={statusFilter ? 'Không có ứng viên nào ở trạng thái này' : 'Chưa có ứng viên nào nộp CV'}
            description="Ứng viên nộp CV qua trang tuyển dụng công khai sẽ xuất hiện tại đây. Khi có CV, hãy chọn ứng viên và dùng AI sàng lọc để được gợi ý mức độ phù hợp với JD."
          />
        </Card>
      ) : (
        <Card className="mt-4 animate-fade-in overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 rounded border-slate-300 accent-brand-600"
              aria-label="Chọn tất cả ứng viên"
            />
            <span className="text-[13px] font-medium text-slate-500">
              {selected.size > 0 ? `Đã chọn ${selected.size} ứng viên` : 'Chọn ứng viên để phân tích AI'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="ui-table min-w-[780px]">
              <thead>
                <tr>
                  <th className="ui-th w-10">
                    <span className="sr-only">Chọn</span>
                  </th>
                  <th className="ui-th">Ứng viên</th>
                  <th className="ui-th w-52">Điểm AI</th>
                  <th className="ui-th w-40">Trạng thái</th>
                  <th className="ui-th w-24 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const score = getScore(c);
                  const tone = scoreTone(score);
                  const st = CANDIDATE_STATUS[c.status] ?? CANDIDATE_STATUS.new;
                  return (
                    <tr key={c.id} className={`ui-tr ${selected.has(c.id) ? 'bg-accent-50/60' : ''}`}>
                      <td className="ui-td">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggleOne(c.id)}
                          className="h-4 w-4 rounded border-slate-300 accent-brand-600"
                          aria-label={`Chọn ${c.full_name}`}
                        />
                      </td>
                      <td className="ui-td">
                        <button
                          onClick={() => openDrawer(c)}
                          className="flex min-w-0 items-center gap-3 text-left"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold uppercase text-white shadow-[0_4px_12px_-4px_rgba(39,79,234,.5)]">
                            {initials(c.full_name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-900">
                              {c.full_name}
                            </span>
                            <span className="block truncate text-xs text-slate-500">
                              {c.email || '—'}
                              {c.phone ? ` · ${c.phone}` : ''} · Nộp {formatDate(c.created_at)}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="ui-td">
                        {score != null ? (
                          <div className="flex items-center gap-2.5" title="Điểm phù hợp do AI gợi ý">
                            <span className="w-20 shrink-0">
                              <ScoreBar score={score} />
                            </span>
                            <span className={`text-sm font-bold ${tone.text}`}>{score}</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              AI
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs italic text-slate-400">Chưa phân tích</span>
                        )}
                      </td>
                      <td className="ui-td">
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td className="ui-td text-right">
                        <Button variant="ghost" size="sm" onClick={() => openDrawer(c)}>
                          Chi tiết
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* -------- Drawer chi tiết -------- */}
      {drawerCandidate && (
        <CandidateDrawer
          candidate={drawerCandidate}
          analysis={drawerAnalysis}
          analysisLoading={drawerLoading}
          analysisError={drawerError}
          onClose={() => setDrawerCandidate(null)}
          onSaved={handleCandidateSaved}
        />
      )}
    </div>
  );
}
