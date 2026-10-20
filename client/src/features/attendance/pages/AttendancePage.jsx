import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getToday, checkIn, checkOut, getMyMonthly, getTeamMonthly, getDepartments, getEmployees,
} from '../services';
import {
  Alert, Badge, Button, Card, CardHeader, EmptyState, PageHeader, Select, StatCard, TableSkeleton,
} from '../../../components/ui';

/* ---------- Helpers dùng chung ---------- */

// Lấy user hiện tại (role) một cách phòng thủ: localStorage 'user' -> JWT payload.
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

// tone theo Badge của UI kit: đúng giờ = green, muộn/thiếu giờ ra = amber,
// vắng = red, nghỉ phép = blue, còn lại = slate.
const STATUS_META = {
  present: { label: 'Đúng giờ', tone: 'green' },
  late: { label: 'Đi muộn', tone: 'amber' },
  absent: { label: 'Vắng', tone: 'red' },
  on_leave: { label: 'Nghỉ phép', tone: 'blue' },
  missing_checkout: { label: 'Thiếu giờ ra', tone: 'amber' },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status || '—', tone: 'slate' };
  return <Badge tone={meta.tone} dot>{meta.label}</Badge>;
}

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—');
const fmtDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
const errMsg = (e) => e?.response?.data?.error?.message || e?.message || 'Đã xảy ra lỗi, vui lòng thử lại.';

/* ---------- Icon nhỏ cho StatCard (SVG stroke) ---------- */
const iconProps = {
  className: 'h-5 w-5', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
};
const CalendarIcon = (<svg {...iconProps}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="m9 16 2 2 4-4" /></svg>);
const ClockIcon = (<svg {...iconProps}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>);
const SunIcon = (<svg {...iconProps}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
const AbsentIcon = (<svg {...iconProps}><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></svg>);
const AlertIcon = (<svg {...iconProps}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>);

function MonthNav({ cursor, onChange }) {
  const shift = (delta) => {
    const d = new Date(cursor.year, cursor.month - 1 + delta, 1);
    onChange({ month: d.getMonth() + 1, year: d.getFullYear() });
  };
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={() => shift(-1)}>← Tháng trước</Button>
      <span className="min-w-28 text-center text-sm font-bold text-slate-800">Tháng {cursor.month}/{cursor.year}</span>
      <Button type="button" variant="secondary" size="sm" onClick={() => shift(1)}>Tháng sau →</Button>
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

  const summaryCards = [
    { label: 'Ngày công', value: summary.workdays ?? '—', icon: CalendarIcon, tone: 'blue' },
    { label: 'Đi muộn', value: summary.late ?? '—', icon: ClockIcon, tone: 'amber' },
    { label: 'Nghỉ phép', value: summary.on_leave ?? '—', icon: SunIcon, tone: 'teal' },
    { label: 'Vắng', value: summary.absent ?? '—', icon: AbsentIcon, tone: 'rose' },
    { label: 'Thiếu giờ ra', value: summary.missing_checkout ?? '—', icon: AlertIcon, tone: 'violet' },
  ];

  return (
    <div className="page-shell">
      <PageHeader
        title="Chấm công"
        subtitle="Check-in/check-out hằng ngày và bảng công tháng."
      />

      {(error || notice) && (
        <div className="mb-6 space-y-3">
          <Alert tone="error">{error}</Alert>
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      <div className="stagger space-y-6">
        {/* === Thẻ hôm nay (nổi bật) === */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-950 via-navy-900 to-brand-900 text-white shadow-lift">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand-500/25 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-accent-500/20 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-6 p-6 lg:p-7">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium capitalize text-slate-300">
                <span className="h-2 w-2 animate-pulse-soft rounded-full bg-accent-400" />
                {clock.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
              </p>
              <p className="mt-1.5 text-5xl font-extrabold tabular-nums tracking-tight lg:text-[56px] lg:leading-none">
                {clock.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
              {todayLoading ? (
                <div className="mt-4 flex items-center gap-3" aria-hidden="true">
                  <div className="h-5 w-40 animate-shimmer rounded-lg bg-white/15" />
                  <div className="h-5 w-32 animate-shimmer rounded-lg bg-white/15" />
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-200">
                  <span>Giờ vào: <b className="text-base font-bold tabular-nums text-white">{fmtTime(today?.check_in_at)}</b></span>
                  <span>Giờ ra: <b className="text-base font-bold tabular-nums text-white">{fmtTime(today?.check_out_at)}</b></span>
                  {today?.status && <StatusBadge status={today.status} />}
                </div>
              )}
              {!todayLoading && !checkedIn && (
                <p className="mt-3 text-sm font-medium text-amber-300">Bạn chưa check-in hôm nay. Hãy check-in khi bắt đầu giờ làm việc.</p>
              )}
              {!todayLoading && checkedIn && !checkedOut && (
                <p className="mt-3 text-sm text-slate-300">Đã ghi nhận giờ vào. Đừng quên check-out khi kết thúc ngày làm việc.</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button" variant="accent" size="lg" loading={acting}
                disabled={acting || todayLoading || checkedIn}
                onClick={() => doCheck(checkIn, 'Check-in thành công. Chúc anh/chị một ngày làm việc hiệu quả!')}
              >Check-in</Button>
              <Button
                type="button" variant="secondary" size="lg"
                disabled={acting || todayLoading || !checkedIn || checkedOut}
                onClick={() => doCheck(checkOut, 'Check-out thành công. Hẹn gặp lại ngày mai!')}
              >Check-out</Button>
            </div>
          </div>
        </section>

        {/* === Bảng công tháng của tôi === */}
        <Card>
          <CardHeader
            title="Bảng công của tôi"
            subtitle={`Tổng hợp chấm công tháng ${cursor.month}/${cursor.year} của bạn.`}
            actions={<MonthNav cursor={cursor} onChange={setCursor} />}
          />
          <div className="grid grid-cols-2 gap-3 px-5 pt-5 sm:grid-cols-3 xl:grid-cols-5">
            {summaryCards.map((c) => (
              <StatCard key={c.label} icon={c.icon} label={c.label} value={c.value} tone={c.tone} className="p-4" />
            ))}
          </div>

          {myLoading ? <TableSkeleton rows={6} cols={5} />
            : myData.records.length === 0 ? (
              <EmptyState
                icon={CalendarIcon}
                title="Chưa có dữ liệu chấm công trong tháng này."
              />
            ) : (
              <div className="overflow-x-auto px-2 pb-2 pt-2">
                <table className="ui-table min-w-[560px]">
                  <thead><tr>
                    <th className="ui-th">Ngày</th><th className="ui-th">Giờ vào</th>
                    <th className="ui-th">Giờ ra</th><th className="ui-th">Trạng thái</th><th className="ui-th">Ghi chú</th>
                  </tr></thead>
                  <tbody>
                    {myData.records.map((r) => (
                      <tr key={r.id || r.work_date} className="ui-tr">
                        <td className="ui-td whitespace-nowrap font-semibold capitalize text-slate-800">{fmtDate(r.work_date)}</td>
                        <td className="ui-td tabular-nums">{fmtTime(r.check_in_at)}</td>
                        <td className="ui-td tabular-nums">{fmtTime(r.check_out_at)}</td>
                        <td className="ui-td"><StatusBadge status={r.status} /></td>
                        <td className="ui-td text-slate-500">{r.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>

        {/* === Bảng công đội ngũ (HR / Manager / Admin) === */}
        {canViewTeam && (
          <Card>
            <CardHeader
              title={`Bảng công nhân viên ${user?.role === 'manager' ? '(phòng của tôi)' : ''}`}
              subtitle="Tổng hợp ngày công của nhân viên trong tháng theo phòng ban."
              actions={(
                <>
                  <Select value={filterDept} onChange={(e) => { setFilterDept(e.target.value); setFilterEmp(''); }} className="w-44 py-2">
                    <option value="">Tất cả phòng ban</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </Select>
                  <Select value={filterEmp} onChange={(e) => setFilterEmp(e.target.value)} className="w-52 py-2">
                    <option value="">Tất cả nhân viên</option>
                    {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.code ? `${emp.code} — ` : ''}{emp.full_name}</option>)}
                  </Select>
                </>
              )}
            />
            {teamLoading ? <TableSkeleton rows={6} cols={6} />
              : teamRows.length === 0 ? (
                <EmptyState
                  icon={CalendarIcon}
                  title="Không có dữ liệu theo bộ lọc hiện tại."
                />
              ) : (
                <div className="overflow-x-auto px-2 pb-2">
                  <table className="ui-table min-w-[640px]">
                    <thead><tr>
                      <th className="ui-th">Nhân viên</th><th className="ui-th">Phòng ban</th>
                      <th className="ui-th text-center">Ngày công</th><th className="ui-th text-center">Đi muộn</th>
                      <th className="ui-th text-center">Nghỉ phép</th><th className="ui-th text-center">Vắng</th>
                    </tr></thead>
                    <tbody>
                      {teamRows.map((row, i) => {
                        const emp = row.employee || row;
                        const s = row.summary || row;
                        return (
                          <tr key={emp.id || i} className="ui-tr">
                            <td className="ui-td font-semibold text-slate-800">{emp.full_name}{emp.code ? <span className="font-normal text-slate-400"> ({emp.code})</span> : null}</td>
                            <td className="ui-td">{emp.department_name || emp.department?.name || '—'}</td>
                            <td className="ui-td text-center font-semibold tabular-nums">{s.workdays ?? '—'}</td>
                            <td className="ui-td text-center tabular-nums">{s.late ?? '—'}</td>
                            <td className="ui-td text-center tabular-nums">{s.on_leave ?? '—'}</td>
                            <td className="ui-td text-center tabular-nums">{s.absent ?? '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            <p className="border-t border-slate-100 px-5 py-3.5 text-xs text-slate-400">Phạm vi dữ liệu do server quyết định theo vai trò và phòng ban của bạn.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
