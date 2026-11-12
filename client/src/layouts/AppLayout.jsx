import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@astryxdesign/core/AppShell';
import {
  SideNav,
  SideNavCollapseButton,
  SideNavItem,
  SideNavSection,
} from '@astryxdesign/core/SideNav';
import { TopNav } from '@astryxdesign/core/TopNav';
import { CommandPalette } from '@astryxdesign/core/CommandPalette';
import { createStaticSource } from '@astryxdesign/core/Typeahead';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Icon } from '@astryxdesign/core/Icon';
import { useAuth } from '../app/AuthContext.jsx';
import { prefetchRoute } from '../app/pages.js';
import { notificationsApi } from '../api/index.js';
import { fetchOverview } from '../features/dashboard/services';
import { getAnnouncements } from '../features/announcements/services';
import { getEmployees } from '../features/employees/services';
import PageTransition from '../components/motion/PageTransition.jsx';
import { useMediaQuery } from '../hooks/useMediaQuery.js';

// Layout chính cho khu vực đã đăng nhập — khung Astryx (AppShell +
// SideNav + TopNav + CommandPalette, theme neutral, mode light) thay cho
// khung tự chế v4. Giữ nguyên 100% logic: NAV_ITEMS/nhóm/vai trò, lọc
// theo role + hồ sơ nhân viên, prefetch route khi hover/focus, chuông
// thông báo, thẻ người dùng + đăng xuất, thu gọn sidebar, đồng bộ
// document.title, prefetch dữ liệu tổng quan khi mount. Trang /display TV
// không đi qua layout này nên không bị ảnh hưởng.
// Quy ước Astryx: SideNavItem `icon` chỉ nhận TÊN NGỮ NGHĨA trong
// registry của theme neutral (không còn SVG tự vẽ cho từng mục menu);
// nút chuông/đăng xuất dùng IconButton/Button với icon là ReactNode nên
// giữ nguyên SVG chuông/đăng xuất cũ.

const ROLE_LABELS = {
  admin: 'Quản trị viên',
  hr: 'Nhân sự (HR)',
  manager: 'Trưởng phòng',
  employee: 'Nhân viên',
};

// SVG nhỏ còn giữ lại cho các nút mà registry icon ngữ nghĩa của theme
// neutral không có tên tương ứng (chuông thông báo, quả địa cầu, đăng
// xuất). IconButton/Button nhận icon dạng ReactNode nên đây là cách dùng
// đúng API của chúng — khác với SideNavItem chỉ nhận tên ngữ nghĩa.
function AppIcon({ paths }) {
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

const bellIcon = (
  <AppIcon
    paths={
      <>
        <path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.7 8-2.7 8h17.4s-2.7-1.5-2.7-8" />
        <path d="M10.4 20a2 2 0 0 0 3.2 0" />
      </>
    }
  />
);
const globeIcon = (
  <AppIcon
    paths={
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3c2.7 2.6 4 5.6 4 9s-1.3 6.4-4 9c-2.7-2.6-4-5.6-4-9s1.3-6.4 4-9Z" />
      </>
    }
  />
);
const logoutIcon = (
  <AppIcon
    paths={
      <>
        <path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7M10 12h11M18 8.5 21.5 12 18 15.5" />
      </>
    }
  />
);

// Bảng ánh xạ icon menu: 4 mục giữ tên built-in của theme neutral
// (Chấm công=clock, Nghỉ phép=calendar, Phỏng vấn thử AI=microphone,
// Nguy cơ nghỉ việc=warning); 26 mục còn lại dùng icon riêng hrm:*
// đăng ký trong src/theme/hrmIcons.jsx (registerIcons) — registry
// neutral chỉ có 29 tên chung nên không đủ icon người/phòng ban/tiền...
// Thêm mục mới: dùng tên hrm:* đã đăng ký, hoặc thêm key mới vào
// hrmIcons.jsx trước rồi mới dùng ở đây.
const NAV_ITEMS = [
  { to: '/', label: 'Tổng quan', icon: 'hrm:dashboard', end: true },
  {
    to: '/employees',
    label: 'Nhân viên',
    icon: 'hrm:users',
    roles: ['admin', 'hr', 'manager'],
  },
  {
    to: '/departments',
    label: 'Phòng ban',
    icon: 'hrm:building',
    roles: ['admin', 'hr', 'manager'],
  },
  { to: '/attendance', label: 'Chấm công', icon: 'clock' },
  {
    to: '/checkin-qr',
    label: 'Chấm công QR',
    icon: 'hrm:qrcode',
    roles: ['admin', 'hr'],
  },
  { to: '/leave', label: 'Nghỉ phép', icon: 'calendar' },
  { to: '/payroll', label: 'Bảng lương', icon: 'hrm:payroll' },
  { to: '/performance', label: 'Hiệu suất', icon: 'hrm:performance' },
  // /onboarding giữ cho mọi role: trang có màn "Hội nhập của tôi" — employee
  // tự xem và cập nhật checklist hội nhập của chính mình (tự phục vụ).
  { to: '/onboarding', label: 'Hội nhập', icon: 'hrm:onboarding' },
  { to: '/shifts', label: 'Ca làm', icon: 'hrm:shifts' },
  { to: '/documents', label: 'Hồ sơ & giấy tờ', icon: 'hrm:documents' },
  { to: '/org-chart', label: 'Sơ đồ tổ chức', icon: 'hrm:orgchart', roles: ['admin', 'hr', 'manager'] },
  { to: '/team-calendar', label: 'Lịch team', icon: 'hrm:teamcalendar', roles: ['admin', 'hr', 'manager'] },
  // /skills giữ cho mọi role: tab mặc định "Kỹ năng của tôi" — employee tự
  // cập nhật mức kỹ năng của chính mình; tab Quản trị đã tự ẩn trong trang.
  { to: '/skills', label: 'Bản đồ năng lực', icon: 'hrm:skills' },
  { to: '/mock-interview', label: 'Phỏng vấn thử AI', icon: 'microphone' },
  {
    to: '/offboarding',
    label: 'Nghỉ việc',
    icon: 'hrm:offboarding',
    roles: ['admin', 'hr'],
  },
  { to: '/assets', label: 'Tài sản', icon: 'hrm:assets' },
  { to: '/training', label: 'Đào tạo', icon: 'hrm:training' },
  {
    to: '/recruitment',
    label: 'Tuyển dụng',
    icon: 'hrm:recruitment',
    roles: ['admin', 'hr', 'manager'],
  },
  { to: '/chatbot', label: 'Chatbot HR', icon: 'hrm:chatbot' },
  {
    to: '/attrition-risk',
    label: 'Nguy cơ nghỉ việc',
    icon: 'warning',
    roles: ['admin', 'hr', 'manager'],
  },
  { to: '/announcements', label: 'Thông báo', icon: 'hrm:announcements' },
  { to: '/kudos', label: 'Vinh danh', icon: 'hrm:kudos' },
  { to: '/surveys', label: 'Khảo sát', icon: 'hrm:surveys' },
  { to: '/feed', label: 'Bảng tin', icon: 'hrm:feed' },
  {
    to: '/my-journey',
    label: 'Hành trình của tôi',
    icon: 'hrm:journey',
    needsEmployee: true,
  },
  {
    to: '/rewards',
    label: 'Cửa hàng quà',
    icon: 'hrm:rewards',
    needsEmployee: true,
  },
  {
    to: '/reports',
    label: 'Báo cáo',
    icon: 'hrm:reports',
    roles: ['admin', 'hr', 'manager'],
  },
  {
    to: '/briefing',
    label: 'Báo cáo điều hành',
    icon: 'hrm:briefing',
    roles: ['admin', 'hr'],
  },
  { to: '/admin', label: 'Quản trị', icon: 'hrm:admin', roles: ['admin'] },
];

// Nhóm menu hiển thị trong sidebar. Thứ tự NHÓM được sắp xếp lại theo
// vai trò (ROLE_GROUP_ORDER bên dưới); thứ tự mục trong từng nhóm giữ
// nguyên theo NAV_ITEMS.
const NAV_GROUPS = [
  { id: 'menu-chinh', label: 'Menu chính', paths: ['/'] },
  {
    id: 'quan-ly',
    label: 'Quản lý',
    paths: ['/employees', '/departments', '/attendance', '/checkin-qr', '/leave', '/payroll', '/performance', '/onboarding', '/shifts', '/documents'],
  },
  { id: 'to-chuc', label: 'Tổ chức', paths: ['/org-chart', '/team-calendar', '/offboarding', '/skills'] },
  { id: 'van-hanh', label: 'Vận hành', paths: ['/assets', '/training'] },
  {
    id: 'tuyen-dung-ai',
    label: 'Tuyển dụng & AI',
    paths: ['/recruitment', '/chatbot', '/attrition-risk', '/mock-interview'],
  },
  { id: 'truyen-thong', label: 'Truyền thông', paths: ['/announcements', '/reports', '/briefing', '/kudos', '/surveys', '/feed'] },
  { id: 'trai-nghiem', label: 'Trải nghiệm', paths: ['/my-journey', '/rewards'] },
  { id: 'he-thong', label: 'Hệ thống', paths: ['/admin'] },
];

// Thứ tự ưu tiên nhóm menu theo vai trò: đưa nhóm dùng hằng ngày của từng
// vai trò lên trước. Vai trò không có trong bảng này dùng thứ tự gốc.
const ROLE_GROUP_ORDER = {
  admin: ['menu-chinh', 'he-thong', 'quan-ly', 'to-chuc', 'tuyen-dung-ai', 'truyen-thong', 'van-hanh', 'trai-nghiem'],
  hr: ['menu-chinh', 'quan-ly', 'tuyen-dung-ai', 'to-chuc', 'truyen-thong', 'van-hanh', 'trai-nghiem', 'he-thong'],
  manager: ['menu-chinh', 'quan-ly', 'to-chuc', 'truyen-thong', 'tuyen-dung-ai', 'trai-nghiem', 'van-hanh', 'he-thong'],
  employee: ['menu-chinh', 'trai-nghiem', 'truyen-thong', 'quan-ly', 'van-hanh', 'tuyen-dung-ai', 'to-chuc', 'he-thong'],
};

function groupNavItems(items, role) {
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => group.paths.includes(item.to)),
  })).filter((group) => group.items.length > 0);
  const order = ROLE_GROUP_ORDER[role];
  if (!order) return groups;
  const rank = new Map(order.map((id, index) => [id, index]));
  return groups.sort(
    (a, b) => (rank.get(a.id) ?? order.length) - (rank.get(b.id) ?? order.length),
  );
}

// Mục đang chọn — cùng quy tắc với NavLink cũ: '/' khớp chính xác,
// các mục khác khớp tiền tố theo đoạn đường dẫn (trang chi tiết vẫn
// sáng mục cha, vd /employees/123 sáng "Nhân viên").
function isNavItemSelected(item, pathname) {
  if (item.to === '/') return pathname === '/';
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

// Bỏ dấu tiếng Việt + hạ chữ thường để ô tìm kiếm ⌘K lọc được cả khi
// người dùng gõ không dấu ("nghi phep" vẫn khớp "Nghỉ phép").
function stripDiacritics(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Nút thu/mở sidebar chỉ có ở desktop (như bản cũ) — AppShell tự lo
  // drawer mobile nên không cần nút này dưới lg.
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  // Sidebar thu gọn — state dùng chung cho SideNav (collapsible) và
  // SideNavCollapseButton trên topbar qua cùng một config object.
  const [collapsed, setCollapsed] = useState(false);
  const collapsibleConfig = useMemo(
    () => ({ isCollapsed: collapsed, onCollapsedChange: setCollapsed, hasButton: false }),
    [collapsed],
  );

  // Lọc menu theo role + theo hồ sơ nhân viên: mục gắn cờ needsEmployee
  // (điểm thưởng, hành trình cá nhân) chỉ hiện khi tài khoản có gắn hồ sơ
  // nhân viên (user.employeeId) — tài khoản thuần hệ thống (vd admin)
  // không thấy các mục này, đúng yêu cầu "màn hình của ai thì hiện cho
  // người đó". Command palette ⌘K dùng lại chính danh sách này nên cũng
  // tôn trọng bộ lọc.
  const visibleItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
        if (item.roles && !item.roles.includes(user?.role)) return false;
        if (item.needsEmployee && !user?.employeeId) return false;
        return true;
      }),
    [user?.role, user?.employeeId],
  );
  const navSections = useMemo(
    () => groupNavItems(visibleItems, user?.role),
    [visibleItems, user?.role],
  );

  /* ---------------- Command palette ⌘K (Astryx) ----------------
     Nút tìm kiếm trên topbar mở dialog palette; gõ để lọc các trang
     trong NAV_ITEMS (theo đúng role đang đăng nhập), Enter/click để
     nhảy tới trang. Lọc không dấu qua keywords (nhãn đã bỏ dấu + path).
     Chọn mục -> onValueChange nhận id (= route) rồi palette tự đóng. */
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteSource = useMemo(() => {
    const items = navSections.flatMap((section) =>
      section.items.map((item) => ({
        id: item.to,
        label: item.label,
        auxiliaryData: { group: section.label, to: item.to, icon: item.icon },
      })),
    );
    return createStaticSource(items, {
      keywords: (item) => [stripDiacritics(item.label), item.auxiliaryData.to],
    });
  }, [navSections]);

  const handlePaletteSelect = (value) => {
    const item = visibleItems.find((entry) => entry.to === value);
    if (item) navigate(item.to);
  };

  // Cmd+K / Ctrl+K: mở palette ở bất cứ đâu trong app (dialog tự focus
  // ô nhập khi mở; Esc / bấm ngoài / chọn mục đều do dialog lo).
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /* ------------- Tiêu đề tab trình duyệt theo trang đang mở ------------- */
  useEffect(() => {
    const { pathname } = location;
    let label = null;
    // Khớp tiền tố dài nhất trước để trang chi tiết lấy label của route cha.
    const sorted = [...NAV_ITEMS].sort((a, b) => b.to.length - a.to.length);
    for (const item of sorted) {
      if (item.to === '/') {
        if (pathname === '/') {
          label = item.label;
          break;
        }
        continue;
      }
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
        label = item.label;
        break;
      }
    }
    document.title = label ? `${label} · Web HRM AI` : 'Web HRM AI';
  }, [location.pathname]);
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

  /* ----------------------------- Khung Astryx -----------------------------
     AppShell sở hữu skip link + <main> + drawer mobile — không tự thêm
     <main> hay skip link nữa. variant="section" (ngăn cách bằng đường
     kẻ, khớp v4 phẳng), height="auto" (cuộn theo trang), contentPadding
     0 (mỗi trang tự giữ padding qua .page-shell). mobileNav breakpoint
     lg giữ đúng điểm chuyển mobile như bản cũ (1024px). */
  return (
    <AppShell
      variant="section"
      height="auto"
      contentPadding={0}
      mobileNav={{ breakpoint: 'lg' }}
      topNav={
        <TopNav
          label="Thanh điều hướng trên"
          heading={
            <span className="flex min-w-0 items-center gap-3">
              <img
                src="/logo.svg"
                alt=""
                aria-hidden="true"
                className="h-8 w-8 flex-none rounded-lg"
              />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold leading-tight text-gray-900">
                  Web HRM AI
                </span>
                <span className="block truncate text-xs leading-tight text-gray-500">
                  Quản lý nhân sự
                </span>
              </span>
            </span>
          }
          startContent={
            isDesktop ? (
              <SideNavCollapseButton collapsible={collapsibleConfig} />
            ) : null
          }
          centerContent={
            <>
              {/* Nút mở palette — giữ nguyên hình thức ô tìm kiếm + gợi ý ⌘K */}
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="Tìm kiếm trang"
                className="hidden h-10 w-full max-w-sm items-center gap-2.5 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-500 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/20 md:flex"
              >
                <Icon icon="search" />
                <span className="min-w-0 flex-1 truncate text-left">Tìm kiếm...</span>
                <kbd
                  className="pointer-events-none flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium text-gray-500"
                  aria-hidden="true"
                >
                  ⌘K
                </kbd>
              </button>
              {/* Mobile: hiện tên người dùng như bản cũ (ô tìm kiếm ẩn dưới md) */}
              <span className="block truncate text-sm font-medium text-gray-900 md:hidden">
                {displayName}
              </span>
            </>
          }
          endContent={
            <span className="flex items-center gap-2.5 sm:gap-3.5">
              {/* Chuông thông báo — bấm vào mở trang Thông báo đầy đủ */}
              <span className="relative flex-none">
                <IconButton
                  label={
                    unreadCount > 0
                      ? `Thông báo, ${unreadCount} chưa đọc`
                      : 'Thông báo'
                  }
                  icon={bellIcon}
                  variant="secondary"
                  tooltip="Thông báo"
                  onClick={() => navigate('/notifications')}
                />
                {unreadCount > 0 ? (
                  <>
                    <span className="sr-only">{unreadCount} thông báo chưa đọc</span>
                    <span
                      className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#F04438] ring-2 ring-white"
                      aria-hidden="true"
                    />
                  </>
                ) : null}
              </span>

              {/* Khối người dùng */}
              <span className="hidden items-center gap-2.5 sm:flex">
                <Avatar name={displayName} size={32} tooltip={false} />
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
              </span>

              {/* Đăng xuất */}
              <Button
                label="Đăng xuất"
                variant="secondary"
                icon={logoutIcon}
                onClick={logout}
              />
            </span>
          }
        />
      }
      sideNav={
        <SideNav
          collapsible={collapsibleConfig}
          footer={
            <>
              {/* Link công khai trong chân sidebar */}
              <NavLink
                to="/jobs"
                onMouseEnter={() => prefetchRoute('/jobs')}
                onFocus={() => prefetchRoute('/jobs')}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/30"
              >
                <span className="text-gray-400">{globeIcon}</span>
                {collapsed ? null : <span>Trang tuyển dụng công khai</span>}
              </NavLink>

              {/* Thẻ người dùng — thu gọn thì chỉ còn avatar */}
              <div className="flex items-center gap-3 px-3 py-2">
                <Avatar name={displayName} size={36} tooltip={false} />
                {collapsed ? null : (
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium leading-tight text-gray-900">
                      {displayName}
                    </span>
                    {roleLabel ? (
                      <span className="block truncate text-xs leading-tight text-gray-500">
                        {roleLabel}
                      </span>
                    ) : null}
                  </span>
                )}
              </div>
            </>
          }
          footerIcons={
            <IconButton
              label="Đăng xuất"
              icon={logoutIcon}
              variant="ghost"
              tooltip="Đăng xuất"
              onClick={logout}
            />
          }
        >
          {navSections.map((section) => (
            <SideNavSection key={section.id || section.label} title={section.label}>
              {section.items.map((item) => (
                <SideNavItem
                  key={item.to}
                  label={item.label}
                  href={item.to}
                  icon={item.icon}
                  isSelected={isNavItemSelected(item, location.pathname)}
                  onMouseEnter={() => prefetchRoute(item.to)}
                  onFocus={() => prefetchRoute(item.to)}
                />
              ))}
            </SideNavSection>
          ))}
        </SideNav>
      }
    >
      <PageTransition key={location.pathname}>
        <Outlet />
      </PageTransition>
      <CommandPalette
        isOpen={paletteOpen}
        onOpenChange={setPaletteOpen}
        searchSource={paletteSource}
        renderItem={(item, _isSelected) => (
          <span className="flex items-center gap-2">
            <Icon icon={item.auxiliaryData.icon} />
            <span className="truncate">{item.label}</span>
          </span>
        )}
        emptySearchText="Không tìm thấy trang nào khớp."
        label="Tìm kiếm trang"
        width={640}
        maxHeight={480}
        onValueChange={handlePaletteSelect}
      />
    </AppShell>
  );
}
