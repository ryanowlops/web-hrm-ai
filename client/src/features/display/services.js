// Service layer cho Màn hình sảnh (Display / chế độ TV) — mở rộng v5 mục C.
// TÁI DÙNG services của các feature sở hữu dữ liệu (không gọi API trùng):
//   - Kudo + Cột mốc:  features/kudos/services        (GET /engagement/...)
//   - Bảng điểm:       features/rewards/services      (GET /gamification/leaderboard)
//   - Thông báo:       features/announcements/services(GET /announcements)
//   - Tổng quan:       features/dashboard/services    (GET /stats/overview, đã chuẩn hoá)
//   - Hoạt động:       features/feed/services         (GET /feed/activity)
// File này chỉ CHUẨN HOÁ hình dạng dữ liệu về cấu trúc thống nhất cho các
// cảnh TV (chịu được cả biến thể snake_case/camelCase của từng serializer).
import { getActivity, timeAgo } from '../feed/services';
import { getKudos, getMilestones } from '../kudos/services';
import { getLeaderboard } from '../rewards/services';
import { getAnnouncements } from '../announcements/services';
import { fetchOverview } from '../dashboard/services';

export { timeAgo };

function pick(obj, keys, fallback = undefined) {
  if (!obj || typeof obj !== 'object') return fallback;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return fallback;
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ---------- Cảnh 1: Vinh danh ----------

/** Kudo mới nhất: [{ id, toName, fromName, badgeLabel, message, createdAt }] */
export async function getDisplayKudos() {
  const { items } = await getKudos({ limit: 5 });
  return (items || []).map((k) => ({
    id: pick(k, ['id']),
    toName: pick(k, ['to_name', 'toName', 'to'], 'Đồng nghiệp'),
    fromName: pick(k, ['from_name', 'fromName', 'from'], ''),
    badgeLabel: pick(k, ['badge_label', 'badgeLabel'], ''),
    message: pick(k, ['message', 'content'], ''),
    createdAt: pick(k, ['created_at', 'createdAt'], null),
  }));
}

/** Top 5 điểm thưởng: [{ key, name, department, totalEarned, balance }] */
export async function getDisplayLeaderboard() {
  const { items } = await getLeaderboard(5);
  return (items || []).map((row, idx) => {
    const emp = row?.employee;
    const name =
      (emp && typeof emp === 'object' ? emp.full_name || emp.name : null) ||
      (typeof emp === 'string' ? emp : null) ||
      pick(row, ['employee_name', 'full_name', 'name'], '—');
    const deptRaw = (emp && typeof emp === 'object' ? emp.department : null) ?? row?.department;
    const department =
      deptRaw && typeof deptRaw === 'object'
        ? deptRaw.name || ''
        : pick(row, ['department_name'], typeof deptRaw === 'string' ? deptRaw : '');
    return {
      key: pick(row, ['employee_id'], pick(emp || {}, ['id'], idx)),
      name,
      department: department || '',
      totalEarned: Number(pick(row, ['total_earned', 'totalEarned'], 0)) || 0,
      balance: Number(pick(row, ['balance'], 0)) || 0,
    };
  });
}

// ---------- Cảnh 2: Cột mốc tháng này ----------

function normalizeMilestone(item, kind) {
  return {
    key: `${kind}-${pick(item, ['employee_id', 'employeeId', 'id'], Math.random())}`,
    name: pick(item, ['name', 'full_name', 'fullName'], 'Đồng nghiệp'),
    code: pick(item, ['code', 'employee_code', 'employeeCode'], ''),
    department: pick(item, ['department', 'department_name', 'departmentName'], ''),
    day: pick(item, ['day'], null),
    date: pick(item, ['date'], null),
    years: pick(item, ['years'], null),
  };
}

/** { birthdays: [...], anniversaries: [...] } của tháng hiện tại. */
export async function getDisplayMilestones() {
  const data = await getMilestones(currentMonthValue());
  return {
    birthdays: (data?.birthdays || []).map((i) => normalizeMilestone(i, 'birthday')),
    anniversaries: (data?.anniversaries || []).map((i) => normalizeMilestone(i, 'anniversary')),
  };
}

// ---------- Cảnh 3: Thông báo ----------

const CATEGORY_LABELS = {
  general: 'Chung',
  policy: 'Chính sách',
  event: 'Sự kiện',
};

/** 3 thông báo mới nhất: [{ id, title, content, categoryLabel, authorName, createdAt, isPinned }] */
export async function getDisplayAnnouncements() {
  const { items } = await getAnnouncements({ limit: 3 });
  return (items || []).map((a) => {
    const category = pick(a, ['category'], 'general');
    return {
      id: pick(a, ['id']),
      title: pick(a, ['title'], 'Thông báo'),
      content: pick(a, ['content'], ''),
      categoryLabel: CATEGORY_LABELS[category] || 'Chung',
      authorName: pick(a, ['authorName', 'author_name'], 'Phòng nhân sự'),
      createdAt: pick(a, ['createdAt', 'created_at'], null),
      isPinned: Boolean(pick(a, ['isPinned', 'is_pinned'], false)),
    };
  });
}

// ---------- Cảnh 4: Nhịp công ty ----------

/** Số liệu tổng quan đã chuẩn hoá bởi dashboard/services.fetchOverview. */
export async function getDisplayOverview() {
  const o = await fetchOverview();
  const att = o.attendanceToday || {};
  return {
    totalEmployees: o.totalEmployees || 0,
    totalDepartments: o.totalDepartments || 0,
    presentToday: (att.present || 0) + (att.late || 0),
    onLeaveToday: att.onLeave || 0,
    absentToday: att.absent || 0,
    attendanceRate: o.attendanceRate ?? null,
    pendingLeaveCount: o.pendingLeaveCount || 0,
  };
}

/** Dòng hoạt động mới nhất: [{ key, type, text, at }] */
export async function getDisplayActivity() {
  const items = await getActivity({ limit: 6 });
  return (Array.isArray(items) ? items : []).map((item, idx) => ({
    key: `${item.type || 'act'}-${item.at || idx}-${idx}`,
    type: item.type || 'post',
    text: item.text || '',
    at: item.at || null,
  }));
}
