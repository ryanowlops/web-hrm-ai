// Trang Hoi nhap (Onboarding) — route /onboarding
// - HR/Admin/Manager: board theo doi ke hoach hoi nhap (bang plan: nhan
//   vien, ngay bat dau, tien do %, so task qua han) + chi tiet checklist
//   theo 3 giai doan + quan ly mau (template) va sinh plan thu cong.
// - Employee: "Hoi nhap cua toi" — plan cua chinh minh + cac task duoc
//   giao trong plan cua nguoi khac (buddy/manager).
// Trinh bay theo hop dong thiet ke v4 (docs/frontend-design-v4.md):
// PageHeader phang, the trang border gray-200 rounded-xl, bang thead
// bg-gray-50, tien do phang (thanh + ProgressRing nho), Badge ngu nghia.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../app/AuthContext.jsx';
import {
  Button,
  Card,
  CardHeader,
  Badge,
  Modal,
  PageHeader,
  EmptyState,
  Alert,
  Skeleton,
  FormField,
  Input,
  Select,
  StatCard,
} from '../../../components/ui';
import { ProgressRing } from '../../../components/motion';
import {
  IconCheck,
  IconClock,
  IconClipboard,
  IconFileText,
  IconPlus,
  IconUsers,
} from '../../../components/icons.jsx';
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  getPlans,
  createPlan,
  getPlan,
  getMyPlan,
  getMyTasks,
  updateTask,
  verifyTask,
  parseApiError,
  currentRole,
} from '../services';
import { getEmployees } from '../../employees/services';
import { getDepartments, getPositions } from '../../departments/services';

// ---------------------------------------------------------------------------
// Hang so hien thi
// ---------------------------------------------------------------------------

const TASK_STATUS = {
  pending: { label: 'Chưa bắt đầu', tone: 'slate' },
  in_progress: { label: 'Đang làm', tone: 'blue' },
  done: { label: 'Đã xong', tone: 'green' },
  verified: { label: 'Đã xác nhận', tone: 'green' },
  overdue: { label: 'Quá hạn', tone: 'red' },
  skipped: { label: 'Bỏ qua', tone: 'slate' },
};

const PLAN_STATUS = {
  in_progress: { label: 'Đang hội nhập', tone: 'blue' },
  completed: { label: 'Hoàn thành', tone: 'green' },
  cancelled: { label: 'Đã huỷ', tone: 'slate' },
};

const ASSIGNEE_ROLE = {
  hr: 'HR',
  manager: 'Quản lý',
  it: 'IT',
  buddy: 'Buddy',
  employee: 'Nhân viên mới',
};

const TASK_TYPE = {
  task: 'Việc thường',
  document: 'Hồ sơ',
  training: 'Đào tạo',
  meeting: 'Gặp gỡ',
};

const STAGES = [
  { key: 'before', title: 'Trước ngày đầu' },
  { key: 'first_day', title: 'Ngày đầu tiên' },
  { key: 'first_week', title: 'Tuần đầu tiên & thử việc' },
];

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('vi-VN');
}

function asList(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  return [];
}

// ---------------------------------------------------------------------------
// Mot dong dau viec trong checklist (dung chung: chi tiet plan + viec cua toi)
// ---------------------------------------------------------------------------

function TaskRow({ task, showPlanOwner, busyId, onStatus, onVerify }) {
  const meta = TASK_STATUS[task.status] || TASK_STATUS.pending;
  const busy = busyId === task.id;
  const finished = task.status === 'done' || task.status === 'verified';
  const assigneeLabel = task.assignee_name
    || (task.assignee_role ? ASSIGNEE_ROLE[task.assignee_role] || task.assignee_role : 'Chưa gán');
  return (
    <div className="flex items-start gap-3 px-4 py-3 sm:px-5">
      <span
        className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full border ${
          finished
            ? 'border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]'
            : task.status === 'overdue'
              ? 'border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]'
              : 'border-gray-200 bg-white text-gray-300'
        }`}
        aria-hidden="true"
      >
        {finished ? <IconCheck size={14} /> : <IconClock size={14} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`text-sm font-medium ${finished ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
            {task.title}
          </p>
          <Badge tone={meta.tone} dot>{meta.label}</Badge>
          {task.task_type === 'document' && (
            <Badge tone="violet">{TASK_TYPE.document}</Badge>
          )}
        </div>
        {task.description && <p className="mt-0.5 text-[13px] leading-relaxed text-gray-500">{task.description}</p>}
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-gray-500">
          <span>Phụ trách: <span className="font-medium text-gray-700">{assigneeLabel}</span></span>
          <span>
            Hạn: <span className={`font-medium tnum ${task.is_overdue ? 'text-[#B42318]' : 'text-gray-700'}`}>{fmtDate(task.due_date)}</span>
          </span>
          {showPlanOwner && task.plan_employee_name && <span>Nhân viên mới: {task.plan_employee_name}</span>}
          {task.completed_by_name && <span>Hoàn thành bởi {task.completed_by_name}</span>}
        </p>
        {task.note && <p className="mt-1 text-[13px] italic text-gray-500">Ghi chú: {task.note}</p>}
      </div>
      <div className="flex flex-none flex-wrap justify-end gap-1.5">
        {task.status === 'pending' || task.status === 'overdue' ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onStatus(task, 'in_progress')}>
            Bắt đầu
          </Button>
        ) : null}
        {task.status === 'in_progress' || task.status === 'pending' || task.status === 'overdue' ? (
          <Button size="sm" disabled={busy} onClick={() => onStatus(task, 'done')}>
            Hoàn thành
          </Button>
        ) : null}
        {task.task_type === 'document' && task.status === 'done' && onVerify ? (
          <Button size="sm" variant="accent" disabled={busy} onClick={() => onVerify(task)}>
            HR xác nhận
          </Button>
        ) : null}
        {!finished && task.status !== 'skipped' ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus(task, 'skipped')}>
            Bỏ qua
          </Button>
        ) : null}
        {task.status === 'skipped' ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus(task, 'pending')}>
            Mở lại
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chi tiet mot ke hoach: thong tin nhan vien + checklist theo giai doan
// ---------------------------------------------------------------------------

function PlanDetail({ plan, isHr, busyId, onStatus, onVerify, onBack }) {
  if (!plan) return null;
  const statusMeta = PLAN_STATUS[plan.status] || PLAN_STATUS.in_progress;
  const byStage = useMemo(() => {
    const groups = { before: [], first_day: [], first_week: [] };
    (plan.tasks || []).forEach((t) => {
      (groups[t.stage] || groups.first_week).push(t);
    });
    return groups;
  }, [plan.tasks]);
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-4 px-5 py-4">
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-brand-50 text-[15px] font-semibold text-brand-700 ring-1 ring-brand-100">
            {initials(plan.employee_name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900">{plan.employee_name || 'Nhân viên mới'}</h2>
              <Badge tone={statusMeta.tone} dot>{statusMeta.label}</Badge>
            </div>
            <p className="mt-0.5 text-[13px] text-gray-500">
              {plan.employee_code || ''}
              {plan.position_title ? ` · ${plan.position_title}` : ''}
              {plan.department_name ? ` · ${plan.department_name}` : ''}
              {` · Bắt đầu ${fmtDate(plan.start_date)}`}
              {plan.template_name ? ` · Mẫu: ${plan.template_name}` : ''}
            </p>
          </div>
          <ProgressRing value={plan.progress_percent || 0} size={72} stroke={7} label={`${plan.progress_percent || 0}%`} />
          <div className="text-[13px] leading-relaxed text-gray-500">
            <p><span className="font-semibold text-gray-900 tnum">{plan.done_tasks}</span>/{plan.total_tasks} việc đã xong</p>
            <p className={plan.overdue_tasks > 0 ? 'font-medium text-[#B42318]' : ''}>
              {plan.overdue_tasks} việc quá hạn
            </p>
          </div>
          {onBack && (
            <Button variant="secondary" size="sm" onClick={onBack}>Quay lại bảng</Button>
          )}
        </div>
      </Card>

      {STAGES.map((stage) => {
        const tasks = byStage[stage.key];
        if (!tasks.length) return null;
        return (
          <Card key={stage.key}>
            <CardHeader title={stage.title} subtitle={`${tasks.filter((t) => t.status === 'done' || t.status === 'verified').length}/${tasks.length} việc đã xong`} />
            <div className="divide-y divide-gray-100 border-t border-gray-100">
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  busyId={busyId}
                  onStatus={onStatus}
                  onVerify={isHr ? onVerify : undefined}
                />
              ))}
            </div>
          </Card>
        );
      })}
      {(plan.tasks || []).length === 0 && (
        <Card>
          <EmptyState
            icon={<IconClipboard size={22} />}
            title="Chưa có đầu việc nào"
            description="Kế hoạch này chưa có đầu việc. Hãy kiểm tra lại mẫu hội nhập đã áp dụng."
          />
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trang chinh
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const { user } = useAuth();
  const role = user?.role || currentRole();
  // Tín hiệu có hồ sơ nhân viên gắn với tài khoản (admin hệ thống có thể null).
  const hasProfile = Boolean(user?.employeeId);
  const isHr = role === 'admin' || role === 'hr';
  const isStaff = isHr || role === 'manager';

  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  // Board (staff)
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(isStaff);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Templates + modals (HR)
  const [templates, setTemplates] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [planModal, setPlanModal] = useState(false);
  const [planForm, setPlanForm] = useState({ employee_id: '', template_id: '' });
  const [templateModal, setTemplateModal] = useState(null); // null | 'create' | template
  const [submitting, setSubmitting] = useState(false);

  // Employee / viec duoc giao
  const [myPlan, setMyPlan] = useState(null);
  const [myPlanLoading, setMyPlanLoading] = useState(!isStaff);
  const [myTasks, setMyTasks] = useState([]);

  const loadPlans = useCallback(async () => {
    if (!isStaff) return;
    setPlansLoading(true);
    try {
      const res = await getPlans({ status: statusFilter || undefined, limit: 100 });
      setPlans(asList(res));
      setError('');
    } catch (err) {
      setError(parseApiError(err, 'Không tải được danh sách kế hoạch hội nhập.').message);
    } finally {
      setPlansLoading(false);
    }
  }, [isStaff, statusFilter]);

  const loadMyData = useCallback(async () => {
    // Không gắn hồ sơ thì không có dữ liệu cá nhân nào để lấy: bỏ qua cả
    // /my-tasks lẫn /my-plan (backend trả rỗng/null) để view cá nhân ẩn hẳn.
    if (!hasProfile) {
      setMyTasks([]);
      if (!isStaff) {
        setMyPlan(null);
        setMyPlanLoading(false);
      }
      return;
    }
    try {
      const tasks = await getMyTasks().catch(() => []);
      setMyTasks(Array.isArray(tasks) ? tasks : []);
    } catch {
      setMyTasks([]);
    }
    if (!isStaff) {
      setMyPlanLoading(true);
      try {
        setMyPlan(await getMyPlan());
      } catch {
        setMyPlan(null);
      } finally {
        setMyPlanLoading(false);
      }
    }
  }, [isStaff, hasProfile]);

  const loadRefs = useCallback(async () => {
    if (!isHr) return;
    try {
      const [tpl, emp, dept, pos] = await Promise.all([
        getTemplates().catch(() => []),
        getEmployees({ limit: 100 }).catch(() => []),
        getDepartments({ limit: 100 }).catch(() => []),
        getPositions({ limit: 100 }).catch(() => []),
      ]);
      setTemplates(Array.isArray(tpl) ? tpl : []);
      setEmployees(asList(emp));
      setDepartments(asList(dept));
      setPositions(asList(pos));
    } catch {
      /* bo qua — form van dung duoc phan chinh */
    }
  }, [isHr]);

  useEffect(() => { loadPlans(); }, [loadPlans]);
  useEffect(() => { loadMyData(); }, [loadMyData]);
  useEffect(() => { loadRefs(); }, [loadRefs]);

  const refreshDetail = useCallback(async (planId) => {
    if (!planId) return;
    setDetailLoading(true);
    try {
      setSelectedPlan(await getPlan(planId));
    } catch (err) {
      setError(parseApiError(err, 'Không tải được chi tiết kế hoạch.').message);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleTaskStatus = useCallback(async (task, status) => {
    setBusyId(task.id);
    try {
      await updateTask(task.id, { status });
      if (selectedPlan && task.plan_id === selectedPlan.id) await refreshDetail(selectedPlan.id);
      if (!isStaff) {
        setMyPlan(await getMyPlan());
      }
      await loadPlans();
      await loadMyData();
      setError('');
    } catch (err) {
      setError(parseApiError(err, 'Không cập nhật được đầu việc.').message);
    } finally {
      setBusyId(null);
    }
  }, [selectedPlan, refreshDetail, isStaff, loadPlans, loadMyData]);

  const handleVerify = useCallback(async (task) => {
    setBusyId(task.id);
    try {
      await verifyTask(task.id);
      if (selectedPlan && task.plan_id === selectedPlan.id) await refreshDetail(selectedPlan.id);
      await loadPlans();
      setError('');
    } catch (err) {
      setError(parseApiError(err, 'Không xác nhận được đầu việc.').message);
    } finally {
      setBusyId(null);
    }
  }, [selectedPlan, refreshDetail, loadPlans]);

  const handleCreatePlan = async () => {
    if (!planForm.employee_id) {
      setError('Hãy chọn nhân viên cần tạo kế hoạch hội nhập.');
      return;
    }
    setSubmitting(true);
    try {
      const plan = await createPlan({
        employee_id: Number(planForm.employee_id),
        template_id: planForm.template_id ? Number(planForm.template_id) : undefined,
      });
      setPlanModal(false);
      setPlanForm({ employee_id: '', template_id: '' });
      await loadPlans();
      if (plan?.id) {
        setSelectedPlan(plan.tasks ? plan : await getPlan(plan.id));
      }
      setError('');
    } catch (err) {
      setError(parseApiError(err, 'Không tạo được kế hoạch hội nhập.').message);
    } finally {
      setSubmitting(false);
    }
  };

  const summary = useMemo(() => {
    const inProgress = plans.filter((p) => p.status === 'in_progress').length;
    const completed = plans.filter((p) => p.status === 'completed').length;
    const overdue = plans.reduce((sum, p) => sum + (p.overdue_tasks || 0), 0);
    return { inProgress, completed, overdue };
  }, [plans]);

  const otherTasks = useMemo(() => {
    const myPlanId = myPlan?.id;
    return myTasks.filter((t) => t.plan_id !== myPlanId);
  }, [myTasks, myPlan]);

  // --- Employee: man hinh "Hoi nhap cua toi" ---
  if (!isStaff) {
    // Employee không gắn hồ sơ: view cá nhân ẩn hẳn (không hiện thẻ rỗng
    // "chưa có kế hoạch hội nhập"); chỉ còn tiêu đề trang.
    if (!hasProfile) {
      return (
        <div className="page-shell">
          <PageHeader
            title="Hội nhập của tôi"
            subtitle="Checklist hội nhập của bạn — hoàn thành từng đầu việc theo đúng hạn, HR sẽ xác nhận các hồ sơ cần thiết."
          />
        </div>
      );
    }
    return (
      <div className="page-shell">
        <PageHeader
          title="Hội nhập của tôi"
          subtitle="Checklist hội nhập của bạn — hoàn thành từng đầu việc theo đúng hạn, HR sẽ xác nhận các hồ sơ cần thiết."
        />
        {error && <Alert tone="error" className="mb-4">{error}</Alert>}
        {myPlanLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : myPlan ? (
          <PlanDetail plan={myPlan} isHr={false} busyId={busyId} onStatus={handleTaskStatus} />
        ) : (
          <Card>
            <EmptyState
              icon={<IconClipboard size={22} />}
              title="Bạn chưa có kế hoạch hội nhập"
              description="Khi HR tạo kế hoạch hội nhập cho bạn, checklist sẽ xuất hiện tại đây."
            />
          </Card>
        )}
        {otherTasks.length > 0 && (
          <Card className="mt-4">
            <CardHeader title="Việc hội nhập được giao cho bạn" subtitle="Các đầu việc bạn phụ trách trong kế hoạch của nhân viên mới khác (buddy/hỗ trợ)." />
            <div className="divide-y divide-gray-100 border-t border-gray-100">
              {otherTasks.map((task) => (
                <TaskRow key={task.id} task={task} showPlanOwner busyId={busyId} onStatus={handleTaskStatus} />
              ))}
            </div>
          </Card>
        )}
      </div>
    );
  }

  // --- Staff: board theo doi ---
  return (
    <div className="page-shell">
      <PageHeader
        title="Hội nhập nhân viên mới"
        subtitle="Theo dõi tiến độ hội nhập của nhân viên mới theo mẫu theo phòng ban/chức vụ."
        actions={(
          <>
            {isHr && (
              <Button variant="secondary" onClick={() => setTemplateModal('create')}>
                Tạo mẫu
              </Button>
            )}
            {isHr && (
              <Button onClick={() => setPlanModal(true)}>
                <IconPlus size={16} /> Tạo kế hoạch
              </Button>
            )}
          </>
        )}
      />
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}

      {selectedPlan || detailLoading ? (
        detailLoading && !selectedPlan ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <PlanDetail
            plan={selectedPlan}
            isHr={isHr}
            busyId={busyId}
            onStatus={handleTaskStatus}
            onVerify={handleVerify}
            onBack={() => setSelectedPlan(null)}
          />
        )
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Đang hội nhập" value={summary.inProgress} sub="kế hoạch đang thực hiện" />
            <StatCard label="Đã hoàn thành" value={summary.completed} sub="kế hoạch hội nhập xong" />
            <StatCard label="Đầu việc quá hạn" value={summary.overdue} sub="cần nhắc người phụ trách" />
          </div>

          <Card>
            <CardHeader
              title="Kế hoạch hội nhập"
              subtitle="Bấm vào một dòng để xem checklist chi tiết theo giai đoạn."
              actions={(
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-44"
                  aria-label="Lọc theo trạng thái"
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="in_progress">Đang hội nhập</option>
                  <option value="completed">Hoàn thành</option>
                  <option value="cancelled">Đã huỷ</option>
                </Select>
              )}
            />
            {plansLoading ? (
              <div className="space-y-3 px-5 py-5">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : plans.length === 0 ? (
              <EmptyState
                icon={<IconUsers size={22} />}
                title="Chưa có kế hoạch hội nhập nào"
                description={isHr
                  ? 'Kế hoạch sẽ tự sinh khi tạo hồ sơ nhân viên mới (nếu có mẫu phù hợp), hoặc bấm "Tạo kế hoạch" để tạo thủ công.'
                  : 'Chưa có nhân viên mới nào trong phạm vi quản lý của bạn đang hội nhập.'}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="ui-table">
                  <thead>
                    <tr>
                      <th className="ui-th">Nhân viên mới</th>
                      <th className="ui-th">Phòng ban</th>
                      <th className="ui-th">Ngày bắt đầu</th>
                      <th className="ui-th">Mẫu áp dụng</th>
                      <th className="ui-th w-56">Tiến độ</th>
                      <th className="ui-th">Quá hạn</th>
                      <th className="ui-th">Trạng thái</th>
                      <th className="ui-th" />
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((plan) => {
                      const meta = PLAN_STATUS[plan.status] || PLAN_STATUS.in_progress;
                      return (
                        <tr key={plan.id} className="ui-tr cursor-pointer" onClick={() => refreshDetail(plan.id)}>
                          <td className="ui-td">
                            <span className="flex items-center gap-3">
                              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-50 text-[13px] font-semibold text-brand-700 ring-1 ring-brand-100">
                                {initials(plan.employee_name)}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-gray-900">{plan.employee_name}</span>
                                <span className="block truncate text-[13px] text-gray-500">{plan.position_title || plan.employee_email || ''}</span>
                              </span>
                            </span>
                          </td>
                          <td className="ui-td">{plan.department_name || '—'}</td>
                          <td className="ui-td tnum">{fmtDate(plan.start_date)}</td>
                          <td className="ui-td">{plan.template_name || '—'}</td>
                          <td className="ui-td">
                            <span className="flex items-center gap-2">
                              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                                <span className="block h-full rounded-full bg-brand-600" style={{ width: `${plan.progress_percent || 0}%` }} />
                              </span>
                              <span className="text-[13px] font-medium text-gray-700 tnum">{plan.progress_percent || 0}%</span>
                            </span>
                          </td>
                          <td className="ui-td">
                            {plan.overdue_tasks > 0
                              ? <Badge tone="red" dot>{plan.overdue_tasks} việc</Badge>
                              : <span className="text-gray-400">0</span>}
                          </td>
                          <td className="ui-td"><Badge tone={meta.tone} dot>{meta.label}</Badge></td>
                          <td className="ui-td text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => { e.stopPropagation(); refreshDetail(plan.id); }}
                            >
                              Xem
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {isHr && (
            <Card className="mt-4">
              <CardHeader
                title="Mẫu hội nhập"
                subtitle="Mẫu theo chức vụ được ưu tiên hơn mẫu theo phòng ban, cuối cùng là mẫu chung."
              />
              {templates.length === 0 ? (
                <EmptyState
                  icon={<IconFileText size={22} />}
                  title="Chưa có mẫu hội nhập"
                  description="Tạo mẫu đầu tiên để hệ thống tự sinh kế hoạch khi có nhân viên mới."
                />
              ) : (
                <div className="divide-y divide-gray-100 border-t border-gray-100">
                  {templates.map((tpl) => (
                    <div key={tpl.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{tpl.name}</p>
                        <p className="text-[13px] text-gray-500">
                          {tpl.position_title ? `Chức vụ: ${tpl.position_title} · ` : ''}
                          {tpl.department_name ? `Phòng: ${tpl.department_name} · ` : (!tpl.position_title ? 'Áp dụng chung · ' : '')}
                          {(tpl.tasks || []).length} đầu việc
                        </p>
                      </div>
                      <Badge tone={tpl.is_active ? 'green' : 'slate'} dot>
                        {tpl.is_active ? 'Đang áp dụng' : 'Tạm tắt'}
                      </Badge>
                      <Button size="sm" variant="secondary" onClick={() => setTemplateModal(tpl)}>Sửa mẫu</Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {otherTasks.length > 0 && (
            <Card className="mt-4">
              <CardHeader title="Việc hội nhập được giao cho tôi" subtitle="Các đầu việc bạn phụ trách trong kế hoạch của nhân viên mới." />
              <div className="divide-y divide-gray-100 border-t border-gray-100">
                {otherTasks.map((task) => (
                  <TaskRow key={task.id} task={task} showPlanOwner busyId={busyId} onStatus={handleTaskStatus} onVerify={isHr ? handleVerify : undefined} />
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Modal tao ke hoach thu cong */}
      {planModal && (
        <Modal
          title="Tạo kế hoạch hội nhập"
          subtitle="Chọn nhân viên — hệ thống tự chọn mẫu phù hợp nhất, hoặc chỉ định mẫu cụ thể."
          onClose={() => setPlanModal(false)}
          actions={(
            <>
              <Button variant="secondary" onClick={() => setPlanModal(false)}>Huỷ</Button>
              <Button loading={submitting} onClick={handleCreatePlan}>Tạo kế hoạch</Button>
            </>
          )}
        >
          <div className="space-y-4 px-6 py-5">
            <FormField label="Nhân viên mới">
              <Select value={planForm.employee_id} onChange={(e) => setPlanForm((f) => ({ ...f, employee_id: e.target.value }))}>
                <option value="">— Chọn nhân viên —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} ({emp.code}){emp.department_name ? ` · ${emp.department_name}` : ''}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Mẫu hội nhập" hint="Để trống để hệ thống tự chọn: theo chức vụ → phòng ban → mẫu chung.">
              <Select value={planForm.template_id} onChange={(e) => setPlanForm((f) => ({ ...f, template_id: e.target.value }))}>
                <option value="">Tự động chọn mẫu phù hợp</option>
                {templates.filter((t) => t.is_active).map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                ))}
              </Select>
            </FormField>
          </div>
        </Modal>
      )}

      {/* Modal tao/sua mau */}
      {templateModal && (
        <TemplateFormModal
          key={templateModal === 'create' ? 'create' : templateModal.id}
          initial={templateModal === 'create' ? null : templateModal}
          departments={departments}
          positions={positions}
          submitting={submitting}
          onClose={() => setTemplateModal(null)}
          onSubmit={async (payload) => {
            setSubmitting(true);
            try {
              if (templateModal === 'create') await createTemplate(payload);
              else await updateTemplate(templateModal.id, payload);
              setTemplateModal(null);
              await loadRefs();
              setError('');
            } catch (err) {
              setError(parseApiError(err, 'Không lưu được mẫu hội nhập.').message);
            } finally {
              setSubmitting(false);
            }
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form tao/sua mau hoi nhap (kem danh sach dau viec mau)
// ---------------------------------------------------------------------------

function TemplateFormModal({ initial, departments, positions, submitting, onClose, onSubmit }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    department_id: initial?.department_id ? String(initial.department_id) : '',
    position_id: initial?.position_id ? String(initial.position_id) : '',
    is_active: initial?.is_active ?? true,
    tasks: (initial?.tasks || []).map((t) => ({
      title: t.title || '',
      description: t.description || '',
      assignee_role: t.assignee_role || 'employee',
      due_offset_days: t.due_offset_days ?? 0,
      task_type: t.task_type || 'task',
    })),
  });

  const setTask = (idx, patch) => setForm((f) => ({
    ...f,
    tasks: f.tasks.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
  }));

  const handleSubmit = () => {
    onSubmit({
      name: form.name.trim(),
      department_id: form.department_id ? Number(form.department_id) : null,
      position_id: form.position_id ? Number(form.position_id) : null,
      is_active: form.is_active,
      tasks: form.tasks
        .filter((t) => t.title.trim())
        .map((t, i) => ({
          title: t.title.trim(),
          description: t.description.trim() || undefined,
          assignee_role: t.assignee_role,
          due_offset_days: Number(t.due_offset_days) || 0,
          task_type: t.task_type,
          sort_order: i + 1,
        })),
    });
  };

  return (
    <Modal
      title={initial ? `Sửa mẫu — ${initial.name}` : 'Tạo mẫu hội nhập'}
      subtitle="Đầu việc mẫu sẽ được sinh thành checklist cho nhân viên mới; hạn = ngày bắt đầu + số ngày lệch."
      width="max-w-2xl"
      onClose={onClose}
      actions={(
        <>
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button loading={submitting} disabled={!form.name.trim()} onClick={handleSubmit}>Lưu mẫu</Button>
        </>
      )}
    >
      <div className="max-h-[65vh] space-y-4 overflow-y-auto px-6 py-5">
        <FormField label="Tên mẫu">
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="VD: Hội nhập nhân viên Kỹ thuật"
          />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Phòng ban áp dụng" hint="Trống = áp dụng chung.">
            <Select value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}>
              <option value="">— Chung —</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Chức vụ áp dụng" hint="Mẫu theo chức vụ được ưu tiên cao nhất.">
            <Select value={form.position_id} onChange={(e) => setForm((f) => ({ ...f, position_id: e.target.value }))}>
              <option value="">— Chung —</option>
              {positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </Select>
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300"
          />
          Đang áp dụng (tự sinh kế hoạch cho nhân viên mới)
        </label>

        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Đầu việc mẫu</p>
          <div className="space-y-2">
            {form.tasks.map((task, idx) => (
              <div key={idx} className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={task.title}
                    onChange={(e) => setTask(idx, { title: e.target.value })}
                    placeholder="Tên đầu việc"
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setForm((f) => ({ ...f, tasks: f.tasks.filter((_, i) => i !== idx) }))}
                  >
                    Xoá
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Select value={task.assignee_role} onChange={(e) => setTask(idx, { assignee_role: e.target.value })} aria-label="Người phụ trách">
                    {Object.entries(ASSIGNEE_ROLE).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                  <Select value={task.task_type} onChange={(e) => setTask(idx, { task_type: e.target.value })} aria-label="Loại đầu việc">
                    {Object.entries(TASK_TYPE).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    value={task.due_offset_days}
                    onChange={(e) => setTask(idx, { due_offset_days: e.target.value })}
                    aria-label="Số ngày lệch hạn"
                    title="Hạn = ngày bắt đầu + số ngày này (âm = trước ngày đầu)"
                  />
                </div>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            onClick={() => setForm((f) => ({
              ...f,
              tasks: [...f.tasks, { title: '', description: '', assignee_role: 'employee', due_offset_days: 0, task_type: 'task' }],
            }))}
          >
            <IconPlus size={14} /> Thêm đầu việc
          </Button>
        </div>
      </div>
    </Modal>
  );
}
