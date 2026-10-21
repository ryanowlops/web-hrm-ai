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
  Skeleton,
} from '../../../components/ui';
import AnimatedNumber from '../../../components/motion/AnimatedNumber.jsx';
import ProgressRing from '../../../components/motion/ProgressRing.jsx';
import PulseBar from '../../../components/motion/PulseBar.jsx';
import StaggerList, { StaggerItem } from '../../../components/motion/StaggerList.jsx';
import { getCurrentUser } from '../../auth/services';
import { fetchOverview } from '../services';

// ============================================================
// Trang Dashboard — route "/" — Design v3 "Nhịp nhân sự"
// - Hero Ink Navy "Nhịp hôm nay": thanh nhịp (PulseBar) vẽ theo dữ liệu
//   chấm công thật từ GET /stats/overview, các mốc giờ làm việc
//   07:30 / 12:00 / 13:00 / 17:30 sáng dần theo giờ thật.
// - Bố cục bất đối xứng: biểu đồ (2/3) + cột "Cần xử lý" (1/3),
//   hàng dưới: hội nhập nhân viên mới + vòng chuyên cần.
// - Employee: hero chào + thanh nhịp ngày làm việc + lối tắt cá nhân.
// Logic/dữ liệu giữ nguyên v2 — chỉ thay lớp trình bày.
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

function greetingByHour() {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 13) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

// Mốc nhịp ngày làm việc 07:30 → 17:30 + tiến độ ngày theo giờ thật.
function dayRhythm() {
  const now = new Date();
  const t = now.getHours() * 60 + now.getMinutes();
  const start = 7 * 60 + 30;
  const noon = 12 * 60;
  const back = 13 * 60;
  const end = 17 * 60 + 30;
  const pct = Math.max(0, Math.min(100, ((t - start) / (end - start)) * 100));
  return {
    pct,
    milestones: [
      { at: 0, label: '07:30', done: t >= start },
      { at: (noon - start) / (end - start), label: '12:00', done: t >= noon },
      { at: (back - start) / (end - start), label: '13:00', done: t >= back },
      { at: 1, label: '17:30', done: t >= end },
    ],
  };
}

// ---------- Trạng thái đang tải ----------

function DashboardSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="mb-5 h-[190px] rounded-3xl" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Skeleton className="h-[320px] lg:col-span-2" />
        <Skeleton className="h-[320px]" />
      </div>
    </div>
  );
}

// ---------- Hero "Nhịp hôm nay" (HR / Manager / Admin) ----------

function TodayPulseHero({ user, data }) {
  const rhythm = dayRhythm();
  const att = data.attendanceToday;
  const scheduled = att.present + att.late + att.absent + att.onLeave;
  const checkedIn = att.present + att.late;
  const pulseValue = scheduled > 0 ? (checkedIn / scheduled) * 100 : rhythm.pct;
  return (
    <section className="relative mb-6 overflow-hidden rounded-3xl bg-navy-950 text-white shadow-lift">
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-navy-900 via-navy-950 to-brand-950" />
      <div aria-hidden="true" className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="relative flex flex-col gap-6 px-6 py-6 sm:px-8 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium capitalize text-slate-300">{formatToday()}</p>
          <h1 className="mt-1 font-display text-[28px] font-bold leading-tight lg:text-[32px]">
            {greetingByHour()}{user?.fullName ? `, ${user.fullName}` : ''}
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            Nhịp hôm nay — <span className="tnum font-semibold text-white">{checkedIn}/{scheduled || data.totalEmployees}</span> đã
            chấm công · <span className="tnum font-semibold text-accent-300">{att.onLeave}</span> đang nghỉ phép
            {att.late > 0 ? <> · <span className="tnum font-semibold text-amber-300">{att.late}</span> đi muộn</> : null}
            {att.absent > 0 ? <> · <span className="tnum font-semibold text-rose-300">{att.absent}</span> vắng</> : null}
          </p>
          <PulseBar value={pulseValue} milestones={rhythm.milestones} className="mt-6 max-w-xl" />
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-[13px] text-slate-300">
            <span>Tổng nhân viên: <AnimatedNumber value={data.totalEmployees} className="font-bold text-white" /></span>
            <span>Phòng ban: <AnimatedNumber value={data.totalDepartments} className="font-bold text-white" /></span>
            {data.openJobs != null && (
              <span>Đang tuyển: <AnimatedNumber value={data.openJobs} className="font-bold text-white" /> vị trí</span>
            )}
          </div>
        </div>
        <div className="flex flex-none items-center gap-4 rounded-2xl bg-white/[0.06] px-5 py-4 ring-1 ring-white/10">
          <ProgressRing
            value={data.attendanceRate ?? pulseValue}
            size={96}
            stroke={9}
            color="#0DB795"
            track="rgba(255,255,255,0.14)"
            labelClassName="text-white"
            subClassName="text-slate-300"
            sub="chuyên cần"
          />
          <div className="text-sm leading-relaxed text-slate-300">
            <p className="font-display text-[15px] font-bold text-white">Chuyên cần hôm nay</p>
            <p className="mt-1">
              Đúng giờ <span className="tnum font-semibold text-white">{att.present}</span> · Muộn{' '}
              <span className="tnum font-semibold text-white">{att.late}</span>
            </p>
            <p>
              Nghỉ phép <span className="tnum font-semibold text-white">{att.onLeave}</span> · Vắng{' '}
              <span className="tnum font-semibold text-white">{att.absent}</span>
            </p>
          </div>
        </div>
      </div>
    </section>
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
  const rhythm = dayRhythm();
  return (
    <div>
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-navy-950 text-white shadow-lift">
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-navy-900 via-navy-950 to-brand-950" />
        <div className="relative px-6 py-6 sm:px-8">
          <p className="text-sm font-medium capitalize text-slate-300">{formatToday()}</p>
          <h1 className="mt-1 font-display text-[28px] font-bold leading-tight">
            {greetingByHour()}{user?.fullName ? `, ${user.fullName}` : ''}
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-300">
            Đây là nhịp ngày làm việc của bạn. Chấm công, gửi đơn nghỉ phép, xem phiếu
            lương và hỏi chatbot HR ngay trong hệ thống.
          </p>
          <PulseBar value={rhythm.pct} milestones={rhythm.milestones} className="mt-6 max-w-xl" />
        </div>
      </section>
      <StaggerList className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {EMPLOYEE_FEATURES.map((feature, i) => {
          const FeatureIcon = feature.icon;
          return (
            <StaggerItem key={feature.title} index={i}>
              <Link to={feature.to} className="block h-full focus-visible:outline-none">
                <Card hover className="h-full p-5">
                  <div
                    className={`mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-inset ${feature.tone}`}
                  >
                    <FeatureIcon size={21} />
                  </div>
                  <div className="font-display font-bold text-slate-900">{feature.title}</div>
                  <div className="mt-1 text-sm leading-relaxed text-slate-500">{feature.description}</div>
                </Card>
              </Link>
            </StaggerItem>
          );
        })}
      </StaggerList>
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
  const hasAttendanceData = data?.attendanceChart?.some((item) => item.value > 0);

  return (
    <div className="page-shell">
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
          <TodayPulseHero user={user} data={data} />
          <p className="mb-5 -mt-2 text-[13px] text-slate-500">
            Vai trò: {roleLabel}
            {role === 'manager' ? ' · Số liệu trong phạm vi phòng ban bạn quản lý' : ''}
            {role === 'admin' || role === 'hr' ? ' · Số liệu toàn công ty' : ''}
          </p>

          {/* Hàng chính bất đối xứng: biểu đồ 2/3 + Cần xử lý 1/3 */}
          <section className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Cơ cấu nhân sự theo phòng ban" subtitle={`${data.totalDepartments} phòng ban đang hoạt động`} />
              <CardBody>
                {data.byDepartment.length > 0 ? (
                  <div style={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={data.byDepartment}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={58}
                          outerRadius={92}
                          paddingAngle={2}
                          isAnimationActive
                          animationDuration={800}
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

            {/* Cần xử lý — hàng chờ hành động */}
            <Card className={data.pendingLeaveCount > 0 ? 'ring-1 ring-amber-200' : ''}>
              <CardHeader
                title="Cần xử lý"
                subtitle="Những việc đang chờ bạn quyết định"
                actions={
                  <Badge tone={data.pendingLeaveCount > 0 ? 'amber' : 'slate'} dot>
                    <AnimatedNumber value={data.pendingLeaveCount} /> đơn phép
                  </Badge>
                }
              />
              <div className="px-2.5 py-2">
                {data.pendingLeaves.length > 0 ? (
                  <ul>
                    {data.pendingLeaves.slice(0, 4).map((item, index) => (
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
                    description="Mọi đơn nghỉ phép đã được xử lý. Khi có đơn mới, chúng sẽ hiện ở đây."
                  />
                )}
                <div className="space-y-1.5 px-2.5 py-3 text-sm text-slate-600">
                  <p className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2"><IconFileText size={16} /> Hợp đồng sắp hết hạn</span>
                    <span className="tnum font-bold text-slate-900"><AnimatedNumber value={data.expiringContracts.length} /></span>
                  </p>
                  {data.openJobs != null && (
                    <p className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2"><IconBriefcase size={16} /> Vị trí đang tuyển</span>
                      <span className="tnum font-bold text-slate-900"><AnimatedNumber value={data.openJobs} /></span>
                    </p>
                  )}
                  {data.totalCandidates != null && (
                    <p className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2"><IconUsers size={16} /> Ứng viên trong hệ thống</span>
                      <span className="tnum font-bold text-slate-900"><AnimatedNumber value={data.totalCandidates} /></span>
                    </p>
                  )}
                </div>
                <div className="px-2.5 pb-3">
                  <Link to="/leave" className="inline-flex w-full items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30">
                    Mở hàng chờ duyệt phép
                  </Link>
                </div>
              </div>
            </Card>
          </section>

          {/* Hàng dưới: chuyên cần + hội nhập + hợp đồng */}
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader title="Chuyên cần hôm nay" />
              <CardBody>
                {hasAttendanceData ? (
                  <div style={{ width: '100%', height: 240 }}>
                    <ResponsiveContainer>
                      <BarChart data={data.attendanceChart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(value) => [`${value} người`, 'Số lượng']} />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={800}>
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

            <Card>
              <CardHeader title="Hội nhập nhân viên mới" subtitle="Nhân viên bắt đầu làm việc trong tháng này" />
              <CardBody>
                <div className="flex items-center gap-5">
                  <ProgressRing
                    value={
                      data.totalEmployees > 0 && data.newEmployeesThisMonth != null
                        ? (data.newEmployeesThisMonth / data.totalEmployees) * 100
                        : 0
                    }
                    size={92}
                    color="#274FEA"
                    label={data.newEmployeesThisMonth != null ? `${data.newEmployeesThisMonth}` : '—'}
                    sub="nhân viên mới"
                  />
                  <div className="min-w-0 text-sm leading-relaxed text-slate-600">
                    <p>
                      Tháng này có <span className="tnum font-bold text-slate-900">{data.newEmployeesThisMonth ?? 0}</span> nhân
                      viên mới và <span className="tnum font-bold text-slate-900">{data.resignedThisMonth ?? 0}</span> trường
                      hợp nghỉ việc.
                    </p>
                    <p className="mt-2 text-slate-500">
                      Theo dõi tiến độ hội nhập chi tiết trong hồ sơ từng nhân viên. Module
                      Onboarding theo checklist đang nằm trong lộ trình mở rộng đã duyệt.
                    </p>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={`Hợp đồng sắp hết hạn (${data.expiringContracts.length})`} />
              {data.expiringContracts.length > 0 ? (
                <ul className="px-2.5 py-2">
                  {data.expiringContracts.slice(0, 4).map((item, index) => (
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
                  description="Danh sách sẽ hiển thị hợp đồng còn dưới 30 ngày hiệu lực để HR chủ động gia hạn."
                />
              )}
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
