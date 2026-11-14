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
  Textarea,
  useToast,
} from '../../../components/ui';
import { evaluateProbation, getProbationList } from '../services';

// ============================================================
// Trang Quản lý thử việc — route "/probation" — Design v4
// - Danh sách nhân viên đang thử việc (hợp đồng loại "Thử việc"):
//   ngày bắt đầu/kết thúc, số ngày còn lại, đánh giá mới nhất.
// - Admin/HR/Manager: đánh giá thử việc — Đạt (chuyển chính thức),
//   Không đạt (kết thúc hợp đồng), Gia hạn (kéo dài thêm N ngày).
// - Lương thử việc hưởng 85% — backend tính trong payroll; phiếu lương
//   nhân viên có dòng riêng (xem PayrollPage).
// ============================================================

const DECISION_META = {
  pass: { label: 'Đạt — chuyển chính thức', tone: 'green' },
  fail: { label: 'Không đạt — kết thúc', tone: 'red' },
  extend: { label: 'Gia hạn', tone: 'amber' },
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

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function errorMessage(error, fallback) {
  return error?.response?.data?.error?.message || fallback;
}

// Chuẩn hoá một mục trong danh sách thử việc — backend trả
// {employee, contract, daysRemaining, latestEvaluation} nhưng tên field
// và hình dạng lồng nhau có thể khác nhau, nên đọc phòng thủ.
function normalizeRow(item) {
  const employee = pick(item, 'employee') || {};
  const contract = pick(item, 'contract') || {};
  // Backend trả đúng key "evaluation" cho đánh giá mới nhất.
  const evaluation = pick(item, 'evaluation', 'latestEvaluation', 'latest_evaluation') || null;

  // Phòng ban có thể là chuỗi hoặc object {name} tùy serializer.
  const deptRaw =
    pick(employee, 'department', 'department_name', 'departmentName') ||
    pick(item, 'department_name', 'departmentName') ||
    '';
  const department = typeof deptRaw === 'string' ? deptRaw : pick(deptRaw, 'name') || '';
  const startDate = pick(contract, 'start_date', 'startDate') || pick(item, 'start_date', 'startDate');
  const endDate = pick(contract, 'end_date', 'endDate') || pick(item, 'end_date', 'endDate');

  let daysRemaining = pick(item, 'daysRemaining', 'days_remaining');
  if (daysRemaining === undefined && endDate) {
    const end = parseLocalDate(endDate);
    if (end) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      daysRemaining = Math.round((end.getTime() - today.getTime()) / 86400000);
    }
  }

  return {
    id: pick(contract, 'id') || pick(item, 'contract_id', 'contractId') || pick(item, 'id'),
    contractId: pick(contract, 'id') || pick(item, 'contract_id', 'contractId'),
    employeeId: pick(employee, 'id') || pick(item, 'employee_id', 'employeeId'),
    name: pick(employee, 'full_name', 'fullName', 'name') || pick(item, 'employee_name', 'employeeName') || '—',
    code: pick(employee, 'code') || pick(item, 'employee_code', 'employeeCode') || '',
    department,
    startDate,
    endDate,
    daysRemaining: daysRemaining ?? null,
    evaluation,
  };
}

function evaluationLabel(evaluation) {
  if (!evaluation) return null;
  const decision = pick(evaluation, 'decision');
  const meta = DECISION_META[decision];
  const at = formatDateTime(pick(evaluation, 'evaluated_at', 'evaluatedAt', 'created_at', 'createdAt'));
  return {
    label: meta ? meta.label : String(decision || 'Đã đánh giá'),
    tone: meta ? meta.tone : 'slate',
    notes: pick(evaluation, 'notes') || '',
    at,
  };
}

export default function ProbationPage() {
  const toast = useToast();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Modal đánh giá + hộp xác nhận hậu quả.
  const [evaluating, setEvaluating] = useState(null);
  const [decision, setDecision] = useState('pass');
  const [notes, setNotes] = useState('');
  const [extendDays, setExtendDays] = useState('');
  const [formError, setFormError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { items: rows } = await getProbationList();
      setItems((Array.isArray(rows) ? rows : []).map(normalizeRow));
    } catch (error) {
      setLoadError(errorMessage(error, 'Không tải được danh sách thử việc.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const expiring = items.filter(
      (it) => it.daysRemaining !== null && it.daysRemaining >= 0 && it.daysRemaining <= 14,
    ).length;
    const overdue = items.filter((it) => it.daysRemaining !== null && it.daysRemaining < 0).length;
    return { total: items.length, expiring, overdue };
  }, [items]);

  const openEvaluate = (row) => {
    setEvaluating(row);
    setDecision('pass');
    setNotes('');
    setExtendDays('');
    setFormError('');
    setConfirming(false);
  };

  const closeEvaluate = () => {
    setEvaluating(null);
    setConfirming(false);
    setFormError('');
  };

  // Ngày kết thúc mới nếu gia hạn — chỉ để hiển thị trong hộp xác nhận.
  const extendedEndDate = useMemo(() => {
    if (!evaluating || decision !== 'extend') return null;
    const days = Number(extendDays);
    if (!Number.isFinite(days) || days <= 0 || !evaluating.endDate) return null;
    const end = parseLocalDate(evaluating.endDate);
    if (!end) return null;
    end.setDate(end.getDate() + days);
    return end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }, [evaluating, decision, extendDays]);

  const confirmDescription = () => {
    if (!evaluating) return '';
    const name = evaluating.name;
    if (decision === 'pass') {
      return `Nhân viên ${name} ĐẠT thử việc — hệ thống sẽ tạo hợp đồng chính thức, lương giữ nguyên như hợp đồng thử việc.`;
    }
    if (decision === 'fail') {
      return `Nhân viên ${name} KHÔNG ĐẠT thử việc — hợp đồng thử việc sẽ kết thúc và nhân viên chuyển sang trạng thái đã nghỉ việc. Hành động này không thể hoàn tác.`;
    }
    return `Gia hạn thử việc cho ${name} thêm ${Number(extendDays) || 0} ngày${
      extendedEndDate ? ` — ngày kết thúc mới là ${extendedEndDate}` : ''
    }.`;
  };

  const handleConfirmOpen = () => {
    if (decision === 'extend') {
      const days = Number(extendDays);
      if (!Number.isFinite(days) || days <= 0 || !Number.isInteger(days)) {
        setFormError('Gia hạn cần số ngày là số nguyên lớn hơn 0.');
        return;
      }
      if (days > 180) {
        setFormError('Số ngày gia hạn tối đa là 180 ngày.');
        return;
      }
    }
    setFormError('');
    setConfirming(true);
  };

  const handleSubmit = async () => {
    if (!evaluating) return;
    setSubmitting(true);
    setFormError('');
    try {
      await evaluateProbation(evaluating.contractId, {
        decision,
        notes: notes.trim() || null,
        extend_days: decision === 'extend' ? Number(extendDays) : null,
      });
      toast.success(
        decision === 'pass'
          ? 'Đã ghi nhận: đạt thử việc, chuyển chính thức.'
          : decision === 'fail'
            ? 'Đã ghi nhận: không đạt thử việc, hợp đồng đã kết thúc.'
            : `Đã gia hạn thử việc thêm ${Number(extendDays)} ngày.`,
      );
      closeEvaluate();
      await load();
    } catch (error) {
      setFormError(errorMessage(error, 'Không lưu được đánh giá thử việc.'));
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        title="Quản lý thử việc"
        subtitle="Theo dõi nhân viên đang thử việc (hưởng 85% lương) và đánh giá cuối kỳ: đạt, không đạt hoặc gia hạn."
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardBody className="py-4">
            <p className="text-sm text-gray-500">Đang thử việc</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{summary.total}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-4">
            <p className="text-sm text-gray-500">Sắp hết hạn (≤ 14 ngày)</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-600">{summary.expiring}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-4">
            <p className="text-sm text-gray-500">Đã quá hạn kết thúc</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-red-600">{summary.overdue}</p>
          </CardBody>
        </Card>
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
            title="Chưa có nhân viên nào đang thử việc"
            description="Khi có hợp đồng loại “Thử việc”, nhân viên sẽ hiện ở đây để theo dõi và đánh giá cuối kỳ. Tạo hợp đồng loại “Thử việc” ở trang chi tiết nhân viên."
          />
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
                  <th className="px-4 py-3">Nhân viên</th>
                  <th className="px-4 py-3">Phòng ban</th>
                  <th className="px-4 py-3">Bắt đầu</th>
                  <th className="px-4 py-3">Kết thúc</th>
                  <th className="px-4 py-3">Còn lại</th>
                  <th className="px-4 py-3">Đánh giá mới nhất</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const evalInfo = evaluationLabel(row.evaluation);
                  const remaining = row.daysRemaining;
                  const expiring = remaining !== null && remaining >= 0 && remaining <= 14;
                  const overdue = remaining !== null && remaining < 0;
                  return (
                    <tr key={row.id || row.contractId} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{row.name}</p>
                        {row.code ? <p className="text-xs text-gray-500">{row.code}</p> : null}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.department || '—'}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-gray-700">{formatDate(row.startDate)}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-gray-700">{formatDate(row.endDate)}</td>
                      <td className="px-4 py-3">
                        {remaining === null ? (
                          <span className="text-sm text-gray-500">—</span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-sm font-medium tabular-nums ${
                                overdue ? 'text-red-600' : expiring ? 'text-amber-600' : 'text-gray-900'
                              }`}
                            >
                              {overdue ? `Quá hạn ${Math.abs(remaining)} ngày` : `${remaining} ngày`}
                            </span>
                            {expiring && !overdue ? <Badge tone="amber" dot>Sắp hết hạn</Badge> : null}
                            {overdue ? <Badge tone="red" dot>Quá hạn</Badge> : null}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {evalInfo ? (
                          <span className="flex flex-col gap-1">
                            <Badge tone={evalInfo.tone} dot>
                              {evalInfo.label}
                            </Badge>
                            {evalInfo.at ? (
                              <span className="text-xs text-gray-500">{evalInfo.at}</span>
                            ) : null}
                            {evalInfo.notes ? (
                              <span className="max-w-[220px] truncate text-xs text-gray-500" title={evalInfo.notes}>
                                {evalInfo.notes}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500">Chưa đánh giá</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="secondary" size="sm" onClick={() => openEvaluate(row)}>
                          Đánh giá
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {evaluating ? (
        <Modal
          title={`Đánh giá thử việc — ${evaluating.name}`}
          subtitle={`Hợp đồng thử việc ${formatDate(evaluating.startDate)} → ${formatDate(evaluating.endDate)}${
            evaluating.code ? ` · Mã NV: ${evaluating.code}` : ''
          }`}
          onClose={closeEvaluate}
          actions={
            <>
              <Button variant="secondary" onClick={closeEvaluate}>
                Huỷ
              </Button>
              <Button variant="primary" onClick={handleConfirmOpen} disabled={submitting}>
                Tiếp tục
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
            <FormField label="Quyết định">
              <Select value={decision} onChange={(e) => setDecision(e.target.value)}>
                <option value="pass">Đạt — chuyển chính thức</option>
                <option value="fail">Không đạt — kết thúc hợp đồng</option>
                <option value="extend">Gia hạn thử việc</option>
              </Select>
            </FormField>
            {decision === 'extend' ? (
              <FormField label="Số ngày gia hạn">
                <Input
                  type="number"
                  min={1}
                  max={180}
                  value={extendDays}
                  onChange={(e) => setExtendDays(e.target.value)}
                  placeholder="Ví dụ: 30"
                />
              </FormField>
            ) : null}
            <FormField label="Ghi chú (không bắt buộc)">
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Nhận xét về kết quả thử việc..."
                maxLength={1000}
              />
            </FormField>
            <p className="text-[13px] leading-relaxed text-gray-500">
              {decision === 'pass'
                ? 'Đạt: hệ thống tạo hợp đồng chính thức, lương giữ nguyên như hợp đồng thử việc.'
                : decision === 'fail'
                  ? 'Không đạt: hợp đồng thử việc kết thúc, nhân viên chuyển sang trạng thái đã nghỉ việc.'
                  : 'Gia hạn: hợp đồng thử việc được kéo dài thêm số ngày đã nhập.'}
            </p>
          </div>
        </Modal>
      ) : null}

      <ConfirmDialog
        open={!!confirming && !!evaluating}
        title="Xác nhận đánh giá thử việc"
        description={confirmDescription()}
        confirmLabel={submitting ? 'Đang lưu...' : 'Xác nhận'}
        danger={decision === 'fail'}
        onConfirm={handleSubmit}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
