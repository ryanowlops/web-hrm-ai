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
import { getCurrentUser } from '../../auth/services';
import { fetchOverview } from '../services';

// ============================================================
// Trang Dashboard — route "/"
// - Admin / HR / Manager: thẻ thống kê + biểu đồ từ GET /stats/overview
//   (server đã giới hạn phạm vi theo vai trò: Manager chỉ thấy phòng mình),
//   danh sách việc cần chú ý: đơn nghỉ chờ duyệt, hợp đồng sắp hết hạn.
// - Employee: màn hình chào + lối tắt tính năng cá nhân (không gọi API thống kê).
// Trạng thái: skeleton khi đang tải, EmptyState khi chưa có dữ liệu,
// hộp lỗi + nút thử lại khi API thất bại.
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

const CHART_COLORS = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];

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

// ---------- Khối giao diện nhỏ dùng trong trang ----------

function StatCard({ title, value, sub, highlight }) {
  return (
    <div
      className="card"
      style={highlight ? { borderColor: '#f59e0b', background: '#fffbeb' } : undefined}
    >
      <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ color: '#6b7280', fontSize: 13, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div
      style={{
        border: '1px dashed #d1d5db',
        borderRadius: 8,
        padding: '24px 16px',
        textAlign: 'center',
        color: '#6b7280',
      }}
    >
      <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>{title}</div>
      {description && <div style={{ fontSize: 14 }}>{description}</div>}
    </div>
  );
}

function SkeletonBlock({ height = 120 }) {
  return (
    <div
      className="skeleton"
      style={{ background: '#e5e7eb', borderRadius: 8, minHeight: height, width: '100%' }}
    />
  );
}

function DashboardSkeleton() {
  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <SkeletonBlock height={110} />
        <SkeletonBlock height={110} />
        <SkeletonBlock height={110} />
        <SkeletonBlock height={110} />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
        }}
      >
        <SkeletonBlock height={300} />
        <SkeletonBlock height={300} />
      </div>
    </div>
  );
}

// ---------- Phần dành cho Employee ----------

const EMPLOYEE_FEATURES = [
  {
    title: 'Chấm công',
    description: 'Check-in / check-out hằng ngày và xem lại bảng công của chính bạn theo tháng.',
  },
  {
    title: 'Nghỉ phép',
    description: 'Gửi đơn xin nghỉ, theo dõi trạng thái duyệt 2 cấp và số ngày phép còn lại.',
  },
  {
    title: 'Phiếu lương',
    description: 'Xem phiếu lương chi tiết của bạn ngay khi HR chốt kỳ lương hằng tháng.',
  },
  {
    title: 'Chatbot HR',
    description: 'Hỏi nhanh về quy chế, ngày phép, phúc lợi — AI trả lời dựa trên tài liệu nội bộ.',
  },
];

function EmployeeHome({ user }) {
  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>
          Xin chào{user?.fullName ? `, ${user.fullName}` : ''}!
        </h2>
        <p style={{ margin: 0, color: '#6b7280' }}>
          Hôm nay là {formatToday()}. Bạn có thể chấm công, gửi đơn nghỉ phép, xem phiếu
          lương và hỏi chatbot HR ngay trong hệ thống.
        </p>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        {EMPLOYEE_FEATURES.map((feature) => (
          <div key={feature.title} className="card">
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{feature.title}</div>
            <div style={{ color: '#6b7280', fontSize: 14 }}>{feature.description}</div>
          </div>
        ))}
      </div>
      <p style={{ color: '#6b7280', fontSize: 13, marginTop: 16 }}>
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
    <div>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 24 }}>
          Xin chào{user?.fullName ? `, ${user.fullName}` : ''}
        </h1>
        <p style={{ margin: 0, color: '#6b7280' }}>
          {formatToday()} · Vai trò: {roleLabel}
          {role === 'manager' ? ' · Số liệu trong phạm vi phòng ban bạn quản lý' : ''}
          {(role === 'admin' || role === 'hr') ? ' · Số liệu toàn công ty' : ''}
        </p>
      </header>

      {isEmployee ? (
        <EmployeeHome user={user} />
      ) : isLoading ? (
        <DashboardSkeleton />
      ) : isError ? (
        <div className="card" role="alert">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Không tải được số liệu tổng quan</div>
          <p style={{ color: '#6b7280', margin: '0 0 12px' }}>
            {error?.response?.data?.error?.message ||
              'Đã xảy ra lỗi khi gọi máy chủ. Vui lòng thử lại.'}
          </p>
          <button type="button" className="btn" onClick={() => refetch()}>
            Thử lại
          </button>
        </div>
      ) : !data ? (
        <EmptyState
          title="Chưa có dữ liệu thống kê"
          description="Hệ thống chưa trả về số liệu. Hãy thêm nhân viên và dữ liệu chấm công để bắt đầu."
        />
      ) : (
        <>
          {/* Thẻ thống kê */}
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
              marginBottom: 16,
            }}
          >
            <StatCard
              title="Tổng số nhân viên"
              value={data.totalEmployees}
              sub={
                data.newEmployeesThisMonth != null || data.resignedThisMonth != null
                  ? `Tháng này: +${data.newEmployeesThisMonth ?? 0} mới / −${data.resignedThisMonth ?? 0} nghỉ việc`
                  : undefined
              }
            />
            <StatCard title="Số phòng ban" value={data.totalDepartments} />
            <StatCard
              title="Tỷ lệ chuyên cần hôm nay"
              value={data.attendanceRate != null ? `${data.attendanceRate}%` : '—'}
              sub={
                attendanceTotal > 0
                  ? `Đúng giờ ${data.attendanceToday.present} · Đi muộn ${data.attendanceToday.late} · Nghỉ phép ${data.attendanceToday.onLeave} · Vắng ${data.attendanceToday.absent}`
                  : 'Hôm nay chưa có dữ liệu chấm công'
              }
            />
            <StatCard
              title="Đơn nghỉ chờ duyệt"
              value={data.pendingLeaveCount}
              sub={data.pendingLeaveCount > 0 ? 'Cần xử lý sớm để nhân viên chủ động kế hoạch' : 'Không có đơn nào đang chờ'}
              highlight={data.pendingLeaveCount > 0}
            />
            {data.openJobs != null && (
              <StatCard
                title="Vị trí đang tuyển"
                value={data.openJobs}
                sub={data.totalCandidates != null ? `${data.totalCandidates} ứng viên trong hệ thống` : undefined}
              />
            )}
          </section>

          {/* Biểu đồ */}
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div className="card">
              <h2 style={{ margin: '0 0 12px', fontSize: 17 }}>Cơ cấu nhân sự theo phòng ban</h2>
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
                          <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value} nhân viên`, 'Số lượng']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  title="Chưa có dữ liệu phòng ban"
                  description="Thêm phòng ban và gán nhân viên để xem cơ cấu nhân sự."
                />
              )}
            </div>

            <div className="card">
              <h2 style={{ margin: '0 0 12px', fontSize: 17 }}>Chuyên cần hôm nay</h2>
              {hasAttendanceData ? (
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.attendanceChart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 13 }} />
                      <Tooltip formatter={(value) => [`${value} người`, 'Số lượng']} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {data.attendanceChart.map((entry, index) => (
                          <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  title="Hôm nay chưa có dữ liệu chấm công"
                  description="Biểu đồ sẽ xuất hiện khi nhân viên bắt đầu check-in trong ngày."
                />
              )}
            </div>
          </section>

          {/* Việc cần chú ý */}
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 16,
            }}
          >
            <div className="card">
              <h2 style={{ margin: '0 0 12px', fontSize: 17 }}>
                Đơn nghỉ chờ duyệt ({data.pendingLeaveCount})
              </h2>
              {data.pendingLeaves.length > 0 ? (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {data.pendingLeaves.slice(0, 5).map((item, index) => (
                    <li
                      key={item.id ?? index}
                      style={{
                        padding: '10px 0',
                        borderBottom: index < Math.min(data.pendingLeaves.length, 5) - 1 ? '1px solid #f3f4f6' : 'none',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{item.employeeName}</div>
                      <div style={{ color: '#6b7280', fontSize: 14 }}>
                        {item.leaveType}
                        {item.fromDate ? ` · ${formatDate(item.fromDate)}` : ''}
                        {item.toDate ? ` → ${formatDate(item.toDate)}` : ''}
                        {item.daysCount ? ` · ${item.daysCount} ngày` : ''}
                      </div>
                      <div style={{ color: '#d97706', fontSize: 13 }}>
                        {LEAVE_STATUS_LABELS[item.status] || 'Đang chờ duyệt'}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="Không có đơn nghỉ nào đang chờ"
                  description="Mọi đơn nghỉ phép đã được xử lý."
                />
              )}
            </div>

            <div className="card">
              <h2 style={{ margin: '0 0 12px', fontSize: 17 }}>
                Hợp đồng sắp hết hạn ({data.expiringContracts.length})
              </h2>
              {data.expiringContracts.length > 0 ? (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {data.expiringContracts.slice(0, 5).map((item, index) => (
                    <li
                      key={item.id ?? index}
                      style={{
                        padding: '10px 0',
                        borderBottom: index < Math.min(data.expiringContracts.length, 5) - 1 ? '1px solid #f3f4f6' : 'none',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{item.employeeName}</div>
                      <div style={{ color: '#6b7280', fontSize: 14 }}>
                        {item.contractType}
                        {item.departmentName ? ` · ${item.departmentName}` : ''}
                        {item.endDate ? ` · Hết hạn ${formatDate(item.endDate)}` : ''}
                      </div>
                      {item.daysRemaining != null && (
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: item.daysRemaining < 0 ? '#dc2626' : item.daysRemaining <= 7 ? '#dc2626' : '#d97706',
                          }}
                        >
                          {item.daysRemaining < 0
                            ? `Đã hết hạn ${Math.abs(item.daysRemaining)} ngày`
                            : item.daysRemaining === 0
                              ? 'Hết hạn hôm nay'
                              : `Còn ${item.daysRemaining} ngày`}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="Không có hợp đồng nào sắp hết hạn"
                  description="Danh sách sẽ hiển thị hợp đồng còn dưới 30 ngày hiệu lực."
                />
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
