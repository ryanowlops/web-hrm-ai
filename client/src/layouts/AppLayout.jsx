import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../app/AuthContext.jsx';

// Layout chính cho khu vực đã đăng nhập: sidebar theo role + header + Outlet.
// Icon dùng SVG nội tuyến (không dùng emoji). Style tối thiểu nằm ngay trong
// file này; worker design-system có thể thay bằng hệ class dùng chung sau,
// giữ nguyên các class hrm-* dưới đây để không phải sửa JSX.

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

const LAYOUT_CSS = `
.hrm-shell{display:flex;min-height:100dvh;background:#f8fafc;color:#0f172a}
.hrm-skip{position:absolute;left:-9999px;top:0;background:#1d4ed8;color:#fff;padding:.6rem 1rem;z-index:60;border-radius:0 0 .5rem 0}
.hrm-skip:focus{left:0}
.hrm-sidebar{width:248px;flex:0 0 248px;background:#fff;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;position:sticky;top:0;height:100dvh}
.hrm-brand{display:flex;align-items:center;gap:.6rem;padding:1rem 1.1rem;font-weight:700;font-size:1.05rem;color:#0f172a;border-bottom:1px solid #e2e8f0}
.hrm-brand-badge{width:30px;height:30px;border-radius:8px;background:#1d4ed8;color:#fff;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto}
.hrm-nav{padding:.75rem;display:flex;flex-direction:column;gap:2px;overflow-y:auto}
.hrm-nav-link{display:flex;align-items:center;gap:.6rem;padding:.55rem .7rem;border-radius:.55rem;color:#334155;text-decoration:none;font-size:.925rem;font-weight:500;transition:background-color .16s ease,color .16s ease}
.hrm-nav-link:hover{background:#f1f5f9;color:#0f172a}
.hrm-nav-link.is-active{background:#dbeafe;color:#1e40af;font-weight:600}
.hrm-nav-link:focus-visible,.hrm-logout:focus-visible,.hrm-public-link:focus-visible{outline:2px solid #1d4ed8;outline-offset:2px}
.hrm-sidebar-foot{margin-top:auto;padding:.9rem 1.1rem;border-top:1px solid #e2e8f0}
.hrm-public-link{color:#1e40af;font-size:.875rem;font-weight:600;text-decoration:none}
.hrm-public-link:hover{text-decoration:underline}
.hrm-body{flex:1;min-width:0;display:flex;flex-direction:column}
.hrm-header{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.8rem 1.5rem;background:#fff;border-bottom:1px solid #e2e8f0;position:sticky;top:0;z-index:20}
.hrm-user{display:flex;align-items:center;gap:.65rem;min-width:0}
.hrm-user-name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hrm-role-badge{background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:999px;padding:.1rem .55rem;font-size:.75rem;font-weight:600;white-space:nowrap}
.hrm-logout{display:inline-flex;align-items:center;gap:.45rem;border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:.55rem;padding:.45rem .8rem;font-size:.875rem;font-weight:600;cursor:pointer;transition:background-color .16s ease}
.hrm-logout:hover{background:#f1f5f9}
.hrm-main{flex:1;padding:1.5rem;max-width:1280px;width:100%;margin:0 auto}
@media (prefers-reduced-motion: reduce){.hrm-nav-link,.hrm-logout{transition:none}}
@media (max-width: 860px){
  .hrm-shell{flex-direction:column}
  .hrm-sidebar{width:100%;flex:none;height:auto;position:static;border-right:none;border-bottom:1px solid #e2e8f0}
  .hrm-nav{flex-direction:row;overflow-x:auto;overflow-y:hidden;padding:.6rem}
  .hrm-nav-link{white-space:nowrap}
  .hrm-sidebar-foot{display:none}
  .hrm-main{padding:1rem}
}
`;

export default function AppLayout() {
  const { user, logout } = useAuth();
  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user?.role));

  return (
    <div className="hrm-shell">
      <style>{LAYOUT_CSS}</style>
      <a className="hrm-skip" href="#main-content">
        Bỏ qua tới nội dung chính
      </a>

      <aside className="hrm-sidebar">
        <div className="hrm-brand">
          <span className="hrm-brand-badge" aria-hidden="true">
            <svg
              width="17"
              height="17"
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
          Web HRM AI
        </div>

        <nav className="hrm-nav" aria-label="Điều hướng chính">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `hrm-nav-link${isActive ? ' is-active' : ''}`}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hrm-sidebar-foot">
          <NavLink className="hrm-public-link" to="/jobs">
            Trang tuyển dụng công khai
          </NavLink>
        </div>
      </aside>

      <div className="hrm-body">
        <header className="hrm-header">
          <div className="hrm-user">
            <span className="hrm-user-name">{user?.fullName || user?.email || 'Người dùng'}</span>
            {user?.role ? (
              <span className="hrm-role-badge">{ROLE_LABELS[user.role] || user.role}</span>
            ) : null}
          </div>
          <button type="button" className="hrm-logout" onClick={logout}>
            {ICONS.logout}
            Đăng xuất
          </button>
        </header>

        <main id="main-content" className="hrm-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
