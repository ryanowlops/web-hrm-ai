/**
 * constants.js — Hằng số nghiệp vụ dùng chung toàn app:
 * nhãn tiếng Việt + tone (màu Badge) cho vai trò và các trạng thái.
 * Nhãn/tone được khớp với cách hiển thị hiện hữu trong các page
 * (LeavePage, AttendancePage, RecruitmentPage, JobDetailPage).
 */

/** Nhãn vai trò người dùng theo mã role của backend. */
export const ROLE_LABELS = {
  admin: 'Quản trị viên',
  hr: 'Nhân sự',
  manager: 'Trưởng phòng',
  employee: 'Nhân viên',
};

/** Tone Badge theo vai trò: admin violet, hr blue, manager amber, employee slate. */
export const ROLE_TONES = {
  admin: 'violet',
  hr: 'blue',
  manager: 'amber',
  employee: 'slate',
};

/**
 * Trạng thái đơn nghỉ phép: nhãn + tone.
 * pending = chờ quản lý duyệt, manager_approved = chờ HR duyệt (cấp 2).
 */
export const LEAVE_STATUS = {
  pending: { label: 'Chờ quản lý duyệt', tone: 'amber' },
  manager_approved: { label: 'Chờ HR duyệt', tone: 'sky' },
  approved: { label: 'Đã duyệt', tone: 'emerald' },
  rejected: { label: 'Đã từ chối', tone: 'rose' },
  cancelled: { label: 'Đã huỷ', tone: 'slate' },
};

/** Trạng thái chấm công trong ngày: nhãn + tone. */
export const ATTENDANCE_STATUS = {
  present: { label: 'Đúng giờ', tone: 'emerald' },
  late: { label: 'Đi muộn', tone: 'amber' },
  absent: { label: 'Vắng', tone: 'rose' },
  on_leave: { label: 'Nghỉ phép', tone: 'sky' },
  missing_checkout: { label: 'Thiếu giờ ra', tone: 'orange' },
};

/** Trạng thái tin tuyển dụng: nhãn + tone. */
export const JOB_STATUS = {
  open: { label: 'Đang tuyển', tone: 'emerald' },
  closed: { label: 'Đã đóng', tone: 'slate' },
};

/**
 * Trạng thái hồ sơ ứng viên: nhãn + tone.
 * Khớp backend hiện tại: new / reviewing / interview / passed / rejected.
 * offer và hired để sẵn cho bước mở rộng quy trình tuyển dụng.
 */
export const APPLICATION_STATUS = {
  new: { label: 'Mới nộp', tone: 'sky' },
  reviewing: { label: 'Đang xem xét', tone: 'amber' },
  interview: { label: 'Mời phỏng vấn', tone: 'violet' },
  offer: { label: 'Đã gửi offer', tone: 'blue' },
  passed: { label: 'Đạt', tone: 'emerald' },
  hired: { label: 'Đã tuyển', tone: 'emerald' },
  rejected: { label: 'Đã loại', tone: 'rose' },
};
