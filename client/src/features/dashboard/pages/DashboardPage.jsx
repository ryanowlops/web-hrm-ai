import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
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
  IconBell,
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
import StaggerList, { StaggerItem } from '../../../components/motion/StaggerList.jsx';
import { getCurrentUser } from '../../auth/services';
import { getAnnouncements } from '../../announcements/services';
import { getEmployees } from '../../employees/services';
import { fetchOverview } from '../services';

// ============================================================
// Trang Dashboard — route "/" — Design v4 (mẫu Overview của shadcn-admin)
// - Không hero/band tối, không trang trí: PageHeader phẳng, hàng 4
//   StatCard, biểu đồ chấm công màu phẳng (2/3) + thẻ "Cần xử lý" (1/3),
//   hàng dưới: cơ cấu phòng ban + bảng đơn nghỉ phép gần đây.
// - Số liệu lấy nguyên từ GET /stats/overview qua fetchOverview —
//   không suy diễn thêm % tăng/giảm hay số liệu ngoài API.
// Logic/dữ liệu giữ nguyên các bản trước — chỉ thay lớp trình bày.
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

// Màu biểu đồ phẳng theo hợp đồng v4 (fill đặc, không hiệu ứng màu chuyển):
// brand-600, teal accent-500, amber-500, gray-300.
const ATTENDANCE_COLORS = {
  'Đúng giờ': '#274FEA',
  'Đi muộn': '#F59E0B',
  'Nghỉ phép': '#0DB795',
  Vắng: '#D0D5DD',
};
const DEPARTMENT_COLORS = ['#274FEA', '#0DB795', '#F59E0B', '#98A2B3', '#667085', '#D0D5DD'];

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

function greetingByHour() {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 13) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

// Lớp nút dạng liên kết theo hợp đồng v4 (rounded-lg, 14px medium).
const LINK_BUTTON_PRIMARY =
  'inline-flex h-9 items-center justify-center rounded-lg bg-brand-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/20';
const LINK_BUTTON_SECONDARY =
  'inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3.5 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/20';

// ---------- Trạng thái đang tải ----------

function DashboardSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="mb-2 h-6 w-72" />
      <Skeleton className="mb-6 h-4 w-96 max-w-full" />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Skeleton className="h-[340px] rounded-xl lg:col-span-2" />
        <Skeleton className="h-[340px] rounded-xl" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Skeleton className="h-[300px] rounded-xl" />
        <Skeleton className="h-[300px] rounded-xl lg:col-span-2" />
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
    to: '/attendance',
  },
  {
    title: 'Nghỉ phép',
    description: 'Gửi đơn xin nghỉ, theo dõi trạng thái duyệt 2 cấp và số ngày phép còn lại.',
    icon: IconCalendar,
    tone: 'bg-accent-50 text-accent-600 ring-accent-100',
    to: '/leave',
  },
  {
    title: 'Phiếu lương',
    description: 'Xem phiếu lương chi tiết của bạn ngay khi HR chốt kỳ lương hằng tháng.',
    icon: IconMoney,
    tone: 'bg-amber-50 text-amber-600 ring-amber-100',
    to: '/payroll',
  },
  {
    title: 'Chatbot HR',
    description: 'Hỏi nhanh về quy chế, ngày phép, phúc lợi — AI trả lời dựa trên tài liệu nội bộ.',
    icon: IconChat,
    tone: 'bg-violet-50 text-violet-600 ring-violet-100',
    to: '/chatbot',
  },
];

function EmployeeHome({ user }) {
  return (
    <div>
      <PageHeader
        title={`${greetingByHour()}${user?.fullName ? `, ${user.fullName}` : ''}`}
        subtitle={`${formatToday()} · Chấm công, gửi đơn nghỉ phép, xem phiếu lương và hỏi chatbot HR ngay trong hệ thống.`}
      />
      <StaggerList className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {EMPLOYEE_FEATURES.map((feature, i) => {
          const FeatureIcon = feature.icon;
          return (
            <StaggerItem key={feature.title} index={i}>
              <Link to={feature.to} className="block h-full focus-visible:outline-none">
                <Card hover className="h-full p-5">
                  <div
                    className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ring-1 ring-inset ${feature.tone}`}
                  >
                    <FeatureIcon size={20} />
                  </div>
                  <div className="text-[15px] font-semibold text-gray-900">{feature.title}</div>
                  <div className="mt-1 text-sm leading-relaxed text-gray-500">{feature.description}</div>
                </Card>
              </Link>
            </StaggerItem>
          );
        })}
      </StaggerList>
      <DashboardExtras />
      <p className="mt-5 text-[13px] text-gray-500">
        Số liệu thống kê toàn công ty chỉ hiển thị cho Quản trị viên, phòng HR và Trưởng
        phòng theo đúng phạm vi phân quyền.
      </p>
    </div>
  );
}

// ---------- Widget bổ sung (đội E): Thông báo mới nhất + Tháng này ----------
// Hai thẻ phẳng v4 gắn thêm vào cuối Dashboard, không đổi các khối cũ.
// Dữ liệu: announcements qua features/announcements/services; sinh nhật +
// nhân viên mới lọc tại client từ danh sách employees hiện có (theo scope
// của người gọi do backend áp sẵn).

const ANNOUNCEMENT_CATEGORY_LABELS = {
  general: 'Chung',
  policy: 'Chính sách',
  event: 'Sự kiện',
};

function parseLocalDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function DashboardExtras() {
  const announcementsQuery = useQuery({
    queryKey: ['announcements', 'latest'],
    queryFn: async () => (await getAnnouncements({ limit: 3 })).items,
    staleTime: 60_000,
    retry: 1,
  });
  const employeesQuery = useQuery({
    queryKey: ['employees', 'dashboard-this-month'],
    queryFn: async () => (await getEmployees({ limit: 100 })).items,
    staleTime: 60_000,
    retry: 1,
  });

  const announcements = announcementsQuery.data || [];
  const employees = employeesQuery.data || [];
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const monthLabel = `Tháng ${month + 1}/${year}`;

  const birthdays = employees
    .map((e) => ({ employee: e, date: parseLocalDate(e.date_of_birth || e.dateOfBirth) }))
    .filter((x) => x.date && x.date.getMonth() === month)
    .sort((a, b) => a.date.getDate() - b.date.getDate());
  const newJoiners = employees
    .map((e) => ({ employee: e, date: parseLocalDate(e.start_date || e.startDate) }))
    .filter((x) => x.date && x.date.getMonth() === month && x.date.getFullYear() === year)
    .sort((a, b) => a.date - b.date);

  return (
    <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* Thông báo mới nhất */}
      <Card className="lg:col-span-2">
        <CardHeader
          title="Thông báo mới nhất"
          subtitle="Thông báo chính thức mới nhất của công ty"
          actions={
            <Link to="/announcements" className={LINK_BUTTON_SECONDARY}>
              Xem tất cả
            </Link>
          }
        />
        {announcementsQuery.isLoading ? (
          <div className="space-y-3 px-5 py-4" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : announcements.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {announcements.map((item) => (
              <li key={item.id}>
                <Link
                  to="/announcements"
                  className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-gray-50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
                    <IconBell size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-gray-900">{item.title}</span>
                      {item.isPinned ? (
                        <Badge tone="amber" dot>
                          Đã ghim
                        </Badge>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-gray-500">
                      {ANNOUNCEMENT_CATEGORY_LABELS[item.category] || 'Chung'}
                      {item.createdAt ? ` · ${formatDate(item.createdAt)}` : ''}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <CardBody>
            <p className="text-sm text-gray-500">Chưa có thông báo nào.</p>
          </CardBody>
        )}
      </Card>

      {/* Tháng này: sinh nhật + nhân viên mới */}
      <Card>
        <CardHeader title={monthLabel} subtitle="Sinh nhật và nhân viên mới trong tháng" />
        {employeesQuery.isLoading ? (
          <div className="space-y-3 px-5 py-4" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : (
          <div className="px-5 py-2">
            <p className="pt-2 text-[13px] font-medium text-gray-500">
              Sinh nhật ({birthdays.length})
            </p>
            {birthdays.length > 0 ? (
              birthdays.slice(0, 4).map(({ employee, date }) => (
                <div key={`bd-${employee.id}`} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[13px] font-semibold text-brand-700">
                    {initialsOf(employee.full_name || employee.fullName)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                    {employee.full_name || employee.fullName}
                  </span>
                  <span className="shrink-0 text-[13px] tabular-nums text-gray-500">
                    {String(date.getDate()).padStart(2, '0')}/{String(month + 1).padStart(2, '0')}
                  </span>
                </div>
              ))
            ) : (
              <p className="py-2 text-sm text-gray-500">Không có sinh nhật nào trong tháng.</p>
            )}
            <p className="border-t border-gray-100 pt-3 text-[13px] font-medium text-gray-500">
              Nhân viên mới ({newJoiners.length})
            </p>
            {newJoiners.length > 0 ? (
              newJoiners.slice(0, 4).map(({ employee, date }) => (
                <div key={`nj-${employee.id}`} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-50 text-[13px] font-semibold text-gray-600 ring-1 ring-inset ring-gray-200">
                    {initialsOf(employee.full_name || employee.fullName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      {employee.full_name || employee.fullName}
                    </span>
                    {employee.department_name || employee.departmentName ? (
                      <span className="block truncate text-[13px] text-gray-500">
                        {employee.department_name || employee.departmentName}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[13px] tabular-nums text-gray-500">
                    {formatDate(date.toISOString())}
                  </span>
                </div>
              ))
            ) : (
              <p className="py-2 text-sm text-gray-500">Chưa có nhân viên mới trong tháng.</p>
            )}
          </div>
        )}
      </Card>
    </section>
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

  if (isEmployee) {
    return (
      <div className="page-shell">
        <EmployeeHome user={user} />
      </div>
    );
  }

  const roleLabel = ROLE_LABELS[role] || 'Người dùng';
  const scopeText =
    role === 'manager'
      ? 'Số liệu trong phạm vi phòng ban bạn quản lý'
      : role === 'admin' || role === 'hr'
        ? 'Số liệu toàn công ty'
        : '';

  const header = (
    <PageHeader
      title={`${greetingByHour()}${user?.fullName ? `, ${user.fullName}` : ''}`}
      subtitle={`${formatToday()} · Vai trò: ${roleLabel}${scopeText ? ` · ${scopeText}` : ''}`}
      actions={
        <>
          <Link to="/attendance" className={LINK_BUTTON_SECONDARY}>
            Xem chấm công
          </Link>
          <Link to="/leave" className={LINK_BUTTON_PRIMARY}>
            Duyệt phép
          </Link>
        </>
      }
    />
  );

  return (
    <div className="page-shell">
      {header}
      {isLoading ? (
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
          {/* Hàng 1: 4 thẻ số liệu phẳng */}
          <section className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={<IconUsers size={20} />}
              label="Tổng nhân viên"
              value={data.totalEmployees}
              sub={`${data.totalDepartments} phòng ban đang hoạt động`}
              tone="blue"
            />
            <StatCard
              icon={<IconClock size={20} />}
              label="Đã chấm công hôm nay"
              value={data.attendanceToday.present + data.attendanceToday.late}
              sub={`Đúng giờ ${data.attendanceToday.present} · Muộn ${data.attendanceToday.late} · Vắng ${data.attendanceToday.absent} · Nghỉ phép ${data.attendanceToday.onLeave}`}
              tone="teal"
            />
            <StatCard
              icon={<IconClipboard size={20} />}
              label="Đơn phép chờ duyệt"
              value={data.pendingLeaveCount}
              sub={data.pendingLeaveCount > 0 ? 'Đang chờ quyết định của bạn' : 'Không có đơn nào đang chờ'}
              tone="amber"
            />
            <StatCard
              icon={<IconFileText size={20} />}
              label="Hợp đồng sắp hết hạn"
              value={data.expiringContracts.length}
              sub="Hợp đồng còn dưới 30 ngày hiệu lực"
              tone="slate"
            />
          </section>

          {/* Hàng 2: biểu đồ chấm công (2/3) + Cần xử lý (1/3) */}
          <section className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Chuyên cần hôm nay"
                subtitle="Phân bổ trạng thái chấm công trong ngày theo số liệu tổng quan"
              />
              <CardBody>
                {data.attendanceChart.some((item) => item.value > 0) ? (
                  <div style={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer>
                      <BarChart data={data.attendanceChart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid stroke="#EAECF0" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#667085' }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#667085' }} />
                        <Tooltip formatter={(value) => [`${value} người`, 'Số lượng']} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={800}>
                          {data.attendanceChart.map((entry) => (
                            <Cell key={entry.name} fill={ATTENDANCE_COLORS[entry.name] || '#274FEA'} />
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

            {/* Cần xử lý — danh sách việc chờ quyết định */}
            <Card>
              <CardHeader title="Cần xử lý" subtitle="Những việc đang chờ bạn quyết định" />
              <div className="px-5 py-2">
                <div className="flex items-center gap-3 border-b border-gray-100 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
                    <IconClipboard size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">Đơn phép chờ duyệt</p>
                    <p className="mt-0.5 text-[13px] text-gray-500">
                      {data.pendingLeaveCount > 0
                        ? `Có ${data.pendingLeaveCount} đơn đang chờ quyết định`
                        : 'Không có đơn nào đang chờ'}
                    </p>
                  </div>
                  <Badge tone={data.pendingLeaveCount > 0 ? 'amber' : 'slate'} dot>
                    {data.pendingLeaveCount}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 border-b border-gray-100 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-200">
                    <IconFileText size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">Hợp đồng sắp hết hạn</p>
                    <p className="mt-0.5 text-[13px] text-gray-500">
                      {data.expiringContracts.length > 0
                        ? `${data.expiringContracts.length} hợp đồng còn dưới 30 ngày hiệu lực`
                        : 'Không có hợp đồng nào sắp hết hạn'}
                    </p>
                  </div>
                  <Badge tone={data.expiringContracts.length > 0 ? 'amber' : 'slate'} dot>
                    {data.expiringContracts.length}
                  </Badge>
                </div>
                {data.openJobs != null && (
                  <div className="flex items-center gap-3 border-b border-gray-100 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-200">
                      <IconBriefcase size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">Vị trí đang tuyển</p>
                      <p className="mt-0.5 text-[13px] text-gray-500">Tin tuyển dụng đang mở trên hệ thống</p>
                    </div>
                    <Badge tone="blue" dot>
                      {data.openJobs}
                    </Badge>
                  </div>
                )}
                {data.totalCandidates != null && (
                  <div className="flex items-center gap-3 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-200">
                      <IconUsers size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">Ứng viên trong hệ thống</p>
                      <p className="mt-0.5 text-[13px] text-gray-500">Tổng số hồ sơ ứng viên đã tiếp nhận</p>
                    </div>
                    <Badge tone="blue" dot>
                      {data.totalCandidates}
                    </Badge>
                  </div>
                )}
              </div>
              <div className="border-t border-gray-100 px-5 py-4">
                <Link to="/leave" className={`${LINK_BUTTON_PRIMARY} w-full`}>
                  Mở hàng chờ duyệt phép
                </Link>
              </div>
            </Card>
          </section>

          {/* Hàng 3: cơ cấu phòng ban + đơn nghỉ phép gần đây */}
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card>
              <CardHeader
                title="Cơ cấu nhân sự theo phòng ban"
                subtitle={`${data.totalDepartments} phòng ban đang hoạt động`}
              />
              <CardBody>
                {data.byDepartment.length > 0 ? (
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={data.byDepartment}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={56}
                          outerRadius={88}
                          paddingAngle={1}
                          isAnimationActive
                          animationDuration={800}
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {data.byDepartment.map((entry, index) => (
                            <Cell key={entry.name} fill={DEPARTMENT_COLORS[index % DEPARTMENT_COLORS.length]} />
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

            <Card className="lg:col-span-2">
              <CardHeader
                title="Đơn nghỉ phép gần đây"
                subtitle="Các đơn đang chờ duyệt trong dữ liệu tổng quan"
              />
              {data.pendingLeaves.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Nhân viên</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Loại phép</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Thời gian</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Số ngày</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.pendingLeaves.slice(0, 6).map((item, index) => (
                        <tr
                          key={item.id ?? index}
                          className="border-t border-gray-100 transition-colors hover:bg-gray-50"
                        >
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-3">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[13px] font-semibold text-brand-700">
                                {initialsOf(item.employeeName)}
                              </span>
                              <span className="font-medium text-gray-900">{item.employeeName}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{item.leaveType}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {item.fromDate ? formatDate(item.fromDate) : ''}
                            {item.toDate ? ` → ${formatDate(item.toDate)}` : ''}
                          </td>
                          <td className="tabular-nums px-4 py-3 text-gray-600">
                            {item.daysCount ? `${item.daysCount} ngày` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={LEAVE_STATUS_TONES[item.status] || 'amber'} dot>
                              {LEAVE_STATUS_LABELS[item.status] || 'Đang chờ duyệt'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={<IconClipboard size={26} />}
                  title="Không có đơn nghỉ nào đang chờ"
                  description="Mọi đơn nghỉ phép đã được xử lý. Khi có đơn mới, chúng sẽ hiện ở đây."
                />
              )}
            </Card>
          </section>

          {/* Hàng 4 (đội E): thông báo mới nhất + tháng này */}
          <DashboardExtras />
        </>
      )}
    </div>
  );
}
