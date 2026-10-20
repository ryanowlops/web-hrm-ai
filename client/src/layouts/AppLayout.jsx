import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../app/AuthContext.jsx';
import { notificationsApi } from '../api/index.js';

// Layout chính cho khu vực đã đăng nhập (design system v2 — enterprise):
// sidebar navy (logo, menu theo role có nhóm + thanh chỉ thị active, thẻ
// người dùng ở đáy) + topbar trắng mờ (tìm kiếm, chuông thông báo, chip
// người dùng, nút Đăng xuất) + vùng nội dung nền canvas (.page-shell ở page).

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
  {
    to: '/recruitment',
    label: 'Tuyển dụng',
    icon: ICONS.recruitment,
    roles: ['admin', 'hr', 'manager'],
  },
  { to: '/chatbot', label: 'Chatbot HR', icon: ICONS.chatbot },
  { to: '/admin', label: 'Quản trị', icon: ICONS.admin, roles: ['admin'] },
];

// Nhóm menu hiển thị trong sidebar (giữ nguyên thứ tự của NAV_ITEMS).
const NAV_GROUPS = [
  { label: 'Menu chính', paths: ['/'] },
  { label: 'Quản lý', paths: ['/employees', '/departments', '/attendance', '/leave', '/payroll'] },
  { label: 'Tuyển dụng & AI', paths: ['/recruitment', '/chatbot'] },
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
    'group relative flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium',
    'transition-all duration-200 ease-spring',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900',
    isActive
      ? 'bg-white/10 font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.09)]'
      : 'text-slate-300/85 hover:translate-x-0.5 hover:bg-white/[0.06] hover:text-white',
  ].join(' ');

export default function AppLayout() {
  const { user, logout } = useAuth();
  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user?.role));
  const navSections = groupNavItems(visibleItems);
  const displayName = user?.fullName || user?.email || 'Người dùng';
  const roleLabel = user?.role ? ROLE_LABELS[user.role] || user.role : null;

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
    <div className="flex min-h-dvh flex-col bg-canvas text-slate-800 lg:flex-row">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:left-0 focus:top-0 focus:z-[60] focus:rounded-br-xl focus:bg-brand-700 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
        href="#main-content"
      >
        Bỏ qua tới nội dung chính
      </a>

      {/* ============================ SIDEBAR ============================ */}
      <aside className="flex w-full flex-none flex-col bg-gradient-to-b from-navy-950 via-navy-900 to-navy-800 text-slate-200 shadow-lift lg:sticky lg:top-0 lg:h-dvh lg:w-[264px]">
        {/* Khối logo */}
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4 lg:py-5">
          <span
            className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-lift ring-1 ring-white/25"
            aria-hidden="true"
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="12" cy="8" r="3.6" />
              <path d="M4.5 20.5c1.2-4 4-6 7.5-6s6.3 2 7.5 6" />
            </svg>
          </span>
          <span className="text-[17px] font-bold leading-tight tracking-tight text-white">
            Web HRM AI
          </span>
          <span
            className="ml-auto h-2 w-2 flex-none rounded-full bg-accent-400 shadow-[0_0_10px_rgba(39,207,169,0.9)] animate-pulse-soft lg:ml-0"
            aria-hidden="true"
          />
        </div>

        {/* Menu theo role, chia nhóm */}
        <nav
          className="nice-scroll flex gap-1 overflow-x-auto px-3 py-3 lg:flex-1 lg:flex-col lg:gap-0 lg:overflow-x-hidden lg:overflow-y-auto lg:py-4"
          aria-label="Điều hướng chính"
        >
          {navSections.map((section) => (
            <div key={section.label} className="flex items-start gap-1 lg:mt-4 lg:block lg:first:mt-0">
              <p className="hidden px-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400/60 lg:block">
                {section.label}
              </p>
              <div className="flex gap-1 lg:flex-col lg:gap-0.5">
                {section.items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
                    {({ isActive }) => (
                      <>
                        {isActive ? (
                          <span
                            aria-hidden="true"
                            className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-accent-400 shadow-[0_0_12px_rgba(39,207,169,0.85)] animate-fade-in"
                          />
                        ) : null}
                        <span
                          className={`transition-colors duration-200 ${
                            isActive ? 'text-accent-300' : 'text-slate-400 group-hover:text-slate-100'
                          }`}
                        >
                          {item.icon}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Chân sidebar: link công khai + thẻ người dùng */}
        <div className="mt-auto hidden space-y-2 border-t border-white/10 p-3 lg:block">
          <NavLink
            to="/jobs"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300/85 transition-all duration-200 ease-spring hover:translate-x-0.5 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/70"
          >
            <span className="text-slate-400">{globeIcon}</span>
            Trang tuyển dụng công khai
          </NavLink>

          <div className="flex items-center gap-3 rounded-xl bg-white/[0.06] px-3 py-2.5 ring-1 ring-white/10">
            <span
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-accent-500 text-xs font-bold text-white ring-2 ring-white/15"
              aria-hidden="true"
            >
              {getInitials(user)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-tight text-white">
                {displayName}
              </span>
              {roleLabel ? (
                <span className="block truncate text-xs leading-tight text-slate-400">
                  {roleLabel}
                </span>
              ) : null}
            </span>
          </div>
        </div>
      </aside>

      {/* ============================ THÂN TRANG ============================ */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar trắng mờ */}
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/75 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 sm:gap-4 sm:px-5 lg:px-8">
            {/* Ô tìm kiếm (trang trí) */}
            <div className="relative hidden w-full max-w-sm md:block">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                {searchIcon}
              </span>
              <input
                type="search"
                aria-label="Tìm kiếm"
                placeholder="Tìm kiếm nhân viên, phòng ban…"
                className="w-full rounded-xl border border-slate-200/90 bg-slate-100/70 py-2 pl-10 pr-4 text-sm text-slate-700 shadow-[inset_0_1px_2px_rgba(16,24,40,0.04)] transition duration-200 ease-spring placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/15"
              />
            </div>
            <div className="min-w-0 flex-1 md:hidden">
              <span className="block truncate text-sm font-semibold text-slate-800">
                {displayName}
              </span>
            </div>

            <div className="ml-auto flex items-center gap-2.5 sm:gap-3.5">
              {/* Chuông thông báo */}
              <button
                type="button"
                aria-label="Thông báo"
                className="relative flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-500 shadow-card transition duration-200 ease-spring hover:-translate-y-px hover:border-brand-200 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20"
              >
                {bellIcon}
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white animate-scale-in">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </button>

              {/* Chip người dùng */}
              <div className="hidden items-center gap-2.5 rounded-full border border-slate-200/90 bg-white py-1.5 pl-1.5 pr-3.5 shadow-card sm:flex">
                <span
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[11px] font-bold text-white"
                  aria-hidden="true"
                >
                  {getInitials(user)}
                </span>
                <span className="min-w-0">
                  <span className="block max-w-[150px] truncate text-[13px] font-semibold leading-tight text-slate-800">
                    {displayName}
                  </span>
                  {roleLabel ? (
                    <span className="block text-[11px] leading-tight text-slate-500">
                      {roleLabel}
                    </span>
                  ) : null}
                </span>
              </div>

              {/* Đăng xuất */}
              <button
                type="button"
                onClick={logout}
                className="inline-flex flex-none items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-card transition duration-200 ease-spring hover:-translate-y-px hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-500/15 sm:px-3.5"
              >
                {ICONS.logout}
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        <main id="main-content" className="min-w-0 flex-1" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
