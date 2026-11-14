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
import { getEmployees } from '../../employees/services';
import {
  approveShiftSwap,
  cancelShiftSwap,
  createShiftSwap,
  getShiftSwaps,
  rejectShiftSwap,
} from '../services';

// ============================================================
// Trang Đổi ca làm việc — route "/shift-swaps" — Design v4
// - Nhân viên tạo đơn xin đổi ca một ngày với đồng nghiệp.
// - Khi quản lý/HR duyệt, hai ca gán (ShiftAssignment) ngày hôm đó
//   được hoán đổi (hoặc chuyển ca nếu chỉ một người có ca gán).
// - Danh sách đã phân quyền ở backend: admin/hr thấy toàn công ty,
//   manager thấy đơn liên quan phòng mình, employee thấy đơn mình tạo
//   + đơn chọn mình làm người đổi ca.
// ============================================================

const STATUS_META = {
  pending: { label: 'Chờ duyệt', tone: 'amber' },
  approved: { label: 'Đã duyệt', tone: 'green' },
  rejected: { label: 'Đã từ chối', tone: 'red' },
  cancelled: { label: 'Đã hủy', tone: 'slate' },
};

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

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
    requesterId: pick(item, 'requester_id', 'requesterId'),
    requesterName: pick(item, 'requester_name', 'requesterName') || '—',
    requesterCode: pick(item, 'requester_code', 'requesterCode') || '',
    requesterDepartment: pick(item, 'requester_department', 'requesterDepartment') || '',
    targetId: pick(item, 'target_id', 'targetId'),
    targetName: pick(item, 'target_name', 'targetName') || '—',
    targetCode: pick(item, 'target_code', 'targetCode') || '',
    targetDepartment: pick(item, 'target_department', 'targetDepartment') || '',
    workDate: pick(item, 'work_date', 'workDate'),
    status: pick(item, 'status') || 'pending',
    note: pick(item, 'note') || '',
    decidedByName: pick(item, 'decided_by_name', 'decidedByName') || '',
  };
}

export default function ShiftSwapsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const role = user?.role || 'employee';
  const myEmployeeId = user?.employeeId ?? null;
  const canDecide = ['admin', 'hr', 'manager'].includes(role);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Tạo đơn mới.
  const [creating, setCreating] = useState(false);
  const [colleagues, setColleagues] = useState([]);
  const [targetId, setTargetId] = useState('');
  const [workDate, setWorkDate] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Duyệt / hủy / từ chối.
  const [confirming, setConfirming] = useState(null); // {type: 'approve'|'cancel', row}
  const [rejecting, setRejecting] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [actionError, setActionError] = useState('');

  const todayISO = useMemo(() => toISODate(new Date()), []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const { items: rows } = await getShiftSwaps(params);
      setItems((Array.isArray(rows) ? rows : []).map(normalizeRow));
    } catch (error) {
      setLoadError(errorMessage(error, 'Không tải được danh sách đơn đổi ca.'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const pending = items.filter((it) => it.status === 'pending').length;
    const approved = items.filter((it) => it.status === 'approved').length;
    return { total: items.length, pending, approved };
  }, [items]);

  const openCreate = async () => {
    setCreating(true);
    setTargetId('');
    setWorkDate('');
    setNote('');
    setFormError('');
    try {
      const { items: rows } = await getEmployees({ limit: 100 });
      setColleagues((Array.isArray(rows) ? rows : []).filter((emp) => emp.id !== myEmployeeId));
    } catch (error) {
      setFormError(errorMessage(error, 'Không tải được danh sách nhân viên.'));
    }
  };

  const closeCreate = () => {
    setCreating(false);
    setFormError('');
  };

  const handleCreate = async () => {
    if (!targetId) {
      setFormError('Hãy chọn đồng nghiệp muốn đổi ca.');
      return;
    }
    if (!workDate) {
      setFormError('Hãy chọn ngày đổi ca.');
      return;
    }
    if (workDate < todayISO) {
      setFormError('Ngày đổi ca phải từ hôm nay trở đi.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await createShiftSwap({
        target_id: Number(targetId),
        work_date: workDate,
        note: note.trim() || null,
      });
      toast.success('Đã tạo đơn đổi ca, đang chờ duyệt.');
      closeCreate();
      await load();
    } catch (error) {
      setFormError(errorMessage(error, 'Không tạo được đơn đổi ca.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirming) return;
    setSubmitting(true);
    setActionError('');
    try {
      if (confirming.type === 'approve') {
        await approveShiftSwap(confirming.row.id);
        toast.success('Đã duyệt đơn đổi ca — ca làm hai người đã được hoán đổi.');
      } else {
        await cancelShiftSwap(confirming.row.id);
        toast.success('Đã hủy đơn đổi ca.');
      }
      setConfirming(null);
      await load();
    } catch (error) {
      setActionError(errorMessage(error, 'Không thực hiện được thao tác.'));
      setConfirming(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejecting) return;
    setSubmitting(true);
    setActionError('');
    try {
      await rejectShiftSwap(rejecting.id, { note: rejectNote.trim() || null });
      toast.success('Đã từ chối đơn đổi ca.');
      setRejecting(null);
      setRejectNote('');
      await load();
    } catch (error) {
      setActionError(errorMessage(error, 'Không từ chối được đơn đổi ca.'));
      setRejecting(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        title="Đổi ca làm việc"
        subtitle="Xin đổi ca một ngày với đồng nghiệp — khi được duyệt, ca làm của hai người ngày hôm đó sẽ được hoán đổi."
        actions={
          <Button variant="primary" onClick={openCreate}>
            Tạo đơn đổi ca
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardBody className="py-4">
            <p className="text-sm text-gray-500">Tổng số đơn</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{summary.total}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-4">
            <p className="text-sm text-gray-500">Đang chờ duyệt</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-600">{summary.pending}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-4">
            <p className="text-sm text-gray-500">Đã duyệt</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-green-600">{summary.approved}</p>
          </CardBody>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600" htmlFor="swap-status-filter">
          Trạng thái
        </label>
        <Select
          id="swap-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-48"
        >
          <option value="">Tất cả</option>
          <option value="pending">Chờ duyệt</option>
          <option value="approved">Đã duyệt</option>
          <option value="rejected">Đã từ chối</option>
          <option value="cancelled">Đã hủy</option>
        </Select>
        {actionError ? <Alert tone="error">{actionError}</Alert> : null}
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
            title="Chưa có đơn đổi ca nào"
            description="Khi cần đổi ca với đồng nghiệp vào một ngày cụ thể, hãy tạo đơn — quản lý hoặc HR duyệt xong ca làm của hai người sẽ tự đổi cho nhau."
          />
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
                  <th className="px-4 py-3">Ngày đổi ca</th>
                  <th className="px-4 py-3">Người xin đổi</th>
                  <th className="px-4 py-3">Đổi ca với</th>
                  <th className="px-4 py-3">Lý do</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const meta = STATUS_META[row.status] || STATUS_META.pending;
                  const isMine = myEmployeeId !== null && row.requesterId === myEmployeeId;
                  return (
                    <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium tabular-nums text-gray-900">
                        {formatDate(row.workDate)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">
                          {row.requesterName}
                          {isMine ? ' (bạn)' : ''}
                        </p>
                        <p className="text-xs text-gray-500">
                          {row.requesterCode}
                          {row.requesterDepartment ? ` · ${row.requesterDepartment}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">
                          {row.targetName}
                          {myEmployeeId !== null && row.targetId === myEmployeeId ? ' (bạn)' : ''}
                        </p>
                        <p className="text-xs text-gray-500">
                          {row.targetCode}
                          {row.targetDepartment ? ` · ${row.targetDepartment}` : ''}
                        </p>
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-sm text-gray-700" title={row.note || ''}>
                        {row.note || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={meta.tone} dot>
                          {meta.label}
                        </Badge>
                        {row.decidedByName && row.status !== 'pending' ? (
                          <p className="mt-1 text-xs text-gray-500">{row.decidedByName}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.status === 'pending' ? (
                          <span className="inline-flex flex-wrap justify-end gap-2">
                            {canDecide ? (
                              <>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => setConfirming({ type: 'approve', row })}
                                >
                                  Duyệt
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => { setRejecting(row); setRejectNote(''); }}>
                                  Từ chối
                                </Button>
                              </>
                            ) : null}
                            {isMine ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setConfirming({ type: 'cancel', row })}
                              >
                                Hủy đơn
                              </Button>
                            ) : null}
                            {!canDecide && !isMine ? <span className="text-sm text-gray-400">—</span> : null}
                          </span>
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
          title="Tạo đơn đổi ca"
          subtitle="Chọn đồng nghiệp và ngày muốn đổi ca — ca làm của hai người ngày hôm đó sẽ được hoán đổi khi đơn được duyệt."
          onClose={closeCreate}
          actions={
            <>
              <Button variant="secondary" onClick={closeCreate}>
                Huỷ
              </Button>
              <Button variant="primary" onClick={handleCreate} disabled={submitting}>
                {submitting ? 'Đang tạo...' : 'Gửi đơn'}
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
            <FormField label="Đổi ca với">
              <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                <option value="">— Chọn đồng nghiệp —</option>
                {colleagues.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.code} · {emp.full_name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Ngày đổi ca">
              <Input type="date" min={todayISO} value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
            </FormField>
            <FormField label="Lý do (không bắt buộc)">
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ví dụ: bận việc gia đình buổi sáng..."
                maxLength={500}
              />
            </FormField>
            <p className="text-[13px] leading-relaxed text-gray-500">
              Một người chỉ có tối đa một đơn đang chờ duyệt cho cùng một ngày. Khi đơn được duyệt, ca làm của hai
              người ngày hôm đó sẽ tự động hoán đổi.
            </p>
          </div>
        </Modal>
      ) : null}

      {rejecting ? (
        <Modal
          title={`Từ chối đơn đổi ca — ${rejecting.requesterName}`}
          subtitle={`Ngày ${formatDate(rejecting.workDate)} · đổi ca với ${rejecting.targetName}`}
          onClose={() => { setRejecting(null); setRejectNote(''); }}
          actions={
            <>
              <Button variant="secondary" onClick={() => { setRejecting(null); setRejectNote(''); }}>
                Huỷ
              </Button>
              <Button variant="primary" onClick={handleReject} disabled={submitting}>
                {submitting ? 'Đang lưu...' : 'Xác nhận từ chối'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <FormField label="Lý do từ chối (không bắt buộc)">
              <Textarea
                rows={3}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Ví dụ: không đủ người trực ca hôm đó..."
                maxLength={500}
              />
            </FormField>
            <p className="text-[13px] leading-relaxed text-gray-500">
              Đơn bị từ chối sẽ không đổi ca làm. Người xin đổi có thể tạo đơn mới cho ngày khác.
            </p>
          </div>
        </Modal>
      ) : null}

      <ConfirmDialog
        open={!!confirming}
        title={confirming?.type === 'approve' ? 'Duyệt đơn đổi ca' : 'Hủy đơn đổi ca'}
        description={
          confirming?.type === 'approve'
            ? `Duyệt đơn đổi ca ngày ${formatDate(confirming?.row?.workDate)} của ${confirming?.row?.requesterName} với ${confirming?.row?.targetName} — ca làm của hai người ngày hôm đó sẽ được hoán đổi.`
            : `Hủy đơn đổi ca ngày ${formatDate(confirming?.row?.workDate)}? Đơn sẽ chuyển sang trạng thái đã hủy.`
        }
        confirmLabel={submitting ? 'Đang xử lý...' : confirming?.type === 'approve' ? 'Duyệt đơn' : 'Hủy đơn'}
        danger={confirming?.type === 'cancel'}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
