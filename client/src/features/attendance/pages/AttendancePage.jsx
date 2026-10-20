import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getToday, checkIn, checkOut, getMyMonthly, getTeamMonthly, getDepartments, getEmployees,
} from '../services';

/* ---------- Helpers dùng chung ---------- */

// Lấy user hiện tại (role) một cách phòng thủ: localStorage 'user' -> JWT payload.
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
  present: { label: 'Đúng giờ', cls: 'bg-emerald-100 text-emerald-700' },
  late: { label: 'Đi muộn', cls: 'bg-amber-100 text-amber-700' },
  absent: { label: 'Vắng', cls: 'bg-rose-100 text-rose-700' },
  on_leave: { label: 'Nghỉ phép', cls: 'bg-sky-100 text-sky-700' },
  missing_checkout: { label: 'Thiếu giờ ra', cls: 'bg-orange-100 text-orange-700' },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status || '—', cls: 'bg-slate-100 text-slate-600' };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>;
}

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—');
const fmtDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
const errMsg = (e) => e?.response?.data?.error?.message || e?.message || 'Đã xảy ra lỗi, vui lòng thử lại.';

function MonthNav({ cursor, onChange }) {
  const shift = (delta) => {
    const d = new Date(cursor.year, cursor.month - 1 + delta, 1);
    onChange({ month: d.getMonth() + 1, year: d.getFullYear() });
  };
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => shift(-1)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50">← Tháng trước</button>
      <span className="min-w-28 text-center font-semibold">Tháng {cursor.month}/{cursor.year}</span>
      <button type="button" onClick={() => shift(1)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50">Tháng sau →</button>
    </div>
  );
}

/* ---------- Trang chính ---------- */

export default function AttendancePage() {
  const user = useMemo(getCurrentUser, []);
  const canViewTeam = ['admin', 'hr', 'manager'].includes(user?.role);

  const now = new Date();
  const [cursor, setCursor] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });

  /* --- Thẻ hôm nay --- */
  const [today, setToday] = useState(null);
  const [todayLoading, setTodayLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadToday = useCallback(async () => {
    try { setToday(await getToday()); } catch (e) { setError(errMsg(e)); } finally { setTodayLoading(false); }
  }, []);

  useEffect(() => { loadToday(); }, [loadToday]);
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

  const doCheck = async (fn, okText) => {
    setActing(true); setError(''); setNotice('');
    try { setToday(await fn()); setNotice(okText); loadMyMonthly(); }
    catch (e) { setError(errMsg(e)); } finally { setActing(false); }
  };

  /* --- Bảng công tháng của tôi --- */
  const [myData, setMyData] = useState({ records: [], summary: null });
  const [myLoading, setMyLoading] = useState(false);

  const loadMyMonthly = useCallback(async () => {
    setMyLoading(true);
    try {
      const res = await getMyMonthly(cursor.month, cursor.year);
      setMyData({ records: Array.isArray(res) ? res : res.data || [], summary: res?.summary || null });
    } catch (e) { setError(errMsg(e)); } finally { setMyLoading(false); }
  }, [cursor]);

  useEffect(() => { loadMyMonthly(); }, [loadMyMonthly]);

  /* --- Bảng công đội ngũ (HR/Manager) --- */
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [teamRows, setTeamRows] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [filterDept, setFilterDept] = useState('');
  const [filterEmp, setFilterEmp] = useState('');

  useEffect(() => {
    if (!canViewTeam) return;
    getDepartments().then(setDepartments);
  }, [canViewTeam]);

  useEffect(() => {
    if (!canViewTeam) return;
    getEmployees({ departmentId: filterDept || undefined }).then(setEmployees);
  }, [canViewTeam, filterDept]);

  const loadTeam = useCallback(async () => {
    if (!canViewTeam) return;
    setTeamLoading(true);
    try {
      const res = await getTeamMonthly({
        month: cursor.month, year: cursor.year,
        departmentId: filterDept || undefined, employeeId: filterEmp || undefined,
      });
      setTeamRows(Array.isArray(res) ? res : res.data || []);
    } catch (e) { setError(errMsg(e)); } finally { setTeamLoading(false); }
  }, [canViewTeam, cursor, filterDept, filterEmp]);

  useEffect(() => { loadTeam(); }, [loadTeam]);

  const checkedIn = Boolean(today?.check_in_at);
  const checkedOut = Boolean(today?.check_out_at);
  const summary = myData.summary || {};

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">Chấm công</h1>
        <p className="text-sm text-slate-500">Check-in/check-out hằng ngày và bảng công tháng.</p>
      </header>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {notice && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

      {/* === Thẻ hôm nay === */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">
              {clock.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>
            <p className="text-4xl font-bold tabular-nums text-slate-800">
              {clock.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
            {todayLoading ? <p className="mt-2 text-sm text-slate-400">Đang tải trạng thái hôm nay…</p> : (
              <div className="mt-2 flex items-center gap-3 text-sm">
                <span>Giờ vào: <b>{fmtTime(today?.check_in_at)}</b></span>
                <span>Giờ ra: <b>{fmtTime(today?.check_out_at)}</b></span>
                {today?.status && <StatusBadge status={today.status} />}
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button" disabled={acting || todayLoading || checkedIn}
              onClick={() => doCheck(checkIn, 'Check-in thành công. Chúc anh/chị một ngày làm việc hiệu quả!')}
              className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >Check-in</button>
            <button
              type="button" disabled={acting || todayLoading || !checkedIn || checkedOut}
              onClick={() => doCheck(checkOut, 'Check-out thành công. Hẹn gặp lại ngày mai!')}
              className="rounded-xl bg-slate-800 px-6 py-3 font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
            >Check-out</button>
          </div>
        </div>
        {!todayLoading && !checkedIn && <p className="mt-3 text-sm text-amber-600">Bạn chưa check-in hôm nay. Hãy check-in khi bắt đầu giờ làm việc.</p>}
        {!todayLoading && checkedIn && !checkedOut && <p className="mt-3 text-sm text-slate-500">Đã ghi nhận giờ vào. Đừng quên check-out khi kết thúc ngày làm việc.</p>}
      </section>

      {/* === Bảng công tháng của tôi === */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-800">Bảng công của tôi</h2>
          <MonthNav cursor={cursor} onChange={setCursor} />
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ['Ngày công', summary.workdays ?? '—'],
            ['Đi muộn', summary.late ?? '—'],
            ['Nghỉ phép', summary.on_leave ?? '—'],
            ['Vắng', summary.absent ?? '—'],
            ['Thiếu giờ ra', summary.missing_checkout ?? '—'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-xl font-bold text-slate-800">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        {myLoading ? <p className="py-6 text-center text-sm text-slate-400">Đang tải bảng công…</p>
          : myData.records.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">Chưa có dữ liệu chấm công trong tháng này.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead><tr className="border-b text-slate-500">
                  <th className="py-2 pr-3">Ngày</th><th className="py-2 pr-3">Giờ vào</th>
                  <th className="py-2 pr-3">Giờ ra</th><th className="py-2 pr-3">Trạng thái</th><th className="py-2">Ghi chú</th>
                </tr></thead>
                <tbody>
                  {myData.records.map((r) => (
                    <tr key={r.id || r.work_date} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(r.work_date)}</td>
                      <td className="py-2 pr-3">{fmtTime(r.check_in_at)}</td>
                      <td className="py-2 pr-3">{fmtTime(r.check_out_at)}</td>
                      <td className="py-2 pr-3"><StatusBadge status={r.status} /></td>
                      <td className="py-2 text-slate-500">{r.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>

      {/* === Bảng công đội ngũ (HR / Manager / Admin) === */}
      {canViewTeam && (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-800">
              Bảng công nhân viên {user?.role === 'manager' ? '(phòng của tôi)' : ''}
            </h2>
            <div className="flex flex-wrap gap-2">
              <select value={filterDept} onChange={(e) => { setFilterDept(e.target.value); setFilterEmp(''); }}
                className="rounded-lg border px-3 py-1.5 text-sm">
                <option value="">Tất cả phòng ban</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select value={filterEmp} onChange={(e) => setFilterEmp(e.target.value)}
                className="rounded-lg border px-3 py-1.5 text-sm">
                <option value="">Tất cả nhân viên</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.code ? `${emp.code} — ` : ''}{emp.full_name}</option>)}
              </select>
            </div>
          </div>

          {teamLoading ? <p className="py-6 text-center text-sm text-slate-400">Đang tải…</p>
            : teamRows.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">Không có dữ liệu theo bộ lọc hiện tại.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead><tr className="border-b text-slate-500">
                    <th className="py-2 pr-3">Nhân viên</th><th className="py-2 pr-3">Phòng ban</th>
                    <th className="py-2 pr-3 text-center">Ngày công</th><th className="py-2 pr-3 text-center">Đi muộn</th>
                    <th className="py-2 pr-3 text-center">Nghỉ phép</th><th className="py-2 text-center">Vắng</th>
                  </tr></thead>
                  <tbody>
                    {teamRows.map((row, i) => {
                      const emp = row.employee || row;
                      const s = row.summary || row;
                      return (
                        <tr key={emp.id || i} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="py-2 pr-3 font-medium">{emp.full_name}{emp.code ? <span className="text-slate-400"> ({emp.code})</span> : null}</td>
                          <td className="py-2 pr-3">{emp.department_name || emp.department?.name || '—'}</td>
                          <td className="py-2 pr-3 text-center">{s.workdays ?? '—'}</td>
                          <td className="py-2 pr-3 text-center">{s.late ?? '—'}</td>
                          <td className="py-2 pr-3 text-center">{s.on_leave ?? '—'}</td>
                          <td className="py-2 text-center">{s.absent ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          <p className="mt-3 text-xs text-slate-400">Phạm vi dữ liệu do server quyết định theo vai trò và phòng ban của bạn.</p>
        </section>
      )}
    </div>
  );
}
