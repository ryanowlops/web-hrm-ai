import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  EmptyState,
  FormField,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  useToast,
} from '../../../components/ui';
import {
  createOfferLetter,
  getCandidatesForSelect,
  getJobsForSelect,
  getOfferLetters,
  respondOfferLetter,
  sendOfferLetter,
  withdrawOfferLetter,
} from '../services';

// ============================================================
// Trang Thư mời nhận việc — route "/offer-letters" — Design v4
// - Danh sách thư mời: ứng viên, vị trí, lương, ngày bắt đầu,
//   hạn trả lời, trạng thái (Nháp/Đã gửi/Đã chấp nhận/Từ chối/
//   Thu hồi/Hết hạn — "Hết hạn" do backend tính lúc đọc: thư đã gửi
//   mà quá hạn trả lời, không đổi trạng thái đã lưu).
// - Admin/HR: tạo thư mời (nội dung thư do backend sinh từ mẫu tiếng
//   Việt), gửi thư, ghi nhận phản hồi ứng viên, thu hồi thư.
// ============================================================

const STATUS_META = {
  draft: { label: 'Nháp', tone: 'slate' },
  sent: { label: 'Đã gửi', tone: 'blue' },
  accepted: { label: 'Đã chấp nhận', tone: 'green' },
  declined: { label: 'Từ chối', tone: 'red' },
  withdrawn: { label: 'Thu hồi', tone: 'slate' },
  expired: { label: 'Hết hạn', tone: 'amber' },
};

// Lấy field chịu được cả snake_case (DB/BE Flask) lẫn camelCase.
function pick(obj, ...keys) {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function parseLocalDate(value) {
  // "YYYY-MM-DD" -> Date giờ địa phương (tránh lệch ngày do UTC).
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = parseLocalDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatSalary(value) {
  if (value === undefined || value === null || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `${num.toLocaleString('vi-VN')} VNĐ/tháng`;
}

function errorMessage(error, fallback) {
  return error?.response?.data?.error?.message || fallback;
}

function normalizeRow(item) {
  return {
    id: pick(item, 'id'),
    candidateId: pick(item, 'candidate_id', 'candidateId'),
    candidateName: pick(item, 'candidate_name', 'candidateName') || '—',
    candidateEmail: pick(item, 'candidate_email', 'candidateEmail') || '',
    jobId: pick(item, 'job_id', 'jobId'),
    jobTitle: pick(item, 'job_title', 'jobTitle') || '—',
    salary: pick(item, 'salary'),
    startDate: pick(item, 'start_date', 'startDate'),
    deadline: pick(item, 'deadline'),
    status: pick(item, 'status') || 'draft',
    letterBody: pick(item, 'letter_body', 'letterBody') || '',
  };
}

export default function OfferLettersPage() {
  const toast = useToast();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal tạo thư mời.
  const [creating, setCreating] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [candidateId, setCandidateId] = useState('');
  const [jobId, setJobId] = useState('');
  const [salary, setSalary] = useState('');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Modal xem nội dung thư.
  const [previewing, setPreviewing] = useState(null);

  // Hộp xác nhận cho gửi / phản hồi / thu hồi.
  const [pendingAction, setPendingAction] = useState(null); // { type, row }
  const [actionError, setActionError] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const { items: rows } = await getOfferLetters(params);
      setItems((Array.isArray(rows) ? rows : []).map(normalizeRow));
    } catch (error) {
      setLoadError(errorMessage(error, 'Không tải được danh sách thư mời.'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(
    () => ({
      total: items.length,
      sent: items.filter((it) => it.status === 'sent').length,
      accepted: items.filter((it) => it.status === 'accepted').length,
    }),
    [items],
  );

  const openCreate = async () => {
    setCreating(true);
    setCandidateId('');
    setJobId('');
    setSalary('');
    setStartDate('');
    setDeadline('');
    setFormError('');
    try {
      const [cands, jobList] = await Promise.all([
        getCandidatesForSelect(),
        getJobsForSelect(),
      ]);
      setCandidates(Array.isArray(cands) ? cands : []);
      setJobs(Array.isArray(jobList) ? jobList : []);
    } catch (error) {
      setFormError(errorMessage(error, 'Không tải được danh sách ứng viên / vị trí.'));
    }
  };

  const closeCreate = () => {
    setCreating(false);
    setFormError('');
  };

  const handleCreate = async () => {
    if (!candidateId) {
      setFormError('Vui lòng chọn ứng viên.');
      return;
    }
    const salaryNum = Number(salary);
    if (!Number.isFinite(salaryNum) || salaryNum <= 0 || !Number.isInteger(salaryNum)) {
      setFormError('Lương phải là số nguyên lớn hơn 0 (VNĐ/tháng).');
      return;
    }
    if (!startDate) {
      setFormError('Vui lòng chọn ngày bắt đầu làm việc.');
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = parseLocalDate(startDate);
    if (start && start < today) {
      setFormError('Ngày bắt đầu làm việc không được trong quá khứ.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await createOfferLetter({
        candidate_id: Number(candidateId),
        job_id: jobId ? Number(jobId) : null,
        salary: salaryNum,
        start_date: startDate,
        deadline: deadline || null,
      });
      toast.success('Đã tạo thư mời nhận việc (trạng thái nháp).');
      closeCreate();
      await load();
    } catch (error) {
      setFormError(errorMessage(error, 'Không tạo được thư mời.'));
    } finally {
      setSubmitting(false);
    }
  };

  const actionDescription = () => {
    if (!pendingAction) return '';
    const { type, row } = pendingAction;
    if (type === 'send') return `Gửi thư mời cho ${row.candidateName} (${row.jobTitle})? Sau khi gửi, thư chuyển sang trạng thái "Đã gửi".`;
    if (type === 'accept') return `Ghi nhận ${row.candidateName} ĐÃ CHẤP NHẬN thư mời?`;
    if (type === 'decline') return `Ghi nhận ${row.candidateName} ĐÃ TỪ CHỐI thư mời?`;
    return `Thu hồi thư mời của ${row.candidateName}? Thư sẽ chuyển sang trạng thái "Thu hồi" và không dùng được nữa.`;
  };

  const handleAction = async () => {
    if (!pendingAction) return;
    const { type, row } = pendingAction;
    setActing(true);
    setActionError('');
    try {
      if (type === 'send') {
        await sendOfferLetter(row.id);
        toast.success('Đã gửi thư mời.');
      } else if (type === 'accept') {
        await respondOfferLetter(row.id, 'accepted');
        toast.success('Đã ghi nhận: ứng viên chấp nhận thư mời.');
      } else if (type === 'decline') {
        await respondOfferLetter(row.id, 'declined');
        toast.success('Đã ghi nhận: ứng viên từ chối thư mời.');
      } else {
        await withdrawOfferLetter(row.id);
        toast.success('Đã thu hồi thư mời.');
      }
      setPendingAction(null);
      await load();
    } catch (error) {
      setActionError(errorMessage(error, 'Không thực hiện được thao tác.'));
    } finally {
      setActing(false);
    }
  };

  const actionButtons = (row) => {
    const buttons = [
      <Button key="preview" variant="secondary" size="sm" onClick={() => setPreviewing(row)}>
        Xem thư
      </Button>,
    ];
    if (row.status === 'draft') {
      buttons.push(
        <Button key="send" variant="primary" size="sm" onClick={() => setPendingAction({ type: 'send', row })}>
          Gửi
        </Button>,
        <Button key="withdraw" variant="secondary" size="sm" onClick={() => setPendingAction({ type: 'withdraw', row })}>
          Thu hồi
        </Button>,
      );
    } else if (row.status === 'sent') {
      buttons.push(
        <Button key="accept" variant="primary" size="sm" onClick={() => setPendingAction({ type: 'accept', row })}>
          Chấp nhận
        </Button>,
        <Button key="decline" variant="secondary" size="sm" onClick={() => setPendingAction({ type: 'decline', row })}>
          Từ chối
        </Button>,
        <Button key="withdraw" variant="secondary" size="sm" onClick={() => setPendingAction({ type: 'withdraw', row })}>
          Thu hồi
        </Button>,
      );
    }
    return buttons;
  };

  return (
    <div className="page-shell">
      <PageHeader
        title="Thư mời nhận việc"
        subtitle="Soạn, gửi và theo dõi thư mời nhận việc cho ứng viên trúng tuyển — nội dung thư do hệ thống sinh từ mẫu tiếng Việt."
        actions={
          <Button variant="primary" onClick={openCreate}>
            Tạo thư mời
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardBody className="py-4">
            <p className="text-sm text-gray-500">Tổng số thư mời</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{summary.total}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-4">
            <p className="text-sm text-gray-500">Đang chờ phản hồi</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-blue-600">{summary.sent}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-4">
            <p className="text-sm text-gray-500">Đã chấp nhận</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-green-600">{summary.accepted}</p>
          </CardBody>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FormField label="Trạng thái" className="mb-0 w-48">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {Object.entries(STATUS_META).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </Select>
        </FormField>
        <Button variant="secondary" size="sm" onClick={load}>
          Làm mới
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[72px] rounded-xl" />
          ))}
        </div>
      ) : loadError ? (
        <Card>
          <CardBody className="py-5">
            <Alert tone="error">{loadError}</Alert>
            <Button variant="secondary" size="sm" className="mt-4" onClick={load}>
              Thử lại
            </Button>
          </CardBody>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            title="Chưa có thư mời nhận việc nào"
            description="Khi ứng viên trúng tuyển, HR tạo thư mời ở đây — hệ thống tự soạn nội dung thư từ mẫu tiếng Việt, HR chỉ cần gửi đi."
          />
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
                  <th className="px-4 py-3">Ứng viên</th>
                  <th className="px-4 py-3">Vị trí</th>
                  <th className="px-4 py-3">Lương</th>
                  <th className="px-4 py-3">Bắt đầu</th>
                  <th className="px-4 py-3">Hạn trả lời</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const meta = STATUS_META[row.status] || { label: row.status, tone: 'slate' };
                  return (
                    <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{row.candidateName}</p>
                        {row.candidateEmail ? <p className="text-xs text-gray-500">{row.candidateEmail}</p> : null}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.jobTitle}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-gray-700">{formatSalary(row.salary)}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-gray-700">{formatDate(row.startDate)}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-gray-700">{formatDate(row.deadline)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={meta.tone} dot>
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex flex-wrap justify-end gap-2">{actionButtons(row)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {creating ? (
        <Modal
          title="Tạo thư mời nhận việc"
          subtitle="Hệ thống tự soạn nội dung thư từ mẫu tiếng Việt — HR chỉ cần điền thông tin, thư mới tạo ở trạng thái nháp."
          onClose={closeCreate}
          actions={
            <>
              <Button variant="secondary" onClick={closeCreate}>
                Huỷ
              </Button>
              <Button variant="primary" onClick={handleCreate} disabled={submitting}>
                {submitting ? 'Đang tạo...' : 'Tạo thư mời'}
              </Button>
            </>
          }
        >
          {formError ? (
            <Alert tone="error" className="mb-4">
              {formError}
            </Alert>
          ) : null}
          <div className="space-y-4">
            <FormField label="Ứng viên">
              <Select value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
                <option value="">— Chọn ứng viên —</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {pick(c, 'full_name', 'fullName') || '—'}
                    {pick(c, 'email') ? ` (${pick(c, 'email')})` : ''}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Vị trí (không bắt buộc — mặc định lấy vị trí ứng viên đã ứng tuyển)">
              <Select value={jobId} onChange={(e) => setJobId(e.target.value)}>
                <option value="">— Theo vị trí ứng viên đã ứng tuyển —</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {pick(j, 'title') || '—'}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Lương (VNĐ/tháng)">
              <Input
                type="number"
                min={1}
                step={1}
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="Ví dụ: 12000000"
              />
            </FormField>
            <FormField label="Ngày bắt đầu làm việc">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </FormField>
            <FormField label="Hạn trả lời (không bắt buộc)">
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </FormField>
          </div>
        </Modal>
      ) : null}

      {previewing ? (
        <Modal
          title={`Thư mời — ${previewing.candidateName}`}
          subtitle={`${previewing.jobTitle} · Lương ${formatSalary(previewing.salary)} · Bắt đầu ${formatDate(previewing.startDate)}`}
          onClose={() => setPreviewing(null)}
          actions={
            <Button variant="secondary" onClick={() => setPreviewing(null)}>
              Đóng
            </Button>
          }
        >
          <pre className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-800">
            {previewing.letterBody || 'Chưa có nội dung thư.'}
          </pre>
        </Modal>
      ) : null}

      <ConfirmDialog
        open={!!pendingAction}
        title={
          pendingAction?.type === 'send'
            ? 'Gửi thư mời'
            : pendingAction?.type === 'accept'
              ? 'Ghi nhận chấp nhận'
              : pendingAction?.type === 'decline'
                ? 'Ghi nhận từ chối'
                : 'Thu hồi thư mời'
        }
        description={actionDescription()}
        confirmLabel={acting ? 'Đang xử lý...' : 'Xác nhận'}
        danger={pendingAction?.type === 'withdraw' || pendingAction?.type === 'decline'}
        onConfirm={handleAction}
        onCancel={() => {
          setPendingAction(null);
          setActionError('');
        }}
      />
      {actionError ? (
        <div className="mt-4">
          <Alert tone="error">{actionError}</Alert>
        </div>
      ) : null}
    </div>
  );
}
