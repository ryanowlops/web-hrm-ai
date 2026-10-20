import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getLeaveTypes, getMyBalances, createRequest, getMyRequests, cancelRequest,
  getPendingForMe, approveRequest, rejectRequest, getCalendar,
} from '../services';

/* ---------- Helpers ---------- */

function getCurrentUser() {
  try {
    const raw = localStorage.getItem('user') || localStorage.getItem('currentUser');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  try {
    const token = localStorage.getItem('access_token') || localStorage.getItem('token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return { id: payload.sub, role: payload.role };
    }
  } catch { /* ignore */ }
  return null;
}

const STATUS_META = {
  pending: { label: 'Chờ quản lý duyệt', cls: 'bg-amber-100 text-amber-700' },
  manager_approved: { label: 'Chờ HR duyệt', cls: 'bg-sky-100 text-sky-700' },
  approved: { label: 'Đã duyệt', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Đã từ chối', cls: 'bg-rose-100 text-rose-700' },
  cancelled: { label: 'Đã huỷ', cls: 'bg-slate-200 text-slate-600' },
};

const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || { label: status || '—', cls: 'bg-slate-100 text-slate-600' };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
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
      <button type="button" onClick={() => shift(-1)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50">←</button>
      <span className="min-w-24 text-center font-semibold">Tháng {cursor.month}/{cursor.year}</span>
      <button type="button" onClick={() => shift(1)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50">→</button>
    </div>
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
      if (action === 'approve') await approveRequest(id);
      else await rejectRequest(id, rejectReason.trim());
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

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">Nghỉ phép</h1>
        <p className="text-sm text-slate-500">Đơn nghỉ được duyệt 2 cấp: Quản lý trực tiếp → HR. Số dư phép cập nhật ngay khi HR duyệt.</p>
      </header>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {notice && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

      {/* === Số dư phép của tôi === */}
      <section>
        <h2 className="mb-3 font-semibold text-slate-800">Số dư phép năm {year} của tôi</h2>
        {balances.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-sm text-slate-400 shadow-sm ring-1 ring-slate-100">Chưa có thông tin số dư phép.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {balances.map((b) => {
              const total = b.total_days ?? 0;
              const used = b.used_days ?? 0;
              const remaining = b.remaining_days ?? Math.max(total - used, 0);
              const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
              return (
                <div key={b.leave_type_id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                  <p className="text-sm font-medium text-slate-600">{b.leave_type_name || b.name}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-800">{remaining}<span className="text-sm font-normal text-slate-400"> / {total} ngày còn lại</span></p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Đã dùng {used} ngày</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* === Tạo đơn === */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-slate-800">Tạo đơn nghỉ mới</h2>
          <form onSubmit={submit} className="space-y-3" noValidate>
            <div>
              <label className="mb-1 block text-sm font-medium">Loại nghỉ</label>
              <select value={form.leave_type_id} onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm">
                <option value="">— Chọn loại nghỉ —</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}{t.paid ? '' : ' (không lương)'}</option>)}
              </select>
              {formErrors.leave_type_id && <p className="mt-1 text-xs text-rose-600">{formErrors.leave_type_id}</p>}
              {selectedBalance && <p className="mt-1 text-xs text-slate-400">Số dư hiện tại: còn {selectedBalance.remaining_days} ngày.</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Từ ngày</label>
                <input type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm" />
                {formErrors.from_date && <p className="mt-1 text-xs text-rose-600">{formErrors.from_date}</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Đến ngày</label>
                <input type="date" value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm" />
                {formErrors.to_date && <p className="mt-1 text-xs text-rose-600">{formErrors.to_date}</p>}
              </div>
            </div>
            {formDays > 0 && <p className="text-sm text-slate-500">Số ngày làm việc xin nghỉ: <b>{formDays}</b> ngày</p>}
            <div>
              <label className="mb-1 block text-sm font-medium">Lý do</label>
              <textarea rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Ví dụ: Nghỉ phép năm đi du lịch cùng gia đình" className="w-full rounded-lg border px-3 py-2 text-sm" />
              {formErrors.reason && <p className="mt-1 text-xs text-rose-600">{formErrors.reason}</p>}
            </div>
            <button type="submit" disabled={submitting}
              className="w-full rounded-xl bg-sky-600 px-4 py-2.5 font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50">
              {submitting ? 'Đang gửi…' : 'Gửi đơn nghỉ'}
            </button>
            <p className="text-xs text-slate-400">Đơn trùng ngày với đơn đang chờ/đã duyệt sẽ bị server từ chối.</p>
          </form>
        </section>

        {/* === Đơn của tôi === */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 lg:col-span-3">
          <h2 className="mb-4 font-semibold text-slate-800">Đơn nghỉ của tôi</h2>
          {myLoading ? <p className="py-4 text-center text-sm text-slate-400">Đang tải…</p>
            : myRequests.length === 0 ? <p className="py-4 text-center text-sm text-slate-400">Bạn chưa có đơn nghỉ nào.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead><tr className="border-b text-slate-500">
                    <th className="py-2 pr-3">Loại nghỉ</th><th className="py-2 pr-3">Thời gian</th>
                    <th className="py-2 pr-3 text-center">Số ngày</th><th className="py-2 pr-3">Trạng thái</th><th className="py-2" />
                  </tr></thead>
                  <tbody>
                    {myRequests.map((r) => (
                      <tr key={r.id} className="border-b align-top last:border-0 hover:bg-slate-50">
                        <td className="py-2 pr-3 font-medium">{r.leave_type_name || r.leave_type?.name || '—'}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(r.from_date)} → {fmtDate(r.to_date)}
                          <p className="max-w-56 truncate text-xs text-slate-400" title={r.reason}>{r.reason}</p></td>
                        <td className="py-2 pr-3 text-center">{r.days_count ?? '—'}</td>
                        <td className="py-2 pr-3">
                          <StatusBadge status={r.status} />
                          {r.status === 'rejected' && (r.hr_decision || r.manager_decision) && (
                            <p className="mt-1 text-xs text-rose-500">Lý do: {r.hr_decision || r.manager_decision}</p>)}
                        </td>
                        <td className="py-2 text-right">
                          {['pending', 'manager_approved'].includes(r.status) && (
                            <button type="button" onClick={() => cancel(r.id)}
                              className="rounded-lg border border-rose-200 px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50">Huỷ đơn</button>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </section>
      </div>

      {/* === Khu vực duyệt đơn === */}
      {isApprover && (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <h2 className="mb-1 font-semibold text-slate-800">
            Đơn chờ tôi duyệt {user?.role === 'manager' ? '(cấp quản lý — phòng của tôi)' : '(cấp HR — duyệt cuối)'}
          </h2>
          <p className="mb-4 text-xs text-slate-400">Danh sách do server lọc theo cấp duyệt và phạm vi phòng ban của bạn.</p>
          {pendingLoading ? <p className="py-4 text-center text-sm text-slate-400">Đang tải…</p>
            : pending.length === 0 ? <p className="py-4 text-center text-sm text-slate-400">Không có đơn nào đang chờ bạn duyệt. 🎉</p> : (
              <div className="space-y-3">
                {pending.map((r) => (
                  <div key={r.id} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{r.employee_name || r.employee?.full_name}
                          <span className="ml-2 text-sm font-normal text-slate-400">{r.department_name || r.employee?.department_name || ''}</span></p>
                        <p className="text-sm text-slate-600">
                          {r.leave_type_name || ''} · {fmtDate(r.from_date)} → {fmtDate(r.to_date)} · {r.days_count ?? '—'} ngày
                        </p>
                        <p className="mt-1 text-sm text-slate-500">Lý do: {r.reason}</p>
                        <div className="mt-1"><StatusBadge status={r.status} /></div>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" disabled={decidingId === r.id} onClick={() => decide(r.id, 'approve')}
                          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Duyệt</button>
                        <button type="button" disabled={decidingId === r.id}
                          onClick={() => { setRejectingId(rejectingId === r.id ? null : r.id); setRejectReason(''); }}
                          className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">Từ chối</button>
                      </div>
                    </div>
                    {rejectingId === r.id && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Nhập lý do từ chối (bắt buộc)" className="min-w-64 flex-1 rounded-lg border px-3 py-2 text-sm" />
                        <button type="button" disabled={decidingId === r.id} onClick={() => decide(r.id, 'reject')}
                          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">Xác nhận từ chối</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
        </section>
      )}

      {/* === Lịch nghỉ tháng === */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-800">Lịch nghỉ đã duyệt trong tháng</h2>
          <MonthNav cursor={cursor} onChange={setCursor} />
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
          {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => <div key={d} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((cell, i) => (
            <div key={i} className={`min-h-20 rounded-lg p-1.5 text-left ${cell ? 'bg-slate-50' : 'bg-transparent'}`}>
              {cell && (
                <>
                  <p className={`text-xs font-semibold ${cell.iso === toISODate(new Date()) ? 'text-sky-600' : 'text-slate-500'}`}>{cell.day}</p>
                  <div className="mt-1 space-y-1">
                    {cell.leaves.slice(0, 3).map((lv) => (
                      <p key={lv.id} title={`${lv.employee_name} — ${lv.leave_type_name || ''}`}
                        className="truncate rounded bg-sky-100 px-1.5 py-0.5 text-[11px] text-sky-700">{lv.employee_name}</p>
                    ))}
                    {cell.leaves.length > 3 && <p className="text-[11px] text-slate-400">+{cell.leaves.length - 3} người nữa</p>}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
