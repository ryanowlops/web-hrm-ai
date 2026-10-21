import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getLeaveTypes, getMyBalances, createRequest, getMyRequests, cancelRequest,
  getPendingForMe, approveRequest, rejectRequest, getCalendar,
} from '../services';
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState,
  FormField, Input, PageHeader, Select, Skeleton, StatCard, TableSkeleton, Textarea,
} from '../../../components/ui';
import { StaggerList, StaggerItem } from '../../../components/motion';

/* ---------- Helpers ---------- */

function getCurrentUser() {
  try {
    const raw = localStorage.getItem('hrm_user') || localStorage.getItem('user') || localStorage.getItem('currentUser');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  try {
    const token = localStorage.getItem('hrm_access_token') || localStorage.getItem('access_token') || localStorage.getItem('token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return { id: payload.sub, role: payload.role };
    }
  } catch { /* ignore */ }
  return null;
}

const STATUS_META = {
  pending: { label: 'Chờ quản lý duyệt', tone: 'amber' },
  manager_approved: { label: 'Chờ HR duyệt', tone: 'blue' },
  approved: { label: 'Đã duyệt', tone: 'green' },
  rejected: { label: 'Đã từ chối', tone: 'red' },
  cancelled: { label: 'Đã huỷ', tone: 'slate' },
};

const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || { label: status || '—', tone: 'slate' };
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
};

const fmtDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('vi-VN') : '—');
const errMsg = (e) => e?.response?.data?.error?.message || e?.message || 'Đã xảy ra lỗi, vui lòng thử lại.';
const toISODate = (d) => d.toISOString().slice(0, 10);

// Đếm ngày làm việc (T2–T6) trong khoảng [from, to] — chỉ để hướng dẫn/validate sớm ở FE.
function countWorkdays(from, to) {
  if (!from || !to) return 0;
  let count = 0;
  const d = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(d) || Number.isNaN(end) || d > end) return 0;
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count += 1;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function MonthNav({ cursor, onChange }) {
  const shift = (delta) => {
    const d = new Date(cursor.year, cursor.month - 1 + delta, 1);
    onChange({ month: d.getMonth() + 1, year: d.getFullYear() });
  };
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={() => shift(-1)} aria-label="Tháng trước">←</Button>
      <span className="min-w-28 text-center text-sm font-semibold text-gray-800">Tháng {cursor.month}/{cursor.year}</span>
      <Button type="button" variant="secondary" size="sm" onClick={() => shift(1)} aria-label="Tháng sau">→</Button>
    </div>
  );
}

/* Thẻ số dư phép phẳng theo StatCard của UI kit: số ngày còn lại là giá trị
   chính, dòng phụ ghi đã dùng / tổng số ngày của loại nghỉ. */
function BalanceCard({ balance: b }) {
  const total = b.total_days ?? 0;
  const used = b.used_days ?? 0;
  const remaining = b.remaining_days ?? Math.max(total - used, 0);
  return (
    <StatCard
      label={b.leave_type_name || b.name}
      value={remaining}
      sub={`ngày còn lại · Đã dùng ${used} / ${total} ngày`}
    />
  );
}

/* ---------- Trang chính ---------- */

export default function LeavePage() {
  const user = useMemo(getCurrentUser, []);
  const isApprover = ['admin', 'hr', 'manager'].includes(user?.role);
  const year = new Date().getFullYear();
  const now = new Date();
  const [cursor, setCursor] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  /* --- Số dư phép + loại nghỉ --- */
  const [types, setTypes] = useState([]);
  const [balances, setBalances] = useState([]);
  const loadBalances = useCallback(async () => {
    try { setBalances(await getMyBalances(year)); } catch (e) { setError(errMsg(e)); }
  }, [year]);
  useEffect(() => {
    getLeaveTypes().then(setTypes).catch((e) => setError(errMsg(e)));
    loadBalances();
  }, [loadBalances]);

  const balanceOf = (typeId) => balances.find((b) => String(b.leave_type_id) === String(typeId));

  /* --- Form tạo đơn --- */
  const [form, setForm] = useState({ leave_type_id: '', from_date: '', to_date: '', reason: '' });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const formDays = useMemo(() => countWorkdays(form.from_date, form.to_date), [form]);
  const selectedType = types.find((t) => String(t.id) === String(form.leave_type_id));
  const selectedBalance = form.leave_type_id ? balanceOf(form.leave_type_id) : null;

  const validate = () => {
    const errs = {};
    const todayISO = toISODate(new Date());
    if (!form.leave_type_id) errs.leave_type_id = 'Vui lòng chọn loại nghỉ.';
    if (!form.from_date) errs.from_date = 'Vui lòng chọn ngày bắt đầu.';
    if (!form.to_date) errs.to_date = 'Vui lòng chọn ngày kết thúc.';
    if (form.from_date && form.from_date < todayISO) errs.from_date = 'Ngày bắt đầu không được ở quá khứ.';
    if (form.from_date && form.to_date && form.to_date < form.from_date) errs.to_date = 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.';
    if (formDays === 0 && form.from_date && form.to_date && form.to_date >= form.from_date) {
      errs.to_date = 'Khoảng đã chọn không có ngày làm việc (T2–T6) nào.';
    }
    if (!form.reason.trim()) errs.reason = 'Vui lòng nhập lý do nghỉ.';
    // Chỉ kiểm tra số dư với loại nghỉ có giới hạn và có số dư trả về (nghỉ phép năm).
    if (selectedType?.paid && selectedBalance && formDays > (selectedBalance.remaining_days ?? Infinity)) {
      errs.from_date = `Số ngày xin nghỉ (${formDays}) vượt quá số dư phép còn lại (${selectedBalance.remaining_days} ngày).`;
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  /* --- Đơn của tôi --- */
  const [myRequests, setMyRequests] = useState([]);
  const [myLoading, setMyLoading] = useState(false);
  const loadMine = useCallback(async () => {
    setMyLoading(true);
    try {
      const res = await getMyRequests({ page: 1, limit: 50 });
      setMyRequests(Array.isArray(res) ? res : res.data || []);
    } catch (e) { setError(errMsg(e)); } finally { setMyLoading(false); }
  }, []);
  useEffect(() => { loadMine(); }, [loadMine]);

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true); setError(''); setNotice('');
    try {
      await createRequest({
        leave_type_id: Number(form.leave_type_id),
        from_date: form.from_date, to_date: form.to_date, reason: form.reason.trim(),
      });
      setNotice('Đơn nghỉ đã được gửi và đang chờ quản lý duyệt.');
      setForm({ leave_type_id: '', from_date: '', to_date: '', reason: '' });
      setFormErrors({});
      loadMine(); loadBalances(); loadPending();
    } catch (err) { setError(errMsg(err)); } finally { setSubmitting(false); }
  };

  const cancel = async (id) => {
    if (!window.confirm('Huỷ đơn nghỉ này?')) return;
    setError(''); setNotice('');
    try { await cancelRequest(id); setNotice('Đã huỷ đơn nghỉ.'); loadMine(); loadBalances(); }
    catch (err) { setError(errMsg(err)); }
  };

  /* --- Khu vực duyệt (Manager / HR / Admin) --- */
  const [pending, setPending] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [decidingId, setDecidingId] = useState(null);

  const loadPending = useCallback(async () => {
    if (!isApprover) return;
    setPendingLoading(true);
    try {
      const res = await getPendingForMe({ page: 1, limit: 50 });
      setPending(Array.isArray(res) ? res : res.data || []);
    } catch { setPending([]); } finally { setPendingLoading(false); }
  }, [isApprover]);
  useEffect(() => { loadPending(); }, [loadPending]);

  const decide = async (id, action) => {
    if (action === 'reject' && !rejectReason.trim()) {
      setError('Vui lòng nhập lý do từ chối.'); return;
    }
    setDecidingId(id); setError(''); setNotice('');
    try {
      const itemStatus = pending.find((r) => r.id === id)?.status;
      if (action === 'approve') await approveRequest(id, undefined, itemStatus);
      else await rejectRequest(id, rejectReason.trim(), itemStatus);
      setNotice(action === 'approve' ? 'Đã duyệt đơn.' : 'Đã từ chối đơn.');
      setRejectingId(null); setRejectReason('');
      loadPending(); loadMine(); loadCalendar(); loadBalances();
    } catch (err) { setError(errMsg(err)); } finally { setDecidingId(null); }
  };

  /* --- Lịch nghỉ tháng --- */
  const [calendar, setCalendar] = useState([]);
  const loadCalendar = useCallback(async () => {
    try { setCalendar(await getCalendar(cursor.month, cursor.year)); } catch { setCalendar([]); }
  }, [cursor]);
  useEffect(() => { loadCalendar(); }, [loadCalendar]);

  const calendarCells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month - 1, 1);
    const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate();
    const startOffset = (first.getDay() + 6) % 7; // tuần bắt đầu thứ 2
    const cells = [];
    for (let i = 0; i < startOffset; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      const iso = toISODate(new Date(cursor.year, cursor.month - 1, d));
      const leaves = calendar.filter((lv) => lv.from_date <= iso && iso <= lv.to_date);
      cells.push({ day: d, iso, leaves });
    }
    return cells;
  }, [cursor, calendar]);

  const todayISO = toISODate(new Date());

  // Nút hành động ở PageHeader: cuộn tới biểu mẫu tạo đơn (chỉ trình bày).
  const scrollToForm = () => {
    document.getElementById('tao-don-nghi')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="page-shell">
      <PageHeader
        title="Nghỉ phép"
        subtitle="Đơn nghỉ được duyệt 2 cấp: Quản lý trực tiếp → HR. Số dư phép cập nhật ngay khi HR duyệt."
        actions={(
          <Button type="button" variant="primary" onClick={scrollToForm}>
            Tạo đơn nghỉ
          </Button>
        )}
      />

      {(error || notice) && (
        <div className="mb-6 space-y-3">
          {error && <Alert tone="error">{error}</Alert>}
          {notice && <Alert tone="success">{notice}</Alert>}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-5">
        {/* === Cột trái: tạo đơn + số dư phép === */}
        <div className="space-y-6 lg:col-span-2">
          <Card id="tao-don-nghi">
            <CardHeader title="Tạo đơn nghỉ mới" subtitle="Điền thông tin bên dưới để gửi đơn xin nghỉ." />
            <CardBody>
              <form onSubmit={submit} className="space-y-4" noValidate>
                <FormField
                  label="Loại nghỉ"
                  error={formErrors.leave_type_id}
                  hint={selectedBalance ? `Số dư hiện tại: còn ${selectedBalance.remaining_days} ngày.` : undefined}
                >
                  <Select value={form.leave_type_id} onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}>
                    <option value="">— Chọn loại nghỉ —</option>
                    {types.map((t) => <option key={t.id} value={t.id}>{t.name}{t.paid ? '' : ' (không lương)'}</option>)}
                  </Select>
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Từ ngày" error={formErrors.from_date}>
                    <Input type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} />
                  </FormField>
                  <FormField label="Đến ngày" error={formErrors.to_date}>
                    <Input type="date" value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} />
                  </FormField>
                </div>
                {formDays > 0 && (
                  <p className="rounded-lg bg-brand-50 px-3.5 py-2.5 text-sm font-medium text-brand-700">
                    Số ngày làm việc xin nghỉ: <b>{formDays}</b> ngày
                  </p>
                )}
                <FormField label="Lý do" error={formErrors.reason}>
                  <Textarea rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    placeholder="Ví dụ: Nghỉ phép năm đi du lịch cùng gia đình" />
                </FormField>
                <Button type="submit" variant="primary" loading={submitting} className="w-full">
                  {submitting ? 'Đang gửi…' : 'Gửi đơn nghỉ'}
                </Button>
                <p className="text-xs leading-relaxed text-gray-400">Đơn trùng ngày với đơn đang chờ/đã duyệt sẽ bị server từ chối.</p>
              </form>
            </CardBody>
          </Card>

          {/* === Số dư phép của tôi (StatCard phẳng) === */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Số dư phép năm {year} của tôi</h3>
            {balances.length === 0 ? (
              <div className="ui-card">
                <EmptyState
                  title="Chưa có thông tin số dư phép."
                  description="Số dư phép sẽ xuất hiện tại đây khi HR cấu hình hạn mức cho năm nay. Bạn vẫn có thể tạo đơn nghỉ ở biểu mẫu phía trên."
                />
              </div>
            ) : (
              <StaggerList className="space-y-3">
                {balances.map((b, i) => (
                  <StaggerItem key={b.leave_type_id} index={i}>
                    <BalanceCard balance={b} />
                  </StaggerItem>
                ))}
              </StaggerList>
            )}
          </div>
        </div>

        {/* === Cột phải: đơn của tôi === */}
        <Card className="lg:col-span-3">
          <CardHeader
            title="Đơn nghỉ của tôi"
            subtitle="Theo dõi trạng thái duyệt 2 cấp của các đơn đã gửi."
            actions={myRequests.length > 0 ? <Badge tone="blue">{myRequests.length} đơn</Badge> : null}
          />
          {myLoading ? <TableSkeleton rows={4} cols={4} />
            : myRequests.length === 0 ? (
              <EmptyState title="Bạn chưa có đơn nghỉ nào." description="Tạo đơn nghỉ mới ở biểu mẫu bên trái, đơn sẽ được gửi tới quản lý trực tiếp của bạn." />
            ) : (
              <div className="overflow-x-auto nice-scroll">
                <table className="ui-table min-w-[540px]">
                  <thead>
                    <tr>
                      <th className="ui-th">Loại nghỉ</th>
                      <th className="ui-th">Thời gian</th>
                      <th className="ui-th text-center">Số ngày</th>
                      <th className="ui-th">Trạng thái</th>
                      <th className="ui-th" aria-label="Thao tác" />
                    </tr>
                  </thead>
                  <tbody>
                    {myRequests.map((r) => (
                      <tr key={r.id} className="ui-tr">
                        <td className="ui-td font-medium text-gray-900">{r.leave_type_name || r.leave_type?.name || '—'}</td>
                        <td className="ui-td whitespace-nowrap">
                          {fmtDate(r.from_date)} → {fmtDate(r.to_date)}
                          <p className="mt-0.5 max-w-56 truncate text-xs text-gray-400" title={r.reason}>{r.reason}</p>
                        </td>
                        <td className="ui-td tnum text-center font-medium text-gray-900">{r.days_count ?? '—'}</td>
                        <td className="ui-td">
                          <StatusBadge status={r.status} />
                          {r.status === 'rejected' && (r.hr_decision || r.manager_decision) && (
                            <p className="mt-1.5 text-xs font-medium text-[#B42318]">Lý do: {r.hr_decision || r.manager_decision}</p>)}
                        </td>
                        <td className="ui-td text-right">
                          {['pending', 'manager_approved'].includes(r.status) && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => cancel(r.id)}
                              className="text-[#B42318] ring-1 ring-inset ring-[#FDA29B] hover:bg-[#FEF3F2] hover:text-[#B42318]">
                              Huỷ đơn
                            </Button>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      </div>

      {/* === Khu vực duyệt đơn === */}
      {isApprover && (
        <Card className="mt-6">
          <CardHeader
            title={`Đơn chờ tôi duyệt ${user?.role === 'manager' ? '(cấp quản lý — phòng của tôi)' : '(cấp HR — duyệt cuối)'}`}
            subtitle="Danh sách do server lọc theo cấp duyệt và phạm vi phòng ban của bạn."
            actions={pending.length > 0 ? <Badge tone="amber" dot>{pending.length} đơn chờ</Badge> : null}
          />
          {pendingLoading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : pending.length === 0 ? (
            <EmptyState title="Không có đơn nào đang chờ bạn duyệt. 🎉" description="Khi có đơn nghỉ mới thuộc phạm vi duyệt của bạn, đơn sẽ xuất hiện tại đây." />
          ) : (
            <CardBody>
              <StaggerList className="space-y-3">
              {pending.map((r, i) => (
                <StaggerItem key={r.id} index={i}>
                <div className="rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">
                        {r.employee_name || r.employee?.full_name}
                        <span className="ml-2 text-sm font-normal text-gray-400">{r.department_name || r.employee?.department_name || ''}</span>
                      </p>
                      <p className="mt-0.5 text-sm text-gray-600">
                        {r.leave_type_name || ''} · {fmtDate(r.from_date)} → {fmtDate(r.to_date)} · {r.days_count ?? '—'} ngày
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-gray-500">Lý do: {r.reason}</p>
                      <div className="mt-2"><StatusBadge status={r.status} /></div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" variant="primary" size="sm" loading={decidingId === r.id} onClick={() => decide(r.id, 'approve')}>
                        Duyệt
                      </Button>
                      <Button type="button" variant="ghost" size="sm" disabled={decidingId === r.id}
                        onClick={() => { setRejectingId(rejectingId === r.id ? null : r.id); setRejectReason(''); }}
                        className="text-[#B42318] ring-1 ring-inset ring-[#FDA29B] hover:bg-[#FEF3F2] hover:text-[#B42318]">
                        Từ chối
                      </Button>
                    </div>
                  </div>
                  {rejectingId === r.id && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Nhập lý do từ chối (bắt buộc)" className="min-w-64 flex-1" />
                      <Button type="button" variant="danger" size="sm" loading={decidingId === r.id} onClick={() => decide(r.id, 'reject')}>
                        Xác nhận từ chối
                      </Button>
                    </div>
                  )}
                </div>
                </StaggerItem>
              ))}
              </StaggerList>
            </CardBody>
          )}
        </Card>
      )}

      {/* === Lịch nghỉ tháng === */}
      <Card className="mt-6">
        <CardHeader
          title="Lịch nghỉ đã duyệt trong tháng"
          subtitle="Tổng quan ngày nghỉ đã duyệt của toàn công ty."
          actions={<MonthNav cursor={cursor} onChange={setCursor} />}
        />
        <CardBody>
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-gray-500">
            {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {calendarCells.map((cell, i) => (
              <div
                key={i}
                className={`min-h-[76px] rounded-lg p-1.5 text-left transition-colors ${
                  !cell
                    ? 'bg-transparent'
                    : cell.iso === todayISO
                      ? 'border border-brand-300 bg-brand-50'
                      : 'border border-gray-100 bg-gray-50 hover:bg-gray-100'
                }`}
              >
                {cell && (
                  <>
                    <p className={`text-xs font-semibold ${cell.iso === todayISO ? 'text-brand-700' : 'text-gray-500'}`}>{cell.day}</p>
                    <div className="mt-1 space-y-1">
                      {cell.leaves.slice(0, 3).map((lv) => (
                        <p key={lv.id} title={`${lv.employee_name} — ${lv.leave_type_name || ''}`}
                          className="truncate rounded-md bg-accent-50 px-1.5 py-0.5 text-[11px] font-medium text-accent-700">
                          {lv.employee_name}
                        </p>
                      ))}
                      {cell.leaves.length > 3 && <p className="px-1 text-[11px] font-medium text-gray-400">+{cell.leaves.length - 3} người nữa</p>}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
