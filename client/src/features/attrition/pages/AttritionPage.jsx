// Trang Điểm nguy cơ nghỉ việc — route /attrition-risk (mục 5.3, gói People AI).
// Admin/HR: toàn công ty (+ lọc theo phòng ban). Manager: chỉ nhóm của mình
// (server ép phạm vi — trang này không tự lọc dữ liệu nhạy cảm).
// Điểm do server chấm theo luật minh bạch trong cửa sổ 60 ngày, kèm yếu tố
// giải thích cho từng người. Trình bày phẳng theo hợp đồng thiết kế v4.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../app/AuthContext.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  PageHeader,
  Select,
  StatCard,
  TableSkeleton,
} from '../../../components/ui';
import { IconAlertTriangle, IconChart, IconShield, IconUsers } from '../../../components/icons.jsx';
import { formatDateTime, initials } from '../../../lib/format';
import { getAttritionRisk, parseApiError } from '../services';

const LEVEL_META = {
  high: { label: 'Cao', tone: 'red', scoreClass: 'text-red-600' },
  medium: { label: 'Trung bình', tone: 'amber', scoreClass: 'text-amber-600' },
  low: { label: 'Thấp', tone: 'green', scoreClass: 'text-gray-900' },
};

const FAIRNESS_NOTE =
  'Điểm tham khảo phục vụ chăm sóc nhân viên — không dùng làm căn cứ kỷ luật hay đánh giá chính thức.';

function getRoleFallback() {
  try {
    const raw = localStorage.getItem('hrm_user');
    if (raw) {
      const u = JSON.parse(raw);
      if (u?.role) return u.role;
    }
    const token = localStorage.getItem('hrm_access_token');
    if (token && token.split('.').length === 3) {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role) return payload.role;
    }
  } catch {
    /* bỏ qua */
  }
  return null;
}

export default function AttritionPage() {
  const { user } = useAuth();
  const role = user?.role || getRoleFallback();
  const canFilterDepartment = role === 'admin' || role === 'hr';

  const [data, setData] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [level, setLevel] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getAttritionRisk({
        departmentId: departmentId || undefined,
        level: level || undefined,
      });
      setData(result);
    } catch (err) {
      setError(parseApiError(err, 'Không tải được điểm nguy cơ nghỉ việc.'));
    } finally {
      setLoading(false);
    }
  }, [departmentId, level]);

  useEffect(() => {
    load();
  }, [load]);

  // Tuỳ chọn phòng ban lấy từ lần tải không lọc đầu tiên (chỉ admin/hr cần).
  useEffect(() => {
    if (!canFilterDepartment || departments.length > 0) return;
    let cancelled = false;
    getAttritionRisk({})
      .then((result) => {
        if (cancelled) return;
        const seen = new Map();
        (result?.items || []).forEach((item) => {
          const emp = item.employee || {};
          if (emp.department_id && emp.department_name) {
            seen.set(emp.department_id, emp.department_name);
          }
        });
        setDepartments([...seen.entries()].map(([id, name]) => ({ id, name })));
      })
      .catch(() => {
        /* bộ lọc phòng ban là phụ trợ — lỗi thì bỏ qua */
      });
    return () => {
      cancelled = true;
    };
  }, [canFilterDepartment, departments.length]);

  const items = useMemo(() => data?.items || [], [data]);
  const summary = data?.summary || { high: 0, medium: 0, low: 0 };

  return (
    <div className="page-shell">
      <PageHeader
        title="Nguy cơ nghỉ việc"
        subtitle="Điểm rủi ro theo luật minh bạch từ dữ liệu chấm công, nghỉ phép, hiệu suất và thâm niên — cửa sổ 60 ngày gần nhất, tính trực tiếp mỗi lần xem."
      />

      <Alert tone="info" className="mb-5">
        <span className="font-semibold">Lưu ý công bằng:</span> {FAIRNESS_NOTE}
      </Alert>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={IconAlertTriangle}
          tone="red"
          label="Nguy cơ cao (≥ 60 điểm)"
          value={summary.high || 0}
          sub="Cần HR/quản lý quan tâm sớm"
        />
        <StatCard
          icon={IconChart}
          tone="amber"
          label="Nguy cơ trung bình (30–59)"
          value={summary.medium || 0}
          sub="Theo dõi thêm trong kỳ tới"
        />
        <StatCard
          icon={IconShield}
          tone="green"
          label="Nguy cơ thấp (< 30 điểm)"
          value={summary.low || 0}
          sub="Tín hiệu ổn định"
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-gray-200 px-5 py-4">
          <FormField label="Mức nguy cơ">
            <Select value={level} onChange={(e) => setLevel(e.target.value)} className="w-44">
              <option value="">Tất cả mức</option>
              <option value="high">Cao</option>
              <option value="medium">Trung bình</option>
              <option value="low">Thấp</option>
            </Select>
          </FormField>
          {canFilterDepartment && (
            <FormField label="Phòng ban">
              <Select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-52"
              >
                <option value="">Toàn công ty</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <div className="ml-auto pb-0.5 text-xs text-gray-400">
            {data?.generated_at
              ? `Tính lúc ${formatDateTime(data.generated_at)} · cửa sổ ${data.window_days || 60} ngày`
              : ''}
          </div>
        </div>

        {error ? (
          <div className="p-5">
            <Alert tone="error" className="mb-3">
              {error}
            </Alert>
            <Button variant="secondary" onClick={load}>
              Thử lại
            </Button>
          </div>
        ) : loading ? (
          <div className="p-5">
            <TableSkeleton rows={6} cols={4} />
          </div>
        ) : items.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={IconUsers}
              title="Không có nhân viên nào trong phạm vi lọc"
              description="Thử bỏ bớt điều kiện lọc, hoặc chưa có dữ liệu nhân viên trong phạm vi của bạn."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-3 font-medium">Nhân viên</th>
                  <th className="px-5 py-3 font-medium">Phòng ban</th>
                  <th className="px-5 py-3 font-medium">Điểm</th>
                  <th className="px-5 py-3 font-medium">Mức</th>
                  <th className="px-5 py-3 font-medium">Yếu tố chính</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => {
                  const emp = item.employee || {};
                  const meta = LEVEL_META[item.level] || LEVEL_META.low;
                  return (
                    <tr key={emp.id} className="align-top hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                            {initials(emp.full_name || '?')}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-gray-900">
                              {emp.full_name || '—'}
                            </div>
                            <div className="text-xs text-gray-400">
                              {emp.code || ''}
                              {emp.position_name ? ` · ${emp.position_name}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{emp.department_name || '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`text-base font-bold ${meta.scoreClass}`}>
                          {item.score}
                        </span>
                        <span className="text-xs text-gray-400"> /100</span>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                      <td className="max-w-md px-5 py-3">
                        {item.factors && item.factors.length > 0 ? (
                          <ul className="space-y-0.5 text-xs leading-relaxed text-gray-500">
                            {item.factors.map((factor) => (
                              <li key={factor}>{factor}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-xs text-gray-400">
                            Không có tín hiệu nổi bật trong 60 ngày.
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
