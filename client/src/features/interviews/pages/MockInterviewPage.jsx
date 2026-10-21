import { useCallback, useEffect, useRef, useState } from 'react';
import {
  answerInterview,
  finishInterview,
  friendlyError,
  getInterview,
  getMyInterviews,
  listOpenJobs,
  startInterview,
} from '../services';
import { getAccessToken } from '../../../api/axiosClient';
import {
  Alert,
  Badge,
  Button,
  Card,
  FormField,
  Input,
  Select,
  Skeleton,
  Textarea,
} from '../../../components/ui';

/**
 * Trang PHỎNG VẤN THỬ VỚI AI — CÔNG KHAI (route /mock-interview, ngoài
 * AppLayout; parent đăng ký cạnh route /jobs).
 *
 * Luồng 3 màn:
 *  1) Mở đầu: chọn vị trí đang tuyển (API jobs công khai); khách nhập
 *     thêm họ tên + email, user đã đăng nhập bỏ qua. Có ?job=<id> thì
 *     chọn sẵn vị trí.
 *  2) Phỏng vấn: bong bóng câu hỏi của "Phỏng vấn viên AI", trả lời
 *     từng câu trong 5 câu, tiến độ Câu x/5, kết thúc sớm vẫn chấm.
 *  3) Báo cáo: điểm tổng /100 (vòng tròn), điểm + nhận xét từng câu,
 *     điểm mạnh / cần cải thiện, nhãn nguồn chấm (AI | tham khảo).
 *
 * Phiên khách được giữ bằng access_token (sessionStorage) để tải lại
 * trang vẫn tiếp tục được đúng phiên của mình.
 */

const STORAGE_KEY = 'hrm_mock_interview';

function loadStoredSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeSession(id, token) {
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id, token: token || null }));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage không khả dụng (private mode...) — bỏ qua, phiên
    // vẫn chạy trong bộ nhớ trang.
  }
}

function departmentName(job) {
  return job?.department?.name || job?.department_name || 'Chưa rõ phòng ban';
}

function ScoreRing({ score }) {
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const tone = value >= 70 ? '#059669' : value >= 45 ? '#d97706' : '#e11d48';
  return (
    <div className="relative h-36 w-36" role="img" aria-label={`Điểm tổng ${value} trên 100`}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-semibold text-gray-900">{Math.round(value)}</span>
        <span className="text-xs font-medium text-gray-400">/ 100 điểm</span>
      </div>
    </div>
  );
}

function InterviewerBubble({ children }) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white"
      >
        AI
      </span>
      <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-gray-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-gray-800 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
        {children}
      </div>
    </div>
  );
}

function AnswerBubble({ children }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-brand-600 px-4 py-3 text-[15px] leading-relaxed text-white">
        {children}
      </div>
    </div>
  );
}

export default function MockInterviewPage() {
  const isLoggedIn = Boolean(getAccessToken());
  const [phase, setPhase] = useState('setup'); // setup | interview | report
  const [pageError, setPageError] = useState('');

  /* ------------------------------ Màn mở đầu ------------------------------ */
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobId, setJobId] = useState('');
  const [guest, setGuest] = useState({ name: '', email: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [starting, setStarting] = useState(false);
  const [mySessions, setMySessions] = useState([]);

  /* ------------------------------ Màn phỏng vấn ---------------------------- */
  const [sessionId, setSessionId] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [jobInfo, setJobInfo] = useState(null);
  const [totalQuestions, setTotalQuestions] = useState(5);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [transcript, setTranscript] = useState([]); // [{question, answer}]
  const [draft, setDraft] = useState('');
  const [answering, setAnswering] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [resumed, setResumed] = useState(false);
  const transcriptEndRef = useRef(null);

  /* ------------------------------- Màn báo cáo ----------------------------- */
  const [report, setReport] = useState(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }, []);

  /* --------------------------- Tải vị trí + khôi phục ---------------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { items } = await listOpenJobs({ page: 1, limit: 100 });
        if (cancelled) return;
        setJobs(items);
        const wanted = new URLSearchParams(window.location.search).get('job');
        const wantedId = wanted ? Number(wanted) : null;
        if (wantedId && items.some((j) => j.id === wantedId)) setJobId(String(wantedId));
        else if (items.length > 0) setJobId(String(items[0].id));
      } catch (err) {
        if (!cancelled) {
          setPageError(friendlyError(err, 'Không tải được danh sách vị trí tuyển dụng.'));
        }
      } finally {
        if (!cancelled) setJobsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const items = await getMyInterviews();
        if (!cancelled) setMySessions(items);
      } catch {
        // Không lấy được lịch sử thì ẩn khu vực này, không chặn luồng chính.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const applyReport = useCallback((data) => {
    setReport(data);
    setPhase('report');
    storeSession(null);
  }, []);

  // Khôi phục phiên đang dở (tải lại trang) từ sessionStorage.
  useEffect(() => {
    const stored = loadStoredSession();
    if (!stored?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getInterview(stored.id, stored.token);
        if (cancelled) return;
        setSessionId(data.id);
        setSessionToken(stored.token);
        setJobInfo(data.job);
        setTotalQuestions(data.total_questions || 5);
        if (data.status === 'finished') {
          applyReport(data);
        } else {
          setAnsweredCount(data.answered_count || 0);
          setCurrentQuestion(data.current_question || null);
          setResumed(true);
          setPhase('interview');
        }
      } catch {
        storeSession(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === 'interview') scrollToEnd();
  }, [phase, transcript, currentQuestion, scrollToEnd]);

  /* --------------------------------- Bắt đầu ------------------------------- */
  function validateSetup() {
    const errors = {};
    if (!jobId) errors.job = 'Vui lòng chọn vị trí muốn luyện phỏng vấn.';
    if (!isLoggedIn) {
      if (guest.name.trim().length < 2) errors.name = 'Vui lòng nhập họ tên của bạn.';
      const email = guest.email.trim();
      if (!email) errors.email = 'Vui lòng nhập email liên hệ.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Email chưa đúng định dạng.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleStart(e) {
    e.preventDefault();
    setPageError('');
    if (!validateSetup()) return;
    setStarting(true);
    try {
      const data = await startInterview({
        jobId: Number(jobId),
        guestName: isLoggedIn ? undefined : guest.name.trim(),
        guestEmail: isLoggedIn ? undefined : guest.email.trim(),
      });
      setSessionId(data.session_id);
      setSessionToken(data.access_token || null);
      setJobInfo(data.job);
      setTotalQuestions(data.total_questions || 5);
      setCurrentQuestion(data.first_question || null);
      setAnsweredCount(0);
      setTranscript([]);
      setDraft('');
      setResumed(false);
      storeSession(data.session_id, data.access_token || null);
      setPhase('interview');
    } catch (err) {
      setPageError(friendlyError(err, 'Không bắt đầu được buổi phỏng vấn, vui lòng thử lại.'));
    } finally {
      setStarting(false);
    }
  }

  /* ------------------------------- Trả lời -------------------------------- */
  async function handleAnswer(e) {
    e.preventDefault();
    const answer = draft.trim();
    if (!answer || !sessionId || answering) return;
    setAnswering(true);
    setPageError('');
    try {
      const asked = currentQuestion;
      const data = await answerInterview(sessionId, answer, sessionToken);
      setTranscript((prev) => [...prev, { question: asked?.question, answer }]);
      setDraft('');
      setAnsweredCount(data.answered_count ?? answeredCount + 1);
      if (data.done) {
        await handleFinish(true);
      } else {
        setCurrentQuestion(data.next_question || null);
      }
    } catch (err) {
      setPageError(friendlyError(err, 'Không gửi được câu trả lời, vui lòng thử lại.'));
    } finally {
      setAnswering(false);
    }
  }

  async function handleFinish(fromAuto = false) {
    if (!sessionId || finishing) return;
    setFinishing(true);
    setPageError('');
    try {
      const data = await finishInterview(sessionId, sessionToken);
      applyReport(data);
    } catch (err) {
      if (!fromAuto) {
        setPageError(friendlyError(err, 'Chưa kết thúc được buổi phỏng vấn, vui lòng thử lại.'));
      }
    } finally {
      setFinishing(false);
    }
  }

  function resetAll() {
    storeSession(null);
    setReport(null);
    setSessionId(null);
    setSessionToken(null);
    setCurrentQuestion(null);
    setTranscript([]);
    setAnsweredCount(0);
    setDraft('');
    setPhase('setup');
  }

  const progressPct = totalQuestions
    ? Math.round((answeredCount / totalQuestions) * 100)
    : 0;
  const summary = report?.summary || {};
  const isAiScored = summary.source === 'ai';

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800 antialiased">
      {/* ------------------------------- Header ------------------------------- */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white"
            >
              H
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-gray-900">
              HRM AI <span className="font-normal text-gray-400">· Phỏng vấn thử với AI</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/jobs"
              className="inline-flex h-9 items-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Vị trí đang tuyển
            </a>
            {!isLoggedIn && (
              <a
                href="/login"
                className="hidden h-9 items-center rounded-lg bg-brand-600 px-3 text-sm font-medium text-white transition hover:bg-brand-700 sm:inline-flex"
              >
                Đăng nhập nội bộ
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[860px] px-5 py-8 lg:py-10">
        {pageError && phase !== 'interview' && (
          <Alert tone="error" className="mb-6">
            {pageError}
          </Alert>
        )}

        {/* ============================ MÀN MỞ ĐẦU ============================ */}
        {phase === 'setup' && (
          <>
            <h1 className="text-[28px] font-semibold leading-[1.25] tracking-[-0.01em] text-gray-900">
              Luyện phỏng vấn cùng AI
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-gray-500">
              Chọn một vị trí đang tuyển — phỏng vấn viên AI sẽ đặt 5 câu hỏi dựa trên đúng mô
              tả công việc của vị trí đó, nghe bạn trả lời và chấm điểm, nhận xét từng câu ở
              cuối buổi. Đây là buổi luyện tập, kết quả chỉ mình bạn xem được.
            </p>

            <Card className="mt-6 p-5 sm:p-6">
              {jobsLoading ? (
                <div className="space-y-4" aria-label="Đang tải danh sách vị trí">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-11 w-40" />
                </div>
              ) : jobs.length === 0 ? (
                <p className="text-sm leading-relaxed text-gray-500">
                  Hiện chưa có vị trí nào đang tuyển để luyện phỏng vấn. Vui lòng quay lại sau.
                </p>
              ) : (
                <form onSubmit={handleStart} noValidate className="space-y-4">
                  <FormField label="Vị trí muốn luyện phỏng vấn" error={fieldErrors.job}>
                    <Select
                      id="mi-job"
                      value={jobId}
                      onChange={(e) => setJobId(e.target.value)}
                    >
                      {jobs.map((job) => (
                        <option key={job.id} value={job.id}>
                          {job.title} — {departmentName(job)}
                        </option>
                      ))}
                    </Select>
                  </FormField>

                  {!isLoggedIn && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        label={<>Họ và tên <span className="text-rose-500">*</span></>}
                        error={fieldErrors.name}
                      >
                        <Input
                          id="mi-name"
                          type="text"
                          autoComplete="name"
                          placeholder="VD: Nguyễn Văn A"
                          value={guest.name}
                          onChange={(e) => setGuest((g) => ({ ...g, name: e.target.value }))}
                        />
                      </FormField>
                      <FormField
                        label={<>Email liên hệ <span className="text-rose-500">*</span></>}
                        error={fieldErrors.email}
                      >
                        <Input
                          id="mi-email"
                          type="email"
                          autoComplete="email"
                          placeholder="VD: ten.ban@email.com"
                          value={guest.email}
                          onChange={(e) => setGuest((g) => ({ ...g, email: e.target.value }))}
                        />
                      </FormField>
                    </div>
                  )}

                  {isLoggedIn && (
                    <p className="rounded-lg bg-brand-50 px-3.5 py-2.5 text-sm text-brand-800">
                      Bạn đang đăng nhập — buổi phỏng vấn sẽ được lưu vào lịch sử của bạn.
                    </p>
                  )}

                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    loading={starting}
                    disabled={starting}
                    className="w-full sm:w-auto"
                  >
                    {starting ? 'Đang chuẩn bị câu hỏi…' : 'Bắt đầu phỏng vấn thử'}
                  </Button>
                  <p className="text-xs leading-relaxed text-gray-400">
                    5 câu hỏi · trả lời bằng văn bản · nhận báo cáo điểm ngay khi kết thúc.
                  </p>
                </form>
              )}
            </Card>

            {isLoggedIn && mySessions.length > 0 && (
              <Card className="mt-6 p-5 sm:p-6">
                <h2 className="text-[15px] font-semibold text-gray-900">
                  Các buổi phỏng vấn gần đây của bạn
                </h2>
                <ul className="mt-3 divide-y divide-gray-100">
                  {mySessions.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-800">
                          {s.job?.title || 'Vị trí đã xoá'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {s.created_at
                            ? new Date(s.created_at).toLocaleString('vi-VN')
                            : ''}
                        </p>
                      </div>
                      {s.status === 'finished' ? (
                        <Badge tone="green">{Math.round(s.overall_score ?? 0)}/100 điểm</Badge>
                      ) : (
                        <Badge tone="amber">Đang dở {s.answered_count}/{s.total_questions} câu</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}

        {/* =========================== MÀN PHỎNG VẤN ========================== */}
        {phase === 'interview' && (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-gray-900">
                  Phỏng vấn vị trí {jobInfo?.title || ''}
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  {resumed ? 'Tiếp tục buổi phỏng vấn đang dở của bạn. ' : ''}
                  Trả lời thật như khi phỏng vấn — càng cụ thể, nhận xét càng sát.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                loading={finishing}
                disabled={finishing}
                onClick={() => handleFinish(false)}
              >
                Kết thúc & xem kết quả
              </Button>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between text-[13px] font-medium text-gray-500">
                <span>
                  Câu {Math.min(answeredCount + 1, totalQuestions)}/{totalQuestions}
                </span>
                <span>{answeredCount} đã trả lời</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {pageError && (
              <Alert tone="error" className="mt-5">
                {pageError}
              </Alert>
            )}

            <div className="mt-6 space-y-5">
              <InterviewerBubble>
                Chào bạn, mình là phỏng vấn viên AI. Buổi luyện tập gồm {totalQuestions} câu
                hỏi cho vị trí <strong>{jobInfo?.title || ''}</strong>. Bạn cứ trả lời tự
                nhiên nhé — bắt đầu thôi!
              </InterviewerBubble>

              {transcript.map((turn, idx) => (
                <div key={idx} className="space-y-5">
                  {turn.question && <InterviewerBubble>{turn.question}</InterviewerBubble>}
                  <AnswerBubble>{turn.answer}</AnswerBubble>
                </div>
              ))}

              {currentQuestion && (
                <InterviewerBubble>
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-600">
                    Câu {currentQuestion.order_no}/{totalQuestions}
                  </span>
                  {currentQuestion.question}
                </InterviewerBubble>
              )}
              <div ref={transcriptEndRef} />
            </div>

            {currentQuestion ? (
              <form onSubmit={handleAnswer} className="mt-6">
                <Card className="p-4 sm:p-5">
                  <FormField label="Câu trả lời của bạn">
                    <Textarea
                      id="mi-answer"
                      rows={5}
                      placeholder="Nhập câu trả lời của bạn… (nên có ví dụ thực tế và nhắc tới các kỹ năng chính của vị trí)"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      maxLength={5000}
                    />
                  </FormField>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-400">{draft.length}/5000 ký tự</span>
                    <Button
                      type="submit"
                      variant="primary"
                      loading={answering}
                      disabled={answering || !draft.trim()}
                    >
                      {answering
                        ? 'Đang gửi…'
                        : answeredCount + 1 >= totalQuestions
                          ? 'Trả lời & kết thúc'
                          : 'Trả lời & tiếp tục'}
                    </Button>
                  </div>
                </Card>
              </form>
            ) : (
              <Card className="mt-6 p-6 text-center">
                <p className="text-sm text-gray-500">
                  Bạn đã trả lời hết các câu hỏi. Bấm nút bên dưới để nhận báo cáo điểm.
                </p>
                <Button
                  type="button"
                  variant="primary"
                  className="mt-4"
                  loading={finishing}
                  disabled={finishing}
                  onClick={() => handleFinish(false)}
                >
                  Xem kết quả phỏng vấn
                </Button>
              </Card>
            )}
          </>
        )}

        {/* ============================ MÀN BÁO CÁO ============================ */}
        {phase === 'report' && report && (
          <>
            <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-gray-900">
              Báo cáo buổi phỏng vấn thử
            </h1>
            <p className="mt-2 text-[15px] text-gray-500">
              Vị trí: <strong className="text-gray-700">{report.job?.title || ''}</strong>
            </p>

            <Card className="mt-6 p-6">
              <div className="flex flex-col items-center gap-6 sm:flex-row">
                <ScoreRing score={report.overall_score} />
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <Badge tone={isAiScored ? 'green' : 'gray'} dot>
                    {isAiScored ? 'Chấm bởi AI' : 'Điểm tham khảo — chấm tự động theo từ khoá'}
                  </Badge>
                  {summary.verdict && (
                    <p className="mt-3 text-[15px] leading-relaxed text-gray-700">
                      {summary.verdict}
                    </p>
                  )}
                  {!isAiScored && (
                    <p className="mt-2 text-[13px] leading-relaxed text-gray-400">
                      Hệ thống AI đang bận nên điểm lần này được tính theo độ dài và mức độ
                      bao quát ý chính của từng câu trả lời — mang tính tham khảo để bạn tự
                      luyện tập.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <h3 className="text-sm font-semibold text-emerald-900">Điểm mạnh</h3>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-emerald-900/90">
                    {(summary.strengths || []).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                    {(!summary.strengths || summary.strengths.length === 0) && (
                      <li>Chưa ghi nhận điểm mạnh nổi bật trong buổi này.</li>
                    )}
                  </ul>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                  <h3 className="text-sm font-semibold text-amber-900">Cần cải thiện</h3>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-amber-900/90">
                    {(summary.improvements || []).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                    {(!summary.improvements || summary.improvements.length === 0) && (
                      <li>Không có điểm yếu đáng kể — hãy tiếp tục phát huy.</li>
                    )}
                  </ul>
                </div>
              </div>
            </Card>

            <h2 className="mt-8 text-lg font-semibold text-gray-900">Chi tiết từng câu hỏi</h2>
            <div className="mt-4 space-y-4">
              {(report.questions || []).map((qa) => (
                <Card key={qa.order_no} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[15px] font-medium leading-relaxed text-gray-900">
                      <span className="mr-2 text-sm font-semibold text-brand-600">
                        Câu {qa.order_no}
                      </span>
                      {qa.question}
                    </p>
                    <Badge
                      tone={
                        qa.score == null
                          ? 'gray'
                          : qa.score >= 7
                            ? 'green'
                            : qa.score >= 4
                              ? 'amber'
                              : 'red'
                      }
                      className="shrink-0"
                    >
                      {qa.score == null ? '—' : `${qa.score}/10`}
                    </Badge>
                  </div>
                  <div className="mt-3 rounded-lg bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-600">
                    {qa.answer ? (
                      <span className="whitespace-pre-wrap">{qa.answer}</span>
                    ) : (
                      <span className="italic text-gray-400">Chưa trả lời câu này.</span>
                    )}
                  </div>
                  {qa.comment && (
                    <p className="mt-3 text-sm leading-relaxed text-gray-500">
                      <span className="font-medium text-gray-700">Nhận xét: </span>
                      {qa.comment}
                    </p>
                  )}
                </Card>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3 pb-4">
              <Button type="button" variant="primary" size="lg" onClick={resetAll}>
                Phỏng vấn lại
              </Button>
              <a
                href="/jobs"
                className="inline-flex h-11 items-center rounded-lg border border-gray-300 bg-white px-5 text-[15px] font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Xem các vị trí đang tuyển
              </a>
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-gray-200/80 px-6 py-6 text-center text-xs leading-relaxed text-gray-400">
        Buổi phỏng vấn thử chỉ phục vụ luyện tập — kết quả không được dùng trong quyết định
        tuyển dụng chính thức.
      </footer>
    </div>
  );
}
