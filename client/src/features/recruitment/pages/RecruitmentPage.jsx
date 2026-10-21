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
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  FormField,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  StatCard,
  Textarea,
} from '../../../components/ui';
import { StaggerList, StaggerItem } from '../../../components/motion';
import {
  IconBriefcase,
  IconBuilding,
  IconCalendar,
  IconCheck,
  IconSearch,
  IconUsers,
} from '../../../components/icons.jsx';

const JOB_STATUS = {
  open: { label: 'Đang tuyển', tone: 'green' },
  closed: { label: 'Đã đóng', tone: 'slate' },
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

  return (
    <Modal
      open={open}
      title={initial ? 'Sửa tin tuyển dụng' : 'Đăng tin tuyển dụng mới'}
      onClose={onClose}
      width="max-w-2xl"
      actions={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" form="job-form" loading={saving}>
            {saving ? 'Đang lưu...' : initial ? 'Lưu thay đổi' : 'Đăng tin'}
          </Button>
        </>
      }
    >
      <form id="job-form" onSubmit={handleSubmit}>
        {error && (
          <Alert tone="error" className="mb-5">
            {error}
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            className="sm:col-span-2"
            label={
              <>
                Vị trí tuyển <span className="text-rose-500">*</span>
              </>
            }
          >
            <Input
              value={form.title}
              onChange={set('title')}
              required
              placeholder="Ví dụ: Lập trình viên Python (Flask)"
            />
          </FormField>

          <FormField label="Phòng ban">
            <Select value={form.department_id} onChange={set('department_id')}>
              <option value="">— Chưa chọn —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Số lượng">
              <Input type="number" min="1" value={form.quantity} onChange={set('quantity')} />
            </FormField>
            <FormField label="Hạn nộp CV">
              <Input type="date" value={form.deadline} onChange={set('deadline')} />
            </FormField>
          </div>

          <FormField
            className="sm:col-span-2"
            label={
              <>
                Mô tả công việc (JD) <span className="text-rose-500">*</span>
              </>
            }
          >
            <Textarea
              rows={5}
              value={form.description}
              onChange={set('description')}
              required
              placeholder="Công việc chính, trách nhiệm, quyền lợi..."
            />
          </FormField>

          <FormField
            className="sm:col-span-2"
            label="Yêu cầu ứng viên"
            hint="Mẹo: viết yêu cầu càng cụ thể, kết quả AI sàng lọc CV càng sát."
          >
            <Textarea
              rows={4}
              value={form.requirements}
              onChange={set('requirements')}
              placeholder="Kỹ năng bắt buộc, số năm kinh nghiệm... — nội dung này là chuẩn để AI đối chiếu khi sàng lọc CV"
            />
          </FormField>

          {initial && (
            <FormField label="Trạng thái">
              <Select value={form.status} onChange={set('status')}>
                <option value="open">Đang tuyển</option>
                <option value="closed">Đã đóng</option>
              </Select>
            </FormField>
          )}
        </div>
      </form>
    </Modal>
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

  const openCreateModal = () => {
    setEditing(null);
    setFormError('');
    setModalOpen(true);
  };

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
    <div className="page-shell">
      {/* Header */}
      <PageHeader
        eyebrow="Tuyển dụng"
        title="Tuyển dụng"
        subtitle={
          <>
            Quản lý tin tuyển dụng và ứng viên. Mở 1 vị trí để xem CV và dùng{' '}
            <span className="font-semibold text-accent-600">AI sàng lọc CV</span> — AI chỉ gợi ý, HR là
            người quyết định.
          </>
        }
        actions={<Button onClick={openCreateModal}>+ Đăng tin tuyển dụng</Button>}
      />

      {/* Mini stats */}
      <div className="stagger mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<IconBriefcase size={22} />}
          label="Tin đang hiển thị"
          value={meta.totalItems ?? jobs.length}
          tone="blue"
        />
        <StatCard
          icon={<IconCheck size={22} />}
          label="Đang tuyển (trang này)"
          value={stats.open}
          tone="teal"
        />
        <StatCard
          icon={<IconUsers size={22} />}
          label="Ứng viên (trang này)"
          value={stats.candidates}
          tone="violet"
        />
      </div>

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

      {/* Filters */}
      <Card className="mb-5">
        <CardBody className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <IconSearch size={17} />
            </span>
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm theo tên vị trí..."
              className="pl-10"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-auto min-w-[180px]"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="open">Đang tuyển</option>
            <option value="closed">Đã đóng</option>
          </Select>
          <Button variant="secondary" onClick={loadJobs}>
            Tải lại
          </Button>
        </CardBody>
      </Card>

      {/* List */}
      {loading ? (
        <div className="space-y-4" aria-hidden="true">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardBody>
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="mt-3 h-4 w-2/3" />
                <Skeleton className="mt-2 h-4 w-1/2" />
              </CardBody>
            </Card>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconBriefcase size={26} />}
            title="Chưa có tin tuyển dụng nào"
            description={'Bấm "Đăng tin tuyển dụng" để tạo vị trí đầu tiên. Sau khi ứng viên nộp CV, bạn có thể dùng AI sàng lọc ngay trong trang chi tiết của vị trí.'}
            action={<Button onClick={openCreateModal}>+ Đăng tin tuyển dụng</Button>}
          />
        </Card>
      ) : (
        <StaggerList className="space-y-4">
          {jobs.map((job, i) => {
            const st = JOB_STATUS[job.status] ?? JOB_STATUS.closed;
            const deptName = job.department_name ?? job.department?.name;
            const count = job.candidates_count ?? job.candidate_count ?? 0;
            const overdue = isOverdue(job);
            return (
              <StaggerItem key={job.id} index={i}>
              <Card hover>
                <CardBody className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/recruitment/${job.id}`}
                        className="text-base font-bold tracking-[-0.01em] text-slate-900 transition-colors hover:text-brand-700"
                      >
                        {job.title}
                      </Link>
                      <Badge tone={st.tone} dot={job.status === 'open'}>
                        {st.label}
                      </Badge>
                      {overdue && <Badge tone="red">Quá hạn nộp</Badge>}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                      {deptName && (
                        <span className="inline-flex items-center gap-1.5">
                          <IconBuilding size={15} className="text-slate-400" />
                          {deptName}
                        </span>
                      )}
                      <span>Tuyển {job.quantity ?? 1} người</span>
                      <span
                        className={`inline-flex items-center gap-1.5 ${overdue ? 'font-semibold text-rose-600' : ''}`}
                      >
                        <IconCalendar size={15} className={overdue ? 'text-rose-400' : 'text-slate-400'} />
                        Hạn nộp: {formatDate(job.deadline)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-600">
                        <IconUsers size={15} className="text-slate-400" />
                        {count} ứng viên
                      </span>
                    </div>

                    {job.description && (
                      <p className="mt-2.5 line-clamp-2 max-w-3xl text-sm leading-relaxed text-slate-500">
                        {job.description}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link
                      to={`/recruitment/${job.id}`}
                      className="inline-flex h-9 select-none items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-[13px] font-semibold tracking-[0.01em] text-white shadow-[0_6px_16px_-6px_rgba(39,79,234,.55)] transition-all duration-200 ease-spring hover:-translate-y-px hover:bg-brand-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/40 active:translate-y-0 active:scale-[.99]"
                    >
                      Xem ứng viên
                    </Link>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditing(job);
                        setFormError('');
                        setModalOpen(true);
                      }}
                    >
                      Sửa
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleToggleStatus(job)}
                      disabled={busyJobId === job.id}
                    >
                      {busyJobId === job.id ? 'Đang xử lý...' : job.status === 'open' ? 'Đóng tin' : 'Mở lại'}
                    </Button>
                  </div>
                </CardBody>
              </Card>
              </StaggerItem>
            );
          })}
        </StaggerList>
      )}

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="mt-5 flex items-center justify-end gap-2.5 text-sm">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Trước
          </Button>
          <span className="font-medium text-slate-500">
            Trang {meta.page ?? page}/{meta.totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Sau →
          </Button>
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
