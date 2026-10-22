// Trang Ca làm việc — route /shifts (feature-expansion-v3 mục 1)
// 3 tab: Lịch ca (bảng tuần + gán ca + định nghĩa ca) / Tăng ca / Giải trình.
// Cả 2 loại đơn đều duyệt 2 cấp (Manager -> HR) như đơn nghỉ phép.
// Trình bày theo hợp đồng thiết kế v4: phẳng, UI kit, badge trạng thái.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../app/AuthContext.jsx';
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  Badge,
  Modal,
  PageHeader,
  EmptyState,
  Alert,
  FormField,
  Input,
  Select,
  Textarea,
  Skeleton,
  TableSkeleton,
  ConfirmDialog,
} from '../../../components/ui';
import { IconPlus, IconEdit, IconTrash, IconCheck, IconClock } from '../../../components/icons.jsx';
import {
  getDefinitions,
  createDefinition,
  updateDefinition,
  deleteDefinition,
  getWeek,
  upsertAssignment,
  deleteAssignment,
  getOvertime,
  createOvertime,
  decideOvertime,
  getCorrections,
  createCorrection,
  decideCorrection,
  parseApiError,
} from '../services';
import { getEmployees } from '../../employees/services';
import { getDepartments } from '../../departments/services';

const STATUS_META = {
  pending: { label: 'Chờ quản lý duyệt', tone: 'amber' },
  manager_approved: { label: 'Chờ HR duyệt', tone: 'blue' },
  approved: { label: 'Đã duyệt', tone: 'green' },
  rejected: { label: 'Đã từ chối', tone: 'red' },
};

const WEEKDAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const WRITE_ROLES = ['admin', 'hr'];

function toISODate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function mondayOf(d) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (copy.getDay() + 6) % 7; // getDay: CN=0 -> lùi về Thứ 2
  copy.setDate(copy.getDate() - offset);
  return copy;
}

function addDays(d, n) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('vi-VN');
}

function formatTime(value) {
  if (!value) return '—';
  return String(value).slice(0, 5);
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, tone: 'slate' };
  return <Badge tone={meta.tone} dot>{meta.label}</Badge>;
}

// ---------------------------------------------------------------------------
// Modal quyết định duyệt (dùng chung cho tăng ca & giải trình)
// ---------------------------------------------------------------------------

function DecisionModal({ open, title, summary, onClose, onSubmit }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) { setNote(''); setError(''); }
  }, [open ]);

  const submit = async (decision) => {
    if (decision === 'reject' && !note.trim()) {
      setError('Từ chối đơn bắt buộc phải nhập lý do.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(decision, note.trim());
      onClose();
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">{summary}</p>
        {error && <Alert tone="error">{error}</Alert>}
        <FormField label="Ghi chú quyết định">
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bắt buộc khi từ chối…" />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Đóng</Button>
          <Button variant="danger" onClick={() => submit('reject')} loading={submitting}>Từ chối</Button>
          <Button variant="primary" onClick={() => submit('approve')} loading={submitting}>
            <IconCheck size={16} /> Duyệt
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Nút mở modal duyệt theo đúng cấp đang chờ + vai trò người dùng.
function DecisionAction({ item, role, onDecide }) {
  if (item.status === 'pending' && role === 'manager') {
    return <Button size="sm" variant="secondary" onClick={() => onDecide(item, 'manager')}>Duyệt cấp quản lý</Button>;
  }
  if (item.status === 'manager_approved' && WRITE_ROLES.includes(role)) {
    return <Button size="sm" variant="secondary" onClick={() => onDecide(item, 'hr')}>Duyệt cấp HR</Button>;
  }
  return <span className="text-xs text-gray-400">—</span>;
}

// ---------------------------------------------------------------------------
// Tab 1: Lịch ca
// ---------------------------------------------------------------------------

function DefinitionModal({ open, editing, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', start_time: '08:00', end_time: '17:00', break_minutes: 60, is_overnight: false, is_active: true });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(''); setFieldErrors({});
    if (editing) {
      setForm({
        name: editing.name || '',
        start_time: formatTime(editing.start_time),
        end_time: formatTime(editing.end_time),
        break_minutes: editing.break_minutes ?? 60,
        is_overnight: !!editing.is_overnight,
        is_active: !!editing.is_active,
      });
    } else {
      setForm({ name: '', start_time: '08:00', end_time: '17:00', break_minutes: 60, is_overnight: false, is_active: true });
    }
  }, [editing, open]);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = { ...form, break_minutes: Number(form.break_minutes) || 0 };
    try {
      if (editing) await updateDefinition(editing.id, payload);
      else await createDefinition(payload);
      onSaved();
      onClose();
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
      setFieldErrors(parsed.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Sửa ca làm việc' : 'Thêm ca làm việc'}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <FormField label="Tên ca" error={fieldErrors.name}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="VD: Ca hành chính" required />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Giờ bắt đầu" error={fieldErrors.start_time}>
            <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} required />
          </FormField>
          <FormField label="Giờ kết thúc" error={fieldErrors.end_time}>
            <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} required />
          </FormField>
        </div>
        <FormField label="Nghỉ giữa ca (phút)" error={fieldErrors.break_minutes}>
          <Input type="number" min="0" max="480" value={form.break_minutes} onChange={(e) => setForm({ ...form, break_minutes: e.target.value })} />
        </FormField>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.is_overnight} onChange={(e) => setForm({ ...form, is_overnight: e.target.checked })} />
          Ca qua đêm (kết thúc vào ngày hôm sau)
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          Đang áp dụng
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button type="submit" variant="primary" loading={submitting}>{editing ? 'Lưu thay đổi' : 'Tạo ca'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function AssignmentModal({ open, cell, definitions, onClose, onSaved }) {
  const [shiftId, setShiftId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !cell) return;
    setError('');
    setShiftId(cell.assignment ? String(cell.assignment.shift_id) : '');
    setNote(cell.assignment?.note || '');
  }, [cell, open]);

  if (!cell) return null;
  const activeDefs = definitions.filter((d) => d.is_active);

  const save = async () => {
    if (!shiftId) { setError('Vui lòng chọn ca.'); return; }
    setSubmitting(true);
    try {
      await upsertAssignment({ employee_id: cell.employee.id, shift_id: Number(shiftId), work_date: cell.date, note: note.trim() || undefined });
      onSaved();
      onClose();
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    setSubmitting(true);
    try {
      await deleteAssignment(cell.assignment.id);
      onSaved();
      onClose();
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Gán ca — ${cell.employee.full_name}`}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">Ngày {formatDate(cell.date)} · {cell.employee.department_name || 'Chưa có phòng ban'}</p>
        {error && <Alert tone="error">{error}</Alert>}
        <FormField label="Ca làm việc">
          <Select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
            <option value="">— Chọn ca —</option>
            {activeDefs.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({formatTime(d.start_time)}–{formatTime(d.end_time)})</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Ghi chú">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Không bắt buộc" />
        </FormField>
        <div className="flex items-center justify-between">
          <div>
            {cell.assignment && (
              <Button variant="danger" onClick={remove} loading={submitting}><IconTrash size={16} /> Xoá gán ca</Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Đóng</Button>
            <Button variant="primary" onClick={save} loading={submitting}>Lưu gán ca</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ScheduleTab({ role }) {
  const canAssign = ['admin', 'hr', 'manager'].includes(role);
  const canManageDefs = WRITE_ROLES.includes(role);
  const [anchor, setAnchor] = useState(() => mondayOf(new Date()));
  const [week, setWeek] = useState(null);
  const [definitions, setDefinitions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cell, setCell] = useState(null);
  const [defModal, setDefModal] = useState({ open: false, editing: null });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getWeek({ date: toISODate(anchor), ...(departmentId ? { department_id: departmentId } : {}) });
      setWeek(data);
      if (Array.isArray(data?.definitions)) setDefinitions(data.definitions);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [anchor, departmentId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!canManageDefs) return;
    getDepartments({ limit: 100 })
      .then((res) => setDepartments(res?.items || []))
      .catch(() => setDepartments([]));
  }, [canManageDefs]);

  const reloadDefs = useCallback(async () => {
    try {
      const res = await getDefinitions();
      setDefinitions(res.items || []);
    } catch { /* giữ danh sách cũ */ }
    load();
  }, [load]);

  // Xoá ca: hỏi xác nhận bằng ConfirmDialog (thay window.confirm), logic
  // gọi API giữ nguyên và chỉ chạy sau khi người dùng xác nhận.
  const [deleteDefTarget, setDeleteDefTarget] = useState(null);
  const confirmDeleteDef = async () => {
    const def = deleteDefTarget;
    setDeleteDefTarget(null);
    if (!def) return;
    try {
      await deleteDefinition(def.id);
      reloadDefs();
    } catch (err) {
      setError(parseApiError(err).message);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Lịch ca theo tuần"
          subtitle={week ? `${formatDate(week.start_date)} — ${formatDate(week.end_date)}` : 'Đang tải…'}
          actions={(
            <div className="flex items-center gap-2">
              {canManageDefs && (
                <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-44">
                  <option value="">Tất cả phòng ban</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              )}
              <Button size="sm" variant="secondary" onClick={() => setAnchor(addDays(anchor, -7))}>← Tuần trước</Button>
              <Button size="sm" variant="secondary" onClick={() => setAnchor(mondayOf(new Date()))}>Tuần này</Button>
              <Button size="sm" variant="secondary" onClick={() => setAnchor(addDays(anchor, 7))}>Tuần sau →</Button>
            </div>
          )}
        />
        <CardBody>
          {error && <Alert tone="error" className="mb-4">{error} <button type="button" className="underline" onClick={load}>Thử lại</button></Alert>}
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : !week || week.rows.length === 0 ? (
            <EmptyState icon={<IconClock size={26} />} title="Chưa có nhân viên trong phạm vi" description="Không có dữ liệu lịch ca cho tuần này." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-500">Nhân viên</th>
                    {week.days.map((day, i) => (
                      <th key={day} className="border-b border-gray-200 px-2 py-2 text-center text-xs font-medium text-gray-500">
                        {WEEKDAYS[i]}<br /><span className="text-gray-400">{formatDate(day)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {week.rows.map((row) => (
                    <tr key={row.employee.id} className="border-b border-gray-100">
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{row.employee.full_name}</div>
                        <div className="text-xs text-gray-500">{row.employee.code} · {row.employee.department_name || '—'}</div>
                      </td>
                      {row.cells.map((c) => (
                        <td key={c.date} className="px-1.5 py-2 text-center">
                          {canAssign ? (
                            <button
                              type="button"
                              onClick={() => setCell({ employee: row.employee, date: c.date, assignment: c.assignment })}
                              className={`w-full rounded-lg px-2 py-1.5 text-xs transition-colors ${c.assignment ? 'bg-brand-50 font-medium text-brand-700 hover:bg-brand-100' : 'text-gray-400 hover:bg-gray-50'}`}
                              title={c.assignment ? 'Bấm để đổi ca / xoá' : 'Bấm để gán ca'}
                            >
                              {c.assignment ? c.assignment.shift_name : '+ Gán ca'}
                            </button>
                          ) : c.assignment ? (
                            <span className="inline-block rounded-lg bg-brand-50 px-2 py-1.5 text-xs font-medium text-brand-700">{c.assignment.shift_name}</span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {role === 'employee' && (
            <p className="mt-3 text-xs text-gray-500">Bạn đang xem lịch ca của mình và đồng nghiệp cùng phòng ban (chỉ xem).</p>
          )}
        </CardBody>
      </Card>

      {canManageDefs && (
        <Card>
          <CardHeader
            title="Định nghĩa ca"
            subtitle="Các ca làm việc đang dùng để gán lịch"
            actions={<Button size="sm" variant="primary" onClick={() => setDefModal({ open: true, editing: null })}><IconPlus size={16} /> Thêm ca</Button>}
          />
          <CardBody>
            {definitions.length === 0 ? (
              <EmptyState icon={<IconClock size={26} />} title="Chưa có ca nào" description="Tạo ca đầu tiên để bắt đầu gán lịch." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Tên ca</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Giờ làm</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Nghỉ giữa ca</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Qua đêm</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Trạng thái</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {definitions.map((d) => (
                      <tr key={d.id} className="border-t border-gray-100">
                        <td className="px-4 py-3 font-medium text-gray-900">{d.name}</td>
                        <td className="px-4 py-3">{formatTime(d.start_time)} – {formatTime(d.end_time)}</td>
                        <td className="px-4 py-3">{d.break_minutes} phút</td>
                        <td className="px-4 py-3">{d.is_overnight ? 'Có' : 'Không'}</td>
                        <td className="px-4 py-3"><Badge tone={d.is_active ? 'green' : 'slate'} dot>{d.is_active ? 'Đang áp dụng' : 'Đã tắt'}</Badge></td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="secondary" onClick={() => setDefModal({ open: true, editing: d })}><IconEdit size={14} /> Sửa</Button>
                            <Button size="sm" variant="danger" onClick={() => setDeleteDefTarget(d)}><IconTrash size={14} /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <AssignmentModal open={!!cell} cell={cell} definitions={definitions} onClose={() => setCell(null)} onSaved={load} />
      <DefinitionModal open={defModal.open} editing={defModal.editing} onClose={() => setDefModal({ open: false, editing: null })} onSaved={reloadDefs} />
      <ConfirmDialog
        open={!!deleteDefTarget}
        title="Xoá ca làm việc"
        description={deleteDefTarget ? `Xoá / ngừng áp dụng ca "${deleteDefTarget.name}"?` : ''}
        confirmLabel="Xoá ca"
        danger
        onConfirm={confirmDeleteDef}
        onCancel={() => setDeleteDefTarget(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 + 3: danh sách đơn duyệt 2 cấp (tăng ca / giải trình)
// ---------------------------------------------------------------------------

function RequestList({ kind, role }) {
  const isOvertime = kind === 'overtime';
  const canCreateForOthers = WRITE_ROLES.includes(role);
  const [scope, setScope] = useState(role === 'employee' ? 'mine' : role === 'manager' ? 'team' : 'all');
  const [status, setStatus] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [employees, setEmployees] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [decision, setDecision] = useState(null); // { item, stage }
  const [form, setForm] = useState({ employee_id: '', work_date: toISODate(new Date()), hours: 2, reason: '', time_in: '', time_out: '' });
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { scope, limit: 100, ...(status ? { status } : {}) };
      const res = isOvertime ? await getOvertime(params) : await getCorrections(params);
      setItems(res.items || []);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [isOvertime, scope, status]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!canCreateForOthers) return;
    getEmployees({ limit: 100 })
      .then((res) => setEmployees(res?.items || []))
      .catch(() => setEmployees([]));
  }, [canCreateForOthers]);

  const submitCreate = async (e) => {
    e.preventDefault();
    setFormError(''); setFieldErrors({});
    const payload = { work_date: form.work_date, reason: form.reason.trim() || undefined };
    if (canCreateForOthers && form.employee_id) payload.employee_id = Number(form.employee_id);
    if (isOvertime) {
      payload.hours = Number(form.hours);
    } else {
      if (!form.time_in && !form.time_out) {
        setFormError('Cần đề xuất ít nhất giờ vào hoặc giờ ra.');
        return;
      }
      if (form.time_in) payload.requested_check_in = `${form.work_date}T${form.time_in}:00`;
      if (form.time_out) payload.requested_check_out = `${form.work_date}T${form.time_out}:00`;
      payload.reason = form.reason.trim();
      if (!payload.reason) { setFormError('Vui lòng nhập lý do giải trình.'); return; }
    }
    setSubmitting(true);
    try {
      if (isOvertime) await createOvertime(payload);
      else await createCorrection(payload);
      setCreateOpen(false);
      setForm({ employee_id: '', work_date: toISODate(new Date()), hours: 2, reason: '', time_in: '', time_out: '' });
      load();
    } catch (err) {
      const parsed = parseApiError(err);
      setFormError(parsed.message);
      setFieldErrors(parsed.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  };

  const submitDecision = async (decisionValue, note) => {
    const { item, stage } = decision;
    const payload = { decision: decisionValue, note: note || undefined };
    if (isOvertime) await decideOvertime(item.id, stage, payload);
    else await decideCorrection(item.id, stage, payload);
    load();
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={isOvertime ? 'Đơn tăng ca' : 'Đơn giải trình chấm công'}
          subtitle={isOvertime ? 'Tăng ca ngoài giờ làm việc — duyệt 2 cấp: Quản lý → HR' : 'Bổ sung / sửa giờ chấm công — HR duyệt xong sẽ cập nhật bản ghi chấm công'}
          actions={<Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}><IconPlus size={16} /> {isOvertime ? 'Tạo đơn tăng ca' : 'Tạo giải trình'}</Button>}
        />
        <CardBody>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Select value={scope} onChange={(e) => setScope(e.target.value)} className="w-44">
              <option value="mine">Đơn của tôi</option>
              {role !== 'employee' && <option value="team">Đội của tôi</option>}
              {WRITE_ROLES.includes(role) && <option value="all">Toàn công ty</option>}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
              <option value="">Tất cả trạng thái</option>
              {Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
            </Select>
          </div>

          {error && <Alert tone="error" className="mb-4">{error} <button type="button" className="underline" onClick={load}>Thử lại</button></Alert>}
          {loading ? (
            <TableSkeleton rows={4} />
          ) : items.length === 0 ? (
            <EmptyState icon={<IconClock size={26} />} title="Chưa có đơn nào" description="Danh sách trống theo bộ lọc hiện tại." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Nhân viên</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Ngày</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">{isOvertime ? 'Số giờ' : 'Giờ đề xuất'}</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Lý do</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Trạng thái</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t border-gray-100 align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{item.employee_name}</div>
                        <div className="text-xs text-gray-500">{item.employee_code} · {item.department_name || '—'}</div>
                      </td>
                      <td className="px-4 py-3">{formatDate(item.work_date)}</td>
                      <td className="px-4 py-3">
                        {isOvertime
                          ? `${item.hours} giờ`
                          : `Vào ${formatDateTime(item.requested_check_in)} · Ra ${formatDateTime(item.requested_check_out)}`}
                      </td>
                      <td className="max-w-[260px] px-4 py-3 text-gray-600">{item.reason || '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <DecisionAction item={item} role={role} onDecide={(it, stage) => setDecision({ item: it, stage })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={isOvertime ? 'Tạo đơn tăng ca' : 'Tạo đơn giải trình chấm công'}>
        <form onSubmit={submitCreate} className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}
          {canCreateForOthers && (
            <FormField label="Nhân viên (để trống = chính tôi)">
              <Select value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                <option value="">— Chính tôi —</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.code} · {emp.full_name}</option>)}
              </Select>
            </FormField>
          )}
          <FormField label="Ngày" error={fieldErrors.work_date}>
            <Input type="date" value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} required />
          </FormField>
          {isOvertime ? (
            <FormField label="Số giờ tăng ca" error={fieldErrors.hours}>
              <Input type="number" step="0.5" min="0.5" max="16" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} required />
            </FormField>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Giờ vào đề xuất" error={fieldErrors.requested_check_in}>
                <Input type="time" value={form.time_in} onChange={(e) => setForm({ ...form, time_in: e.target.value })} />
              </FormField>
              <FormField label="Giờ ra đề xuất" error={fieldErrors.requested_check_out}>
                <Input type="time" value={form.time_out} onChange={(e) => setForm({ ...form, time_out: e.target.value })} />
              </FormField>
            </div>
          )}
          <FormField label="Lý do" error={fieldErrors.reason}>
            <Textarea rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder={isOvertime ? 'VD: Hoàn thiện báo cáo tháng' : 'VD: Quên check-in buổi sáng'} />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Huỷ</Button>
            <Button type="submit" variant="primary" loading={submitting}>Gửi đơn</Button>
          </div>
        </form>
      </Modal>

      <DecisionModal
        open={!!decision}
        title={decision?.stage === 'hr' ? 'Duyệt cấp HR (cấp cuối)' : 'Duyệt cấp quản lý'}
        summary={decision ? `${decision.item.employee_name} · ${formatDate(decision.item.work_date)} · ${decision.item.reason || 'Không có lý do'}` : ''}
        onClose={() => setDecision(null)}
        onSubmit={submitDecision}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trang chính
// ---------------------------------------------------------------------------

const TABS = [
  { key: 'schedule', label: 'Lịch ca' },
  { key: 'overtime', label: 'Tăng ca' },
  { key: 'corrections', label: 'Giải trình' },
];

export default function ShiftsPage() {
  const { user } = useAuth();
  const role = user?.role || 'employee';
  const [tab, setTab] = useState('schedule');

  const subtitle = useMemo(() => {
    if (tab === 'schedule') return 'Lịch ca theo tuần của bạn và phòng ban, gán ca cho nhân viên.';
    if (tab === 'overtime') return 'Đơn tăng ca duyệt 2 cấp: Quản lý trực tiếp, sau đó là HR.';
    return 'Giải trình chấm công: bổ sung giờ vào/ra, HR duyệt xong hệ thống tự cập nhật chấm công.';
  }, [tab]);

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <PageHeader title="Ca làm việc" subtitle={subtitle} />
      <div className="mb-5 flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'schedule' && <ScheduleTab role={role} />}
      {tab === 'overtime' && <RequestList kind="overtime" role={role} />}
      {tab === 'corrections' && <RequestList kind="corrections" role={role} />}
    </div>
  );
}
