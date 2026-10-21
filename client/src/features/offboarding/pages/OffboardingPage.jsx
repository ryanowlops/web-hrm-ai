// Trang Nghi viec & ban giao (Offboarding) — route /offboarding
// - HR/Admin/Manager: bang theo doi quy trinh nghi viec (nhan vien, ngay
//   lam viec cuoi, tien do checklist, trang thai) + chi tiet checklist
//   theo nhom category; HR/Admin tao quy trinh, hoan tat (chi khi 100%),
//   huy quy trinh.
// - Tick dau viec theo dung quyen backend: HR/Admin moi task; Manager
//   task duoc giao vai tro Quan ly; Nhan vien task vai tro Nhan vien
//   trong quy trinh cua chinh minh.
// Trinh bay theo hop dong thiet ke v4: PageHeader phang, the trang
// border gray-200, thanh tien do phang + ProgressRing, Badge ngu nghia.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../app/AuthContext.jsx';
import {
  Button,
  Card,
  CardHeader,
  Badge,
  Modal,
  PageHeader,
  EmptyState,
  Alert,
  Skeleton,
  FormField,
  Input,
  Select,
  Textarea,
  StatCard,
} from '../../../components/ui';
import { ProgressRing } from '../../../components/motion';
import {
  IconCheck,
  IconClipboard,
  IconClock,
  IconPlus,
  IconUsers,
} from '../../../components/icons.jsx';
import {
  getProcesses,
  createProcess,
  getProcess,
  updateTask,
  completeProcess,
  cancelProcess,
  parseApiError,
  currentRole,
} from '../services';
import { getEmployees } from '../../employees/services';

// ---------------------------------------------------------------------------
// Hang so hien thi
// ---------------------------------------------------------------------------

const PROCESS_STATUS = {
  in_progress: { label: 'Đang bàn giao', tone: 'blue' },
  completed: { label: 'Đã hoàn tất', tone: 'green' },
  cancelled: { label: 'Đã huỷ', tone: 'slate' },
};

const CATEGORIES = [
  { key: 'assets', title: 'Tài sản' },
  { key: 'it', title: 'IT & tài khoản' },
  { key: 'knowledge', title: 'Bàn giao công việc' },
  { key: 'finance', title: 'Tài chính' },
  { key: 'hr', title: 'Nhân sự' },
  { key: 'other', title: 'Khác' },
];

const ASSIGNEE_ROLE = {
  hr: 'HR',
  manager: 'Quản lý',
  employee: 'Nhân viên',
  it: 'IT',
};

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('vi-VN');
}

function fmtDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN');
}

// ---------------------------------------------------------------------------
// Mot dong dau viec trong checklist ban giao
// ---------------------------------------------------------------------------

function TaskRow({ task, canToggle, busyId, onToggle }) {
  const busy = busyId === task.id;
  return (
    <div className="flex items-start gap-3 px-4 py-3 sm:px-5">
      <span
        className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full border ${
          task.is_done
            ? 'border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]'
            : 'border-gray-200 bg-white text-gray-300'
        }`}
        aria-hidden="true"
      >
        {task.is_done ? <IconCheck size={14} /> : <IconClock size={14} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`text-sm font-medium ${task.is_done ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
            {task.title}
          </p>
          <Badge tone="slate">{ASSIGNEE_ROLE[task.assignee_role] || task.assignee_role}</Badge>
          {task.is_done && <Badge tone="green" dot>Đã xong</Badge>}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-gray-500">
          {task.done_by_name && (
            <span>Hoàn thành bởi <span className="font-medium text-gray-700">{task.done_by_name}</span></span>
          )}
          {task.done_at && <span>{fmtDateTime(task.done_at)}</span>}
        </p>
        {task.note && <p className="mt-1 text-[13px] italic text-gray-500">Ghi chú: {task.note}</p>}
      </div>
      {canToggle && (
        <div className="flex flex-none flex-wrap justify-end gap-1.5">
          {task.is_done ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onToggle(task, false)}>
              Mở lại
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => onToggle(task, true)}>
              Đánh dấu xong
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chi tiet mot quy trinh: thong tin nhan vien + checklist theo category
// ---------------------------------------------------------------------------

function ProcessDetail({
  process,
  role,
  isHr,
  myEmployeeId,
  busyId,
  actionBusy,
  onToggle,
  onComplete,
  onCancel,
  onBack,
}) {
  if (!process) return null;
  const statusMeta = PROCESS_STATUS[process.status] || PROCESS_STATUS.in_progress;
  const isOpen = process.status === 'in_progress';
  const canComplete = isHr && isOpen && (process.progress_percent || 0) >= 100;

  const canToggleTask = (task) => {
    if (!isOpen) return false;
    if (isHr) return true;
    if (role === 'manager') return task.assignee_role === 'manager';
    if (role === 'employee') {
      return task.assignee_role === 'employee' && process.employee_id === myEmployeeId;
    }
    return false;
  };

  const byCategory = useMemo(() => {
    const groups = {};
    CATEGORIES.forEach((c) => { groups[c.key] = []; });
    (process.tasks || []).forEach((t) => {
      (groups[t.category] || groups.other).push(t);
    });
    return groups;
  }, [process.tasks]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-4 px-5 py-4">
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-brand-50 text-[15px] font-semibold text-brand-700 ring-1 ring-brand-100">
            {initials(process.employee_name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900">{process.employee_name || 'Nhân viên'}</h2>
              <Badge tone={statusMeta.tone} dot>{statusMeta.label}</Badge>
            </div>
            <p className="mt-0.5 text-[13px] text-gray-500">
              {process.employee_code || ''}
              {process.position_title ? ` · ${process.position_title}` : ''}
              {process.department_name ? ` · ${process.department_name}` : ''}
              {` · Ngày làm việc cuối: ${fmtDate(process.last_working_day)}`}
            </p>
            {process.reason && (
              <p className="mt-0.5 text-[13px] text-gray-500">Lý do: {process.reason}</p>
            )}
            {process.initiated_by_name && (
              <p className="mt-0.5 text-[13px] text-gray-500">Khởi tạo bởi: {process.initiated_by_name}</p>
            )}
          </div>
          <ProgressRing value={process.progress_percent || 0} size={72} stroke={7} label={`${process.progress_percent || 0}%`} />
          <div className="text-[13px] leading-relaxed text-gray-500">
            <p><span className="font-semibold text-gray-900 tnum">{process.done_tasks}</span>/{process.total_tasks} việc đã xong</p>
            {process.completed_at && <p>Hoàn tất: {fmtDateTime(process.completed_at)}</p>}
          </div>
          <div className="flex flex-none flex-wrap gap-2">
            {onBack && (
              <Button variant="secondary" size="sm" onClick={onBack}>Quay lại</Button>
            )}
            {isHr && isOpen && (
              <>
                <Button
                  size="sm"
                  disabled={!canComplete || actionBusy}
                  title={canComplete ? '' : 'Chỉ hoàn tất được khi 100% đầu việc đã xong'}
                  onClick={onComplete}
                >
                  Hoàn tất nghỉ việc
                </Button>
                <Button size="sm" variant="ghost" disabled={actionBusy} onClick={onCancel}>
                  Huỷ quy trình
                </Button>
              </>
            )}
          </div>
        </div>
        {isHr && isOpen && (process.progress_percent || 0) < 100 && (
          <p className="border-t border-gray-100 px-5 py-3 text-[13px] text-gray-500">
            Nút "Hoàn tất nghỉ việc" chỉ bật khi toàn bộ checklist bàn giao đã xong (100%).
            Khi hoàn tất, nhân viên sẽ chuyển trạng thái nghỉ việc và tài khoản đăng nhập bị khoá.
          </p>
        )}
      </Card>

      {CATEGORIES.map((cat) => {
        const tasks = byCategory[cat.key];
        if (!tasks || !tasks.length) return null;
        return (
          <Card key={cat.key}>
            <CardHeader
              title={cat.title}
              subtitle={`${tasks.filter((t) => t.is_done).length}/${tasks.length} việc đã xong`}
            />
            <div className="divide-y divide-gray-100 border-t border-gray-100">
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  canToggle={canToggleTask(task)}
                  busyId={busyId}
                  onToggle={onToggle}
                />
              ))}
            </div>
          </Card>
        );
      })}
      {(process.tasks || []).length === 0 && (
        <Card>
          <EmptyState
            icon={<IconClipboard size={22} />}
            title="Chưa có đầu việc bàn giao"
            description="Quy trình này chưa có checklist. Hãy liên hệ HR để kiểm tra lại."
          />
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trang chinh
// ---------------------------------------------------------------------------

export default function OffboardingPage() {
  const { user } = useAuth();
  const role = user?.role || currentRole();
  const myEmployeeId = user?.employeeId ?? user?.employee_id ?? null;
  const isHr = role === 'admin' || role === 'hr';

  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [employees, setEmployees] = useState([]);
  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState({ employee_id: '', last_working_day: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);

  const [confirmAction, setConfirmAction] = useState(null); // 'complete' | 'cancel'

  const loadProcesses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getProcesses({ status: statusFilter || undefined, limit: 100 });
      setProcesses(Array.isArray(res?.data) ? res.data : []);
      setError('');
    } catch (err) {
      setError(parseApiError(err, 'Không tải được danh sách quy trình nghỉ việc.').message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const loadEmployees = useCallback(async () => {
    if (!isHr) return;
    try {
      const res = await getEmployees({ limit: 100 });
      const items = Array.isArray(res?.items) ? res.items : [];
      setEmployees(items.filter((e) => e.status !== 'resigned'));
    } catch {
      setEmployees([]);
    }
  }, [isHr]);

  useEffect(() => { loadProcesses(); }, [loadProcesses]);
  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  const refreshDetail = useCallback(async (processId) => {
    if (!processId) return;
    setDetailLoading(true);
    try {
      setSelected(await getProcess(processId));
    } catch (err) {
      setError(parseApiError(err, 'Không tải được chi tiết quy trình.').message);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleToggle = useCallback(async (task, isDone) => {
    setBusyId(task.id);
    try {
      await updateTask(task.id, { is_done: isDone });
      if (selected && task.process_id === selected.id) await refreshDetail(selected.id);
      await loadProcesses();
      setError('');
    } catch (err) {
      setError(parseApiError(err, 'Không cập nhật được đầu việc.').message);
    } finally {
      setBusyId(null);
    }
  }, [selected, refreshDetail, loadProcesses]);

  const handleCreate = async () => {
    if (!form.employee_id) {
      setError('Hãy chọn nhân viên cần tạo quy trình nghỉ việc.');
      return;
    }
    if (!form.last_working_day) {
      setError('Hãy chọn ngày làm việc cuối cùng.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createProcess({
        employee_id: Number(form.employee_id),
        last_working_day: form.last_working_day,
        reason: form.reason.trim() || undefined,
      });
      setCreateModal(false);
      setForm({ employee_id: '', last_working_day: '', reason: '' });
      await loadProcesses();
      if (created?.id) setSelected(created.tasks ? created : await getProcess(created.id));
      setError('');
    } catch (err) {
      setError(parseApiError(err, 'Không tạo được quy trình nghỉ việc.').message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!selected || !confirmAction) return;
    setActionBusy(true);
    try {
      const updated = confirmAction === 'complete'
        ? await completeProcess(selected.id)
        : await cancelProcess(selected.id);
      setConfirmAction(null);
      setSelected(updated?.tasks ? updated : { ...selected, ...updated });
      await loadProcesses();
      setError('');
    } catch (err) {
      setError(parseApiError(err, confirmAction === 'complete'
        ? 'Chưa thể hoàn tất quy trình (cần xong 100% đầu việc).'
        : 'Không huỷ được quy trình.').message);
      setConfirmAction(null);
    } finally {
      setActionBusy(false);
    }
  };

  const summary = useMemo(() => ({
    inProgress: processes.filter((p) => p.status === 'in_progress').length,
    completed: processes.filter((p) => p.status === 'completed').length,
    cancelled: processes.filter((p) => p.status === 'cancelled').length,
  }), [processes]);

  return (
    <div className="page-shell">
      <PageHeader
        title="Nghỉ việc & bàn giao"
        subtitle="Quy trình nghỉ việc với checklist bàn giao tài sản, tài khoản và công việc — hoàn tất khi xong 100% đầu việc."
        actions={isHr ? (
          <Button onClick={() => setCreateModal(true)}>
            <IconPlus size={16} /> Tạo quy trình nghỉ việc
          </Button>
        ) : undefined}
      />
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}

      {selected || detailLoading ? (
        detailLoading && !selected ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <ProcessDetail
            process={selected}
            role={role}
            isHr={isHr}
            myEmployeeId={myEmployeeId}
            busyId={busyId}
            actionBusy={actionBusy}
            onToggle={handleToggle}
            onComplete={() => setConfirmAction('complete')}
            onCancel={() => setConfirmAction('cancel')}
            onBack={() => setSelected(null)}
          />
        )
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Đang bàn giao" value={summary.inProgress} sub="quy trình đang thực hiện" />
            <StatCard label="Đã hoàn tất" value={summary.completed} sub="nhân viên đã nghỉ việc" />
            <StatCard label="Đã huỷ" value={summary.cancelled} sub="quy trình bị huỷ bỏ" />
          </div>

          <Card>
            <CardHeader
              title="Quy trình nghỉ việc"
              subtitle="Bấm vào một dòng để xem checklist bàn giao chi tiết theo nhóm."
              actions={(
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-44"
                  aria-label="Lọc theo trạng thái"
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="in_progress">Đang bàn giao</option>
                  <option value="completed">Đã hoàn tất</option>
                  <option value="cancelled">Đã huỷ</option>
                </Select>
              )}
            />
            {loading ? (
              <div className="space-y-3 px-5 py-5">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : processes.length === 0 ? (
              <EmptyState
                icon={<IconUsers size={22} />}
                title="Chưa có quy trình nghỉ việc nào"
                description={isHr
                  ? 'Bấm "Tạo quy trình nghỉ việc" để bắt đầu — hệ thống sẽ tự sinh checklist bàn giao, gồm cả đầu việc thu hồi từng tài sản đang cấp phát.'
                  : 'Chưa có quy trình nghỉ việc nào trong phạm vi của bạn.'}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="ui-table">
                  <thead>
                    <tr>
                      <th className="ui-th">Nhân viên</th>
                      <th className="ui-th">Phòng ban</th>
                      <th className="ui-th">Ngày làm việc cuối</th>
                      <th className="ui-th">Lý do</th>
                      <th className="ui-th w-56">Tiến độ bàn giao</th>
                      <th className="ui-th">Trạng thái</th>
                      <th className="ui-th" />
                    </tr>
                  </thead>
                  <tbody>
                    {processes.map((proc) => {
                      const meta = PROCESS_STATUS[proc.status] || PROCESS_STATUS.in_progress;
                      return (
                        <tr key={proc.id} className="ui-tr cursor-pointer" onClick={() => refreshDetail(proc.id)}>
                          <td className="ui-td">
                            <span className="flex items-center gap-3">
                              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-50 text-[13px] font-semibold text-brand-700 ring-1 ring-brand-100">
                                {initials(proc.employee_name)}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-gray-900">{proc.employee_name}</span>
                                <span className="block truncate text-[13px] text-gray-500">{proc.position_title || proc.employee_email || ''}</span>
                              </span>
                            </span>
                          </td>
                          <td className="ui-td">{proc.department_name || '—'}</td>
                          <td className="ui-td tnum">{fmtDate(proc.last_working_day)}</td>
                          <td className="ui-td">
                            <span className="block max-w-56 truncate" title={proc.reason || ''}>{proc.reason || '—'}</span>
                          </td>
                          <td className="ui-td">
                            <span className="flex items-center gap-2">
                              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                                <span className="block h-full rounded-full bg-brand-600" style={{ width: `${proc.progress_percent || 0}%` }} />
                              </span>
                              <span className="text-[13px] font-medium text-gray-700 tnum">{proc.progress_percent || 0}%</span>
                            </span>
                          </td>
                          <td className="ui-td"><Badge tone={meta.tone} dot>{meta.label}</Badge></td>
                          <td className="ui-td text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => { e.stopPropagation(); refreshDetail(proc.id); }}
                            >
                              Xem
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Modal tao quy trinh nghi viec */}
      {createModal && (
        <Modal
          title="Tạo quy trình nghỉ việc"
          subtitle="Hệ thống tự sinh checklist bàn giao, gồm 1 đầu việc riêng cho từng tài sản đang cấp phát cho nhân viên."
          onClose={() => setCreateModal(false)}
          actions={(
            <>
              <Button variant="secondary" onClick={() => setCreateModal(false)}>Huỷ</Button>
              <Button loading={submitting} onClick={handleCreate}>Tạo quy trình</Button>
            </>
          )}
        >
          <div className="space-y-4 px-6 py-5">
            <FormField label="Nhân viên nghỉ việc">
              <Select
                value={form.employee_id}
                onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))}
              >
                <option value="">— Chọn nhân viên —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} ({emp.code}){emp.department_name ? ` · ${emp.department_name}` : ''}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Ngày làm việc cuối cùng">
              <Input
                type="date"
                value={form.last_working_day}
                onChange={(e) => setForm((f) => ({ ...f, last_working_day: e.target.value }))}
              />
            </FormField>
            <FormField label="Lý do nghỉ việc" hint="Không bắt buộc.">
              <Textarea
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="VD: Chuyển công tác theo nguyện vọng cá nhân"
                rows={3}
              />
            </FormField>
          </div>
        </Modal>
      )}

      {/* Modal xac nhan hoan tat / huy */}
      {confirmAction && selected && (
        <Modal
          title={confirmAction === 'complete' ? 'Hoàn tất quy trình nghỉ việc?' : 'Huỷ quy trình nghỉ việc?'}
          subtitle={confirmAction === 'complete'
            ? `${selected.employee_name} sẽ chuyển trạng thái nghỉ việc và tài khoản đăng nhập sẽ bị khoá ngay.`
            : `Quy trình bàn giao của ${selected.employee_name} sẽ bị huỷ, nhân viên vẫn ở trạng thái đang làm việc.`}
          onClose={() => setConfirmAction(null)}
          actions={(
            <>
              <Button variant="secondary" onClick={() => setConfirmAction(null)}>Quay lại</Button>
              <Button loading={actionBusy} onClick={handleConfirmAction}>
                {confirmAction === 'complete' ? 'Hoàn tất nghỉ việc' : 'Huỷ quy trình'}
              </Button>
            </>
          )}
        >
          <div className="px-6 py-5 text-sm leading-relaxed text-gray-600">
            {confirmAction === 'complete'
              ? 'Thao tác này chỉ thực hiện được khi toàn bộ checklist bàn giao đã hoàn thành (100%).'
              : 'Bạn có thể tạo lại quy trình mới cho nhân viên này sau nếu cần.'}
          </div>
        </Modal>
      )}
    </div>
  );
}
