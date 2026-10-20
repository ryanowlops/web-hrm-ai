import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listOpenJobs, getPublicJob, applyToJob, friendlyError } from '../services';

/**
 * Trang Tuyển dụng CÔNG KHAI (route /jobs) — khách chưa đăng nhập (FR-08).
 * - Xem danh sách tin đang mở, tìm kiếm/lọc ngay tại client cho mượt.
 * - Mở chi tiết 1 tin (JD + yêu cầu đầy đủ) trong hộp thoại.
 * - Form nộp CV: họ tên, email, số điện thoại, file CV PDF tối đa 5 MB —
 *   validate kỹ tại client và hiển thị lỗi theo từng trường; backend vẫn
 *   kiểm tra lại độc lập. Kết quả thành công/lỗi đều thông báo rõ ràng.
 */

const CV_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const STYLE = `
.pj-wrap { min-height: 100vh; background: var(--color-bg); }
.pj-topbar {
  position: sticky; top: 0; z-index: 20;
  background: var(--color-surface); border-bottom: 1px solid var(--color-border);
}
.pj-topbar-in {
  max-width: 1200px; margin: 0 auto; padding: var(--space-3) var(--space-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-4);
}
.pj-logo { display: flex; align-items: center; gap: var(--space-3); font-weight: var(--weight-bold); font-size: var(--text-lg); color: var(--color-text); }
.pj-logo-mark {
  width: 36px; height: 36px; border-radius: var(--radius-md);
  background: var(--color-primary-600); color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: var(--text-base);
}
.pj-login-link { font-size: var(--text-sm); font-weight: var(--weight-medium); }
.pj-hero {
  background: var(--color-sidebar-bg); color: #fff;
  padding: var(--space-12) var(--space-6) var(--space-10);
}
.pj-hero-in { max-width: 1200px; margin: 0 auto; animation: pjFadeUp var(--duration-slow) var(--ease-out) both; }
.pj-hero h1 { color: #fff; font-size: var(--text-3xl); margin-bottom: var(--space-3); }
.pj-hero p { color: var(--color-sidebar-text); max-width: 640px; line-height: var(--leading-relaxed); }
.pj-search {
  margin-top: var(--space-6); max-width: 560px; display: flex; align-items: center; gap: var(--space-2);
  background: #fff; border-radius: var(--radius-md); padding: 0 var(--space-4);
  box-shadow: var(--shadow-md);
}
.pj-search input { flex: 1; border: none; padding: var(--space-3) 0; font-size: var(--text-base); background: transparent; color: var(--color-text); }
.pj-search input:focus { outline: none; }
.pj-search:focus-within { outline: 2px solid var(--color-primary-300); }
.pj-main { max-width: 1200px; margin: 0 auto; padding: var(--space-8) var(--space-6) var(--space-12); }
.pj-count { font-size: var(--text-sm); color: var(--color-text-secondary); margin-bottom: var(--space-4); }
.pj-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--space-5); }
.pj-job {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-lg); padding: var(--space-5);
  display: flex; flex-direction: column; gap: var(--space-3);
  box-shadow: var(--shadow-sm); cursor: pointer;
  transition: transform var(--duration-base) var(--ease-out), box-shadow var(--duration-base) var(--ease-out), border-color var(--duration-base) var(--ease-out);
  animation: pjFadeUp var(--duration-slow) var(--ease-out) both;
}
.pj-job:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); border-color: var(--color-primary-300); }
.pj-job-title { font-size: var(--text-lg); font-weight: var(--weight-semibold); color: var(--color-text); }
.pj-job-meta { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.pj-chip {
  display: inline-flex; align-items: center; gap: var(--space-1);
  padding: 2px var(--space-2); border-radius: var(--radius-full);
  background: var(--color-gray-100); color: var(--color-gray-700);
  font-size: var(--text-xs); font-weight: var(--weight-medium);
}
.pj-chip.deadline { background: var(--color-info-bg); color: var(--color-info); }
.pj-chip.expired { background: var(--color-danger-bg); color: var(--color-danger); }
.pj-job-desc {
  font-size: var(--text-sm); color: var(--color-text-secondary); line-height: var(--leading-relaxed);
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.pj-job-cta { margin-top: auto; font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--color-primary-700); }
.pj-empty {
  text-align: center; color: var(--color-text-secondary);
  padding: var(--space-12) var(--space-4); background: var(--color-surface);
  border: 1px dashed var(--color-border-strong); border-radius: var(--radius-lg);
}
.pj-skeleton {
  height: 190px; border-radius: var(--radius-lg);
  background: linear-gradient(90deg, var(--color-gray-100) 25%, var(--color-gray-200) 50%, var(--color-gray-100) 75%);
  background-size: 200% 100%; animation: pjShimmer 1.2s infinite;
}
.pj-alert {
  padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
  font-size: var(--text-sm); border: 1px solid transparent; margin-bottom: var(--space-5);
  animation: pjFadeUp var(--duration-base) var(--ease-out) both;
}
.pj-alert.error { background: var(--color-danger-bg); color: var(--color-danger); border-color: var(--color-danger-border); }
.pj-overlay {
  position: fixed; inset: 0; z-index: 50; background: var(--color-overlay);
  display: flex; align-items: flex-start; justify-content: center;
  padding: var(--space-6) var(--space-4); overflow-y: auto;
  animation: pjFadeIn var(--duration-base) var(--ease-out) both;
}
.pj-modal {
  background: var(--color-surface); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg); width: 100%; max-width: 760px;
  padding: var(--space-6); margin: auto 0;
  animation: pjScaleIn var(--duration-slow) var(--ease-out) both;
}
.pj-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); }
.pj-close {
  flex: 0 0 auto; width: 34px; height: 34px; border-radius: var(--radius-full);
  display: flex; align-items: center; justify-content: center; color: var(--color-text-muted);
}
.pj-close:hover { background: var(--color-gray-100); color: var(--color-text); }
.pj-section-title { font-size: var(--text-base); font-weight: var(--weight-semibold); margin: var(--space-5) 0 var(--space-2); }
.pj-pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--text-sm); line-height: var(--leading-relaxed); color: var(--color-gray-700); }
.pj-form { border-top: 1px solid var(--color-border); margin-top: var(--space-6); padding-top: var(--space-5); }
.pj-field { margin-bottom: var(--space-4); }
.pj-label { display: block; font-size: var(--text-sm); font-weight: var(--weight-medium); margin-bottom: var(--space-1); }
.pj-label .req { color: var(--color-danger); }
.pj-input {
  width: 100%; padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-strong); border-radius: var(--radius-md);
  font-size: var(--text-sm); background: var(--color-surface);
}
.pj-input:focus { border-color: var(--color-primary-500); outline: 2px solid var(--color-primary-100); }
.pj-input.invalid { border-color: var(--color-danger-600); }
.pj-field-error { margin-top: var(--space-1); font-size: var(--text-xs); color: var(--color-danger); }
.pj-file-name { margin-top: var(--space-1); font-size: var(--text-xs); color: var(--color-text-secondary); }
.pj-submit {
  width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
  padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
  background: var(--color-primary-600); color: var(--color-text-on-primary);
  font-size: var(--text-base); font-weight: var(--weight-semibold);
  transition: background var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out);
}
.pj-submit:hover:not(:disabled) { background: var(--color-primary-700); }
.pj-submit:active:not(:disabled) { transform: scale(0.99); }
.pj-submit:disabled { opacity: 0.55; cursor: not-allowed; }
.pj-success {
  text-align: center; padding: var(--space-8) var(--space-4);
  background: var(--color-success-bg); border: 1px solid var(--color-success-border);
  border-radius: var(--radius-lg); animation: pjScaleIn var(--duration-slow) var(--ease-out) both;
}
.pj-success-icon {
  width: 54px; height: 54px; margin: 0 auto var(--space-3); border-radius: var(--radius-full);
  background: var(--color-success); color: #fff;
  display: flex; align-items: center; justify-content: center;
}
.pj-ghost-btn {
  display: inline-flex; padding: var(--space-2) var(--space-4); border-radius: var(--radius-md);
  border: 1px solid var(--color-border-strong); background: var(--color-surface);
  font-size: var(--text-sm); font-weight: var(--weight-medium);
}
.pj-footer {
  border-top: 1px solid var(--color-border); padding: var(--space-5) var(--space-6);
  text-align: center; font-size: var(--text-xs); color: var(--color-text-muted);
}
@keyframes pjFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pjFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes pjScaleIn { from { opacity: 0; transform: scale(0.97) translateY(6px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes pjShimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@media (max-width: 768px) {
  .pj-hero { padding: var(--space-8) var(--space-4) var(--space-6); }
  .pj-hero h1 { font-size: var(--text-2xl); }
  .pj-main, .pj-topbar-in { padding-left: var(--space-4); padding-right: var(--space-4); }
  .pj-grid { grid-template-columns: 1fr; }
  .pj-modal { padding: var(--space-5) var(--space-4); }
}
`;

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

export default function PublicJobsPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [keyword, setKeyword] = useState('');

  const [selected, setSelected] = useState(null); // tin đang mở chi tiết
  const [detailLoading, setDetailLoading] = useState(false);

  const [form, setForm] = useState(emptyForm);
  const [cvFile, setCvFile] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);
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

  const visibleJobs = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return jobs;
    return jobs.filter(
      (j) =>
        (j.title || '').toLowerCase().includes(kw) ||
        departmentName(j).toLowerCase().includes(kw) ||
        (j.description || '').toLowerCase().includes(kw),
    );
  }, [jobs, keyword]);

  /* ------------------------------ Mở chi tiết ------------------------------- */
  const openJob = useCallback(async (job) => {
    setSelected(job);
    setForm(emptyForm);
    setCvFile(null);
    setFieldErrors({});
    setSubmitError('');
    setSubmitted(false);
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

  return (
    <div className="pj-wrap">
      <style>{STYLE}</style>

      <header className="pj-topbar">
        <div className="pj-topbar-in">
          <div className="pj-logo">
            <span className="pj-logo-mark" aria-hidden="true">HR</span>
            <span>HRM AI · Tuyển dụng</span>
          </div>
          <a className="pj-login-link" href="/login">Đăng nhập nội bộ</a>
        </div>
      </header>

      <section className="pj-hero">
        <div className="pj-hero-in">
          <h1>Cơ hội nghề nghiệp đang mở</h1>
          <p>
            Xem các vị trí đang tuyển và nộp CV trực tiếp tại đây. Hồ sơ của bạn sẽ được đội ngũ
            HR xem xét — hệ thống có hỗ trợ AI phân tích mức phù hợp, nhưng quyết định cuối cùng
            luôn do con người đưa ra.
          </p>
          <div className="pj-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: 'var(--color-gray-400)', flex: '0 0 auto' }}>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path d="m20 20-3.8-3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <label className="sr-only" htmlFor="pj-keyword">Tìm vị trí tuyển dụng</label>
            <input
              id="pj-keyword"
              type="search"
              placeholder="Tìm theo tên vị trí, phòng ban…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
        </div>
      </section>

      <main className="pj-main">
        {loadError && (
          <div className="pj-alert error" role="alert">
            {loadError}
          </div>
        )}

        {!loading && !loadError && (
          <div className="pj-count" role="status">
            {visibleJobs.length > 0
              ? `Đang hiển thị ${visibleJobs.length} vị trí đang tuyển`
              : 'Không có vị trí nào khớp với tìm kiếm'}
          </div>
        )}

        {loading ? (
          <div className="pj-grid" aria-label="Đang tải danh sách tuyển dụng">
            <div className="pj-skeleton" />
            <div className="pj-skeleton" />
            <div className="pj-skeleton" />
          </div>
        ) : visibleJobs.length === 0 && !loadError ? (
          <div className="pj-empty">
            <p style={{ fontWeight: 'var(--weight-medium)', color: 'var(--color-text)', marginBottom: 'var(--space-2)' }}>
              {keyword ? 'Không tìm thấy vị trí phù hợp' : 'Hiện chưa có vị trí nào đang tuyển'}
            </p>
            <p>
              {keyword
                ? 'Thử đổi từ khoá ngắn hơn, ví dụ "kế toán", "kỹ thuật", "kinh doanh".'
                : 'Vui lòng quay lại sau — các vị trí mới sẽ được cập nhật tại trang này.'}
            </p>
          </div>
        ) : (
          <div className="pj-grid">
            {visibleJobs.map((job, idx) => {
              const expired = isExpired(job);
              return (
                <article
                  key={job.id}
                  className="pj-job"
                  style={{ animationDelay: `${Math.min(idx, 8) * 60}ms` }}
                  onClick={() => openJob(job)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Xem chi tiết vị trí ${job.title || ''}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openJob(job);
                    }
                  }}
                >
                  <div className="pj-job-title">{job.title}</div>
                  <div className="pj-job-meta">
                    <span className="pj-chip">{departmentName(job)}</span>
                    {job.quantity ? <span className="pj-chip">Tuyển {job.quantity} người</span> : null}
                    <span className={`pj-chip ${expired ? 'expired' : 'deadline'}`}>
                      {expired ? 'Đã hết hạn nộp' : `Hạn nộp: ${formatDate(job.deadline)}`}
                    </span>
                  </div>
                  {job.description && <p className="pj-job-desc">{job.description}</p>}
                  <div className="pj-job-cta">Xem chi tiết & ứng tuyển →</div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <footer className="pj-footer">
        Mọi hồ sơ ứng tuyển được bảo mật và chỉ dùng cho mục đích tuyển dụng của công ty.
      </footer>

      {/* --------------------------- Modal chi tiết + ứng tuyển --------------------------- */}
      {selected && (
        <div
          className="pj-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Chi tiết vị trí ${selected.title || ''}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeJob();
          }}
        >
          <div className="pj-modal">
            <div className="pj-modal-head">
              <div>
                <h2 style={{ fontSize: 'var(--text-2xl)' }}>{selected.title}</h2>
                <div className="pj-job-meta" style={{ marginTop: 'var(--space-2)' }}>
                  <span className="pj-chip">{departmentName(selected)}</span>
                  {selected.quantity ? <span className="pj-chip">Tuyển {selected.quantity} người</span> : null}
                  <span className={`pj-chip ${selectedExpired ? 'expired' : 'deadline'}`}>
                    {selectedExpired ? 'Đã hết hạn nộp' : `Hạn nộp: ${formatDate(selected.deadline)}`}
                  </span>
                </div>
              </div>
              <button type="button" className="pj-close" onClick={closeJob} aria-label="Đóng chi tiết">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 5l14 14M19 5 5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {detailLoading && <p className="text-sm text-muted" style={{ marginTop: 'var(--space-3)' }}>Đang tải mô tả đầy đủ…</p>}

            {selected.description && (
              <>
                <h3 className="pj-section-title">Mô tả công việc</h3>
                <p className="pj-pre">{selected.description}</p>
              </>
            )}
            {selected.requirements && (
              <>
                <h3 className="pj-section-title">Yêu cầu ứng viên</h3>
                <p className="pj-pre">{selected.requirements}</p>
              </>
            )}

            {submitted ? (
              <div className="pj-form">
                <div className="pj-success" role="status">
                  <div className="pj-success-icon" aria-hidden="true">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                      <path d="m4.5 12.5 5 5 10-11" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h3 style={{ marginBottom: 'var(--space-2)' }}>Nộp hồ sơ thành công!</h3>
                  <p className="text-sm text-secondary" style={{ marginBottom: 'var(--space-4)' }}>
                    Cảm ơn bạn đã ứng tuyển vị trí <strong>{selected.title}</strong>. Đội ngũ HR sẽ
                    xem xét hồ sơ và liên hệ qua email/số điện thoại bạn đã cung cấp nếu phù hợp.
                  </p>
                  <button type="button" className="pj-ghost-btn" onClick={closeJob}>
                    Xem các vị trí khác
                  </button>
                </div>
              </div>
            ) : (
              <form className="pj-form" onSubmit={handleSubmit} noValidate>
                <h3 className="pj-section-title" style={{ marginTop: 0 }}>Ứng tuyển vị trí này</h3>

                {submitError && (
                  <div className="pj-alert error" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
                    {submitError}
                  </div>
                )}

                <div className="pj-field">
                  <label className="pj-label" htmlFor="pj-fullname">
                    Họ và tên <span className="req">*</span>
                  </label>
                  <input
                    id="pj-fullname"
                    className={`pj-input${fieldErrors.fullName ? ' invalid' : ''}`}
                    type="text"
                    autoComplete="name"
                    placeholder="VD: Nguyễn Văn A"
                    value={form.fullName}
                    onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  />
                  {fieldErrors.fullName && <div className="pj-field-error">{fieldErrors.fullName}</div>}
                </div>

                <div className="pj-field">
                  <label className="pj-label" htmlFor="pj-email">
                    Email liên hệ <span className="req">*</span>
                  </label>
                  <input
                    id="pj-email"
                    className={`pj-input${fieldErrors.email ? ' invalid' : ''}`}
                    type="email"
                    autoComplete="email"
                    placeholder="VD: ten.ban@email.com"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                  {fieldErrors.email && <div className="pj-field-error">{fieldErrors.email}</div>}
                </div>

                <div className="pj-field">
                  <label className="pj-label" htmlFor="pj-phone">
                    Số điện thoại <span className="req">*</span>
                  </label>
                  <input
                    id="pj-phone"
                    className={`pj-input${fieldErrors.phone ? ' invalid' : ''}`}
                    type="tel"
                    autoComplete="tel"
                    placeholder="VD: 0901 234 567"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                  {fieldErrors.phone && <div className="pj-field-error">{fieldErrors.phone}</div>}
                </div>

                <div className="pj-field">
                  <label className="pj-label" htmlFor="pj-cv">
                    File CV (PDF, tối đa 5 MB) <span className="req">*</span>
                  </label>
                  <input
                    id="pj-cv"
                    ref={fileInputRef}
                    className={`pj-input${fieldErrors.cv ? ' invalid' : ''}`}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleFileChange}
                  />
                  {cvFile && !fieldErrors.cv && (
                    <div className="pj-file-name">
                      Đã chọn: {cvFile.name} ({(cvFile.size / 1024).toFixed(0)} KB)
                    </div>
                  )}
                  {fieldErrors.cv && <div className="pj-field-error">{fieldErrors.cv}</div>}
                </div>

                <button type="submit" className="pj-submit" disabled={submitting || selectedExpired}>
                  {selectedExpired
                    ? 'Vị trí đã hết hạn nộp hồ sơ'
                    : submitting
                      ? 'Đang gửi hồ sơ…'
                      : 'Nộp hồ sơ ứng tuyển'}
                </button>
                <p className="text-xs text-muted" style={{ marginTop: 'var(--space-3)', textAlign: 'center' }}>
                  Bằng việc nộp hồ sơ, bạn đồng ý để công ty lưu trữ và xử lý thông tin cho mục
                  đích tuyển dụng vị trí này.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
