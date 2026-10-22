import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listJobs,
  createJob,
  updateJob,
  closeJob,
  reopenJob,
  listDepartments,
  generateJd,
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
  Textarea,
} from '../../../components/ui';
import {
  IconBriefcase,
  IconBuilding,
  IconCalendar,
  IconSearch,
  IconSparkles,
  IconUsers,
} from '../../../components/icons.jsx';

const JD_LEVELS = [
  ['intern', 'Thực tập sinh'],
  ['fresher', 'Mới tốt nghiệp (Fresher)'],
  ['junior', 'Junior'],
  ['middle', 'Middle'],
  ['senior', 'Senior'],
  ['lead', 'Team Lead'],
  ['manager', 'Quản lý (Manager)'],
];

const JOB_STATUS = {
  open: { label: 'Đang tuyển', tone: 'green' },
  closed: { label: 'Đã đóng', tone: 'gray' },
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
  // Panel "Tạo JD bằng AI" (v6 mục 2): sinh JD xem trước, HR sửa rồi mới
  // bấm "Dùng JD này" để điền vào form — không tự đăng tin.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiForm, setAiForm] = useState({ level: 'middle', skills: '', salary_note: '' });
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [aiApplied, setAiApplied] = useState(false);

  useEffect(() => {
    if (open) {
      setAiOpen(false);
      setAiForm({ level: 'middle', skills: '', salary_note: '' });
      setAiError('');
      setAiResult(null);
      setAiApplied(false);
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

  const handleGenerateJd = async () => {
    if (!form.title.trim()) {
      setAiError('Hãy nhập "Vị trí tuyển" ở trên trước khi tạo JD bằng AI.');
      return;
    }
    setAiBusy(true);
    setAiError('');
    try {
      const data = await generateJd({
        title: form.title.trim(),
        department_id: form.department_id ? Number(form.department_id) : null,
        level: aiForm.level,
        skills: aiForm.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        salary_note: aiForm.salary_note.trim() || null,
      });
      setAiResult(data);
      setAiApplied(false);
    } catch (err) {
      setAiError(friendlyError(err, 'Không tạo được JD. Vui lòng thử lại.'));
    } finally {
      setAiBusy(false);
    }
  };

  const patchAiList = (key) => (e) =>
    setAiResult((r) => (r ? { ...r, [key]: e.target.value.split('\n') } : r));

  const handleApplyJd = () => {
    if (!aiResult) return;
    const lines = (items) =>
      (items ?? []).map((x) => String(x).trim()).filter(Boolean);
    const resp = lines(aiResult.responsibilities);
    const benefits = lines(aiResult.benefits);
    const description = [
      String(aiResult.summary ?? '').trim(),
      resp.length ? `Trách nhiệm chính:\n${resp.map((x) => `- ${x}`).join('\n')}` : '',
      benefits.length ? `Quyền lợi:\n${benefits.map((x) => `- ${x}`).join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    setForm((f) => ({
      ...f,
      description,
      requirements: lines(aiResult.requirements).join('\n'),
    }));
    setAiApplied(true);
  };

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

          {/* ---------- Panel Tạo JD bằng AI (v6 mục 2) ---------- */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <IconSparkles size={15} className="text-brand-600" />
                Tạo JD bằng AI
                <span className="font-normal text-gray-400">
                  — sinh bản nháp để bạn xem trước & sửa, không tự đăng tin
                </span>
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setAiOpen((o) => !o)}
              >
                {aiOpen ? 'Thu gọn' : 'Mở panel'}
              </Button>
            </div>

            {aiOpen && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <FormField label="Cấp bậc">
                    <Select
                      value={aiForm.level}
                      onChange={(e) => setAiForm((f) => ({ ...f, level: e.target.value }))}
                    >
                      {JD_LEVELS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Kỹ năng chính" hint="Cách nhau bằng dấu phẩy">
                    <Input
                      value={aiForm.skills}
                      onChange={(e) => setAiForm((f) => ({ ...f, skills: e.target.value }))}
                      placeholder="Ví dụ: Python, Flask, PostgreSQL"
                    />
                  </FormField>
                  <FormField label="Ghi chú lương" hint="Để trống = 'thoả thuận'">
                    <Input
                      value={aiForm.salary_note}
                      onChange={(e) =>
                        setAiForm((f) => ({ ...f, salary_note: e.target.value }))
                      }
                      placeholder="Ví dụ: 15–25 triệu/tháng"
                    />
                  </FormField>
                </div>

                <div className="flex items-center gap-3">
                  <Button type="button" onClick={handleGenerateJd} loading={aiBusy}>
                    <IconSparkles size={15} />
                    {aiBusy ? 'Đang tạo JD...' : 'Tạo JD'}
                  </Button>
                  <span className="text-[13px] text-gray-400">
                    Chức danh và phòng ban lấy từ form phía trên.
                  </span>
                </div>

                {aiError && <Alert tone="error">{aiError}</Alert>}

                {aiResult && (
                  <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">Bản nháp JD</span>
                      <Badge tone={aiResult.source === 'ai' ? 'violet' : 'gray'}>
                        {aiResult.source === 'ai'
                          ? 'Do AI tạo'
                          : 'Mẫu dự phòng (AI chưa khả dụng)'}
                      </Badge>
                      {aiApplied && <Badge tone="green">Đã điền vào form</Badge>}
                    </div>
                    <FormField label="Tóm tắt vị trí">
                      <Textarea
                        rows={3}
                        value={aiResult.summary ?? ''}
                        onChange={(e) =>
                          setAiResult((r) => (r ? { ...r, summary: e.target.value } : r))
                        }
                      />
                    </FormField>
                    <FormField label="Trách nhiệm chính" hint="Mỗi dòng một mục">
                      <Textarea
                        rows={4}
                        value={(aiResult.responsibilities ?? []).join('\n')}
                        onChange={patchAiList('responsibilities')}
                      />
                    </FormField>
                    <FormField label="Yêu cầu ứng viên" hint="Mỗi dòng một mục">
                      <Textarea
                        rows={4}
                        value={(aiResult.requirements ?? []).join('\n')}
                        onChange={patchAiList('requirements')}
                      />
                    </FormField>
                    <FormField label="Quyền lợi" hint="Mỗi dòng một mục">
                      <Textarea
                        rows={3}
                        value={(aiResult.benefits ?? []).join('\n')}
                        onChange={patchAiList('benefits')}
                      />
                    </FormField>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button type="button" onClick={handleApplyJd}>
                        Dùng JD này
                      </Button>
                      <span className="text-[13px] text-gray-400">
                        Nội dung sẽ điền vào ô "Mô tả công việc" và "Yêu cầu ứng viên" —
                        bạn vẫn kiểm tra lại trước khi đăng tin.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

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
        title="Tuyển dụng"
        subtitle={
          <>
            Quản lý tin tuyển dụng và ứng viên. Mở 1 vị trí để xem CV và dùng{' '}
            <span className="font-medium text-brand-700">AI sàng lọc CV</span> — AI chỉ gợi ý, HR là
            người quyết định.
          </>
        }
        actions={<Button onClick={openCreateModal}>+ Đăng tin tuyển dụng</Button>}
      />

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
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
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
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="ui-table min-w-[860px]">
              <thead>
                <tr>
                  <th className="ui-th">Vị trí tuyển dụng</th>
                  <th className="ui-th w-44">Phòng ban</th>
                  <th className="ui-th w-40">Trạng thái</th>
                  <th className="ui-th w-36">Hạn nộp</th>
                  <th className="ui-th w-28 text-right">Ứng viên</th>
                  <th className="ui-th w-64 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const st = JOB_STATUS[job.status] ?? JOB_STATUS.closed;
                  const deptName = job.department_name ?? job.department?.name;
                  const count = job.candidates_count ?? job.candidate_count ?? 0;
                  const overdue = isOverdue(job);
                  return (
                    <tr key={job.id} className="ui-tr">
                      <td className="ui-td">
                        <Link
                          to={`/recruitment/${job.id}`}
                          className="text-sm font-medium text-gray-900 transition-colors hover:text-brand-700"
                        >
                          {job.title}
                        </Link>
                        <span className="mt-0.5 block text-[13px] text-gray-500">
                          Tuyển {job.quantity ?? 1} người
                        </span>
                        {job.description && (
                          <span className="mt-0.5 line-clamp-1 block max-w-md text-[13px] text-gray-500">
                            {job.description}
                          </span>
                        )}
                      </td>
                      <td className="ui-td">
                        {deptName ? (
                          <span className="inline-flex items-center gap-1.5 text-sm text-gray-700">
                            <IconBuilding size={15} className="text-gray-400" />
                            {deptName}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="ui-td">
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <Badge tone={st.tone} dot={job.status === 'open'}>
                            {st.label}
                          </Badge>
                          {overdue && <Badge tone="red">Quá hạn nộp</Badge>}
                        </span>
                      </td>
                      <td className="ui-td">
                        <span
                          className={`inline-flex items-center gap-1.5 text-sm tabular-nums ${
                            overdue ? 'font-medium text-rose-700' : 'text-gray-700'
                          }`}
                        >
                          <IconCalendar size={15} className={overdue ? 'text-rose-500' : 'text-gray-400'} />
                          {formatDate(job.deadline)}
                        </span>
                      </td>
                      <td className="ui-td text-right">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium tabular-nums text-gray-900">
                          <IconUsers size={15} className="text-gray-400" />
                          {count}
                        </span>
                      </td>
                      <td className="ui-td">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Link
                            to={`/recruitment/${job.id}`}
                            className="inline-flex h-8 select-none items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="mt-5 flex items-center justify-end gap-2.5 text-sm">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Trước
          </Button>
          <span className="font-medium text-gray-500">
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
