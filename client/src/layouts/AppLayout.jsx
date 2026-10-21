import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../app/AuthContext.jsx';
import { prefetchRoute } from '../app/pages.js';
import { notificationsApi } from '../api/index.js';
import { fetchOverview } from '../features/dashboard/services';
import { getAnnouncements } from '../features/announcements/services';
import { getEmployees } from '../features/employees/services';
import PageTransition from '../components/motion/PageTransition.jsx';
import ActivePill from '../components/motion/ActivePill.jsx';
import { useMediaQuery } from '../hooks/useMediaQuery.js';

// Layout chính cho khu vực đã đăng nhập (design system v4 — bám shadcn-admin):
// sidebar TRẮNG 264px border-r gray-200 (thu gọn 76px ở desktop), mục đang
// chọn nền phẳng brand-50 qua ActivePill, topbar trắng 64px có ô tìm kiếm
// kiểu ⌘K + chuông thông báo chấm đỏ, nội dung nền gray-50.
// PageTransition bọc Outlet theo pathname. Logic giữ nguyên 100%.

const ROLE_LABELS = {
  admin: 'Quản trị viên',
  hr: 'Nhân sự (HR)',
  manager: 'Trưởng phòng',
  employee: 'Nhân viên',
};

function Icon({ paths }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: '0 0 auto' }}
    >
      {paths}
    </svg>
  );
}

const ICONS = {
  dashboard: (
    <Icon
      paths={
        <>
          <rect x="3" y="3" width="7.5" height="9" rx="1.5" />
          <rect x="13.5" y="3" width="7.5" height="5.5" rx="1.5" />
          <rect x="13.5" y="12" width="7.5" height="9" rx="1.5" />
          <rect x="3" y="15.5" width="7.5" height="5.5" rx="1.5" />
        </>
      }
    />
  ),
  employees: (
    <Icon
      paths={
        <>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20c.9-3.6 3.4-5.4 6.5-5.4s5.6 1.8 6.5 5.4" />
          <path d="M16 5.2a3.5 3.5 0 0 1 0 5.9M18.4 14.9c1.7.8 2.7 2.4 3.1 5.1" />
        </>
      }
    />
  ),
  departments: (
    <Icon
      paths={
        <>
          <rect x="4" y="3" width="12" height="18" rx="1.5" />
          <path d="M16 9h3a1.5 1.5 0 0 1 1.5 1.5V21M2.5 21h19M8 7.5h2M8 11.5h2M8 15.5h2" />
        </>
      }
    />
  ),
  attendance: (
    <Icon
      paths={
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </>
      }
    />
  ),
  leave: (
    <Icon
      paths={
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4M8 15h3" />
        </>
      }
    />
  ),
  payroll: (
    <Icon
      paths={
        <>
          <rect x="2.5" y="6" width="19" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.8" />
          <path d="M6 9.5h.01M18 14.5h.01" />
        </>
      }
    />
  ),
  recruitment: (
    <Icon
      paths={
        <>
          <rect x="3" y="7.5" width="18" height="12.5" rx="2" />
          <path d="M9 7.5V6a3 3 0 0 1 3-3v0a3 3 0 0 1 3 3v1.5M3 13h18" />
        </>
      }
    />
  ),
  chatbot: (
    <Icon
      paths={
        <>
          <path d="M21 12a8 8 0 0 1-8 8H4l2.3-2.9A8 8 0 1 1 21 12Z" />
          <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" />
        </>
      }
    />
  ),
  performance: (
    <Icon
      paths={
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1" />
        </>
      }
    />
  ),
  onboarding: (
    <Icon
      paths={
        <>
          <circle cx="10" cy="8" r="3.5" />
          <path d="M3.5 20c.8-3.4 3.2-5.2 6.5-5.2 1.3 0 2.5.3 3.5.8" />
          <path d="M18.5 8.5v6M15.5 11.5h6" />
        </>
      }
    />
  ),
  orgChart: (
    <Icon
      paths={
        <>
          <rect x="9" y="2.5" width="6" height="5" rx="1" />
          <rect x="2.5" y="16.5" width="6" height="5" rx="1" />
          <rect x="15.5" y="16.5" width="6" height="5" rx="1" />
          <path d="M12 7.5v4M5.5 16.5v-5h13v5" />
        </>
      }
    />
  ),
  teamCalendar: (
    <Icon
      paths={
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
          <path d="m9 15.5 2 2 4-4" />
        </>
      }
    />
  ),
  assets: (
    <Icon
      paths={
        <>
          <rect x="3" y="4.5" width="18" height="11" rx="1.5" />
          <path d="M2 19.5h20" />
        </>
      }
    />
  ),
  training: (
    <Icon
      paths={
        <>
          <path d="M2.5 9.5 12 4l9.5 5.5L12 15 2.5 9.5Z" />
          <path d="M6.5 11.8V16c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3v-4.2" />
          <path d="M21.5 9.5V15" />
        </>
      }
    />
  ),
  announcements: (
    <Icon
      paths={
        <>
          <path d="m3 11 18-6v14L3 13v-2Z" />
          <path d="M11.6 12.4v5.1a1.9 1.9 0 0 1-3.8 0v-4.2" />
        </>
      }
    />
  ),
  reports: (
    <Icon
      paths={
        <>
          <path d="M3 3v16a2 2 0 0 0 2 2h16" />
          <path d="M7 15v3M12 10v8M17 6v12" />
        </>
      }
    />
  ),
  shifts: (
    <Icon
      paths={
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      }
    />
  ),
  documents: (
    <Icon
      paths={
        <>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
        </>
      }
    />
  ),
  offboarding: (
    <Icon
      paths={
        <>
          <circle cx="10" cy="8" r="3.5" />
          <path d="M3.5 20c.8-3.4 3.2-5.2 6.5-5.2 1.3 0 2.5.3 3.5.8" />
          <path d="M15.5 17.5h6" />
        </>
      }
    />
  ),
  kudos: (
    <Icon
      paths={
        <>
          <circle cx="12" cy="9" r="6" />
          <path d="M8.6 13.8 7 22l5-2.9L17 22l-1.6-8.2" />
        </>
      }
    />
  ),
  surveys: (
    <Icon
      paths={
        <>
          <rect x="5.5" y="4.5" width="13" height="17" rx="2" />
          <path d="M9.5 4.5a2.5 2.5 0 0 1 5 0" />
          <path d="M9 11h6M9 15h6" />
        </>
      }
    />
  ),
  attrition: (
    <Icon
      paths={
        <>
          <path d="m3 7 6 6 4-4 8 8" />
          <path d="M15 17h6v-6" />
        </>
      }
    />
  ),
  feed: (
    <Icon
      paths={
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M7 9.5h4M7 13.5h10M7 17.5h10" />
        </>
      }
    />
  ),
  rewards: (
    <Icon
      paths={
        <>
          <rect x="3.5" y="8" width="17" height="4" />
          <path d="M5 12v7.5A1.5 1.5 0 0 0 6.5 21h11A1.5 1.5 0 0 0 19 19.5V12M12 8v13" />
          <path d="M12 8c-2.8 0-4.2-1-4.2-2.4C7.8 4 9.2 3.2 10.3 3.7 12 4.4 12 8 12 8ZM12 8c2.8 0 4.2-1 4.2-2.4 0-1.6-1.4-2.4-2.5-1.9C12 4.4 12 8 12 8Z" />
        </>
      }
    />
  ),
  journey: (
    <Icon
      paths={
        <>
          <circle cx="6" cy="19" r="2.5" />
          <circle cx="18" cy="5" r="2.5" />
          <path d="M8.5 19H15a3 3 0 0 0 0-6h-6a3 3 0 0 1 0-6h.6" />
        </>
      }
    />
  ),
  admin: (
    <Icon
      paths={
        <>
          <path d="M12 3 5 5.8v5.4c0 4.5 3 7.7 7 9.3 4-1.6 7-4.8 7-9.3V5.8L12 3Z" />
          <path d="m9.2 11.8 2 2 3.8-4" />
        </>
      }
    />
  ),
  logout: (
    <Icon
      paths={
        <>
          <path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7M10 12h11M18 8.5 21.5 12 18 15.5" />
        </>
      }
    />
  ),
};

// Icon phụ cho topbar / chân sidebar (cùng phong cách nét với ICONS).
const searchIcon = (
  <Icon
    paths={
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20.5 20.5-4-4" />
      </>
    }
  />
);
const bellIcon = (
  <Icon
    paths={
      <>
        <path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.7 8-2.7 8h17.4s-2.7-1.5-2.7-8" />
        <path d="M10.4 20a2 2 0 0 0 3.2 0" />
      </>
    }
  />
);
const globeIcon = (
  <Icon
    paths={
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3c2.7 2.6 4 5.6 4 9s-1.3 6.4-4 9c-2.7-2.6-4-5.6-4-9s1.3-6.4 4-9Z" />
      </>
    }
  />
);

const NAV_ITEMS = [
  { to: '/', label: 'Tổng quan', icon: ICONS.dashboard, end: true },
  { to: '/employees', label: 'Nhân viên', icon: ICONS.employees },
  {
    to: '/departments',
    label: 'Phòng ban',
    icon: ICONS.departments,
    roles: ['admin', 'hr', 'manager'],
  },
  { to: '/attendance', label: 'Chấm công', icon: ICONS.attendance },
  { to: '/leave', label: 'Nghỉ phép', icon: ICONS.leave },
  { to: '/payroll', label: 'Bảng lương', icon: ICONS.payroll },
  { to: '/performance', label: 'Hiệu suất', icon: ICONS.performance },
  { to: '/onboarding', label: 'Hội nhập', icon: ICONS.onboarding },
  { to: '/shifts', label: 'Ca làm', icon: ICONS.shifts },
  { to: '/documents', label: 'Hồ sơ & giấy tờ', icon: ICONS.documents },
  { to: '/org-chart', label: 'Sơ đồ tổ chức', icon: ICONS.orgChart },
  { to: '/team-calendar', label: 'Lịch team', icon: ICONS.teamCalendar },
  { to: '/offboarding', label: 'Nghỉ việc', icon: ICONS.offboarding },
  { to: '/assets', label: 'Tài sản', icon: ICONS.assets },
  { to: '/training', label: 'Đào tạo', icon: ICONS.training },
  {
    to: '/recruitment',
    label: 'Tuyển dụng',
    icon: ICONS.recruitment,
    roles: ['admin', 'hr', 'manager'],
  },
  { to: '/chatbot', label: 'Chatbot HR', icon: ICONS.chatbot },
  {
    to: '/attrition-risk',
    label: 'Nguy cơ nghỉ việc',
    icon: ICONS.attrition,
    roles: ['admin', 'hr', 'manager'],
  },
  { to: '/announcements', label: 'Thông báo', icon: ICONS.announcements },
  { to: '/kudos', label: 'Vinh danh', icon: ICONS.kudos },
  { to: '/surveys', label: 'Khảo sát', icon: ICONS.surveys },
  { to: '/feed', label: 'Bảng tin', icon: ICONS.feed },
  { to: '/my-journey', label: 'Hành trình của tôi', icon: ICONS.journey },
  { to: '/rewards', label: 'Cửa hàng quà', icon: ICONS.rewards },
  { to: '/reports', label: 'Báo cáo', icon: ICONS.reports },
  { to: '/admin', label: 'Quản trị', icon: ICONS.admin, roles: ['admin'] },
];

// Nhóm menu hiển thị trong sidebar (giữ nguyên thứ tự của NAV_ITEMS).
const NAV_GROUPS = [
  { label: 'Menu chính', paths: ['/'] },
  {
    label: 'Quản lý',
    paths: ['/employees', '/departments', '/attendance', '/leave', '/payroll', '/performance', '/onboarding', '/shifts', '/documents'],
  },
  { label: 'Tổ chức', paths: ['/org-chart', '/team-calendar', '/offboarding'] },
  { label: 'Vận hành', paths: ['/assets', '/training'] },
  { label: 'Tuyển dụng & AI', paths: ['/recruitment', '/chatbot', '/attrition-risk'] },
  { label: 'Truyền thông', paths: ['/announcements', '/reports', '/kudos', '/surveys', '/feed'] },
  { label: 'Trải nghiệm', paths: ['/my-journey', '/rewards'] },
  { label: 'Hệ thống', paths: ['/admin'] },
];

function groupNavItems(items) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => group.paths.includes(item.to)),
  })).filter((group) => group.items.length > 0);
}

function getInitials(user) {
  const name = String(user?.fullName || user?.email || 'Người dùng').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'ND';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const navLinkClass = ({ isActive }) =>
  [
    'group relative flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/30',
    isActive
      ? 'font-medium text-brand-700'
      : 'text-gray-700 hover:bg-gray-50',
  ].join(' ');

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  // Sidebar thu gọn (chỉ áp dụng ở desktop lg+; mobile giữ dạng thanh ngang).
  const [collapsed, setCollapsed] = useState(false);
  const sidebarWidth = isDesktop ? (collapsed ? 76 : 264) : undefined;
  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user?.role));
  const navSections = groupNavItems(visibleItems);
  const displayName = user?.fullName || user?.email || 'Người dùng';
  const roleLabel = user?.role ? ROLE_LABELS[user.role] || user.role : null;

  // Nạp trước dữ liệu của trang Tổng quan ngay khi layout hiện (tức ngay sau
  // đăng nhập) — dùng đúng queryKey/queryFn của DashboardPage nên khi người
  // dùng vào trang chủ, số liệu đã có sẵn trong cache, hiện gần như tức thì.
  const queryClient = useQueryClient();
  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: ['stats', 'overview'],
      queryFn: fetchOverview,
      staleTime: 60_000,
    });
    queryClient.prefetchQuery({
      queryKey: ['announcements', 'latest'],
      queryFn: async () => (await getAnnouncements({ limit: 3 })).items,
      staleTime: 60_000,
    });
    queryClient.prefetchQuery({
      queryKey: ['employees', 'dashboard-this-month'],
      queryFn: async () => (await getEmployees({ limit: 100 })).items,
      staleTime: 60_000,
    });
  }, [queryClient]);

  // Số thông báo chưa đọc cho chấm đỏ trên chuông (chỉ hiển thị, lỗi thì ẩn).
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    notificationsApi
      .unreadCount()
      .then((res) => {
        const body = res?.data ?? res;
        const count = body?.count ?? body?.unread_count ?? body?.unreadCount ?? 0;
        if (!cancelled) setUnreadCount(Number(count) || 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-gray-50 text-gray-800 lg:flex-row">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:left-0 focus:top-0 focus:z-[60] focus:rounded-br-lg focus:bg-brand-600 focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-white"
        href="#main-content"
      >
        Bỏ qua tới nội dung chính
      </a>

      {/* ============================ SIDEBAR ============================ */}
      <motion.aside
        className="flex w-full flex-none flex-col border-b border-gray-200 bg-white text-gray-700 lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r"
        animate={sidebarWidth ? { width: sidebarWidth } : undefined}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
      >
        {/* Khối logo */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
          <img
            src="/logo.svg"
            alt=""
            aria-hidden="true"
            className="h-8 w-8 flex-none rounded-lg"
          />
          <span className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
            <span className="block truncate text-[15px] font-semibold leading-tight text-gray-900">
              Web HRM AI
            </span>
            <span className="block truncate text-xs leading-tight text-gray-500">
              Quản lý nhân sự
            </span>
          </span>
          {/* Nút thu/mở sidebar (desktop) */}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
            title={collapsed ? 'Mở rộng' : 'Thu gọn'}
            className={`ml-auto hidden h-8 w-8 flex-none items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/30 lg:flex ${collapsed ? 'lg:ml-0' : ''}`}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {/* Menu theo role, chia nhóm */}
        <nav
          className="nice-scroll flex gap-1 overflow-x-auto px-3 py-3 lg:flex-1 lg:flex-col lg:gap-0 lg:overflow-x-hidden lg:overflow-y-auto lg:py-4"
          aria-label="Điều hướng chính"
        >
          {navSections.map((section) => (
            <div key={section.label} className="flex items-start gap-1 lg:mt-5 lg:block lg:first:mt-0">
              <p className={`hidden px-3 pb-1.5 text-xs font-medium text-gray-500 lg:block ${collapsed ? 'lg:invisible' : ''}`}>
                {section.label}
              </p>
              <div className="flex gap-1 lg:flex-col lg:gap-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={navLinkClass}
                    title={collapsed ? item.label : undefined}
                    onMouseEnter={() => prefetchRoute(item.to)}
                    onFocus={() => prefetchRoute(item.to)}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive ? (
                          <ActivePill
                            layoutId="sidebar-active"
                            className="absolute inset-0 rounded-lg bg-brand-50"
                          />
                        ) : null}
                        <span
                          className={`relative z-10 transition-colors duration-150 ${
                            isActive ? 'text-brand-600' : 'text-gray-400 group-hover:text-gray-500'
                          }`}
                        >
                          {item.icon}
                        </span>
                        <span className={`relative z-10 truncate ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Chân sidebar: link công khai + thẻ người dùng */}
        <div className="mt-auto hidden border-t border-gray-200 p-3 lg:block">
          <NavLink
            to="/jobs"
            onMouseEnter={() => prefetchRoute('/jobs')}
            onFocus={() => prefetchRoute('/jobs')}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/30"
          >
            <span className="text-gray-400">{globeIcon}</span>
            <span className={collapsed ? 'lg:hidden' : ''}>Trang tuyển dụng công khai</span>
          </NavLink>

          <div className="flex items-center gap-3 px-3 py-2">
            <span
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700"
              aria-hidden="true"
            >
              {getInitials(user)}
            </span>
            <span className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
              <span className="block truncate text-sm font-medium leading-tight text-gray-900">
                {displayName}
              </span>
              {roleLabel ? (
                <span className="block truncate text-xs leading-tight text-gray-500">
                  {roleLabel}
                </span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={logout}
              aria-label="Đăng xuất"
              title="Đăng xuất"
              className={`ml-auto flex h-8 w-8 flex-none items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/30 ${collapsed ? 'lg:hidden' : ''}`}
            >
              {ICONS.logout}
            </button>
          </div>
        </div>
      </motion.aside>

      {/* ============================ THÂN TRANG ============================ */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar trắng */}
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
          <div className="flex h-16 items-center gap-3 px-4 sm:gap-4 sm:px-5 lg:px-8">
            {/* Ô tìm kiếm kiểu shadcn-admin (trình bày, giữ hành vi hiện có) */}
            <div className="relative hidden w-full max-w-sm md:block">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                {searchIcon}
              </span>
              <input
                type="search"
                aria-label="Tìm kiếm"
                placeholder="Tìm kiếm..."
                className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-14 text-sm text-gray-700 transition placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/20"
              />
              <kbd
                className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium text-gray-500"
                aria-hidden="true"
              >
                ⌘K
              </kbd>
            </div>
            <div className="min-w-0 flex-1 md:hidden">
              <span className="block truncate text-sm font-medium text-gray-900">
                {displayName}
              </span>
            </div>

            <div className="ml-auto flex items-center gap-2.5 sm:gap-3.5">
              {/* Chuông thông báo — bấm vào mở trang Thông báo đầy đủ */}
              <button
                type="button"
                onClick={() => navigate('/notifications')}
                aria-label={unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : 'Thông báo'}
                className="relative flex h-10 w-10 flex-none items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/20"
              >
                {bellIcon}
                {unreadCount > 0 ? (
                  <>
                    <span className="sr-only">{unreadCount} thông báo chưa đọc</span>
                    <span
                      className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#F04438] ring-2 ring-white"
                      aria-hidden="true"
                    />
                  </>
                ) : null}
              </button>

              {/* Khối người dùng */}
              <div className="hidden items-center gap-2.5 sm:flex">
                <span
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white"
                  aria-hidden="true"
                >
                  {getInitials(user)}
                </span>
                <span className="min-w-0">
                  <span className="block max-w-[150px] truncate text-sm font-medium leading-tight text-gray-900">
                    {displayName}
                  </span>
                  {roleLabel ? (
                    <span className="block text-xs leading-tight text-gray-500">
                      {roleLabel}
                    </span>
                  ) : null}
                </span>
              </div>

              {/* Đăng xuất */}
              <button
                type="button"
                onClick={logout}
                className="inline-flex h-10 flex-none items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/20"
              >
                {ICONS.logout}
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        <main id="main-content" className="min-w-0 flex-1 bg-gray-50 p-6 lg:p-8" tabIndex={-1}>
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </main>
      </div>
    </div>
  );
}
