import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Modal, Spinner, Textarea } from '../../../components/ui';
import { friendlyError } from '../services';
import { checkCvFile, checkCvText } from '../cvCheckServices';

/**
 * Modal "AI kiểm tra CV" (v5 mục E) — ứng viên dán nội dung CV hoặc tải
 * file PDF/TXT để nhận đánh giá mức phù hợp với JD của vị trí, TRƯỚC khi
 * quyết định ứng tuyển. Kết quả gồm: điểm /100, verdict, điểm mạnh /
 * cần cải thiện, từ khoá khớp / còn thiếu và nhãn nguồn phân tích
 * ("ai" | "heuristic") hiển thị trung thực.
 *
 * Quyền riêng tư (ghi rõ cho người dùng): CV chỉ dùng để phân tích tức
 * thời, KHÔNG lưu lại trên hệ thống — backend không ghi DB/file.
 */

const CV_MAX_BYTES = 5 * 1024 * 1024; // 5 MB — khớp validate backend
const CV_MAX_CHARS = 12000;

function scoreTone(score) {
  if (score >= 75) return { ring: 'text-emerald-500', label: 'text-emerald-700' };
  if (score >= 55) return { ring: 'text-brand-600', label: 'text-brand-700' };
  if (score >= 35) return { ring: 'text-amber-500', label: 'text-amber-700' };
  return { ring: 'text-rose-500', label: 'text-rose-700' };
}

function ScoreCircle({ score }) {
  const tone = scoreTone(score);
  const R = 52;
  const C = 2 * Math.PI * R;
  const filled = Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="relative h-32 w-32 shrink-0" role="img" aria-label={`Điểm phù hợp: ${score} trên 100`}>
      <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <circle cx="60" cy="60" r={R} strokeWidth="10" className="stroke-gray-100" fill="none" />
        <circle
          cx="60"
          cy="60"
          r={R}
          strokeWidth="10"
          strokeLinecap="round"
          className={`${tone.ring} transition-[stroke-dashoffset] duration-700`}
          stroke="currentColor"
          fill="none"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - filled)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-semibold leading-none ${tone.label}`}>{score}</span>
        <span className="mt-1 text-xs font-medium text-gray-400">/ 100</span>
      </div>
    </div>
  );
}

function KeywordChips({ items, tone }) {
  if (!items || items.length === 0) return null;
  const styles =
    tone === 'matched'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-gray-200 bg-gray-50 text-gray-500';
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((kw) => (
        <span
          key={kw}
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${styles}`}
        >
          {kw}
        </span>
      ))}
    </div>
  );
}

export default function CvCheckModal({ job, onClose, onApply }) {
  const [tab, setTab] = useState('text'); // 'text' | 'file'
  const [cvText, setCvText] = useState('');
  const [cvFile, setCvFile] = useState(null);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  // Mỗi lần mở cho 1 vị trí khác nhau -> làm mới trạng thái.
  useEffect(() => {
    if (job) {
      setTab('text');
      setCvText('');
      setCvFile(null);
      setError('');
      setResult(null);
      setAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [job]);

  if (!job) return null;

  function validateFile(file) {
    if (!file) return 'Vui lòng chọn file CV.';
    const name = file.name.toLowerCase();
    if (!name.endsWith('.pdf') && !name.endsWith('.txt')) {
      return 'Chỉ nhận file PDF hoặc TXT (.pdf, .txt).';
    }
    if (file.size > CV_MAX_BYTES) return 'File CV vượt quá 5 MB, vui lòng giảm dung lượng file.';
    if (file.size === 0) return 'File CV đang rỗng, vui lòng chọn file khác.';
    return '';
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0] || null;
    setCvFile(file);
    setError(file ? validateFile(file) : '');
  }

  async function handleAnalyze() {
    setError('');
    setResult(null);
    let payloadError = '';
    if (tab === 'text') {
      if (!cvText.trim()) payloadError = 'Vui lòng dán nội dung CV của bạn.';
      else if (cvText.length > CV_MAX_CHARS) {
        payloadError = `CV quá dài (tối đa ${CV_MAX_CHARS.toLocaleString('vi-VN')} ký tự).`;
      }
    } else {
      payloadError = validateFile(cvFile);
    }
    if (payloadError) {
      setError(payloadError);
      return;
    }
    setAnalyzing(true);
    try {
      const data =
        tab === 'text' ? await checkCvText(job.id, cvText.trim()) : await checkCvFile(job.id, cvFile);
      setResult(data);
    } catch (err) {
      setError(friendlyError(err, 'Không phân tích được CV, vui lòng thử lại sau.'));
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <Modal
      open
      title="AI kiểm tra CV của bạn"
      subtitle={`Đối chiếu CV với yêu cầu của vị trí: ${job.title || ''}`}
      onClose={onClose}
      width="max-w-2xl"
    >
      <p className="rounded-lg bg-brand-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-brand-800 ring-1 ring-inset ring-brand-100">
        CV của bạn chỉ dùng để phân tích tức thời và <strong>không lưu lại</strong> trên hệ
        thống. Kết quả là đánh giá tự động để bạn tham khảo — quyết định tuyển dụng luôn do
        con người đưa ra.
      </p>

      {!result && (
        <>
          <div className="mt-5 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1" role="tablist" aria-label="Cách nhập CV">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'text'}
              onClick={() => setTab('text')}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
                tab === 'text' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Dán nội dung CV
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'file'}
              onClick={() => setTab('file')}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
                tab === 'file' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Tải file PDF/TXT
            </button>
          </div>

          {tab === 'text' ? (
            <div className="mt-4">
              <Textarea
                id="cvcheck-text"
                rows={9}
                placeholder="Dán toàn bộ nội dung CV của bạn vào đây (kinh nghiệm, kỹ năng, học vấn…)…"
                value={cvText}
                onChange={(e) => setCvText(e.target.value)}
                className="w-full"
              />
              <p className="mt-1.5 text-right text-xs text-gray-400">
                {cvText.length.toLocaleString('vi-VN')} / {CV_MAX_CHARS.toLocaleString('vi-VN')} ký tự
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <label
                htmlFor="cvcheck-file"
                className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-6 text-center transition hover:border-brand-400 hover:bg-brand-50/60"
              >
                <span className="max-w-full truncate text-sm font-semibold text-gray-700">
                  {cvFile ? cvFile.name : 'Bấm để chọn file CV (PDF hoặc TXT, tối đa 5 MB)'}
                </span>
                <span className="text-xs text-gray-400">
                  {cvFile ? `${(cvFile.size / 1024).toFixed(0)} KB — bấm để đổi file khác` : 'File chỉ được đọc trong bộ nhớ để phân tích, không lưu lại'}
                </span>
              </label>
              <input
                id="cvcheck-file"
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept=".pdf,.txt,application/pdf,text/plain"
                onChange={handleFileChange}
              />
            </div>
          )}

          {error && (
            <Alert tone="error" className="mt-4">
              {error}
            </Alert>
          )}

          <Button
            type="button"
            variant="primary"
            size="lg"
            loading={analyzing}
            disabled={analyzing}
            onClick={handleAnalyze}
            className="mt-5 w-full"
          >
            {analyzing ? 'AI đang đọc CV của bạn…' : 'Phân tích CV ngay'}
          </Button>
          {analyzing && (
            <p className="mt-3 flex items-center justify-center gap-2 text-sm text-gray-500" role="status">
              <Spinner className="h-4 w-4" /> Đang đối chiếu CV với mô tả vị trí, thường mất vài giây…
            </p>
          )}
        </>
      )}

      {result && (
        <div className="mt-2">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
            <ScoreCircle score={result.score ?? 0} />
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <Badge tone={result.source === 'ai' ? 'blue' : 'slate'} dot>
                {result.source === 'ai' ? 'Phân tích bởi AI' : 'Đánh giá nhanh theo từ khoá'}
              </Badge>
              <p className="mt-2.5 text-[15px] font-medium leading-relaxed text-gray-800">
                {result.verdict}
              </p>
              {result.source !== 'ai' && (
                <p className="mt-1 text-[13px] leading-relaxed text-gray-400">
                  Hệ thống AI đang bận — điểm này được ước tính tự động theo mức khớp từ khoá
                  giữa CV và mô tả vị trí.
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-emerald-700">Điểm mạnh</h3>
              {result.strengths?.length ? (
                <ul className="space-y-1.5">
                  {result.strengths.map((item, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-relaxed text-gray-600">
                      <span aria-hidden="true" className="mt-0.5 text-emerald-500">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">Chưa ghi nhận điểm mạnh rõ ràng.</p>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-amber-700">Cần cải thiện</h3>
              {result.improvements?.length ? (
                <ul className="space-y-1.5">
                  {result.improvements.map((item, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-relaxed text-gray-600">
                      <span aria-hidden="true" className="mt-0.5 text-amber-500">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">Chưa có góp ý đáng kể.</p>
              )}
            </div>
          </div>

          {result.matched_keywords?.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Từ khoá đã khớp với JD</h3>
              <KeywordChips items={result.matched_keywords} tone="matched" />
            </div>
          )}
          {result.missing_keywords?.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Từ khoá JD yêu cầu nhưng CV chưa có</h3>
              <KeywordChips items={result.missing_keywords} tone="missing" />
            </div>
          )}

          {error && (
            <Alert tone="error" className="mt-4">
              {error}
            </Alert>
          )}

          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={() => onApply && onApply(job)}
            >
              Ứng tuyển vị trí này
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={() => {
                setResult(null);
                setError('');
              }}
            >
              Kiểm tra lại
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
