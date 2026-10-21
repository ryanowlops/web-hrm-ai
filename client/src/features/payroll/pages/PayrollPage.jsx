import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getPeriods,
  createPeriod,
  calculatePeriod,
  lockPeriod,
  getPeriodItems,
  getMyPayslip,
} from '../services';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  FormField,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  TableSkeleton,
} from '../../../components/ui';
import { StaggerList, StaggerItem, AnimatedNumber } from '../../../components/motion';

/* ================= Helpers ================= */

// Tiền tệ: số nguyên VND, format vi-VN theo contract FE
const vndFmt = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
export const formatVND = (v) => vndFmt.format(Number(v ?? 0));

const dateFmt = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const formatDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
};

// Lấy field chịu được cả snake_case (DB/BE Flask) lẫn camelCase
const pick = (obj, ...keys) => {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
};

// axiosClient có thể trả axios response hoặc body trực tiếp (tuỳ interceptor)
const unwrap = (res) => {
  if (res && typeof res === 'object' && 'data' in res && ('status' in res || 'headers' in res)) {
    return res.data;
  }
  return res;
};

// Danh sách phân trang theo quy ước B6: { data: [...], meta: {...} }
const unwrapList = (res) => {
  const body = unwrap(res);
  if (Array.isArray(body)) return { items: body, meta: null };
  if (body && Array.isArray(body.data)) return { items: body.data, meta: body.meta || null };
  return { items: [], meta: null };
};

const errorMessage = (err, fallback) =>
  err?.response?.data?.error?.message ||
  err?.response?.data?.message ||
  err?.message ||
  fallback;

// Lấy user hiện tại: ưu tiên prop, sau đó localStorage, cuối cùng giải mã JWT (payload có role — B8)
function resolveUser(propUser) {
  if (propUser?.role) return propUser;
  try {
    for (const key of ['hrm_user', 'user', 'authUser', 'currentUser']) {
      const raw = localStorage.getItem(key);
      if (raw) {
        const u = JSON.parse(raw);
        if (u?.role) return u;
      }
    }
    for (const key of ['hrm_access_token', 'accessToken', 'access_token', 'token']) {
      const t = localStorage.getItem(key);
      if (t && t.split('.').length === 3) {
        const payload = JSON.parse(
          atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
        );
        if (payload?.role) return { id: payload.sub, role: payload.role };
      }
    }
  } catch {
    /* bỏ qua — coi như chưa rõ role */
  }
  return propUser || null;
}

/* ================= Trang chính — route /payroll ================= */

export default function PayrollPage({ user: userProp }) {
  const user = useMemo(() => resolveUser(userProp), [userProp]);
  const role = String(user?.role || '').toLowerCase();
  const isHR = role === 'hr' || role === 'admin';

  return isHR ? <HrPayrollView /> : <MyPayslipView />;
}

/* ================= Góc nhìn HR / Admin ================= */

function HrPayrollView() {
  const [periods, setPeriods] = useState([]);
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [items, setItems] = useState([]);
  const [itemsMeta, setItemsMeta] = useState(null);
  const [itemsPage, setItemsPage] = useState(1);
  const [loadingItems, setLoadingItems] = useState(false);
  const [busyId, setBusyId] = useState(null); // period id đang tính/chốt
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(() => {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear(), standardWorkdays: 22 };
  });
  const [creating, setCreating] = useState(false);

  const [lockTarget, setLockTarget] = useState(null); // period chờ xác nhận chốt

  const selectedPeriod = useMemo(
    () => periods.find((p) => String(p.id) === String(selectedId)) || null,
    [periods, selectedId],
  );

  const loadPeriods = useCallback(async () => {
    setLoadingPeriods(true);
    try {
      const { items: list } = unwrapList(await getPeriods({ page: 1, limit: 100 }));
      setPeriods(list);
      setSelectedId((prev) => {
        if (prev && list.some((p) => String(p.id) === String(prev))) return prev;
        return list.length ? list[0].id : null;
      });
    } catch (err) {
      setError(errorMessage(err, 'Không tải được danh sách kỳ lương.'));
    } finally {
      setLoadingPeriods(false);
    }
  }, []);

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods]);

  const loadItems = useCallback(async () => {
    if (!selectedId) {
      setItems([]);
      setItemsMeta(null);
      return;
    }
    setLoadingItems(true);
    try {
      const { items: list, meta } = unwrapList(
        await getPeriodItems(selectedId, { page: itemsPage, limit: 20 }),
      );
      setItems(list);
      setItemsMeta(meta);
    } catch (err) {
      setError(errorMessage(err, 'Không tải được bảng lương của kỳ này.'));
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [selectedId, itemsPage]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const selectPeriod = (id) => {
    setError('');
    setNotice('');
    setItemsPage(1);
    setSelectedId(id);
  };

  const handleCreate = async () => {
    const month = Number(createForm.month);
    const year = Number(createForm.year);
    const standardWorkdays = Number(createForm.standardWorkdays);
    if (!month || month < 1 || month > 12) return setError('Tháng phải từ 1 đến 12.');
    if (!year || year < 2000) return setError('Năm không hợp lệ.');
    if (!standardWorkdays || standardWorkdays <= 0) return setError('Ngày công chuẩn phải lớn hơn 0.');
    setCreating(true);
    setError('');
    try {
      await createPeriod({ month, year, standardWorkdays });
      setShowCreate(false);
      setNotice(`Đã tạo kỳ lương tháng ${month}/${year}.`);
      await loadPeriods();
    } catch (err) {
      setError(errorMessage(err, 'Tạo kỳ lương thất bại (có thể kỳ này đã tồn tại).'));
    } finally {
      setCreating(false);
    }
  };

  const handleCalculate = async (period) => {
    setBusyId(period.id);
    setError('');
    setNotice('');
    try {
      await calculatePeriod(period.id);
      setNotice(
        `Đã tính lương kỳ tháng ${pick(period, 'month')}/${pick(period, 'year')}. Kiểm tra bảng bên dưới trước khi chốt.`,
      );
      if (String(selectedId) === String(period.id)) await loadItems();
    } catch (err) {
      setError(errorMessage(err, 'Tính lương thất bại.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleLock = async () => {
    if (!lockTarget) return;
    setBusyId(lockTarget.id);
    setError('');
    try {
      await lockPeriod(lockTarget.id);
      setNotice(
        `Đã chốt kỳ lương tháng ${pick(lockTarget, 'month')}/${pick(lockTarget, 'year')}. Nhân viên đã xem được phiếu lương của mình.`,
      );
      setLockTarget(null);
      await loadPeriods();
      if (String(selectedId) === String(lockTarget.id)) await loadItems();
    } catch (err) {
      setError(errorMessage(err, 'Chốt kỳ lương thất bại.'));
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = itemsMeta?.totalPages || 1;
  const pageTotal = items.reduce((sum, it) => sum + Number(pick(it, 'total_salary', 'totalSalary') || 0), 0);

  const itemsTitle = selectedPeriod
    ? `Bảng lương tháng ${pick(selectedPeriod, 'month')}/${pick(selectedPeriod, 'year')}` +
      (pick(selectedPeriod, 'status') === 'locked' ? ' — đã chốt' : ' — xem trước (bản nháp)')
    : 'Bảng lương chi tiết';

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="Tài chính · Bảng lương"
        title="Bảng lương"
        subtitle="Tạo kỳ lương, tính lương từ bảng công đã tổng hợp và chốt kỳ để nhân viên xem phiếu lương."
        actions={
          <Button onClick={() => setShowCreate(true)}>
            + Tạo kỳ lương
          </Button>
        }
      />

      <Alert tone="error" className="mb-4">{error}</Alert>
      <Alert tone="success" className="mb-4">{notice}</Alert>

      {/* Danh sách kỳ lương */}
      <Card className="mb-6 animate-fade-up">
        <CardHeader title="Kỳ lương" subtitle="Chọn một kỳ để xem bảng lương chi tiết bên dưới." />
        {loadingPeriods ? (
          <TableSkeleton rows={3} cols={5} />
        ) : periods.length === 0 ? (
          <EmptyState
            title="Chưa có kỳ lương nào."
            description="Bấm “Tạo kỳ lương” để bắt đầu."
          />
        ) : (
          <StaggerList>
            <StaggerItem>
          <div className="overflow-x-auto">
            <table className="ui-table">
              <thead>
                <tr>
                  <th className="ui-th">Kỳ lương</th>
                  <th className="ui-th text-right">Ngày công chuẩn</th>
                  <th className="ui-th">Trạng thái</th>
                  <th className="ui-th">Chốt lúc</th>
                  <th className="ui-th text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => {
                  const locked = pick(p, 'status') === 'locked';
                  const busy = String(busyId) === String(p.id);
                  const selected = String(selectedId) === String(p.id);
                  return (
                    <tr key={p.id} className={`ui-tr ${selected ? 'bg-brand-50/70' : ''}`}>
                      <td className="ui-td">
                        <strong className="font-bold text-slate-900">
                          Tháng {pick(p, 'month')}/{pick(p, 'year')}
                        </strong>
                      </td>
                      <td className="ui-td text-right tabular-nums">{pick(p, 'standard_workdays', 'standardWorkdays') ?? '—'}</td>
                      <td className="ui-td">
                        {locked ? (
                          <Badge tone="green" dot>Đã chốt</Badge>
                        ) : (
                          <Badge tone="amber" dot>Nháp</Badge>
                        )}
                      </td>
                      <td className="ui-td tabular-nums">{formatDateTime(pick(p, 'locked_at', 'lockedAt'))}</td>
                      <td className="ui-td">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button variant="secondary" size="sm" onClick={() => selectPeriod(p.id)}>
                            Xem bảng lương
                          </Button>
                          {!locked && (
                            <>
                              <Button
                                variant="primary"
                                size="sm"
                                disabled={busy}
                                onClick={() => handleCalculate(p)}
                              >
                                {busy ? 'Đang xử lý…' : 'Tính lương'}
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                disabled={busy}
                                onClick={() => setLockTarget(p)}
                              >
                                Chốt kỳ
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
            </StaggerItem>
          </StaggerList>
        )}
      </Card>

      {/* Bảng lương chi tiết của kỳ đang chọn */}
      <Card className="animate-fade-up">
        <CardHeader title={itemsTitle} />
        {!selectedPeriod ? (
          <EmptyState title="Chọn một kỳ lương để xem chi tiết." description="Chọn một kỳ ở bảng phía trên, hoặc bấm “Tạo kỳ lương” nếu chưa có kỳ nào." />
        ) : loadingItems ? (
          <TableSkeleton rows={5} cols={6} />
        ) : items.length === 0 ? (
          <EmptyState
            title="Kỳ này chưa có dữ liệu lương."
            description="Bấm “Tính lương” ở kỳ tương ứng để hệ thống tính từ bảng công và đơn nghỉ đã duyệt."
          />
        ) : (
          <>
            <StaggerList>
              <StaggerItem>
            <div className="overflow-x-auto">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th className="ui-th">Mã NV</th>
                    <th className="ui-th">Nhân viên</th>
                    <th className="ui-th">Phòng ban</th>
                    <th className="ui-th text-right">Ngày công hưởng lương</th>
                    <th className="ui-th text-right">Lương cơ bản</th>
                    <th className="ui-th text-right">Phụ cấp</th>
                    <th className="ui-th text-right">Khấu trừ bảo hiểm</th>
                    <th className="ui-th text-right">Khấu trừ khác</th>
                    <th className="ui-th text-right">Tổng nhận</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const emp = it.employee || {};
                    return (
                      <tr key={it.id} className="ui-tr">
                        <td className="ui-td font-semibold text-slate-900">{pick(it, 'employee_code', 'employeeCode') || pick(emp, 'code') || '—'}</td>
                        <td className="ui-td">{pick(it, 'employee_name', 'employeeName') || pick(emp, 'full_name', 'fullName') || '—'}</td>
                        <td className="ui-td">
                          {pick(it, 'department_name', 'departmentName') || pick(emp, 'department_name', 'departmentName') || pick(emp.department || {}, 'name') || '—'}
                        </td>
                        <td className="ui-td text-right tabular-nums">{pick(it, 'workdays_paid', 'workdaysPaid') ?? '—'}</td>
                        <td className="ui-td text-right tabular-nums">{formatVND(pick(it, 'base_salary', 'baseSalary'))}</td>
                        <td className="ui-td text-right tabular-nums">{formatVND(pick(it, 'allowance'))}</td>
                        <td className="ui-td text-right tabular-nums">{formatVND(pick(it, 'insurance_deduction', 'insuranceDeduction'))}</td>
                        <td className="ui-td text-right tabular-nums">{formatVND(pick(it, 'other_deduction', 'otherDeduction'))}</td>
                        <td className="ui-td text-right font-bold tabular-nums text-slate-900">{formatVND(pick(it, 'total_salary', 'totalSalary'))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
              </StaggerItem>
            </StaggerList>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-500">
              <span>
                Tổng chi trang này: <strong className="font-bold tabular-nums text-slate-900"><AnimatedNumber value={pageTotal} format={(n) => formatVND(n)} /></strong>
                {itemsMeta?.totalItems ? ` · ${itemsMeta.totalItems} nhân viên trong kỳ` : ''}
              </span>
              <span className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={itemsPage <= 1}
                  onClick={() => setItemsPage((p) => Math.max(1, p - 1))}
                >
                  ← Trước
                </Button>
                <span className="tabular-nums">
                  Trang {itemsPage}/{totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={itemsPage >= totalPages}
                  onClick={() => setItemsPage((p) => Math.min(totalPages, p + 1))}
                >
                  Sau →
                </Button>
              </span>
            </div>
          </>
        )}
      </Card>

      {/* Modal tạo kỳ lương */}
      {showCreate && (
        <Modal
          title="Tạo kỳ lương"
          onClose={() => setShowCreate(false)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setShowCreate(false)}>
                Huỷ
              </Button>
              <Button disabled={creating} onClick={handleCreate}>
                {creating ? 'Đang tạo…' : 'Tạo kỳ'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4">
            <FormField label="Tháng">
              <Input
                type="number"
                min="1"
                max="12"
                value={createForm.month}
                onChange={(e) => setCreateForm((f) => ({ ...f, month: e.target.value }))}
              />
            </FormField>
            <FormField label="Năm">
              <Input
                type="number"
                min="2000"
                value={createForm.year}
                onChange={(e) => setCreateForm((f) => ({ ...f, year: e.target.value }))}
              />
            </FormField>
            <FormField
              label="Ngày công chuẩn của tháng"
              hint="Mặc định là số ngày làm việc thứ 2–thứ 6 trong tháng. Lương được tính theo tỷ lệ ngày công hưởng lương / ngày công chuẩn."
            >
              <Input
                type="number"
                min="1"
                step="0.5"
                value={createForm.standardWorkdays}
                onChange={(e) => setCreateForm((f) => ({ ...f, standardWorkdays: e.target.value }))}
              />
            </FormField>
          </div>
        </Modal>
      )}

      {/* Modal xác nhận chốt kỳ — cảnh báo không sửa được */}
      {lockTarget && (
        <Modal
          title="Chốt kỳ lương?"
          onClose={() => setLockTarget(null)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setLockTarget(null)}>
                Huỷ
              </Button>
              <Button variant="danger" disabled={!!busyId} onClick={handleLock}>
                {busyId ? 'Đang chốt…' : 'Chốt kỳ lương'}
              </Button>
            </>
          }
        >
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
            ⚠️ Sau khi chốt kỳ lương tháng {pick(lockTarget, 'month')}/{pick(lockTarget, 'year')},{' '}
            <strong>bảng lương sẽ bị khoá và không thể sửa hay tính lại trực tiếp</strong>. Nhân viên
            sẽ xem được phiếu lương của mình ngay sau khi chốt.
            <br />
            <br />
            Hãy chắc chắn đã bấm “Tính lương” và kiểm tra kỹ bảng lương xem trước. Muốn thay đổi sau
            khi chốt phải có thao tác mở khoá của Admin/HR kèm lý do và được ghi nhật ký.
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================= Góc nhìn Employee (và các role không phải HR/Admin) ================= */

function MyPayslipView() {
  const [lockedPeriods, setLockedPeriods] = useState([]);
  const [periodId, setPeriodId] = useState('');
  const [slip, setSlip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  // Tải danh sách kỳ đã chốt để chọn; nếu API kỳ lương bị giới hạn quyền thì
  // vẫn xem được phiếu của kỳ đã chốt mới nhất qua /payroll/my-payslip.
  useEffect(() => {
    (async () => {
      try {
        const { items } = unwrapList(await getPeriods({ page: 1, limit: 100 }));
        const locked = items.filter((p) => pick(p, 'status') === 'locked');
        setLockedPeriods(locked);
        if (locked.length) setPeriodId(String(locked[0].id));
        else setLoading(false);
      } catch {
        setLockedPeriods([]);
        setPeriodId('');
        setLoading(false);
      }
    })();
  }, []);

  const loadSlip = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotFound(false);
    try {
      const body = unwrap(await getMyPayslip(periodId || undefined));
      const slipData = body?.data ?? body;
      setSlip(slipData && typeof slipData === 'object' ? slipData : null);
      if (!slipData) setNotFound(true);
    } catch (err) {
      if (err?.response?.status === 404) {
        setSlip(null);
        setNotFound(true);
      } else {
        setError(errorMessage(err, 'Không tải được phiếu lương.'));
      }
    } finally {
      setLoading(false);
    }
  }, [periodId]);

  useEffect(() => {
    // Chỉ gọi khi đã biết danh sách kỳ đã chốt (hoặc chắc chắn không lấy được danh sách)
    if (lockedPeriods.length > 0 && !periodId) return;
    loadSlip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId]);

  const breakdown = slip?.breakdown || {};
  const baseSalary = pick(slip, 'base_salary', 'baseSalary');
  const workdaysPaid = pick(slip, 'workdays_paid', 'workdaysPaid');
  const standardWorkdays =
    pick(breakdown, 'standard_workdays', 'standardWorkdays') ??
    pick(slip, 'standard_workdays', 'standardWorkdays');
  const salaryByWorkdays = pick(breakdown, 'salary_by_workdays', 'salaryByWorkdays');
  const allowance = pick(slip, 'allowance');
  const insuranceDeduction = pick(slip, 'insurance_deduction', 'insuranceDeduction');
  const insuranceRate = pick(breakdown, 'insurance_rate', 'insuranceRate');
  const otherDeduction = pick(slip, 'other_deduction', 'otherDeduction');
  const totalSalary = pick(slip, 'total_salary', 'totalSalary');
  const emp = slip?.employee || {};
  const period = slip?.period || {};
  const periodLabel =
    pick(period, 'month') && pick(period, 'year')
      ? `tháng ${pick(period, 'month')}/${pick(period, 'year')}`
      : lockedPeriods.find((p) => String(p.id) === String(periodId))
        ? (() => {
            const p = lockedPeriods.find((x) => String(x.id) === String(periodId));
            return `tháng ${pick(p, 'month')}/${pick(p, 'year')}`;
          })()
        : '';

  const empName = pick(slip, 'employee_name', 'employeeName') || pick(emp, 'full_name', 'fullName');
  const empCode = pick(slip, 'employee_code', 'employeeCode') || pick(emp, 'code');

  const slipRow = 'flex items-baseline justify-between gap-4 border-b border-dashed border-slate-200 py-3 text-sm last:border-0';
  const slipLabel = 'text-slate-500';
  const slipValue = 'font-semibold tabular-nums text-slate-800';

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="Tài chính · Bảng lương"
        title="Phiếu lương của tôi"
        subtitle="Phiếu lương chỉ hiển thị sau khi HR đã chốt kỳ lương."
        actions={
          lockedPeriods.length > 1 ? (
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
              Kỳ lương:
              <Select
                className="w-auto"
                value={periodId}
                onChange={(e) => setPeriodId(e.target.value)}
              >
                {lockedPeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    Tháng {pick(p, 'month')}/{pick(p, 'year')}
                  </option>
                ))}
              </Select>
            </label>
          ) : null
        }
      />

      <Alert tone="error" className="mb-4">{error}</Alert>

      {loading ? (
        <Card className="mx-auto max-w-2xl">
          <CardBody className="space-y-3 px-6 py-6">
            <Skeleton className="mx-auto h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-14 w-full" />
          </CardBody>
        </Card>
      ) : notFound || !slip ? (
        <Card className="mx-auto max-w-2xl">
          <EmptyState
            title={`Chưa có phiếu lương${periodLabel ? ` cho ${periodLabel}` : ''}.`}
            description="Kỳ lương có thể chưa được HR chốt — vui lòng kiểm tra lại sau hoặc liên hệ phòng nhân sự."
          />
        </Card>
      ) : (
        <Card className="mx-auto max-w-2xl animate-scale-in overflow-hidden">
          {/* Dải tiêu đề phiếu lương */}
          <div className="bg-navy-900 px-6 py-5 text-white">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-300">
                  Web HRM AI · Phiếu lương
                </p>
                <h2 className="font-display mt-1.5 text-xl font-extrabold tracking-[-0.01em]">
                  PHIẾU LƯƠNG {periodLabel ? periodLabel.toUpperCase() : ''}
                </h2>
                {(empName || empCode) && (
                  <p className="mt-1 text-[13px] text-slate-300">
                    {empName}
                    {empCode ? ` · Mã NV: ${empCode}` : ''}
                  </p>
                )}
              </div>
              <Badge tone="green" dot className="bg-emerald-400/15 text-emerald-300 ring-emerald-300/30">
                Kỳ đã chốt
              </Badge>
            </div>
          </div>

          <CardBody className="px-6 py-5">
            <div className={slipRow}>
              <span className={slipLabel}>Lương cơ bản (theo hợp đồng)</span>
              <strong className={slipValue}>{formatVND(baseSalary)}</strong>
            </div>
            <div className={slipRow}>
              <span className={slipLabel}>
                Ngày công hưởng lương
                {standardWorkdays ? ` / ngày công chuẩn` : ''}
              </span>
              <strong className={slipValue}>
                {workdaysPaid ?? '—'}
                {standardWorkdays ? ` / ${standardWorkdays} ngày` : ' ngày'}
              </strong>
            </div>
            {salaryByWorkdays !== undefined && (
              <div className={slipRow}>
                <span className={slipLabel}>Lương theo ngày công</span>
                <strong className={slipValue}>{formatVND(salaryByWorkdays)}</strong>
              </div>
            )}
            <div className={slipRow}>
              <span className={slipLabel}>Phụ cấp</span>
              <strong className={`${slipValue} text-emerald-600`}>+ {formatVND(allowance)}</strong>
            </div>
            <div className={slipRow}>
              <span className={slipLabel}>
                Khấu trừ bảo hiểm (BHXH/BHYT/BHTN)
                {insuranceRate ? ` — tỷ lệ ${insuranceRate}% trên lương cơ bản` : ''}
              </span>
              <strong className={`${slipValue} text-rose-600`}>− {formatVND(insuranceDeduction)}</strong>
            </div>
            {Number(otherDeduction || 0) > 0 && (
              <div className={slipRow}>
                <span className={slipLabel}>Khấu trừ khác</span>
                <strong className={`${slipValue} text-rose-600`}>− {formatVND(otherDeduction)}</strong>
              </div>
            )}

            {/* Tổng thực nhận nổi bật */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-50 px-5 py-4 ring-1 ring-inset ring-brand-100">
              <span className="text-sm font-extrabold uppercase tracking-[0.08em] text-brand-900">
                Tổng thực nhận
              </span>
              <span className="text-2xl font-extrabold tabular-nums tracking-[-0.01em] text-brand-700">
                <AnimatedNumber value={Number(totalSalary) || 0} format={(n) => formatVND(n)} />
              </span>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-slate-400">
              Ghi chú: lương được tính từ bảng công và các đơn nghỉ đã duyệt trong kỳ theo công thức:
              lương cơ bản × (ngày công hưởng lương / ngày công chuẩn) + phụ cấp − khấu trừ bảo hiểm −
              khấu trừ khác. Đây là mô hình tính lương đơn giản hoá; nếu thấy sai lệch, vui lòng liên
              hệ phòng nhân sự để đối chiếu.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
