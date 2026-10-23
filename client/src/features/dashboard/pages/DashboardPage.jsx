import { Suspense, lazy } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../app/AuthContext.jsx';
import {
  IconAlertTriangle,
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
  IconShield,
  IconSliders,
  IconSparkles,
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
import DeferredMount from '../../../components/motion/DeferredMount.jsx';
import { getCurrentUser } from '../../auth/services';
import { getAnnouncements } from '../../announcements/services';
import LatestKudosWidget from '../../kudos/components/LatestKudosWidget.jsx';
import LatestActivityWidget from '../../feed/components/LatestActivityWidget.jsx';
import { getEmployees } from '../../employees/services';
import { getMyBalances } from '../../leave/services';
import { getMyPayslip } from '../../payroll/services';
import { getMyPoints, getMyBadges } from '../../rewards/services';
import { getToday } from '../../attendance/services';
import { fetchOverview } from '../services';

// Biểu đồ (recharts, chunk ~109KB gzip) nạp lazy + gắn sau khi trang đã vẽ
// xong khung (DeferredMount) — trang hiện số liệu trước, biểu đồ theo sau.
const AttendanceChart = lazy(() =>
  import('../components/DashboardCharts.jsx').then((m) => ({ default: m.AttendanceChart })),
);
const DepartmentChart = lazy(() =>
  import('../components/DashboardCharts.jsx').then((m) => ({ default: m.DepartmentChart })),
);

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

const ATTENDANCE_STATUS_LABELS = {
  present: 'Đúng giờ',
  late: 'Đi muộn',
  absent: 'Vắng',
  on_leave: 'Nghỉ phép',
};

function formatMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${new Intl.NumberFormat('vi-VN').format(num)} đ`;
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

// Hàng 4 thẻ số liệu cá nhân THẬT của chính nhân viên, đặt trên
// EMPLOYEE_FEATURES. Mỗi thẻ dùng một useQuery độc lập với service sẵn có
// (leave/payroll/rewards/attendance): thẻ nào lỗi thì hiện "—", không làm
// sập cả trang.
function EmployeePersonalStats() {
  const year = new Date().getFullYear();

  const balanceQuery = useQuery({
    queryKey: ['dashboard', 'my-leave-balance', year],
    queryFn: () => getMyBalances(year),
    staleTime: 60_000,
    retry: 1,
  });
  const payslipQuery = useQuery({
    queryKey: ['dashboard', 'my-latest-payslip'],
    queryFn: async () => {
      const res = await getMyPayslip();
      const body = res?.data !== undefined ? res.data : res;
      const slip = body?.data ?? body;
      return slip && typeof slip === 'object' ? slip : null;
    },
    staleTime: 60_000,
    retry: 1,
  });
  const pointsQuery = useQuery({
    queryKey: ['dashboard', 'my-points'],
    queryFn: async () => {
      const [pointsResult, badgesResult] = await Promise.allSettled([
        getMyPoints(),
        getMyBadges(),
      ]);
      if (pointsResult.status !== 'fulfilled') throw pointsResult.reason;
      const badges =
        badgesResult.status === 'fulfilled' ? badgesResult.value?.items || [] : [];
      const earned = badges.filter((b) => b.earned);
      return {
        points: pointsResult.value || {},
        latestBadge: earned.length ? earned[earned.length - 1] : null,
      };
    },
    staleTime: 60_000,
    retry: 1,
  });
  const todayQuery = useQuery({
    queryKey: ['dashboard', 'my-attendance-today'],
    queryFn: getToday,
    staleTime: 60_000,
    retry: 1,
  });

  // Phép còn lại: ưu tiên loại "phép năm"; không có thì lấy loại có tổng
  // số ngày lớn nhất trong năm.
  const balances = Array.isArray(balanceQuery.data) ? balanceQuery.data : [];
  const annualBalance =
    balances.find((b) => /phép năm|annual/i.test(b.leave_type_name || '')) ||
    balances.reduce(
      (best, b) => ((b.total_days || 0) > (best?.total_days || 0) ? b : best),
      null,
    );
  const leaveRemaining = annualBalance
    ? (annualBalance.remaining_days ??
      Math.max((annualBalance.total_days || 0) - (annualBalance.used_days || 0), 0))
    : null;

  const slip = payslipQuery.data || null;
  const slipPeriod = slip?.period || {};
  const points = pointsQuery.data?.points || {};
  const latestBadge = pointsQuery.data?.latestBadge || null;
  const today = todayQuery.data || null;
  const checkInTime = formatTime(today?.check_in_at);
  const checkOutTime = formatTime(today?.check_out_at);
  const todayTimes = [
    checkInTime ? `Vào lúc ${checkInTime}` : '',
    checkOutTime ? `Ra lúc ${checkOutTime}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={<IconCalendar size={20} />}
        label={`Phép còn lại năm ${year}`}
        value={
          balanceQuery.isError || leaveRemaining == null ? '—' : `${leaveRemaining} ngày`
        }
        sub={
          annualBalance
            ? `${annualBalance.leave_type_name || 'Phép năm'} · Đã dùng ${annualBalance.used_days ?? 0}/${annualBalance.total_days ?? 0} ngày`
            : 'Chưa có dữ liệu số dư phép'
        }
        tone="blue"
      />
      <StatCard
        icon={<IconMoney size={20} />}
        label="Phiếu lương gần nhất"
        value={slip ? formatMoney(slip.total_salary ?? slip.totalSalary) : '—'}
        sub={
          slip && slipPeriod.month && slipPeriod.year
            ? `Thực lĩnh kỳ lương tháng ${slipPeriod.month}/${slipPeriod.year}`
            : 'Chưa có phiếu lương đã chốt'
        }
        tone="teal"
      />
      <StatCard
        icon={<IconSparkles size={20} />}
        label="Điểm thưởng của tôi"
        value={pointsQuery.isError || points.balance == null ? '—' : points.balance}
        sub={
          latestBadge
            ? `Huy hiệu gần nhất: ${latestBadge.emoji ? `${latestBadge.emoji} ` : ''}${latestBadge.name}`
            : points.total_earned != null
              ? `Đã tích lũy ${points.total_earned} điểm`
              : 'Chưa có dữ liệu điểm thưởng'
        }
        tone="amber"
      />
      <StatCard
        icon={<IconClock size={20} />}
        label="Chấm công hôm nay"
        value={
          todayQuery.isError
            ? '—'
            : today
              ? ATTENDANCE_STATUS_LABELS[today.status] || 'Đã chấm công'
              : 'Chưa check-in'
        }
        sub={
          today
            ? todayTimes || 'Đã ghi nhận chấm công hôm nay'
            : 'Hôm nay bạn chưa ghi nhận chấm công'
        }
        tone="slate"
      />
    </section>
  );
}

function EmployeeHome({ user }) {
  return (
    <div>
      <PageHeader
        title={`${greetingByHour()}${user?.fullName ? `, ${user.fullName}` : ''}`}
        subtitle={`${formatToday()} · Chấm công, gửi đơn nghỉ phép, xem phiếu lương và hỏi chatbot HR ngay trong hệ thống.`}
      />
      <EmployeePersonalStats />
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
      <DeferredMount
        fallback={
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        }
      >
        <DashboardExtras />
      </DeferredMount>
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
    <>
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

    {/* Vinh danh mới nhất (mở rộng v3 — module Engagement) */}
    <LatestKudosWidget />

    {/* Hoạt động mới nhất (mở rộng v4 — module Feed) */}
    <LatestActivityWidget />
    </>
  );
}

// Lối tắt theo vai trò — hàng thẻ phẳng (kiểu EMPLOYEE_FEATURES) ngay dưới
// hàng StatCard, đưa việc hằng ngày của từng vai trò lên trước.
const ROLE_SHORTCUTS = {
  admin: [
    {
      title: 'Quản trị người dùng',
      description: 'Tạo tài khoản, phân quyền và khoá/mở tài khoản hệ thống.',
      icon: IconShield,
      tone: 'bg-violet-50 text-violet-600 ring-violet-100',
      to: '/admin',
    },
    {
      title: 'Nhân viên',
      description: 'Hồ sơ, hợp đồng và thông tin nhân sự toàn công ty.',
      icon: IconUsers,
      tone: 'bg-brand-50 text-brand-600 ring-brand-100',
      to: '/employees',
    },
    {
      title: 'Báo cáo',
      description: 'Số liệu nhân sự, chấm công và lương để xuất báo cáo.',
      icon: IconChart,
      tone: 'bg-accent-50 text-accent-600 ring-accent-100',
      to: '/reports',
    },
    {
      title: 'Cấu hình chấm công QR',
      description: 'Thiết lập mã QR hằng ngày và vị trí văn phòng hợp lệ.',
      icon: IconSliders,
      tone: 'bg-amber-50 text-amber-600 ring-amber-100',
      to: '/checkin-qr',
    },
  ],
  hr: [
    {
      title: 'Tuyển dụng & JD AI',
      description: 'Tin tuyển dụng, ứng viên và tạo JD bằng AI.',
      icon: IconBriefcase,
      tone: 'bg-brand-50 text-brand-600 ring-brand-100',
      to: '/recruitment',
    },
    {
      title: 'Hồ sơ & chứng từ',
      description: 'Quản lý hồ sơ nhân viên và duyệt yêu cầu chứng từ.',
      icon: IconFileText,
      tone: 'bg-accent-50 text-accent-600 ring-accent-100',
      to: '/documents',
    },
    {
      title: 'Onboarding',
      description: 'Lộ trình hội nhập và đầu việc cho nhân viên mới.',
      icon: IconClipboard,
      tone: 'bg-amber-50 text-amber-600 ring-amber-100',
      to: '/onboarding',
    },
    {
      title: 'Báo cáo điều hành',
      description: 'Bản tin điều hành AI tổng hợp từ số liệu thật.',
      icon: IconSparkles,
      tone: 'bg-violet-50 text-violet-600 ring-violet-100',
      to: '/briefing',
    },
  ],
  manager: [
    {
      title: 'Duyệt đơn của team',
      description: 'Đơn nghỉ phép của team đang chờ bạn quyết định.',
      icon: IconClipboard,
      tone: 'bg-brand-50 text-brand-600 ring-brand-100',
      to: '/leave',
    },
    {
      title: 'Lịch team',
      description: 'Ai đang nghỉ, ai đi làm trong team theo tuần/tháng.',
      icon: IconCalendar,
      tone: 'bg-accent-50 text-accent-600 ring-accent-100',
      to: '/team-calendar',
    },
    {
      title: 'Rủi ro nghỉ việc',
      description: 'Điểm rủi ro nghỉ việc của team kèm yếu tố giải thích.',
      icon: IconAlertTriangle,
      tone: 'bg-amber-50 text-amber-600 ring-amber-100',
      to: '/attrition-risk',
    },
    {
      title: 'KPI & OKR team',
      description: 'Mục tiêu và đánh giá hiệu suất của phòng ban.',
      icon: IconChart,
      tone: 'bg-violet-50 text-violet-600 ring-violet-100',
      to: '/performance',
    },
  ],
};

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

  // Nút hành động trên PageHeader theo vai trò; vai trò lạ dùng bộ mặc định.
  const headerActions = {
    admin: (
      <>
        <Link to="/admin" className={LINK_BUTTON_PRIMARY}>
          Quản trị tài khoản
        </Link>
        <Link
          to="/display"
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_BUTTON_SECONDARY}
        >
          Màn hình sảnh
        </Link>
      </>
    ),
    hr: (
      <>
        <Link to="/recruitment" className={LINK_BUTTON_PRIMARY}>
          Tuyển dụng
        </Link>
        <Link to="/briefing" className={LINK_BUTTON_SECONDARY}>
          Báo cáo điều hành
        </Link>
        <Link
          to="/display"
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_BUTTON_SECONDARY}
        >
          Màn hình sảnh
        </Link>
      </>
    ),
    manager: (
      <>
        <Link to="/leave" className={LINK_BUTTON_PRIMARY}>
          Duyệt phép
        </Link>
        <Link to="/team-calendar" className={LINK_BUTTON_SECONDARY}>
          Lịch team
        </Link>
      </>
    ),
  };

  const header = (
    <PageHeader
      title={`${greetingByHour()}${user?.fullName ? `, ${user.fullName}` : ''}`}
      subtitle={`${formatToday()} · Vai trò: ${roleLabel}${scopeText ? ` · ${scopeText}` : ''}`}
      actions={
        headerActions[role] || (
          <>
            <Link
              to="/display"
              target="_blank"
              rel="noopener noreferrer"
              className={LINK_BUTTON_SECONDARY}
            >
              Màn hình sảnh
            </Link>
            <Link to="/attendance" className={LINK_BUTTON_SECONDARY}>
              Xem chấm công
            </Link>
            <Link to="/leave" className={LINK_BUTTON_PRIMARY}>
              Duyệt phép
            </Link>
          </>
        )
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

          {/* Lối tắt theo vai trò — thẻ phẳng kiểu EMPLOYEE_FEATURES */}
          {ROLE_SHORTCUTS[role] ? (
            <section className="mb-5">
              <h2 className="mb-3 text-[15px] font-semibold text-gray-900">
                Lối tắt theo vai trò
              </h2>
              <StaggerList className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {ROLE_SHORTCUTS[role].map((item, i) => {
                  const ItemIcon = item.icon;
                  return (
                    <StaggerItem key={item.to} index={i}>
                      <Link to={item.to} className="block h-full focus-visible:outline-none">
                        <Card hover className="h-full p-5">
                          <div
                            className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ring-1 ring-inset ${item.tone}`}
                          >
                            <ItemIcon size={20} />
                          </div>
                          <div className="text-[15px] font-semibold text-gray-900">{item.title}</div>
                          <div className="mt-1 text-sm leading-relaxed text-gray-500">
                            {item.description}
                          </div>
                        </Card>
                      </Link>
                    </StaggerItem>
                  );
                })}
              </StaggerList>
            </section>
          ) : null}

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
                    <DeferredMount fallback={<Skeleton className="h-full w-full" />}>
                      <Suspense fallback={<Skeleton className="h-full w-full" />}>
                        <AttendanceChart data={data.attendanceChart} />
                      </Suspense>
                    </DeferredMount>
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

            {/* Cần xử lý — danh sách việc chờ quyết định.
                Dữ liệu overview đã được server giới hạn theo vai trò (manager
                chỉ thấy phạm vi phòng mình) và services.js chỉ chuẩn hoá các
                số tổng hợp (đơn phép chờ, hợp đồng sắp hết hạn...) chứ không
                có danh sách task theo loại (ca/OT/sửa chấm công) để lọc an
                toàn tại client — nên giữ nguyên danh sách, chỉ đổi subtitle
                theo vai trò. */}
            <Card>
              <CardHeader
                title="Cần xử lý"
                subtitle={
                  role === 'manager'
                    ? 'Việc chờ duyệt trong phạm vi team của bạn'
                    : 'Những việc đang chờ bạn quyết định'
                }
              />
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
                    <DeferredMount fallback={<Skeleton className="h-full w-full" />}>
                      <Suspense fallback={<Skeleton className="h-full w-full" />}>
                        <DepartmentChart data={data.byDepartment} />
                      </Suspense>
                    </DeferredMount>
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
          <DeferredMount
        fallback={
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        }
      >
        <DashboardExtras />
      </DeferredMount>
        </>
      )}
    </div>
  );
}
