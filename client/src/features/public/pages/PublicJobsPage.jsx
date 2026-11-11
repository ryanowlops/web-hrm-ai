import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listOpenJobs, getPublicJob, applyToJob, friendlyError } from '../services';
import {
  Alert,
  EmptyState,
  FormField,
  Input,
  Modal,
  Skeleton,
} from '../../../components/ui';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Card } from '@astryxdesign/core/Card';
import { TextInput } from '@astryxdesign/core/TextInput';
import CvCheckModal from '../components/CvCheckModal';

/**
 * Trang Tuyển dụng CÔNG KHAI (route /jobs) — khách chưa đăng nhập (FR-08).
 * - Xem danh sách tin đang mở, tìm kiếm/lọc ngay tại client cho mượt.
 * - Mở chi tiết 1 tin (JD + yêu cầu đầy đủ) trong hộp thoại.
 * - Form nộp CV: họ tên, email, số điện thoại, file CV PDF tối đa 5 MB —
 *   validate kỹ tại client và hiển thị lỗi theo từng trường; backend vẫn
 *   kiểm tra lại độc lập. Kết quả thành công/lỗi đều thông báo rõ ràng.
 *
 * Trình bày — đợt làm lại 2026-11-12 (nhánh jobs-polish-2), theo mẫu ATS
 * thật (Greenhouse: tiêu đề phòng ban + hàng tin full-width, không lưới
 * thẻ; đếm "N jobs" + lọc trong một thanh duy nhất) và dùng component
 * Astryx (Button/Badge/Card/TextInput) thay kit tự chế ở các khối chính:
 * - Hero editorial: kicker nhỏ, tiêu đề lớn, thanh lọc tìm kiếm + select
 *   phòng ban trong một hàng, số liệu chỉ là một dòng chữ lặng (không ô).
 * - Tin nổi bật (hạn nộp gần nhất) dạng spotlight; các tin còn lại xếp
 *   thành HÀNG nhóm theo phòng ban, có chevron, hover nền xám.
 * - Quy trình ứng tuyển là timeline có đường nối thật (ngang desktop,
 *   dọc mobile); footer có nav thật tới các route có sẵn.
 * - Không thay đổi logic, không thêm dữ liệu bịa (không lương, địa điểm,
 *   ảnh, phúc lợi — dữ liệu việc làm không có các trường đó).
 *
 * LƯU Ý (đã sửa tận gốc 2026-11-12, nhánh astryx-layer-fix): trước đây
 * nút primary của Astryx và border của Card variant="default" BỊ Tailwind
 * preflight đè — nút primary render trong suốt, Card mất viền — nên trang
 * này từng phải dùng class important (`!bg-*`, `!px-4`) và thêm
 * `border border-gray-200` bằng utility Tailwind. Nguyên nhân gốc KHÔNG
 * phải thứ tự layer nạp sai: Tailwind 3.4.19 không bọc output của nó
 * trong `@layer` nào, mà style KHÔNG layer luôn thắng style CÓ layer bất
 * kể specificity. Cách sửa: plugin `wrap-tailwind-base-in-layer` trong
 * postcss.config.js gom preflight vào `@layer base`, xem comment trong
 * styles/astryx.css. Các class workaround đã gỡ hết khỏi file này.
 */

const CV_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function formatDate(iso) {
  if (!iso) return 'Không giới hạn';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? 'Không giới hạn'
    : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isExpired(job) {
  if (!job?.deadline) return false;
  const d = new Date(job.deadline);
  if (Number.isNaN(d.getTime())) return false;
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
  return end < new Date();
}

function departmentName(job) {
  return job?.department?.name || job?.department_name || 'Chưa rõ phòng ban';
}

const emptyForm = { fullName: '', email: '', phone: '' };

/* Quy trình ứng tuyển thật của hệ thống: nộp CV → AI kiểm tra CV →
   luyện phỏng vấn với AI → HR xem xét và liên hệ. */
const PROCESS_STEPS = [
  {
    title: 'Nộp CV',
    desc: 'Điền thông tin liên hệ và đính kèm CV PDF, tối đa 5 MB.',
  },
  {
    title: 'AI kiểm tra CV',
    desc: 'Xem mức phù hợp của CV với vị trí trước khi nộp hồ sơ.',
  },
  {
    title: 'Luyện phỏng vấn với AI',
    desc: 'Tập trả lời phỏng vấn thử ngay trên trình duyệt, không cần đặt lịch.',
  },
  {
    title: 'HR xem xét và liên hệ',
    desc: 'Đội ngũ HR xem xét hồ sơ và liên hệ qua email hoặc điện thoại nếu phù hợp.',
  },
];

/* ------------------------------- Icon dùng chung ------------------------------ */
function BriefcaseIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="7.5" width="18" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3 12.5h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-3.8-3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BuildingIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="3.5" width="16" height="17" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 8h2m2 0h2M9 12h2m2 0h2M9 16h2m2 0h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function UsersIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 19.5c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M16 5.6a3.5 3.5 0 0 1 0 5.8m1.2 3.9c1.9.6 3 1.9 3.3 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SparkleIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.1l-1.8-5.5L4.5 10.8 10.2 9 12 3.5ZM18.5 15.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function MicIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChevronRightIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* Mô tả + yêu cầu của 1 tin — dùng chung cho cả 2 nhánh của modal
   (đang nộp hồ sơ và đã nộp thành công) để không lệch nhau. */
function JobDescription({ job }) {
  return (
    <>
      {job.description && (
        <>
          <h3 className="mb-2 text-[15px] font-semibold text-gray-900">Mô tả công việc</h3>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-600 [overflow-wrap:anywhere]">
            {job.description}
          </p>
        </>
      )}
      {job.requirements && (
        <>
          <h3 className="mb-2 mt-6 text-[15px] font-semibold text-gray-900">Yêu cầu ứng viên</h3>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-600 [overflow-wrap:anywhere]">
            {job.requirements}
          </p>
        </>
      )}
    </>
  );
}

export default function PublicJobsPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');

  const [selected, setSelected] = useState(null); // tin đang mở chi tiết
  const [detailLoading, setDetailLoading] = useState(false);
  const [checkJob, setCheckJob] = useState(null); // tin đang mở modal AI kiểm tra CV

  const [form, setForm] = useState(emptyForm);
  const [cvFile, setCvFile] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  /* ------------------------------ Tải danh sách ----------------------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { items } = await listOpenJobs({ page: 1, limit: 100 });
        if (!cancelled) setJobs(items);
      } catch (err) {
        if (!cancelled) {
          setLoadError(friendlyError(err, 'Không tải được danh sách tuyển dụng, vui lòng thử lại sau.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Phòng ban đang tuyển (tên + số tin) — tính từ dữ liệu thật, để làm
     select lọc. Chỉ hiện select khi có từ 2 phòng ban trở lên. */
  const departments = useMemo(() => {
    const counts = new Map();
    jobs.forEach((j) => {
      const name = departmentName(j);
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));
  }, [jobs]);

  /* Dòng số liệu lặng ở hero — chỉ dùng dữ liệu đã tải về, không bịa số. */
  const stats = useMemo(() => {
    if (jobs.length === 0) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = jobs
      .map((j) => (j.deadline ? new Date(j.deadline) : null))
      .filter((d) => d && !Number.isNaN(d.getTime()) && d >= today)
      .sort((a, b) => a - b)[0];
    return {
      openCount: jobs.length,
      deptCount: new Set(jobs.map(departmentName)).size,
      nearestDeadline: upcoming ? formatDate(upcoming.toISOString()) : 'Không giới hạn',
    };
  }, [jobs]);

  const visibleJobs = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return jobs.filter((j) => {
      if (deptFilter !== 'all' && departmentName(j) !== deptFilter) return false;
      if (!kw) return true;
      return (
        (j.title || '').toLowerCase().includes(kw) ||
        departmentName(j).toLowerCase().includes(kw) ||
        (j.description || '').toLowerCase().includes(kw)
      );
    });
  }, [jobs, keyword, deptFilter]);

  const hasActiveFilter = keyword.trim() !== '' || deptFilter !== 'all';
  const clearFilters = useCallback(() => {
    setKeyword('');
    setDeptFilter('all');
  }, []);

  /* Tin nổi bật = tin còn hạn có hạn nộp gần nhất (hết hạn xếp sau);
     các tin còn lại xếp thành hàng nhóm theo phòng ban. */
  const sortedVisible = useMemo(() => {
    const deadlineOf = (j) => {
      const d = j.deadline ? new Date(j.deadline) : null;
      return d && !Number.isNaN(d.getTime()) ? d.getTime() : Infinity;
    };
    return [...visibleJobs].sort((a, b) => {
      const ea = isExpired(a);
      const eb = isExpired(b);
      if (ea !== eb) return ea ? 1 : -1;
      return deadlineOf(a) - deadlineOf(b) || (a.title || '').localeCompare(b.title || '', 'vi');
    });
  }, [visibleJobs]);

  const featured = sortedVisible[0] || null;

  const restByDept = useMemo(() => {
    const groups = new Map();
    sortedVisible.slice(1).forEach((j) => {
      const name = departmentName(j);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(j);
    });
    // Thứ tự nhóm theo thứ tự phòng ban đã tính (nhiều tin trước).
    return departments
      .map((d) => ({ name: d.name, jobs: groups.get(d.name) || [] }))
      .filter((g) => g.jobs.length > 0);
  }, [sortedVisible, departments]);

  /* ------------------------------ Mở chi tiết ------------------------------- */
  const openJob = useCallback(async (job) => {
    setSelected(job);
    setForm(emptyForm);
    setCvFile(null);
    setFieldErrors({});
    setSubmitError('');
    setSubmitted(false);
    setDragOver(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    // Lấy JD đầy đủ từ server (danh sách có thể chỉ có mô tả rút gọn).
    setDetailLoading(true);
    try {
      const full = await getPublicJob(job.id);
      if (full && full.id) setSelected((prev) => (prev && prev.id === job.id ? { ...prev, ...full } : prev));
    } catch {
      // Không lấy được chi tiết đầy đủ thì dùng dữ liệu trong danh sách.
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeJob = useCallback(() => {
    setSelected(null);
    setSubmitted(false);
    setSubmitError('');
  }, []);

  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeJob();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, closeJob]);

  /* ------------------------- Validate + nộp hồ sơ --------------------------- */
  function handleFileChange(e) {
    const file = e.target.files?.[0] || null;
    setCvFile(file);
    setFieldErrors((prev) => ({ ...prev, cv: validateCv(file) || undefined }));
  }

  function handleFileDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0] || null;
    setCvFile(file);
    setFieldErrors((prev) => ({ ...prev, cv: validateCv(file) || undefined }));
  }

  function validateCv(file) {
    if (!file) return 'Vui lòng đính kèm file CV.';
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) return 'CV phải là file PDF (.pdf).';
    if (file.size > CV_MAX_BYTES) return 'File CV vượt quá 5 MB, vui lòng giảm dung lượng file.';
    if (file.size === 0) return 'File CV đang rỗng, vui lòng chọn file khác.';
    return '';
  }

  function validateForm() {
    const errors = {};
    if (!form.fullName.trim()) errors.fullName = 'Vui lòng nhập họ tên của bạn.';
    const email = form.email.trim();
    if (!email) errors.email = 'Vui lòng nhập email liên hệ.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Email chưa đúng định dạng.';
    const phone = form.phone.trim();
    if (!phone) errors.phone = 'Vui lòng nhập số điện thoại liên hệ.';
    else if (!/^[0-9+\s().-]{9,15}$/.test(phone)) errors.phone = 'Số điện thoại chưa hợp lệ (9–15 ký tự số).';
    const cvErr = validateCv(cvFile);
    if (cvErr) errors.cv = cvErr;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError('');
    if (!selected || !validateForm()) return;
    setSubmitting(true);
    try {
      await applyToJob(selected.id, {
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        cvFile,
      });
      setSubmitted(true);
    } catch (err) {
      setSubmitError(friendlyError(err, 'Nộp hồ sơ thất bại, vui lòng thử lại.'));
    } finally {
      setSubmitting(false);
    }
  }

  const selectedExpired = selected ? isExpired(selected) : false;
  const cvInvalid = Boolean(fieldErrors.cv);
  const submitLabel = selectedExpired
    ? 'Vị trí đã hết hạn nộp hồ sơ'
    : submitting
      ? 'Đang gửi hồ sơ…'
      : 'Nộp hồ sơ ứng tuyển';

  return (
    <div className="min-h-screen bg-white font-sans text-gray-800 antialiased">
      {/* ------------------------------- Header ------------------------------- */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex w-full max-w-[960px] items-center justify-between gap-4 px-5 py-3">
          <div className="flex min-w-0 items-center gap-6">
            <a href="/jobs" className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/20">
              <img src="/logo.svg" alt="Web HRM AI" className="h-8 w-8 shrink-0 rounded-lg" />
              <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-gray-900">
                HRM AI
              </span>
            </a>
            <nav aria-label="Điều hướng trang tuyển dụng" className="hidden items-center gap-6 md:flex">
              <a href="#viec-lam" className="text-sm font-medium text-gray-600 transition hover:text-gray-900">
                Việc làm
              </a>
              <a href="#quy-trinh" className="text-sm font-medium text-gray-600 transition hover:text-gray-900">
                Quy trình ứng tuyển
              </a>
              <a href="/mock-interview" className="text-sm font-medium text-gray-600 transition hover:text-gray-900">
                Luyện phỏng vấn
              </a>
            </nav>
          </div>
          <Button
            variant="secondary"
            size="lg"
            href="/login"
            label="Đăng nhập nội bộ"
            endContent={
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          />
        </div>
      </header>

      {/* ---------------------------- Vùng đầu trang ---------------------------- */}
      <section className="border-b border-gray-200 bg-white">
        <div className="mx-auto w-full max-w-[960px] px-5 pb-10 pt-10 lg:pt-14">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
            Tuyển dụng
          </p>
          <h1 className="mt-3 max-w-2xl text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-gray-900 sm:text-4xl">
            Cơ hội nghề nghiệp tại HRM AI
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-gray-500">
            Xem vị trí đang mở, kiểm tra CV bằng AI và nộp hồ sơ trực tiếp. Mọi hồ sơ
            đều do đội ngũ HR xem xét — AI chỉ hỗ trợ đánh giá mức phù hợp.
          </p>

          {/* Thanh lọc: tìm kiếm + phòng ban trong một hàng. */}
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <TextInput
                type="search"
                label="Tìm vị trí tuyển dụng"
                isLabelHidden
                placeholder="Tìm theo tên vị trí, phòng ban…"
                value={keyword}
                onChange={(value) => setKeyword(value)}
                startIcon={<SearchIcon className="h-4 w-4" />}
                hasClear
                size="lg"
                width="100%"
              />
            </div>
            {departments.length > 1 && (
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                aria-label="Lọc theo phòng ban"
                className="h-9 w-full shrink-0 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/15 sm:w-60"
              >
                <option value="all">Tất cả phòng ban ({jobs.length})</option>
                {departments.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name} ({d.count})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Dòng số liệu lặng — chỉ là chữ, không ô, không số khổng lồ. */}
          {!loading && !loadError && (
            <p className="mt-4 text-[13px] text-gray-500" role="status">
              {hasActiveFilter ? (
                <>
                  Đang hiển thị {visibleJobs.length} vị trí
                  {deptFilter !== 'all' && ` · Phòng ${deptFilter}`}
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="ml-2 rounded font-medium text-brand-700 hover:text-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/20"
                  >
                    Xóa bộ lọc
                  </button>
                </>
              ) : stats ? (
                <>
                  <span className="font-medium tabular-nums text-gray-700">{stats.openCount}</span>
                  {' '}vị trí đang mở
                  {' · '}
                  <span className="font-medium tabular-nums text-gray-700">{stats.deptCount}</span>
                  {' '}phòng ban đang tuyển
                  {' · '}Hạn nộp gần nhất{' '}
                  <span className="font-medium tabular-nums text-gray-700">{stats.nearestDeadline}</span>
                </>
              ) : null}
            </p>
          )}
        </div>
      </section>

      {/* ------------------------------ Danh sách ------------------------------ */}
      <main id="viec-lam" className="mx-auto w-full max-w-[960px] scroll-mt-20 px-5 py-10">
        {loadError && (
          <Alert tone="error" className="mb-6">
            {loadError}
          </Alert>
        )}

        {loading ? (
          <div className="space-y-3" aria-label="Đang tải danh sách tuyển dụng">
            <Skeleton className="h-[68px]" />
            <Skeleton className="h-[68px]" />
            <Skeleton className="h-[68px]" />
          </div>
        ) : visibleJobs.length === 0 && !loadError ? (
          <Card padding={6} className="shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
            <EmptyState
              icon={<BriefcaseIcon className="h-6 w-6" />}
              title={hasActiveFilter ? 'Không tìm thấy vị trí phù hợp' : 'Hiện chưa có vị trí nào đang tuyển'}
              description={
                hasActiveFilter
                  ? 'Thử đổi từ khoá khác hoặc chọn lại phòng ban.'
                  : 'Vui lòng quay lại sau — các vị trí mới sẽ được cập nhật tại trang này.'
              }
              action={
                hasActiveFilter ? (
                  <Button type="button" variant="secondary" label="Xóa bộ lọc" onClick={clearFilters} />
                ) : undefined
              }
            />
          </Card>
        ) : (
          <>
            {/* Tin nổi bật — hạn nộp gần nhất, chỉ một tin, lấp đầy chiều rộng. */}
            {featured && (
              <Card padding={6} className="mb-10 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
                    Vị trí nổi bật
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="neutral"
                      label={departmentName(featured)}
                      icon={<BuildingIcon className="h-3.5 w-3.5" />}
                    />
                    <Badge
                      variant={isExpired(featured) ? 'error' : 'success'}
                      label={isExpired(featured) ? 'Đã hết hạn nộp' : `Hạn nộp: ${formatDate(featured.deadline)}`}
                    />
                  </div>
                </div>
                <h2 className="mt-3 text-xl font-semibold leading-snug tracking-[-0.01em] text-gray-900">
                  {featured.title}
                </h2>
                {featured.quantity ? (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] text-gray-500">
                    <UsersIcon className="h-4 w-4 text-gray-400" />
                    Tuyển {featured.quantity} người
                  </p>
                ) : null}
                {featured.description && (
                  <p className="mt-3 line-clamp-3 max-w-2xl text-sm leading-relaxed text-gray-600">
                    {featured.description}
                  </p>
                )}
                <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <Button
                    variant="primary"
                    size="lg"
                    label="Xem chi tiết & ứng tuyển"
                    onClick={() => openJob(featured)}
                  />
                  <div className="flex items-center gap-5">
                    <button
                      type="button"
                      onClick={() => setCheckJob(featured)}
                      className="inline-flex items-center gap-1.5 rounded text-[13px] font-medium text-gray-500 transition hover:text-brand-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/15"
                    >
                      <SparkleIcon className="h-4 w-4 shrink-0 text-brand-600" />
                      AI kiểm tra CV
                    </button>
                    <a
                      href={`/mock-interview?job=${featured.id}`}
                      className="inline-flex items-center gap-1.5 rounded text-[13px] font-medium text-gray-500 transition hover:text-brand-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/15"
                    >
                      <MicIcon className="h-4 w-4 shrink-0 text-brand-600" />
                      Luyện phỏng vấn AI
                    </a>
                  </div>
                </div>
              </Card>
            )}

            {/* Các tin còn lại — hàng nhóm theo phòng ban (kiểu Greenhouse). */}
            {restByDept.map((group) => (
              <section key={group.name} className="mt-10 first:mt-0" aria-label={`Phòng ${group.name}`}>
                <div className="flex items-baseline gap-2 pb-3">
                  <h3 className="text-[15px] font-semibold text-gray-900">{group.name}</h3>
                  <span className="text-[13px] text-gray-500">
                    {group.jobs.length} vị trí
                  </span>
                </div>
                <ul className="divide-y divide-gray-200 border-y border-gray-200">
                  {group.jobs.map((job) => {
                    const expired = isExpired(job);
                    return (
                      <li key={job.id}>
                        <button
                          type="button"
                          onClick={() => openJob(job)}
                          aria-label={`Xem chi tiết vị trí ${job.title || ''}`}
                          className="group -mx-3 flex w-[calc(100%+24px)] items-center justify-between gap-4 rounded-lg px-3 py-4 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/15"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[15px] font-medium text-gray-900 transition-colors group-hover:text-brand-700">
                              {job.title}
                            </span>
                            <span className="mt-0.5 block text-[13px] text-gray-500">
                              {job.quantity ? `Tuyển ${job.quantity} người · ` : ''}
                              {expired ? (
                                <span className="text-rose-600">Đã hết hạn nộp</span>
                              ) : (
                                `Hạn nộp: ${formatDate(job.deadline)}`
                              )}
                            </span>
                          </span>
                          <ChevronRightIcon className="h-5 w-5 shrink-0 text-gray-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand-600" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </>
        )}
      </main>

      {/* ------------------------- Quy trình ứng tuyển ------------------------- */}
      <section id="quy-trinh" className="scroll-mt-20 border-t border-gray-200 bg-white">
        <div className="mx-auto w-full max-w-[960px] px-5 py-12">
          <h2 className="text-xl font-semibold tracking-[-0.01em] text-gray-900">Quy trình ứng tuyển</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">
            Bốn bước đơn giản — bạn có thể kiểm tra CV bằng AI và luyện phỏng vấn thử trước khi
            nộp hồ sơ chính thức.
          </p>
          <ol className="relative mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {/* Đường nối dọc (mobile) và ngang (desktop) — chạy qua tâm các vòng số. */}
            <div
              aria-hidden="true"
              className="absolute bottom-5 left-5 top-5 border-l-2 border-gray-200 sm:hidden"
            />
            <div
              aria-hidden="true"
              className="absolute left-5 right-5 top-5 hidden border-t-2 border-gray-200 lg:block"
            />
            {PROCESS_STEPS.map((step, i) => (
              <li key={step.title} className="relative">
                <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[15px] font-semibold text-brand-700 ring-1 ring-inset ring-gray-300">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-[15px] font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-gray-500">{step.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* -------------------------------- Footer -------------------------------- */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto w-full max-w-[960px] px-5 py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <img src="/logo.svg" alt="Web HRM AI" className="h-8 w-8 rounded-lg" />
                <span className="text-[15px] font-semibold tracking-[-0.01em] text-gray-900">
                  HRM AI <span className="font-normal text-gray-400">· Tuyển dụng</span>
                </span>
              </div>
              <p className="mt-3 max-w-sm text-xs leading-relaxed text-gray-400">
                Mọi hồ sơ ứng tuyển được bảo mật và chỉ dùng cho mục đích tuyển dụng của công ty.
              </p>
            </div>
            <nav aria-label="Liên kết trang tuyển dụng" className="flex flex-wrap gap-x-6 gap-y-2">
              <a href="/jobs" className="text-sm text-gray-600 transition hover:text-gray-900">
                Việc làm
              </a>
              <a href="#quy-trinh" className="text-sm text-gray-600 transition hover:text-gray-900">
                Quy trình ứng tuyển
              </a>
              <a href="/mock-interview" className="text-sm text-gray-600 transition hover:text-gray-900">
                Luyện phỏng vấn với AI
              </a>
              <a href="/login" className="text-sm text-gray-600 transition hover:text-gray-900">
                Đăng nhập nội bộ
              </a>
            </nav>
          </div>
          <div className="mt-8 border-t border-gray-100 pt-5 text-xs text-gray-400">
            © 2026 HRM AI
          </div>
        </div>
      </footer>

      {/* --------------------------- Modal AI kiểm tra CV --------------------------- */}
      {checkJob && (
        <CvCheckModal
          job={checkJob}
          onClose={() => setCheckJob(null)}
          onApply={(job) => {
            setCheckJob(null);
            openJob(job);
          }}
        />
      )}

      {/* --------------------------- Modal chi tiết + ứng tuyển --------------------------- */}
      {selected && (
        <Modal
          open
          title={selected.title}
          onClose={closeJob}
          width="max-w-5xl"
          actions={
            submitted ? undefined : (
              <>
                <p className="mr-auto hidden text-left text-xs leading-relaxed text-gray-400 sm:block">
                  Bằng việc nộp hồ sơ, bạn đồng ý để công ty lưu trữ và xử lý thông tin cho mục
                  đích tuyển dụng vị trí này.
                </p>
                <Button
                  type="submit"
                  form="pj-apply-form"
                  variant="primary"
                  size="md"
                  label={submitLabel}
                  isLoading={submitting}
                  isDisabled={submitting || selectedExpired}
                />
              </>
            )
          }
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Badge
              variant="neutral"
              label={departmentName(selected)}
              icon={<BuildingIcon className="h-3.5 w-3.5" />}
            />
            {selected.quantity ? (
              <span className="inline-flex items-center gap-1.5 text-[13px] text-gray-500">
                <UsersIcon className="h-4 w-4 text-gray-400" />
                Tuyển {selected.quantity} người
              </span>
            ) : null}
            <Badge
              variant={selectedExpired ? 'error' : 'success'}
              label={selectedExpired ? 'Đã hết hạn nộp' : `Hạn nộp: ${formatDate(selected.deadline)}`}
            />
          </div>

          {detailLoading && (
            <p className="mt-4 text-sm text-gray-400">Đang tải mô tả đầy đủ…</p>
          )}

          {submitted ? (
            <div className="mt-6">
              <JobDescription job={selected} />
              <Alert tone="success" className="mt-8 px-6 py-8 text-center">
                <div
                  aria-hidden="true"
                  className="mx-auto mb-4 flex h-16 w-16 animate-scale-in items-center justify-center rounded-full bg-emerald-500 text-white"
                >
                  <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none">
                    <path d="m4.5 12.5 5 5 10-11" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-emerald-900">Nộp hồ sơ thành công!</h3>
                <p className="mx-auto mb-5 mt-2 max-w-md text-sm font-normal leading-relaxed text-emerald-800/80">
                  Cảm ơn bạn đã ứng tuyển vị trí <strong>{selected.title}</strong>. Đội ngũ HR sẽ
                  xem xét hồ sơ và liên hệ qua email/số điện thoại bạn đã cung cấp nếu phù hợp.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  label="Xem các vị trí khác"
                  onClick={closeJob}
                />
              </Alert>
            </div>
          ) : (
            <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div>
                <JobDescription job={selected} />
              </div>
              <div className="h-fit lg:sticky lg:top-0">
                <Card variant="muted" padding={5}>
                  <form id="pj-apply-form" onSubmit={handleSubmit} noValidate>
                    <h3 className="mb-5 text-base font-semibold text-gray-900">Ứng tuyển vị trí này</h3>

                    {submitError && (
                      <Alert tone="error" className="mb-4">
                        {submitError}
                      </Alert>
                    )}

                    <div className="space-y-4">
                      <FormField
                        label={<>Họ và tên <span className="text-rose-500">*</span></>}
                        error={fieldErrors.fullName}
                      >
                        <Input
                          id="pj-fullname"
                          type="text"
                          autoComplete="name"
                          placeholder="VD: Nguyễn Văn A"
                          value={form.fullName}
                          onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                          className={fieldErrors.fullName ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15' : ''}
                        />
                      </FormField>

                      <FormField
                        label={<>Email liên hệ <span className="text-rose-500">*</span></>}
                        error={fieldErrors.email}
                      >
                        <Input
                          id="pj-email"
                          type="email"
                          autoComplete="email"
                          placeholder="VD: ten.ban@email.com"
                          value={form.email}
                          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                          className={fieldErrors.email ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15' : ''}
                        />
                      </FormField>

                      <FormField
                        label={<>Số điện thoại <span className="text-rose-500">*</span></>}
                        error={fieldErrors.phone}
                      >
                        <Input
                          id="pj-phone"
                          type="tel"
                          autoComplete="tel"
                          placeholder="VD: 0901 234 567"
                          value={form.phone}
                          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                          className={fieldErrors.phone ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15' : ''}
                        />
                      </FormField>

                      <FormField
                        label={<>File CV (PDF, tối đa 5 MB) <span className="text-rose-500">*</span></>}
                        error={fieldErrors.cv}
                        hint={
                          cvFile && !cvInvalid
                            ? `Đã chọn: ${cvFile.name} (${(cvFile.size / 1024).toFixed(0)} KB)`
                            : undefined
                        }
                      >
                        <label
                          htmlFor="pj-cv"
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOver(true);
                          }}
                          onDragLeave={() => setDragOver(false)}
                          onDrop={handleFileDrop}
                          className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition duration-200 ${
                            cvInvalid
                              ? 'border-rose-300 bg-rose-50/60 hover:border-rose-400'
                              : dragOver
                                ? 'border-brand-500 bg-brand-50'
                                : 'border-gray-300 bg-white hover:border-brand-400 hover:bg-brand-50/60'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`flex h-11 w-11 items-center justify-center rounded-full ring-1 ring-inset transition ${
                              cvInvalid
                                ? 'bg-rose-100 text-rose-500 ring-rose-200'
                                : 'bg-brand-50 text-brand-600 ring-brand-100'
                            }`}
                          >
                            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                              <path
                                d="M12 16V5m0 0 4 4m-4-4L8 9M4 19h16"
                                stroke="currentColor"
                                strokeWidth="1.9"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                transform="translate(0 -1)"
                              />
                            </svg>
                          </span>
                          <span className="max-w-full text-sm font-semibold leading-snug text-gray-700 [overflow-wrap:anywhere]">
                            {cvFile ? cvFile.name : 'Kéo thả file CV vào đây hoặc bấm để chọn file'}
                          </span>
                          <span className="text-xs text-gray-400">Chỉ nhận file PDF, dung lượng tối đa 5 MB</span>
                        </label>
                        <input
                          id="pj-cv"
                          ref={fileInputRef}
                          className="sr-only"
                          type="file"
                          accept=".pdf,application/pdf"
                          onChange={handleFileChange}
                        />
                      </FormField>
                    </div>
                  </form>
                </Card>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
