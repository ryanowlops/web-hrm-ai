import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  FormField,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
} from '../../../components/ui';
import { useAuth } from '../../../app/AuthContext.jsx';
import {
  closeSurvey,
  createSurvey,
  getSurveyResults,
  getSurveys,
  parseApiError,
  respondSurvey,
} from '../services';
import { formatDateTime } from '../../../lib/format';

// ============================================================
// Trang Khảo sát gắn kết — route /surveys (mở rộng v3, mục 4)
// - Mọi người: xem khảo sát đang mở, trả lời 1 lần (ẩn danh thật —
//   đáp án không gắn danh tính, chỉ chống trả lời trùng).
// - HR/Admin: tạo khảo sát (form builder đơn giản), xem kết quả
//   tổng hợp bằng thanh CSS, đóng khảo sát.
// ============================================================

const STATUS_META = {
  active: { label: 'Đang mở', tone: 'green' },
  draft: { label: 'Bản nháp', tone: 'slate' },
  closed: { label: 'Đã đóng', tone: 'amber' },
};

const TYPE_LABELS = {
  enps: 'eNPS (0–10)',
  scale: 'Thang điểm (1–5)',
  single: 'Chọn 1 đáp án',
  text: 'Tự luận',
};

function Bar({ pct, tone = 'bg-brand-600' }) {
  const width = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
    </div>
  );
}

// ---------------- Modal trả lời khảo sát ----------------

function AnswerModal({ survey, onClose }) {
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => respondSurvey(survey.id, answers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagement', 'surveys'] });
      onClose();
    },
    onError: (err) =>
      setError(parseApiError(err, 'Không gửi được đáp án. Vui lòng thử lại.')),
  });

  const setAnswer = (qid, value) => setAnswers((prev) => ({ ...prev, [qid]: value }));

  const missingRequired = (survey.questions || []).some((q) => {
    if (q.type === 'text') return false;
    const v = answers[q.id];
    return v === undefined || v === null || v === '';
  });

  return (
    <Modal
      open
      title={survey.title}
      subtitle="Đáp án của bạn hoàn toàn ẩn danh — hệ thống chỉ ghi nhận bạn đã tham gia để tránh trả lời trùng."
      onClose={onClose}
      width="max-w-xl"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Để sau
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={missingRequired || mutation.isPending}
            loading={mutation.isPending}
          >
            Gửi đáp án
          </Button>
        </>
      }
    >
      {error ? (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      ) : null}
      <div className="space-y-6">
        {(survey.questions || []).map((q, idx) => (
          <div key={q.id}>
            <p className="text-sm font-medium text-gray-900">
              {idx + 1}. {q.text}
            </p>
            <p className="mt-0.5 text-[13px] text-gray-400">{TYPE_LABELS[q.type] || q.type}</p>
            <div className="mt-2.5">
              {q.type === 'enps' ? (
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAnswer(q.id, n)}
                      className={`h-9 w-9 rounded-lg text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/30 ${
                        answers[q.id] === n
                          ? 'bg-brand-600 text-white'
                          : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              ) : q.type === 'scale' ? (
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAnswer(q.id, n)}
                      className={`h-9 w-11 rounded-lg text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/30 ${
                        answers[q.id] === n
                          ? 'bg-brand-600 text-white'
                          : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <span className="ml-2 self-center text-[13px] text-gray-400">
                    1 = Rất không hài lòng · 5 = Rất hài lòng
                  </span>
                </div>
              ) : q.type === 'single' ? (
                <div className="space-y-2">
                  {(q.options || []).map((option) => (
                    <label
                      key={option}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm transition-colors ${
                        answers[q.id] === option
                          ? 'border-brand-600 bg-brand-50 text-gray-900'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        checked={answers[q.id] === option}
                        onChange={() => setAnswer(q.id, option)}
                        className="h-4 w-4 accent-brand-600"
                      />
                      {option}
                    </label>
                  ))}
                </div>
              ) : (
                <Textarea
                  rows={3}
                  maxLength={1000}
                  placeholder="Chia sẻ ý kiến của bạn (không bắt buộc)…"
                  value={answers[q.id] || ''}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ---------------- Modal kết quả (HR/Admin) ----------------

function ResultsModal({ survey, onClose }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['engagement', 'survey-results', survey.id],
    queryFn: () => getSurveyResults(survey.id),
    retry: 1,
  });
  const total = data?.total_responses || 0;
  const pct = (count) => (total > 0 ? Math.round((count / total) * 1000) / 10 : 0);

  return (
    <Modal
      open
      title={`Kết quả — ${survey.title}`}
      subtitle="Số liệu tổng hợp ẩn danh từ toàn bộ người tham gia."
      onClose={onClose}
      width="max-w-2xl"
      actions={
        <Button variant="secondary" onClick={onClose}>
          Đóng
        </Button>
      }
    >
      {isLoading ? (
        <div className="space-y-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Alert tone="error">
          Không tải được kết quả.
          <Button variant="secondary" size="sm" className="ml-3" onClick={() => refetch()}>
            Thử lại
          </Button>
        </Alert>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-gray-600">
            Tổng lượt trả lời: <span className="font-semibold text-gray-900">{total}</span>
          </p>
          {(data?.questions || []).map((q, idx) => (
            <div key={q.id} className="border-t border-gray-100 pt-4 first:border-t-0 first:pt-0">
              <p className="text-sm font-medium text-gray-900">
                {idx + 1}. {q.text}
              </p>
              <p className="mt-0.5 text-[13px] text-gray-400">
                {TYPE_LABELS[q.type] || q.type} · {q.answered} câu trả lời
              </p>
              <div className="mt-3">
                {q.type === 'enps' ? (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-700">
                      Điểm trung bình:{' '}
                      <span className="font-semibold text-gray-900">
                        {q.average ?? '—'}
                      </span>
                      {q.enps_score !== null && q.enps_score !== undefined ? (
                        <>
                          {' · '}eNPS: <span className="font-semibold text-gray-900">{q.enps_score}</span>
                        </>
                      ) : null}
                    </p>
                    {[
                      { label: `Người ủng hộ (9–10): ${q.promoters}`, pct: q.promoter_pct, tone: 'bg-emerald-500' },
                      { label: `Trung lập (7–8): ${q.passives}`, pct: q.passive_pct, tone: 'bg-amber-400' },
                      { label: `Chưa hài lòng (0–6): ${q.detractors}`, pct: q.detractor_pct, tone: 'bg-rose-500' },
                    ].map((row) => (
                      <div key={row.label}>
                        <div className="mb-1 flex justify-between text-[13px] text-gray-600">
                          <span>{row.label}</span>
                          <span className="tabular-nums">{row.pct}%</span>
                        </div>
                        <Bar pct={row.pct} tone={row.tone} />
                      </div>
                    ))}
                  </div>
                ) : q.type === 'scale' ? (
                  <div className="space-y-2.5">
                    <p className="text-sm text-gray-700">
                      Điểm trung bình:{' '}
                      <span className="font-semibold text-gray-900">{q.average ?? '—'} / 5</span>
                    </p>
                    {[5, 4, 3, 2, 1].map((score) => {
                      const count = q.distribution?.[String(score)] || 0;
                      return (
                        <div key={score} className="flex items-center gap-3">
                          <span className="w-8 shrink-0 text-[13px] tabular-nums text-gray-500">
                            {score} điểm
                          </span>
                          <div className="flex-1">
                            <Bar pct={pct(count)} />
                          </div>
                          <span className="w-10 shrink-0 text-right text-[13px] tabular-nums text-gray-500">
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : q.type === 'single' ? (
                  <div className="space-y-2.5">
                    {(q.options || []).map((option) => {
                      const count = q.counts?.[option] || 0;
                      return (
                        <div key={option}>
                          <div className="mb-1 flex justify-between gap-3 text-[13px] text-gray-600">
                            <span className="min-w-0 truncate">{option}</span>
                            <span className="shrink-0 tabular-nums">
                              {count} · {pct(count)}%
                            </span>
                          </div>
                          <Bar pct={pct(count)} />
                        </div>
                      );
                    })}
                  </div>
                ) : (q.answers || []).length > 0 ? (
                  <ul className="space-y-2">
                    {q.answers.map((text, i) => (
                      <li
                        key={i}
                        className="rounded-lg border border-gray-100 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-700"
                      >
                        {text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">Chưa có ý kiến nào.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---------------- Modal tạo khảo sát (HR/Admin) ----------------

const EMPTY_QUESTION = { type: 'scale', text: '', optionsText: '' };

function CreateSurveyModal({ onClose }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState([{ ...EMPTY_QUESTION }]);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      createSurvey({
        title: title.trim(),
        description: description.trim() || null,
        questions: questions.map((q, idx) => {
          const item = { id: `q${idx + 1}`, type: q.type, text: q.text.trim() };
          if (q.type === 'single') {
            item.options = q.optionsText
              .split('\n')
              .map((o) => o.trim())
              .filter(Boolean);
          }
          return item;
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagement', 'surveys'] });
      onClose();
    },
    onError: (err) =>
      setError(parseApiError(err, 'Không tạo được khảo sát. Vui lòng thử lại.')),
  });

  const updateQuestion = (idx, patch) =>
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));

  const valid =
    title.trim() &&
    questions.length > 0 &&
    questions.every(
      (q) =>
        q.text.trim() &&
        (q.type !== 'single' ||
          q.optionsText.split('\n').map((o) => o.trim()).filter(Boolean).length >= 2),
    );

  return (
    <Modal
      open
      title="Tạo khảo sát mới"
      subtitle="Khảo sát sẽ mở ngay sau khi tạo. Đáp án của nhân viên luôn ẩn danh."
      onClose={onClose}
      width="max-w-2xl"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!valid || mutation.isPending}
            loading={mutation.isPending}
          >
            Tạo và mở khảo sát
          </Button>
        </>
      }
    >
      {error ? (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      ) : null}
      <div className="space-y-5">
        <FormField label="Tiêu đề khảo sát">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ví dụ: Khảo sát mức độ gắn kết — Quý 4/2026"
            maxLength={200}
          />
        </FormField>
        <FormField label="Mô tả (không bắt buộc)">
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mục đích khảo sát, thời gian mở…"
          />
        </FormField>

        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div key={idx} className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-900">Câu {idx + 1}</span>
                <Select
                  className="w-48"
                  value={q.type}
                  onChange={(e) => updateQuestion(idx, { type: e.target.value })}
                >
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
                {questions.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== idx))}
                    className="ml-auto text-[13px] font-medium text-rose-600 transition-colors hover:text-rose-700"
                  >
                    Xoá câu
                  </button>
                ) : null}
              </div>
              <Input
                className="mt-3"
                value={q.text}
                onChange={(e) => updateQuestion(idx, { text: e.target.value })}
                placeholder="Nội dung câu hỏi…"
                maxLength={500}
              />
              {q.type === 'single' ? (
                <Textarea
                  className="mt-3"
                  rows={3}
                  value={q.optionsText}
                  onChange={(e) => updateQuestion(idx, { optionsText: e.target.value })}
                  placeholder={'Mỗi lựa chọn một dòng (ít nhất 2 lựa chọn)\nVí dụ:\nHài lòng\nChưa hài lòng'}
                />
              ) : null}
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setQuestions((prev) => [...prev, { ...EMPTY_QUESTION }])}
          >
            Thêm câu hỏi
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Trang chính ----------------

export default function SurveysPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isHr = user?.role === 'admin' || user?.role === 'hr';
  const [answerTarget, setAnswerTarget] = useState(null);
  const [resultsTarget, setResultsTarget] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['engagement', 'surveys'],
    queryFn: getSurveys,
    staleTime: 30_000,
    retry: 1,
  });
  const surveys = data || [];

  const closeMutation = useMutation({
    mutationFn: (id) => closeSurvey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['engagement', 'surveys'] }),
  });

  return (
    <div className="page-shell">
      <PageHeader
        title="Khảo sát gắn kết"
        subtitle="Khảo sát xung và eNPS ẩn danh — lắng nghe nhân viên để cải thiện trải nghiệm làm việc."
        actions={
          isHr ? <Button onClick={() => setCreateOpen(true)}>Tạo khảo sát</Button> : null
        }
      />

      {isLoading ? (
        <div className="space-y-4" aria-hidden="true">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : isError ? (
        <Alert tone="error">
          <span className="font-bold">Không tải được danh sách khảo sát</span>
          <br />
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>
            Thử lại
          </Button>
        </Alert>
      ) : surveys.length === 0 ? (
        <EmptyState
          title="Chưa có khảo sát nào"
          description={
            isHr
              ? 'Bấm "Tạo khảo sát" để mở đợt khảo sát đầu tiên cho nhân viên.'
              : 'Hiện chưa có khảo sát nào đang mở. Vui lòng quay lại sau.'
          }
        />
      ) : (
        <div className="space-y-4">
          {surveys.map((survey) => {
            const status = STATUS_META[survey.status] || STATUS_META.active;
            const canAnswer = survey.status === 'active' && !survey.responded;
            return (
              <Card key={survey.id}>
                <CardBody>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[15px] font-semibold text-gray-900">{survey.title}</h2>
                        <Badge tone={status.tone} dot>
                          {status.label}
                        </Badge>
                        {survey.responded ? (
                          <Badge tone="blue" dot>
                            Đã tham gia
                          </Badge>
                        ) : null}
                      </div>
                      {survey.description ? (
                        <p className="mt-1 text-sm leading-relaxed text-gray-500">
                          {survey.description}
                        </p>
                      ) : null}
                      <p className="mt-2 text-[13px] text-gray-400">
                        {(survey.questions || []).length} câu hỏi
                        {survey.created_by_name ? ` · Tạo bởi ${survey.created_by_name}` : ''}
                        {survey.created_at ? ` · ${formatDateTime(survey.created_at)}` : ''}
                        {isHr && survey.response_count !== undefined && survey.response_count !== null
                          ? ` · ${survey.response_count} lượt trả lời`
                          : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {canAnswer ? (
                        <Button size="sm" onClick={() => setAnswerTarget(survey)}>
                          Trả lời khảo sát
                        </Button>
                      ) : null}
                      {survey.status === 'active' && survey.responded ? (
                        <span className="self-center text-[13px] text-gray-400">
                          Cảm ơn bạn đã tham gia
                        </span>
                      ) : null}
                      {isHr ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setResultsTarget(survey)}
                          >
                            Xem kết quả
                          </Button>
                          {survey.status === 'active' ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={
                                closeMutation.isPending && closeMutation.variables === survey.id
                              }
                              onClick={() => closeMutation.mutate(survey.id)}
                            >
                              Đóng khảo sát
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {answerTarget ? (
        <AnswerModal survey={answerTarget} onClose={() => setAnswerTarget(null)} />
      ) : null}
      {resultsTarget ? (
        <ResultsModal survey={resultsTarget} onClose={() => setResultsTarget(null)} />
      ) : null}
      {createOpen ? <CreateSurveyModal onClose={() => setCreateOpen(false)} /> : null}
    </div>
  );
}
