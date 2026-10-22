import { useCallback, useEffect, useState } from 'react';
import {
  generateInterviewKit,
  getInterviewKit,
  updateInterviewKit,
  friendlyError,
} from '../services';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  EmptyState,
  Input,
  Skeleton,
  Textarea,
} from '../../../components/ui';
import { IconSparkles } from '../../../components/icons.jsx';

/**
 * Tab "Bộ câu hỏi phỏng vấn" (feature-expansion-v6 mục 3.3).
 *
 * - Xem bộ câu hỏi theo 3 vòng; nhãn nguồn trung thực (AI / template).
 * - "Tạo lại bằng AI": ghi đè bộ cũ, version +1 phía server.
 * - Sửa inline từng câu (chủ đề/câu hỏi/rubric/trọng số) + thêm/xoá câu,
 *   lưu bằng PUT; trọng số được server chuẩn hoá tổng 100.
 * - In: print CSS đơn giản — khi in chỉ hiện vùng #kit-print-area.
 */

const ROUND_LABELS = {
  1: 'Vòng 1 · Kiến thức nền',
  2: 'Vòng 2 · Tình huống & kỹ năng',
  3: 'Vòng 3 · Văn hoá & động lực',
};

const PRINT_CSS = `
  #kit-print-area { display: none; }
  @media print {
    body * { visibility: hidden !important; }
    #kit-print-area { display: block !important; position: absolute; top: 0; left: 0; width: 100%; }
    #kit-print-area, #kit-print-area * { visibility: visible !important; }
  }
`;

function groupByRound(questions) {
  const groups = { 1: [], 2: [], 3: [] };
  (questions ?? []).forEach((q, idx) => {
    if (groups[q.round]) groups[q.round].push({ ...q, _idx: idx });
  });
  return groups;
}

export default function InterviewKitPanel({ job }) {
  const [kit, setKit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotFound(false);
    try {
      const data = await getInterviewKit(job.id);
      setKit(data);
    } catch (err) {
      if (err?.response?.status === 404) {
        setNotFound(true);
        setKit(null);
      } else {
        setError(friendlyError(err, 'Không tải được bộ câu hỏi phỏng vấn.'));
      }
    } finally {
      setLoading(false);
    }
  }, [job.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Tạo lại bộ câu hỏi khi đã có bộ cũ: hỏi xác nhận bằng ConfirmDialog
  // (thay window.confirm) vì thao tác ghi đè cả phần đã sửa tay; logic gọi
  // API nằm ở doGenerate và chỉ chạy sau khi người dùng xác nhận.
  const [confirmRegen, setConfirmRegen] = useState(false);

  const handleGenerate = async () => {
    if (kit) {
      setConfirmRegen(true);
      return;
    }
    await doGenerate();
  };

  const doGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const data = await generateInterviewKit(job.id);
      setKit(data);
      setNotFound(false);
      setEditing(false);
      setNotice(
        data.generated_by === 'ai'
          ? `Đã tạo bộ câu hỏi bằng AI (phiên bản ${data.version}).`
          : `AI chưa khả dụng nên hệ thống dùng bộ câu hỏi mẫu theo JD (phiên bản ${data.version}).`,
      );
    } catch (err) {
      setError(friendlyError(err, 'Không tạo được bộ câu hỏi phỏng vấn.'));
    } finally {
      setGenerating(false);
    }
  };

  const startEditing = () => {
    setDraft((kit?.questions ?? []).map((q) => ({ ...q })));
    setEditing(true);
    setNotice('');
  };

  const patchDraft = (idx, key, value) =>
    setDraft((prev) => prev.map((q, i) => (i === idx ? { ...q, [key]: value } : q)));

  const removeDraft = (idx) => setDraft((prev) => prev.filter((_, i) => i !== idx));

  const addDraft = (round) =>
    setDraft((prev) => [
      ...prev,
      { round, topic: '', question: '', rubric: '', weight: 5 },
    ]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const cleaned = draft.map((q) => ({
        round: Number(q.round),
        topic: String(q.topic ?? '').trim(),
        question: String(q.question ?? '').trim(),
        rubric: String(q.rubric ?? '').trim(),
        weight: Number(q.weight) || 0,
      }));
      const data = await updateInterviewKit(job.id, cleaned);
      setKit(data);
      setEditing(false);
      setNotice('Đã lưu bộ câu hỏi phỏng vấn.');
    } catch (err) {
      setError(friendlyError(err, 'Không lưu được bộ câu hỏi. Kiểm tra đủ 3 vòng và các trường bắt buộc.'));
    } finally {
      setSaving(false);
    }
  };

  const questions = editing ? draft : kit?.questions ?? [];
  const groups = groupByRound(questions);
  const flatIndex = (round, localIdx) =>
    questions.findIndex((q, i) => q.round === round && groups[round][localIdx] === questions[i]);

  return (
    <div className="mt-4">
      <style>{PRINT_CSS}</style>

      {notice && (
        <Alert tone="success" className="mb-4">
          {notice}
        </Alert>
      )}
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-gray-900">Bộ câu hỏi phỏng vấn</h3>
          {kit && (
            <>
              <Badge tone={kit.generated_by === 'ai' ? 'violet' : 'gray'}>
                {kit.generated_by === 'ai' ? 'Do AI tạo' : 'Mẫu dự phòng (chưa dùng AI)'}
              </Badge>
              <Badge tone="blue">Phiên bản {kit.version}</Badge>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {kit && !editing && (
            <>
              <Button variant="secondary" size="sm" onClick={() => window.print()}>
                In bộ câu hỏi
              </Button>
              <Button variant="secondary" size="sm" onClick={startEditing}>
                Sửa câu hỏi
              </Button>
            </>
          )}
          {editing && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
                Huỷ sửa
              </Button>
              <Button size="sm" onClick={handleSave} loading={saving}>
                {saving ? 'Đang lưu...' : 'Lưu bộ câu hỏi'}
              </Button>
            </>
          )}
          {!editing && (
            <Button size="sm" onClick={handleGenerate} loading={generating}>
              <IconSparkles size={15} />
              {generating ? 'Đang tạo...' : kit ? 'Tạo lại bằng AI' : 'Tạo bộ câu hỏi'}
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <Card>
          <CardBody>
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="mt-3 h-4 w-2/3" />
            <Skeleton className="mt-2 h-4 w-1/2" />
          </CardBody>
        </Card>
      ) : notFound || !kit ? (
        <Card>
          <EmptyState
            icon={<IconSparkles size={26} />}
            title="Chưa có bộ câu hỏi phỏng vấn"
            description="Tạo bộ câu hỏi bám sát JD của vị trí này — chia 3 vòng (kiến thức nền, tình huống/kỹ năng, văn hoá/động lực), mỗi câu kèm tiêu chí chấm và trọng số."
            action={
              <Button onClick={handleGenerate} loading={generating}>
                <IconSparkles size={15} />
                {generating ? 'Đang tạo...' : 'Tạo bộ câu hỏi'}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {[1, 2, 3].map((round) => (
            <Card key={round}>
              <CardBody>
                <h4 className="text-sm font-semibold text-gray-900">{ROUND_LABELS[round]}</h4>
                <div className="mt-3 space-y-4">
                  {(groups[round] ?? []).map((q, localIdx) => {
                    const idx = editing ? flatIndex(round, localIdx) : q._idx;
                    return (
                      <div
                        key={`${round}-${localIdx}`}
                        className="rounded-lg border border-gray-100 bg-gray-50/60 px-4 py-3"
                      >
                        {editing ? (
                          <div className="space-y-2.5">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <Input
                                value={q.topic}
                                onChange={(e) => patchDraft(idx, 'topic', e.target.value)}
                                placeholder="Chủ đề"
                                className="min-w-[180px] flex-1"
                              />
                              <label className="flex items-center gap-1.5 text-[13px] text-gray-500">
                                Trọng số %
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  value={q.weight}
                                  onChange={(e) => patchDraft(idx, 'weight', e.target.value)}
                                  className="w-24"
                                />
                              </label>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeDraft(idx)}
                                className="text-rose-600 hover:text-rose-700"
                              >
                                Xoá câu
                              </Button>
                            </div>
                            <Textarea
                              rows={2}
                              value={q.question}
                              onChange={(e) => patchDraft(idx, 'question', e.target.value)}
                              placeholder="Nội dung câu hỏi"
                            />
                            <Textarea
                              rows={2}
                              value={q.rubric}
                              onChange={(e) => patchDraft(idx, 'rubric', e.target.value)}
                              placeholder="Tiêu chí chấm (rubric)"
                            />
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <p className="text-sm font-semibold text-gray-900">
                                {localIdx + 1}. {q.topic}
                                <span className="ml-2 text-[13px] font-medium text-gray-400">
                                  Trọng số {q.weight}%
                                </span>
                              </p>
                            </div>
                            <p className="mt-1 text-sm leading-relaxed text-gray-800">{q.question}</p>
                            <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">
                              <span className="font-medium text-gray-600">Tiêu chí chấm: </span>
                              {q.rubric}
                            </p>
                          </>
                        )}
                      </div>
                    );
                  })}
                  {editing && (
                    <Button variant="secondary" size="sm" onClick={() => addDraft(round)}>
                      + Thêm câu vào vòng này
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
          <p className="text-xs leading-relaxed text-gray-400">
            Trọng số các câu được chuẩn hoá tổng 100% khi lưu. Bộ câu hỏi chỉ là tài liệu hỗ trợ
            phỏng vấn — người phỏng vấn toàn quyền điều chỉnh khi dùng.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={confirmRegen}
        title="Tạo lại bộ câu hỏi"
        description="Tạo lại sẽ ghi đè toàn bộ câu hỏi hiện tại (kể cả phần đã sửa tay). Tiếp tục?"
        confirmLabel="Tạo lại"
        danger
        onConfirm={() => {
          setConfirmRegen(false);
          doGenerate();
        }}
        onCancel={() => setConfirmRegen(false)}
      />

      {/* Vùng in: chỉ hiện khi in (print CSS ở đầu component) */}
      {kit && (
        <div id="kit-print-area">
          <h1 style={{ fontSize: 20, marginBottom: 4 }}>Bộ câu hỏi phỏng vấn — {job.title}</h1>
          <p style={{ fontSize: 12, color: '#555', marginBottom: 16 }}>
            Nguồn: {kit.generated_by === 'ai' ? 'AI' : 'Mẫu dự phòng'} · Phiên bản {kit.version}
          </p>
          {[1, 2, 3].map((round) => (
            <div key={round} style={{ marginBottom: 18 }}>
              <h2 style={{ fontSize: 15, marginBottom: 8 }}>{ROUND_LABELS[round]}</h2>
              {(kit.questions ?? [])
                .filter((q) => q.round === round)
                .map((q, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>
                      {i + 1}. {q.topic} (trọng số {q.weight}%)
                    </p>
                    <p style={{ fontSize: 13 }}>{q.question}</p>
                    <p style={{ fontSize: 12, color: '#555' }}>Tiêu chí chấm: {q.rubric}</p>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
