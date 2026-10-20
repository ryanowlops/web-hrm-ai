import api from '../../api/axiosClient';

// ============================================================
// Dashboard service — Web HRM tích hợp AI
// API: GET /stats/overview (Flask, /api/v1)
// Server trả dữ liệu đã được giới hạn theo vai trò của người gọi:
//   Admin/HR -> toàn công ty, Manager -> phòng ban mình quản lý.
// Hàm fetchOverview chuẩn hoá mọi biến thể tên trường
// (camelCase / snake_case) về một cấu trúc thống nhất cho trang Dashboard.
// ============================================================

function pick(obj, keys, fallback = undefined) {
  if (!obj || typeof obj !== 'object') return fallback;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return fallback;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

// Số ngày còn lại tính từ ngày kết thúc (nếu server chưa trả daysRemaining).
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const end = new Date(dateStr);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOfDay(end) - startOfDay(now)) / 86400000);
}

function normalizeOverview(payload) {
  const body = payload?.data ?? payload ?? {};

  // --- Chấm công hôm nay ---
  const attRaw =
    pick(body, ['attendanceToday', 'attendance_today', 'todayAttendance', 'attendance'], {}) || {};
  const attendanceToday = {
    present: toNumber(pick(attRaw, ['present', 'onTime', 'on_time'])),
    late: toNumber(pick(attRaw, ['late'])),
    absent: toNumber(pick(attRaw, ['absent'])),
    onLeave: toNumber(pick(attRaw, ['onLeave', 'on_leave', 'leave'])),
  };
  const scheduled = attendanceToday.present + attendanceToday.late + attendanceToday.absent + attendanceToday.onLeave;
  const explicitRate = pick(body, ['attendanceRate', 'attendance_rate']);
  const attendanceRate =
    explicitRate !== undefined
      ? Math.round(toNumber(explicitRate) * 10) / 10
      : scheduled > 0
        ? Math.round(((attendanceToday.present + attendanceToday.late) / scheduled) * 1000) / 10
        : null;

  // --- Cơ cấu nhân sự theo phòng ban (cho biểu đồ) ---
  const deptRaw = pick(body, ['employeesByDepartment', 'byDepartment', 'departmentStats', 'departments'], []);
  const byDepartment = (Array.isArray(deptRaw) ? deptRaw : [])
    .map((d) => ({
      name: pick(d, ['name', 'departmentName', 'department_name', 'department', 'title'], 'Chưa rõ phòng'),
      value: toNumber(pick(d, ['value', 'count', 'total', 'employeeCount', 'employee_count', 'headcount'])),
    }))
    .filter((d) => d.value > 0);

  // --- Đơn nghỉ chờ duyệt ---
  const pendingRaw = pick(body, ['pendingLeaveRequests', 'pendingLeaves', 'pending_leave_requests'], null)
    ?? pick(body?.leave || {}, ['items'], []);
  const pendingLeaves = (Array.isArray(pendingRaw) ? pendingRaw : []).map((item) => ({
    id: pick(item, ['id', 'requestId', 'request_id']),
    employeeName: pick(
      item,
      ['employeeName', 'employee_name', 'fullName', 'full_name'],
      pick(item?.employee || {}, ['fullName', 'full_name', 'name'], 'Nhân viên'),
    ),
    leaveType: pick(item, ['leaveType', 'leave_type', 'typeName', 'type'], 'Nghỉ phép'),
    fromDate: pick(item, ['fromDate', 'from_date', 'startDate', 'start_date']),
    toDate: pick(item, ['toDate', 'to_date', 'endDate', 'end_date']),
    daysCount: pick(item, ['daysCount', 'days_count', 'days'], null),
    status: pick(item, ['status'], 'pending'),
  }));
  const pendingLeaveCount =
    typeof pendingRaw === 'number'
      ? pendingRaw
      : toNumber(
          pick(body, ['pendingLeaveCount', 'pending_leave_count'], null)
            ?? pick(body?.leave || {}, ['pendingApproval'], pendingLeaves.length),
        );

  // --- Hợp đồng sắp hết hạn ---
  const contractsRaw = pick(body, ['expiringContracts', 'contractsExpiringSoon', 'expiring_contracts'], null)
    ?? pick(body?.contracts || {}, ['items'], []);
  const expiringContracts = (Array.isArray(contractsRaw) ? contractsRaw : []).map((item) => {
    const endDate = pick(item, ['endDate', 'end_date', 'expiresAt', 'expires_at']);
    const remaining = pick(item, ['daysRemaining', 'days_remaining', 'daysLeft', 'days_left']);
    return {
      id: pick(item, ['id', 'contractId', 'contract_id']),
      employeeName: pick(
        item,
        ['employeeName', 'employee_name', 'fullName', 'full_name'],
        pick(item?.employee || {}, ['fullName', 'full_name', 'name'], 'Nhân viên'),
      ),
      departmentName: pick(item, ['departmentName', 'department_name', 'department'], ''),
      contractType: pick(item, ['contractType', 'contract_type', 'type'], 'Hợp đồng'),
      endDate,
      daysRemaining: remaining !== undefined ? toNumber(remaining) : daysUntil(endDate),
    };
  });

  return {
    totalEmployees: toNumber(pick(body, ['totalEmployees', 'total_employees', 'employeesTotal', 'totalStaff'])),
    totalDepartments: toNumber(pick(body, ['totalDepartments', 'total_departments', 'departmentsTotal'])),
    newEmployeesThisMonth: pick(body, ['newEmployeesThisMonth', 'new_this_month', 'newEmployees'], null),
    resignedThisMonth: pick(body, ['resignedThisMonth', 'resigned_this_month', 'resignedEmployees'], null),
    attendanceRate,
    attendanceToday,
    attendanceChart: [
      { name: 'Đúng giờ', value: attendanceToday.present },
      { name: 'Đi muộn', value: attendanceToday.late },
      { name: 'Nghỉ phép', value: attendanceToday.onLeave },
      { name: 'Vắng', value: attendanceToday.absent },
    ],
    byDepartment,
    pendingLeaveCount,
    pendingLeaves,
    expiringContracts,
    openJobs: pick(body, ['openJobs', 'open_jobs', 'activeJobs', 'openJobPostings'], null),
    totalCandidates: pick(body, ['totalCandidates', 'total_candidates', 'newCandidates'], null),
    raw: body,
  };
}

/**
 * Lấy số liệu tổng quan cho Dashboard (đã chuẩn hoá).
 * Ném lỗi (Axios error) ra ngoài để TanStack Query xử lý trạng thái error.
 */
export async function fetchOverview() {
  const payload = await api.get('/stats/overview');
  return normalizeOverview(payload);
}
