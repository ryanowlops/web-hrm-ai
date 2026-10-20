import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listJobs,
  createJob,
  updateJob,
  closeJob,
  reopenJob,
  listDepartments,
  friendlyError,
} from '../services';

const JOB_STATUS = {
  open: { label: 'Đang tuyển', classes: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  closed: { label: 'Đã đóng', classes: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

const EMPTY_FORM = {
  title: '',
  department_id: '',
  quantity: 1,
  deadline: '',
  description: '',
  requirements: '',
  status: 'open',
};

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isOverdue(job) {
  if (!job?.deadline || job.status !== 'open') return false;
  const d = new Date(job.deadline);
  return !Number.isNaN(d.getTime()) && d < new Date(new Date().toDateString());
}

/* ------------------------------- Job form -------------------------------- */

function JobFormModal({ open, initial, departments, saving, error, onClose, onSubmit }) {
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              title: initial.title ?? '',
              department_id: initial.department_id ?? initial.department?.id ?? '',
              quantity: initial.quantity ?? 1,
              deadline: initial.deadline ? String(initial.deadline).slice(0, 10) : '',
              description: initial.description ?? '',
              requirements: initial.requirements ?? '',
              status: initial.status ?? 'open',
            }
          : EMPTY_FORM,
      );
    }
  }, [open, initial]);

  if (!open) return null;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      title: form.title.trim(),
      department_id: form.department_id ? Number(form.department_id) : null,
      quantity: Number(form.quantity) || 1,
      deadline: form.deadline || null,
      description: form.description.trim(),
      requirements: form.requirements.trim(),
      status: form.status,
    });
  };

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200';
  const labelCls = 'mb-1 block text-sm font-medium text-slate-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {initial ? 'Sửa tin tuyển dụng' : 'Đăng tin tuyển dụng mới'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>
              Vị trí tuyển <span className="text-red-500">*</span>
            </label>
            <input
              className={inputCls}
              value={form.title}
              onChange={set('title')}
              required
              placeholder="Ví dụ: Lập trình viên Python (Flask)"
            />
          </div>

          <div>
            <label className={labelCls}>Phòng ban</label>
            <select className={inputCls} value={form.department_id} onChange={set('department_id')}>
              <option value="">— Chưa chọn —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Số lượng</label>
              <input
                type="number"
                min="1"
                className={inputCls}
                value={form.quantity}
                onChange={set('quantity')}
              />
            </div>
            <div>
              <label className={labelCls}>Hạn nộp CV</label>
              <input type="date" className={inputCls} value={form.deadline} onChange={set('deadline')} />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls}>
              Mô tả công việc (JD) <span className="text-red-500">*</span>
            </label>
            <textarea
              className={inputCls}
              rows={5}
              value={form.description}
              onChange={set('description')}
              required
              placeholder="Công việc chính, trách nhiệm, quyền lợi..."
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls}>Yêu cầu ứng viên</label>
            <textarea
              className={inputCls}
              rows={4}
              value={form.requirements}
              onChange={set('requirements')}
              placeholder="Kỹ năng bắt buộc, số năm kinh nghiệm... — nội dung này là chuẩn để AI đối chiếu khi sàng lọc CV"
            />
            <p className="mt-1 text-xs text-slate-400">
              Mẹo: viết yêu cầu càng cụ thể, kết quả AI sàng lọc CV càng sát.
            </p>
          </div>

          {initial && (
            <div>
              <label className={labelCls}>Trạng thái</label>
              <select className={inputCls} value={form.status} onChange={set('status')}>
                <option value="open">Đang tuyển</option>
                <option value="closed">Đã đóng</option>
              </select>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Đang lưu...' : initial ? 'Lưu thay đổi' : 'Đăng tin'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* --------------------------------- Page ---------------------------------- */

export default function RecruitmentPage() {
  const [jobs, setJobs] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, totalItems: 0 });
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyJobId, setBusyJobId] = useState(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listJobs({
        page,
        limit: 20,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        sortBy: 'created_at',
        sortOrder: 'desc',
      });
      setJobs(Array.isArray(res) ? res : res?.data ?? []);
      if (res?.meta) setMeta(res.meta);
    } catch (err) {
      setError(friendlyError(err, 'Không tải được danh sách tin tuyển dụng.'));
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    listDepartments()
      .then(setDepartments)
      .catch(() => setDepartments([]));
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const stats = useMemo(
    () => ({
      open: jobs.filter((j) => j.status === 'open').length,
      candidates: jobs.reduce((sum, j) => sum + (j.candidates_count ?? j.candidate_count ?? 0), 0),
    }),
    [jobs],
  );

  const handleSubmitForm = async (payload) => {
    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        await updateJob(editing.id, payload);
        setNotice('Đã cập nhật tin tuyển dụng.');
      } else {
        await createJob(payload);
        setNotice('Đã đăng tin tuyển dụng mới.');
      }
      setModalOpen(false);
      setEditing(null);
      loadJobs();
    } catch (err) {
      setFormError(friendlyError(err, 'Không lưu được tin tuyển dụng.'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (job) => {
    setBusyJobId(job.id);
    try {
      if (job.status === 'open') {
        await closeJob(job.id);
        setNotice(`Đã đóng tin "${job.title}".`);
      } else {
        await reopenJob(job.id);
        setNotice(`Đã mở lại tin "${job.title}".`);
      }
      loadJobs();
    } catch (err) {
      setError(friendlyError(err, 'Không đổi được trạng thái tin tuyển dụng.'));
    } finally {
      setBusyJobId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tuyển dụng</h1>
          <p className="mt-1 text-sm text-slate-500">
            Quản lý tin tuyển dụng và ứng viên. Mở 1 vị trí để xem CV và dùng{' '}
            <span className="font-medium text-indigo-600">AI sàng lọc CV</span> — AI chỉ gợi ý, HR là
            người quyết định.
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setFormError('');
            setModalOpen(true);
          }}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500"
        >
          + Đăng tin tuyển dụng
        </button>
      </div>

      {/* Mini stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Tin đang hiển thị</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{meta.totalItems ?? jobs.length}</p>
        </div>
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Đang tuyển (trang này)</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{stats.open}</p>
        </div>
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Ứng viên (trang này)</p>
          <p className="mt-1 text-2xl font-bold text-indigo-600">{stats.candidates}</p>
        </div>
      </div>

      {notice && (
        <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Tìm theo tên vị trí..."
          className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="open">Đang tuyển</option>
          <option value="closed">Đã đóng</option>
        </select>
        <button
          onClick={loadJobs}
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300 transition hover:bg-slate-50"
        >
          Tải lại
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl bg-white p-5 ring-1 ring-slate-200">
              <div className="h-4 w-1/3 rounded bg-slate-200" />
              <div className="mt-3 h-3 w-2/3 rounded bg-slate-100" />
              <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl bg-white px-6 py-14 text-center ring-1 ring-slate-200">
          <p className="text-base font-medium text-slate-700">Chưa có tin tuyển dụng nào</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
            Bấm "Đăng tin tuyển dụng" để tạo vị trí đầu tiên. Sau khi ứng viên nộp CV, bạn có thể dùng AI
            sàng lọc ngay trong trang chi tiết của vị trí.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
          <ul className="divide-y divide-slate-100">
            {jobs.map((job) => {
              const st = JOB_STATUS[job.status] ?? JOB_STATUS.closed;
              const deptName = job.department_name ?? job.department?.name;
              const count = job.candidates_count ?? job.candidate_count ?? 0;
              return (
                <li key={job.id} className="p-5 transition hover:bg-slate-50">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/recruitment/${job.id}`}
                          className="text-base font-semibold text-slate-900 transition hover:text-indigo-600"
                        >
                          {job.title}
                        </Link>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${st.classes}`}
                        >
                          {st.label}
                        </span>
                        {isOverdue(job) && (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600 ring-1 ring-red-200">
                            Quá hạn nộp
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {deptName ? `${deptName} · ` : ''}Tuyển {job.quantity ?? 1} người · Hạn nộp:{' '}
                        {formatDate(job.deadline)} · {count} ứng viên
                      </p>
                      {job.description && (
                        <p className="mt-2 line-clamp-2 max-w-3xl text-sm text-slate-500">{job.description}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Link
                        to={`/recruitment/${job.id}`}
                        className="rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
                      >
                        Xem ứng viên
                      </Link>
                      <button
                        onClick={() => {
                          setEditing(job);
                          setFormError('');
                          setModalOpen(true);
                        }}
                        className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 transition hover:bg-slate-50"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => handleToggleStatus(job)}
                        disabled={busyJobId === job.id}
                        className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-50"
                      >
                        {busyJobId === job.id ? 'Đang xử lý...' : job.status === 'open' ? 'Đóng tin' : 'Mở lại'}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg px-3 py-1.5 ring-1 ring-slate-300 transition enabled:hover:bg-slate-50 disabled:opacity-40"
          >
            ← Trước
          </button>
          <span className="text-slate-500">
            Trang {meta.page ?? page}/{meta.totalPages}
          </span>
          <button
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg px-3 py-1.5 ring-1 ring-slate-300 transition enabled:hover:bg-slate-50 disabled:opacity-40"
          >
            Sau →
          </button>
        </div>
      )}

      <JobFormModal
        open={modalOpen}
        initial={editing}
        departments={departments}
        saving={saving}
        error={formError}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmitForm}
      />
    </div>
  );
}
