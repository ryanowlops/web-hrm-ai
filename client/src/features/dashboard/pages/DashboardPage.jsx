import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../../../app/AuthContext.jsx';
import {
  IconBriefcase,
  IconBuilding,
  IconCalendar,
  IconChart,
  IconChat,
  IconClipboard,
  IconClock,
  IconFileText,
  IconMoney,
  IconUsers,
} from '../../../components/icons.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Skeleton,
  StatCard,
} from '../../../components/ui';
import { getCurrentUser } from '../../auth/services';
import { fetchOverview } from '../services';

// ============================================================
// Trang Dashboard — route "/"
// - Admin / HR / Manager: thẻ thống kê + biểu đồ từ GET /stats/overview
//   (server đã giới hạn phạm vi theo vai trò: Manager chỉ thấy phòng mình),
//   danh sách việc cần chú ý: đơn nghỉ chờ duyệt, hợp đồng sắp hết hạn.
// - Employee: màn hình chào + lối tắt tính năng cá nhân (không gọi API thống kê).
// Trình bày theo design system v2 (UI kit trong components/ui):
// .page-shell, PageHeader, StatCard, Card/CardHeader, Badge, EmptyState,
// Skeleton khi đang tải, Alert + nút thử lại khi API thất bại.
// ============================================================

const ROLE_LABELS = {
  admin: 'Quản trị viên',
  hr: 'Phòng nhân sự (HR)',
  manager: 'Trưởng phòng',
  employee: 'Nhân viên',
};

const LEAVE_STATUS_LABELS = {
  pending: 'Chờ trưởng phòng duyệt',
  manager_approved: 'Chờ HR duyệt',
  approved: 'Đã duyệt',
  rejected: 'Đã từ chối',
};

const LEAVE_STATUS_TONES = {
  pending: 'amber',
  manager_approved: 'blue',
  approved: 'green',
  rejected: 'red',
};

// Màu biểu đồ lấy từ design token (--chart-1..5 trong styles/tokens.css).
const chartColor = (index) => `var(--chart-${(index % 5) + 1})`;

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('vi-VN');
}

function formatToday() {
  return new Date().toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function initialsOf(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  return (parts[parts.length - 1]?.[0] || '?').toUpperCase();
}

// ---------- Trạng thái đang tải ----------

function DashboardSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-[104px]" />
        <Skeleton className="h-[104px]" />
        <Skeleton className="h-[104px]" />
        <Skeleton className="h-[104px]" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Skeleton className="h-[320px]" />
        <Skeleton className="h-[320px]" />
      </div>
    </div>
  );
}

// ---------- Phần dành cho Employee ----------

const EMPLOYEE_FEATURES = [
  {
    title: 'Chấm công',
    description: 'Check-in / check-out hằng ngày và xem lại bảng công của chính bạn theo tháng.',
    icon: IconClock,
    tone: 'bg-brand-50 text-brand-600 ring-brand-100',
  },
  {
    title: 'Nghỉ phép',
    description: 'Gửi đơn xin nghỉ, theo dõi trạng thái duyệt 2 cấp và số ngày phép còn lại.',
    icon: IconCalendar,
    tone: 'bg-accent-50 text-accent-600 ring-accent-100',
  },
  {
    title: 'Phiếu lương',
    description: 'Xem phiếu lương chi tiết của bạn ngay khi HR chốt kỳ lương hằng tháng.',
    icon: IconMoney,
    tone: 'bg-amber-50 text-amber-600 ring-amber-100',
  },
  {
    title: 'Chatbot HR',
    description: 'Hỏi nhanh về quy chế, ngày phép, phúc lợi — AI trả lời dựa trên tài liệu nội bộ.',
    icon: IconChat,
    tone: 'bg-violet-50 text-violet-600 ring-violet-100',
  },
];

function EmployeeHome({ user }) {
  return (
    <div>
      <Card className="mb-5">
        <CardBody className="py-5">
          <h2 className="text-lg font-bold tracking-[-0.01em] text-slate-900">
            Xin chào{user?.fullName ? `, ${user.fullName}` : ''}!
          </h2>
          <p className="mt-1.5 max-w-2xl leading-relaxed text-slate-500">
            Hôm nay là {formatToday()}. Bạn có thể chấm công, gửi đơn nghỉ phép, xem phiếu
            lương và hỏi chatbot HR ngay trong hệ thống.
          </p>
        </CardBody>
      </Card>
      <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {EMPLOYEE_FEATURES.map((feature) => {
          const FeatureIcon = feature.icon;
          return (
            <Card key={feature.title} hover className="p-5">
              <div
                className={`mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-inset ${feature.tone}`}
              >
                <FeatureIcon size={21} />
              </div>
              <div className="font-bold text-slate-900">{feature.title}</div>
              <div className="mt-1 text-sm leading-relaxed text-slate-500">{feature.description}</div>
            </Card>
          );
        })}
      </div>
      <p className="mt-5 text-[13px] text-slate-500">
        Số liệu thống kê toàn công ty chỉ hiển thị cho Quản trị viên, phòng HR và Trưởng
        phòng theo đúng phạm vi phân quyền.
      </p>
    </div>
  );
}

// ---------- Trang chính ----------

export default function DashboardPage() {
  // Nguồn sự thật về phiên đăng nhập là AuthContext;
  // user lưu ở localStorage (hrm_user) chỉ là dự phòng.
  const { user: authUser } = useAuth();
  const user = authUser || getCurrentUser();
  const role = user?.role || '';
  const isEmployee = role === 'employee';

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: fetchOverview,
    enabled: !isEmployee,
    retry: 1,
    staleTime: 60_000,
  });

  const roleLabel = ROLE_LABELS[role] || 'Người dùng';
  const attendanceTotal = data
    ? data.attendanceToday.present + data.attendanceToday.late + data.attendanceToday.absent + data.attendanceToday.onLeave
    : 0;
  const hasAttendanceData = data?.attendanceChart?.some((item) => item.value > 0);

  return (
    <div className="page-shell">
      <PageHeader
        title={`Xin chào${user?.fullName ? `, ${user.fullName}` : ''}`}
        subtitle={
          <>
            {formatToday()} · Vai trò: {roleLabel}
            {role === 'manager' ? ' · Số liệu trong phạm vi phòng ban bạn quản lý' : ''}
            {(role === 'admin' || role === 'hr') ? ' · Số liệu toàn công ty' : ''}
          </>
        }
      />

      {isEmployee ? (
        <EmployeeHome user={user} />
      ) : isLoading ? (
        <DashboardSkeleton />
      ) : isError ? (
        <Card>
          <CardBody className="py-5">
            <Alert tone="error">
              <span className="font-bold">Không tải được số liệu tổng quan</span>
              <br />
              {error?.response?.data?.error?.message ||
                'Đã xảy ra lỗi khi gọi máy chủ. Vui lòng thử lại.'}
            </Alert>
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => refetch()}>
              Thử lại
            </Button>
          </CardBody>
        </Card>
      ) : !data ? (
        <Card>
          <EmptyState
            icon={<IconChart size={26} />}
            title="Chưa có dữ liệu thống kê"
            description="Hệ thống chưa trả về số liệu. Hãy thêm nhân viên và dữ liệu chấm công để bắt đầu."
          />
        </Card>
      ) : (
        <>
          {/* Thẻ thống kê */}
          <section className="stagger mb-6 grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
            <StatCard
              icon={<IconUsers size={21} />}
              tone="blue"
              label="Tổng số nhân viên"
              value={data.totalEmployees}
              sub={
                data.newEmployeesThisMonth != null || data.resignedThisMonth != null
                  ? `Tháng này: +${data.newEmployeesThisMonth ?? 0} mới / −${data.resignedThisMonth ?? 0} nghỉ việc`
                  : undefined
              }
            />
            <StatCard
              icon={<IconBuilding size={21} />}
              tone="violet"
              label="Số phòng ban"
              value={data.totalDepartments}
            />
            <StatCard
              icon={<IconClock size={21} />}
              tone="teal"
              label="Tỷ lệ chuyên cần hôm nay"
              value={data.attendanceRate != null ? `${data.attendanceRate}%` : '—'}
              sub={
                attendanceTotal > 0
                  ? `Đúng giờ ${data.attendanceToday.present} · Đi muộn ${data.attendanceToday.late} · Nghỉ phép ${data.attendanceToday.onLeave} · Vắng ${data.attendanceToday.absent}`
                  : 'Hôm nay chưa có dữ liệu chấm công'
              }
            />
            <StatCard
              icon={<IconClipboard size={21} />}
              tone={data.pendingLeaveCount > 0 ? 'amber' : 'slate'}
              className={data.pendingLeaveCount > 0 ? 'border-amber-300 bg-amber-50/60' : ''}
              label="Đơn nghỉ chờ duyệt"
              value={data.pendingLeaveCount}
              sub={data.pendingLeaveCount > 0 ? 'Cần xử lý sớm để nhân viên chủ động kế hoạch' : 'Không có đơn nào đang chờ'}
            />
            {data.openJobs != null && (
              <StatCard
                icon={<IconBriefcase size={21} />}
                tone="rose"
                label="Vị trí đang tuyển"
                value={data.openJobs}
                sub={data.totalCandidates != null ? `${data.totalCandidates} ứng viên trong hệ thống` : undefined}
              />
            )}
          </section>

          {/* Biểu đồ */}
          <section className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Cơ cấu nhân sự theo phòng ban" />
              <CardBody>
                {data.byDepartment.length > 0 ? (
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={data.byDepartment}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={2}
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {data.byDepartment.map((entry, index) => (
                            <Cell key={entry.name} fill={chartColor(index)} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => [`${value} nhân viên`, 'Số lượng']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState
                    icon={<IconBuilding size={26} />}
                    title="Chưa có dữ liệu phòng ban"
                    description="Thêm phòng ban và gán nhân viên để xem cơ cấu nhân sự."
                  />
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Chuyên cần hôm nay" />
              <CardBody>
                {hasAttendanceData ? (
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer>
                      <BarChart data={data.attendanceChart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 13 }} />
                        <Tooltip formatter={(value) => [`${value} người`, 'Số lượng']} />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          {data.attendanceChart.map((entry, index) => (
                            <Cell key={entry.name} fill={chartColor(index)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState
                    icon={<IconChart size={26} />}
                    title="Hôm nay chưa có dữ liệu chấm công"
                    description="Biểu đồ sẽ xuất hiện khi nhân viên bắt đầu check-in trong ngày."
                  />
                )}
              </CardBody>
            </Card>
          </section>

          {/* Việc cần chú ý */}
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title={`Đơn nghỉ chờ duyệt (${data.pendingLeaveCount})`} />
              {data.pendingLeaves.length > 0 ? (
                <ul className="px-2.5 py-2">
                  {data.pendingLeaves.slice(0, 5).map((item, index) => (
                    <li
                      key={item.id ?? index}
                      className="flex items-start gap-3 rounded-xl px-2.5 py-3 transition-colors duration-150 [border-bottom:1px_solid_#f1f5f9] last:[border-bottom:none] hover:bg-brand-50/60"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[13px] font-bold text-brand-700 ring-1 ring-inset ring-brand-100">
                        {initialsOf(item.employeeName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-800">{item.employeeName}</span>
                          <Badge tone={LEAVE_STATUS_TONES[item.status] || 'amber'} dot>
                            {LEAVE_STATUS_LABELS[item.status] || 'Đang chờ duyệt'}
                          </Badge>
                        </div>
                        <div className="mt-0.5 text-sm text-slate-500">
                          {item.leaveType}
                          {item.fromDate ? ` · ${formatDate(item.fromDate)}` : ''}
                          {item.toDate ? ` → ${formatDate(item.toDate)}` : ''}
                          {item.daysCount ? ` · ${item.daysCount} ngày` : ''}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={<IconClipboard size={26} />}
                  title="Không có đơn nghỉ nào đang chờ"
                  description="Mọi đơn nghỉ phép đã được xử lý."
                />
              )}
            </Card>

            <Card>
              <CardHeader title={`Hợp đồng sắp hết hạn (${data.expiringContracts.length})`} />
              {data.expiringContracts.length > 0 ? (
                <ul className="px-2.5 py-2">
                  {data.expiringContracts.slice(0, 5).map((item, index) => (
                    <li
                      key={item.id ?? index}
                      className="flex items-start gap-3 rounded-xl px-2.5 py-3 transition-colors duration-150 [border-bottom:1px_solid_#f1f5f9] last:[border-bottom:none] hover:bg-brand-50/60"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-[13px] font-bold text-amber-700 ring-1 ring-inset ring-amber-100">
                        {initialsOf(item.employeeName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-800">{item.employeeName}</span>
                          {item.daysRemaining != null && (
                            <Badge tone={item.daysRemaining <= 7 ? 'red' : 'amber'} dot>
                              {item.daysRemaining < 0
                                ? `Đã hết hạn ${Math.abs(item.daysRemaining)} ngày`
                                : item.daysRemaining === 0
                                  ? 'Hết hạn hôm nay'
                                  : `Còn ${item.daysRemaining} ngày`}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 text-sm text-slate-500">
                          {item.contractType}
                          {item.departmentName ? ` · ${item.departmentName}` : ''}
                          {item.endDate ? ` · Hết hạn ${formatDate(item.endDate)}` : ''}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={<IconFileText size={26} />}
                  title="Không có hợp đồng nào sắp hết hạn"
                  description="Danh sách sẽ hiển thị hợp đồng còn dưới 30 ngày hiệu lực."
                />
              )}
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
