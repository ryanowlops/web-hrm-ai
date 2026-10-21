// Trang Sơ đồ tổ chức (Đội F) — hợp đồng thiết kế v4: thẻ phẳng, HTML/CSS thuần.
// Dữ liệu lấy từ API hiện có: GET /employees (phân trang), /departments, /positions.
// Cây: Phòng ban -> Trưởng phòng -> nhân viên theo manager_id (đệ quy).
// Bấm vào thẻ nhân viên -> /employees/:id.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
} from '../../../components/ui';
import { getEmployees, parseApiError } from '../../employees/services';
import { getDepartments, getPositions } from '../../departments/services';
import { initials } from '../../../lib/format';

async function fetchAllEmployees() {
  const all = [];
  let page = 1;
  let totalPages = 1;
  do {
    const { items, meta } = await getEmployees({
      page, limit: 100, sortBy: 'full_name', sortOrder: 'asc',
    });
    all.push(...items);
    totalPages = meta?.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages);
  return all;
}

function EmployeeCard({ employee, positionTitle, isManager, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(employee.id)}
      className="flex w-64 max-w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-left shadow-card transition hover:border-brand-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/20"
    >
      {employee.avatar_url ? (
        <img
          src={employee.avatar_url}
          alt={employee.full_name}
          className="h-10 w-10 flex-none rounded-full object-cover ring-1 ring-inset ring-gray-200"
        />
      ) : (
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-brand-50 text-[13px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-100">
          {initials(employee.full_name)}
        </span>
      )}
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-900">{employee.full_name}</span>
          {isManager && <Badge tone="blue">Trưởng phòng</Badge>}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-gray-500">
          {positionTitle} · {employee.code}
        </span>
      </span>
    </button>
  );
}

function EmployeeNode({ employee, depth, context }) {
  const { childrenOf, positionTitleOf, managerIds, onOpen } = context;
  const children = childrenOf.get(employee.id) ?? [];
  return (
    <li>
      <EmployeeCard
        employee={employee}
        positionTitle={positionTitleOf(employee)}
        isManager={managerIds.has(employee.id)}
        onOpen={onOpen}
      />
      {children.length > 0 && (
        <ul className="mt-3 space-y-3 border-l border-gray-200 pl-4 ml-5">
          {children.map((child) => (
            <EmployeeNode key={child.id} employee={child} depth={depth + 1} context={context} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function OrgChartPage() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [allEmployees, deptResult, posResult] = await Promise.all([
        fetchAllEmployees(),
        getDepartments({ limit: 100 }),
        getPositions({ limit: 200 }).catch(() => ({ items: [] })),
      ]);
      setEmployees(allEmployees.filter((e) => e.status !== 'resigned'));
      setDepartments(deptResult.items);
      setPositions(posResult.items);
    } catch (err) {
      setError(parseApiError(err, 'Không tải được dữ liệu sơ đồ tổ chức.').message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const positionTitleOf = useCallback(
    (emp) => emp.position?.title
      || emp.position_title
      || positions.find((p) => p.id === emp.position_id)?.title
      || 'Chưa có chức vụ',
    [positions],
  );

  const managerIds = useMemo(
    () => new Set(departments.map((d) => d.manager_id ?? d.manager?.id).filter(Boolean)),
    [departments],
  );

  // childrenOf: manager_id -> [nhân viên trực thuộc]; chỉ trong cùng tập đang hiển thị.
  const childrenOf = useMemo(() => {
    const visibleIds = new Set(employees.map((e) => e.id));
    const map = new Map();
    employees.forEach((emp) => {
      if (emp.manager_id && visibleIds.has(emp.manager_id) && emp.manager_id !== emp.id) {
        if (!map.has(emp.manager_id)) map.set(emp.manager_id, []);
        map.get(emp.manager_id).push(emp);
      }
    });
    return map;
  }, [employees]);

  // Nhóm theo phòng ban; trong mỗi phòng: gốc = trưởng phòng (nếu thuộc phòng)
  // + nhân viên mà quản lý trực tiếp không nằm trong cùng phòng.
  const groups = useMemo(() => {
    const byDept = new Map();
    employees.forEach((emp) => {
      const key = emp.department_id ?? 'none';
      if (!byDept.has(key)) byDept.set(key, []);
      byDept.get(key).push(emp);
    });
    const ordered = [];
    departments.forEach((dept) => {
      const members = byDept.get(dept.id) ?? [];
      if (members.length === 0) return;
      const memberIds = new Set(members.map((e) => e.id));
      const deptManagerId = dept.manager_id ?? dept.manager?.id;
      const roots = members.filter(
        (emp) => emp.id === deptManagerId || !memberIds.has(emp.manager_id),
      );
      ordered.push({ key: `dept-${dept.id}`, name: dept.name, members, roots });
    });
    const noDept = byDept.get('none') ?? [];
    if (noDept.length > 0) {
      const memberIds = new Set(noDept.map((e) => e.id));
      ordered.push({
        key: 'dept-none',
        name: 'Chưa thuộc phòng ban',
        members: noDept,
        roots: noDept.filter((emp) => !memberIds.has(emp.manager_id)),
      });
    }
    return ordered;
  }, [employees, departments]);

  const toggleGroup = (key) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const context = { childrenOf, positionTitleOf, managerIds, onOpen: (id) => navigate(`/employees/${id}`) };

  return (
    <div className="page-shell">
      <PageHeader
        title="Sơ đồ tổ chức"
        subtitle={`${employees.length} nhân viên đang làm việc trong ${groups.length} phòng ban. Bấm vào thẻ nhân viên để mở hồ sơ.`}
      />

      {error && (
        <Alert tone="error" className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="secondary" size="sm" onClick={load}>Thử lại</Button>
          </div>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          title="Chưa có dữ liệu tổ chức"
          description="Chưa có nhân viên nào đang làm việc để hiển thị sơ đồ tổ chức."
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.key);
            return (
              <section key={group.key} className="rounded-xl border border-gray-200 bg-white shadow-card">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/20"
                  aria-expanded={!isCollapsed}
                >
                  <span className="flex items-center gap-3">
                    <span className="text-[15px] font-semibold text-gray-900">{group.name}</span>
                    <Badge tone="slate">{group.members.length} nhân viên</Badge>
                  </span>
                  <span className="text-[13px] font-medium text-gray-500">
                    {isCollapsed ? 'Mở rộng' : 'Thu gọn'}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="overflow-x-auto px-5 py-4">
                    <ul className="space-y-3">
                      {group.roots.map((root) => (
                        <EmployeeNode key={root.id} employee={root} depth={0} context={context} />
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
