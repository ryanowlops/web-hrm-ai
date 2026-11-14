import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../app/AuthContext.jsx';
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
  Textarea,
  useToast,
} from '../../../components/ui';
import { getCurrentUser } from '../../auth/services';
import { getEmployees } from '../../employees/services';
import {
  createDisciplinary,
  getDisciplinaryList,
  resolveDisciplinary,
} from '../services';

// ============================================================
// Trang Kỷ luật nhân viên — route "/disciplinary" — Design v4
// - Danh sách biên bản kỷ luật: loại, mức độ, trạng thái, người lập.
// - Admin/HR: lập biên bản mới (nhân viên, loại, mức độ, tiêu đề,
//   mô tả, biện pháp đã xử lý, ngày lập) và giải quyết biên bản.
// - Manager: chỉ xem biên bản của phòng mình; nhân viên: chỉ xem
//   biên bản của chính mình. Quyền ghi kiểm ở API.
// ============================================================

const TYPE_META = {
  verbal: { label: 'Khiển trách bằng lời', tone: 'slate' },
  written: { label: 'Khiển trách bằng văn bản', tone: 'amber' },
  final: { label: 'Cảnh cáo cuối', tone: 'amber' },
  suspension: { label: 'Đình chỉ', tone: 'red' },
};

const SEVERITY_META = {
  low: { label: 'Nhẹ', tone: 'green' },
  medium: { label: 'Trung bình', tone: 'amber' },
  high: { label: 'Nghiêm trọng', tone: 'red' },
};

const STATUS_META = {
  active: { label: 'Đang hiệu lực', tone: 'red' },
  resolved: { label: 'Đã giải quyết', tone: 'green' },
};

const EMPTY_FORM = {
  employee_id: '',
  type: 'written',
  severity: 'medium',
  title: '',
  description: '',
  action_taken: '',
  issued_date: '',
};

// Lấy field chịu được cả snake_case (DB/BE Flask) lẫn camelCase.
function pick(obj, ...keys) {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

function errorMessage(error, fallback) {
  return error?.response?.data?.error?.message || fallback;
}

function normalizeRow(item) {
  return {
    id: pick(item, 'id'),
    employeeId: pick(item, 'employee_id', 'employeeId'),
    employeeCode: pick(item, 'employee_code', 'employeeCode') || '',
    employeeName: pick(item, 'employee_name', 'employeeName') || '—',
    departmentName: pick(item, 'department_name', 'departmentName') || '',
    type: pick(item, 'type') || '',
    severity: pick(item, 'severity') || '',
    title: pick(item, 'title') || '',
    description: pick(item, 'description') || '',
    actionTaken: pick(item, 'action_taken', 'actionTaken') || '',
    issuedByName: pick(item, 'issued_by_name', 'issuedByName') || '',
    issuedDate: pick(item, 'issued_date', 'issuedDate'),
    status: pick(item, 'status') || '',
    resolvedNote: pick(item, 'resolved_note', 'resolvedNote') || '',
  };
}

export default function DisciplinaryPage() {
  const toast = useToast();
  const { user: authUser } = useAuth();
  const user = authUser || getCurrentUser();
  const canWrite = user?.role === 'admin' || user?.role === 'hr';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Bộ lọc.
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  // Modal lập biên bản mới.
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Modal giải quyết + hộp xác nhận.
  const [resolving, setResolving] = useState(null);
  const [resolvedNote, setResolvedNote] = useState('');
  const [resolveError, setResolveError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [resolvingSubmitting, setResolvingSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const params = { limit: 100 };
      if (statusFilter) params.status = statusFilter;
      if (severityFilter) params.severity = severityFilter;
      const { items: rows } = await getDisciplinaryList(params);
      setItems((Array.isArray(rows) ? rows : []).map(normalizeRow));
    } catch (error) {
      setLoadError(errorMessage(error, 'Không tải được danh sách kỷ luật.'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const active = items.filter((it) => it.status === 'active').length;
    const resolved = items.filter((it) => it.status === 'resolved').length;
    return { total: items.length, active, resolved };
  }, [items]);

  const openCreate = async () => {
    setForm({ ...EMPTY_FORM, issued_date: todayISO() });
    setFormError('');
    setCreating(true);
    if (employees.length === 0) {
      setEmployeesLoading(true);
      try {
        const { items: rows } = await getEmployees({ limit: 100 });
        setEmployees(Array.isArray(rows) ? rows : []);
      } catch {
        setEmployees([]);
      } finally {
        setEmployeesLoading(false);
      }
    }
  };

  const closeCreate = () => {
    setCreating(false);
    setFormError('');
  };

  const handleCreate = async () => {
    if (!form.employee_id) {
      setFormError('Chọn nhân viên bị kỷ luật.');
      return;
    }
    if (!form.title.trim()) {
      setFormError('Tiêu đề biên bản không được để trống.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await createDisciplinary({
        employee_id: Number(form.employee_id),
        type: form.type,
        severity: form.severity,
        title: form.title.trim(),
        description: form.description.trim() || null,
        action_taken: form.action_taken.trim() || null,
        issued_date: form.issued_date || null,
      });
      toast.success('Đã lập biên bản kỷ luật.');
      closeCreate();
      await load();
    } catch (error) {
      setFormError(errorMessage(error, 'Không lập được biên bản kỷ luật.'));
    } finally {
      setSubmitting(false);
    }
  };

  const openResolve = (row) => {
    setResolving(row);
    setResolvedNote('');
    setResolveError('');
    setConfirming(false);
  };

  const closeResolve = () => {
    setResolving(null);
    setConfirming(false);
    setResolveError('');
  };

  const handleResolve = async () => {
    if (!resolving) return;
    setResolvingSubmitting(true);
    setResolveError('');
    try {
      await resolveDisciplinary(resolving.id, {
        resolved_note: resolvedNote.trim() || null,
      });
      toast.success('Đã giải quyết biên bản kỷ luật.');
      closeResolve();
      await load();
    } catch (error) {
      setResolveError(errorMessage(error, 'Không giải quyết được biên bản.'));
      setConfirming(false);
    } finally {
      setResolvingSubmitting(false);
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        title="Kỷ luật nhân viên"
        subtitle="Theo dõi các biên bản kỷ luật: khiển trách, cảnh cáo, đình chỉ — và giải quyết khi nhân viên đã khắc phục."
        actions={
          canWrite ? (
            <Button variant="primary" onClick={openCreate}>
              Thêm biên bản
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardBody className="py-4">
            <p className="text-sm text-gray-500">Tổng biên bản</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{summary.total}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-4">
            <p className="text-sm text-gray-500">Đang hiệu lực</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-red-600">{summary.active}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-4">
            <p className="text-sm text-gray-500">Đã giải quyết</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-green-600">{summary.resolved}</p>
          </CardBody>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <FormField label="Trạng thái" className="w-44">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tất cả</option>
            <option value="active">Đang hiệu lực</option>
            <option value="resolved">Đã giải quyết</option>
          </Select>
        </FormField>
        <FormField label="Mức độ" className="w-44">
          <Select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
            <option value="">Tất cả</option>
            <option value="low">Nhẹ</option>
            <option value="medium">Trung bình</option>
            <option value="high">Nghiêm trọng</option>
          </Select>
        </FormField>
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
            title="Chưa có biên bản kỷ luật nào"
            description={
              canWrite
                ? 'Khi có vi phạm cần lập biên bản, bấm “Thêm biên bản” để ghi nhận loại kỷ luật, mức độ và biện pháp đã xử lý.'
                : 'Chưa có biên bản kỷ luật nào trong phạm vi của bạn.'
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
                  <th className="px-4 py-3">Nhân viên</th>
                  <th className="px-4 py-3">Loại kỷ luật</th>
                  <th className="px-4 py-3">Mức độ</th>
                  <th className="px-4 py-3">Tiêu đề</th>
                  <th className="px-4 py-3">Ngày lập</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const typeMeta = TYPE_META[row.type];
                  const severityMeta = SEVERITY_META[row.severity];
                  const statusMeta = STATUS_META[row.status];
                  return (
                    <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{row.employeeName}</p>
                        <p className="text-xs text-gray-500">
                          {[row.employeeCode, row.departmentName].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {typeMeta ? (
                          <Badge tone={typeMeta.tone}>{typeMeta.label}</Badge>
                        ) : (
                          <span className="text-sm text-gray-500">{row.type || '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {severityMeta ? (
                          <Badge tone={severityMeta.tone} dot>
                            {severityMeta.label}
                          </Badge>
                        ) : (
                          <span className="text-sm text-gray-500">{row.severity || '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="max-w-[260px] text-sm font-medium text-gray-900">{row.title}</p>
                        {row.description ? (
                          <p className="max-w-[260px] truncate text-xs text-gray-500" title={row.description}>
                            {row.description}
                          </p>
                        ) : null}
                        {row.issuedByName ? (
                          <p className="text-xs text-gray-500">Lập bởi: {row.issuedByName}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-gray-700">{formatDate(row.issuedDate)}</td>
                      <td className="px-4 py-3">
                        {statusMeta ? (
                          <Badge tone={statusMeta.tone} dot>
                            {statusMeta.label}
                          </Badge>
                        ) : (
                          <span className="text-sm text-gray-500">{row.status || '—'}</span>
                        )}
                        {row.status === 'resolved' && row.resolvedNote ? (
                          <p className="mt-1 max-w-[200px] truncate text-xs text-gray-500" title={row.resolvedNote}>
                            {row.resolvedNote}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canWrite && row.status === 'active' ? (
                          <Button variant="secondary" size="sm" onClick={() => openResolve(row)}>
                            Giải quyết
                          </Button>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
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
          title="Lập biên bản kỷ luật"
          subtitle="Biên bản được lưu vào hồ sơ nhân viên và không thể xóa — chỉ giải quyết khi đã khắc phục."
          onClose={closeCreate}
          actions={
            <>
              <Button variant="secondary" onClick={closeCreate}>
                Huỷ
              </Button>
              <Button variant="primary" onClick={handleCreate} disabled={submitting}>
                {submitting ? 'Đang lưu...' : 'Lập biên bản'}
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
            <FormField label="Nhân viên">
              <Select
                value={form.employee_id}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                disabled={employeesLoading}
              >
                <option value="">
                  {employeesLoading ? 'Đang tải danh sách...' : 'Chọn nhân viên...'}
                </option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {pick(emp, 'full_name', 'fullName', 'name') || '—'}
                    {pick(emp, 'code') ? ` (${pick(emp, 'code')})` : ''}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Loại kỷ luật">
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="verbal">Khiển trách bằng lời</option>
                  <option value="written">Khiển trách bằng văn bản</option>
                  <option value="final">Cảnh cáo cuối</option>
                  <option value="suspension">Đình chỉ</option>
                </Select>
              </FormField>
              <FormField label="Mức độ">
                <Select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                  <option value="low">Nhẹ</option>
                  <option value="medium">Trung bình</option>
                  <option value="high">Nghiêm trọng</option>
                </Select>
              </FormField>
            </div>
            <FormField label="Tiêu đề">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ví dụ: Đi muộn nhiều lần trong tháng"
                maxLength={200}
              />
            </FormField>
            <FormField label="Mô tả vi phạm (không bắt buộc)">
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Mô tả hành vi vi phạm, thời gian, địa điểm..."
              />
            </FormField>
            <FormField label="Biện pháp đã xử lý (không bắt buộc)">
              <Textarea
                rows={2}
                value={form.action_taken}
                onChange={(e) => setForm({ ...form, action_taken: e.target.value })}
                placeholder="Ví dụ: Nhắc nhở bằng văn bản, trừ điểm chuyên cần..."
              />
            </FormField>
            <FormField label="Ngày lập">
              <Input
                type="date"
                value={form.issued_date}
                onChange={(e) => setForm({ ...form, issued_date: e.target.value })}
              />
            </FormField>
          </div>
        </Modal>
      ) : null}

      {resolving ? (
        <Modal
          title={`Giải quyết biên bản — ${resolving.employeeName}`}
          subtitle={`“${resolving.title}” · ${formatDate(resolving.issuedDate)}`}
          onClose={closeResolve}
          actions={
            <>
              <Button variant="secondary" onClick={closeResolve}>
                Huỷ
              </Button>
              <Button variant="primary" onClick={() => setConfirming(true)} disabled={resolvingSubmitting}>
                Tiếp tục
              </Button>
            </>
          }
        >
          {resolveError ? (
            <Alert tone="error" className="mb-4">
              {resolveError}
            </Alert>
          ) : null}
          <div className="space-y-4">
            <FormField label="Ghi chú giải quyết (không bắt buộc)">
              <Textarea
                rows={3}
                value={resolvedNote}
                onChange={(e) => setResolvedNote(e.target.value)}
                placeholder="Ví dụ: Nhân viên đã cam kết không tái phạm, theo dõi thêm 1 tháng..."
                maxLength={1000}
              />
            </FormField>
            <p className="text-[13px] leading-relaxed text-gray-500">
              Sau khi giải quyết, biên bản chuyển sang trạng thái “Đã giải quyết” và vẫn lưu trong hồ sơ nhân viên
              để tra cứu.
            </p>
          </div>
        </Modal>
      ) : null}

      <ConfirmDialog
        open={!!confirming && !!resolving}
        title="Xác nhận giải quyết biên bản"
        description={
          resolving
            ? `Biên bản “${resolving.title}” của ${resolving.employeeName} sẽ chuyển sang “Đã giải quyết”.`
            : ''
        }
        confirmLabel={resolvingSubmitting ? 'Đang lưu...' : 'Xác nhận'}
        onConfirm={handleResolve}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
