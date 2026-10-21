// Trang Lịch team (Đội F) — hợp đồng thiết kế v4: lưới tháng phẳng, không gradient.
// Dữ liệu:
//   - Đơn nghỉ ĐÃ DUYỆT: GET /leave/calendar?month=YYYY-MM (scope theo quyền ở server).
//   - Sinh nhật + ngày bắt đầu làm việc: từ danh sách employees hiện có.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  Skeleton,
} from '../../../components/ui';
import { getCalendar } from '../../leave/services';
import { getEmployees } from '../../employees/services';

const WEEKDAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'];

const KIND_META = {
  leave: { label: 'Nghỉ phép', tone: 'amber', dotClass: 'bg-amber-500', chipClass: 'bg-amber-50 text-amber-800' },
  birthday: { label: 'Sinh nhật', tone: 'violet', dotClass: 'bg-violet-500', chipClass: 'bg-violet-50 text-violet-800' },
  start: { label: 'Nhân viên mới', tone: 'green', dotClass: 'bg-emerald-500', chipClass: 'bg-emerald-50 text-emerald-800' },
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dateKey(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parseDateParts(value) {
  if (!value) return null;
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m, day: d };
}

async function fetchAllEmployees() {
  const all = [];
  let page = 1;
  let totalPages = 1;
  do {
    const { items, meta } = await getEmployees({ page, limit: 100, sortBy: 'full_name', sortOrder: 'asc' });
    all.push(...items);
    totalPages = meta?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages);
  return all;
}

export default function TeamCalendarPage() {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState({ month: today.getMonth() + 1, year: today.getFullYear() });
  const [leaveItems, setLeaveItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [employeesNote, setEmployeesNote] = useState('');
  const [selectedKey, setSelectedKey] = useState(
    () => dateKey(today.getFullYear(), today.getMonth() + 1, today.getDate()),
  );

  const loadEmployees = useCallback(async () => {
    try {
      const all = await fetchAllEmployees();
      setEmployees(all.filter((e) => e.status !== 'resigned'));
      setEmployeesNote('');
    } catch {
      setEmployees([]);
      setEmployeesNote('Không tải được danh sách nhân viên nên lịch chưa hiển thị sinh nhật và ngày bắt đầu làm việc.');
    }
  }, []);

  const loadLeave = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const items = await getCalendar(cursor.month, cursor.year);
      setLeaveItems(items);
    } catch {
      setLeaveItems([]);
      setError('Không tải được lịch nghỉ phép của tháng này.');
    } finally {
      setLoading(false);
    }
  }, [cursor]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);
  useEffect(() => { loadLeave(); }, [loadLeave]);

  // Map: 'YYYY-MM-DD' -> [{ kind, label, sub }]
  const eventsByDay = useMemo(() => {
    const map = new Map();
    const push = (key, event) => {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(event);
    };
    const { month, year } = cursor;
    leaveItems.forEach((item) => {
      const from = parseDateParts(item.from_date);
      const to = parseDateParts(item.to_date);
      if (!from || !to) return;
      const start = new Date(from.year, from.month - 1, from.day);
      const end = new Date(to.year, to.month - 1, to.day);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getMonth() + 1 === month && d.getFullYear() === year) {
          push(dateKey(year, month, d.getDate()), {
            kind: 'leave',
            label: item.employee_name,
            sub: item.leave_type_name || 'Nghỉ phép',
          });
        }
      }
    });
    employees.forEach((emp) => {
      const dob = parseDateParts(emp.date_of_birth);
      if (dob && dob.month === month) {
        push(dateKey(year, month, dob.day), {
          kind: 'birthday',
          label: emp.full_name,
          sub: 'Sinh nhật',
        });
      }
      const start = parseDateParts(emp.start_date);
      if (start && start.month === month && start.year === year) {
        push(dateKey(year, month, start.day), {
          kind: 'start',
          label: emp.full_name,
          sub: 'Ngày bắt đầu làm việc',
        });
      }
    });
    return map;
  }, [leaveItems, employees, cursor]);

  const cells = useMemo(() => {
    const { month, year } = cursor;
    const first = new Date(year, month - 1, 1);
    const offset = (first.getDay() + 6) % 7; // Thứ 2 là cột đầu
    const daysInMonth = new Date(year, month, 0).getDate();
    const daysInPrev = new Date(year, month - 1, 0).getDate();
    const total = Math.ceil((offset + daysInMonth) / 7) * 7;
    const list = [];
    for (let i = 0; i < total; i += 1) {
      const dayNum = i - offset + 1;
      if (dayNum < 1) {
        list.push({ key: `prev-${i}`, day: daysInPrev + dayNum, inMonth: false, dateKey: null });
      } else if (dayNum > daysInMonth) {
        list.push({ key: `next-${i}`, day: dayNum - daysInMonth, inMonth: false, dateKey: null });
      } else {
        list.push({ key: dateKey(year, month, dayNum), day: dayNum, inMonth: true, dateKey: dateKey(year, month, dayNum) });
      }
    }
    return list;
  }, [cursor]);

  const moveMonth = (delta) => {
    setCursor((prev) => {
      const next = new Date(prev.year, prev.month - 1 + delta, 1);
      return { month: next.getMonth() + 1, year: next.getFullYear() };
    });
  };

  const goToday = () => {
    setCursor({ month: today.getMonth() + 1, year: today.getFullYear() });
    setSelectedKey(dateKey(today.getFullYear(), today.getMonth() + 1, today.getDate()));
  };

  const todayKey = dateKey(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const selectedEvents = selectedKey ? eventsByDay.get(selectedKey) ?? [] : [];

  return (
    <div className="page-shell">
      <PageHeader
        title="Lịch team"
        subtitle="Ngày nghỉ đã duyệt, sinh nhật và ngày bắt đầu làm việc của nhân viên trong tháng."
        actions={(
          <>
            <Button variant="secondary" onClick={() => moveMonth(-1)}>Tháng trước</Button>
            <Button variant="secondary" onClick={goToday}>Hôm nay</Button>
            <Button variant="secondary" onClick={() => moveMonth(1)}>Tháng sau</Button>
          </>
        )}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="mr-3 text-base font-semibold text-gray-900">
          Tháng {cursor.month}/{cursor.year}
        </h2>
        {Object.values(KIND_META).map((meta) => (
          <Badge key={meta.label} tone={meta.tone} dot>{meta.label}</Badge>
        ))}
      </div>

      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      {employeesNote && <Alert tone="warning" className="mb-4">{employeesNote}</Alert>}

      {loading ? (
        <Skeleton className="h-[560px]" />
      ) : (
        <Card>
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
            {WEEKDAYS.map((day) => (
              <div key={day} className="px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((cell, index) => {
              const events = cell.dateKey ? eventsByDay.get(cell.dateKey) ?? [] : [];
              const isToday = cell.dateKey === todayKey;
              const isSelected = cell.dateKey && cell.dateKey === selectedKey;
              return (
                <button
                  key={cell.key}
                  type="button"
                  disabled={!cell.inMonth}
                  onClick={() => cell.dateKey && setSelectedKey(cell.dateKey)}
                  className={[
                    'min-h-[104px] border-b border-r border-gray-100 p-2 text-left align-top',
                    (index + 1) % 7 === 0 ? 'border-r-0' : '',
                    cell.inMonth ? 'bg-white hover:bg-gray-50' : 'bg-gray-25 text-gray-300',
                    isSelected ? 'ring-2 ring-inset ring-brand-600/40' : '',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-[13px]',
                      isToday ? 'bg-brand-600 font-semibold text-white' : 'font-medium text-gray-700',
                      cell.inMonth ? '' : 'text-gray-300',
                    ].join(' ')}
                  >
                    {cell.day}
                  </span>
                  <span className="mt-1.5 block space-y-1">
                    {events.slice(0, 3).map((event, i) => (
                      <span
                        key={`${event.kind}-${event.label}-${i}`}
                        className={`flex items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium ${KIND_META[event.kind].chipClass}`}
                      >
                        <span className={`h-1.5 w-1.5 flex-none rounded-full ${KIND_META[event.kind].dotClass}`} />
                        <span className="truncate">{event.label}</span>
                      </span>
                    ))}
                    {events.length > 3 && (
                      <span className="block px-1.5 text-[11px] text-gray-500">+{events.length - 3} sự kiện nữa</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {selectedKey && (
        <Card className="mt-6">
          <CardHeader
            title={`Sự kiện ngày ${selectedKey.split('-').reverse().join('/')}`}
            subtitle={selectedEvents.length > 0 ? `${selectedEvents.length} sự kiện` : 'Không có sự kiện nào'}
          />
          <CardBody>
            {selectedEvents.length === 0 ? (
              <p className="text-sm text-gray-500">Ngày này không có người nghỉ, sinh nhật hay nhân viên mới bắt đầu.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {selectedEvents.map((event, i) => (
                  <li key={`${event.kind}-${event.label}-${i}`} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="flex items-center gap-2.5 text-sm">
                      <span className={`h-2 w-2 rounded-full ${KIND_META[event.kind].dotClass}`} />
                      <span className="font-medium text-gray-900">{event.label}</span>
                      <span className="text-gray-500">{event.sub}</span>
                    </span>
                    <Badge tone={KIND_META[event.kind].tone}>{KIND_META[event.kind].label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
