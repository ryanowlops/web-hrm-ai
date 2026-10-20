/* ============================================================
   ICONS — bộ icon SVG inline dùng chung toàn app (kiểu Lucide/Feather).
   KHÔNG dùng emoji làm icon. Màu theo currentColor.

   CHUẨN NÉT VẼ (mọi icon trong file này đều theo):
     - viewBox "0 0 24 24"
     - fill: none, stroke: currentColor
     - strokeWidth mặc định 1.8 (ghi đè được qua prop)
     - strokeLinecap / strokeLinejoin: round

   Cách dùng:
     import { IconHome, IconUsers } from "./icons";
     <IconHome size={20} />
   hoặc: import { Icon } from "./icons"; <Icon name="users" />
   ============================================================ */

function createIcon(children) {
  return function IconComponent({ size = 20, strokeWidth = 1.8, className, ...props }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        {children}
      </svg>
    );
  };
}

export const IconHome = createIcon(
  <>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M9 22V12h6v10" />
  </>
);

export const IconUsers = createIcon(
  <>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </>
);

export const IconUser = createIcon(
  <>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </>
);

export const IconBuilding = createIcon(
  <>
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
    <path d="M2 22h20" />
    <path d="M9 6h1M14 6h1M9 10h1M14 10h1M9 14h1M14 14h1" />
    <path d="M10 22v-3h4v3" />
  </>
);

export const IconClock = createIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </>
);

export const IconCalendar = createIcon(
  <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </>
);

export const IconMoney = createIcon(
  <>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2" />
    <path d="M6 12h.01M18 12h.01" />
  </>
);

export const IconWallet = createIcon(
  <>
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
  </>
);

export const IconBriefcase = createIcon(
  <>
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </>
);

export const IconChat = createIcon(
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
);

export const IconMessage = createIcon(
  <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
);

export const IconBell = createIcon(
  <>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </>
);

export const IconChart = createIcon(
  <>
    <path d="M12 20V10" />
    <path d="M18 20V4" />
    <path d="M6 20v-4" />
  </>
);

export const IconLogout = createIcon(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </>
);

export const IconSearch = createIcon(
  <>
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </>
);

export const IconPlus = createIcon(
  <>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </>
);

export const IconEdit = createIcon(
  <>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="M15 5l4 4" />
  </>
);

export const IconTrash = createIcon(
  <>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M10 11v6M14 11v6" />
  </>
);

export const IconCheck = createIcon(<path d="M20 6 9 17l-5-5" />);

export const IconX = createIcon(
  <>
    <path d="M18 6 6 18" />
    <path d="M6 6l12 12" />
  </>
);

export const IconChevronLeft = createIcon(<path d="M15 18l-6-6 6-6" />);
export const IconChevronRight = createIcon(<path d="M9 18l6-6-6-6" />);
export const IconChevronDown = createIcon(<path d="M6 9l6 6 6-6" />);

export const IconEye = createIcon(
  <>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </>
);

export const IconDownload = createIcon(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </>
);

export const IconUpload = createIcon(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8l-5-5-5 5" />
    <path d="M12 3v12" />
  </>
);

export const IconFileText = createIcon(
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M16 13H8M16 17H8M10 9H8" />
  </>
);

export const IconSparkles = createIcon(
  <>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z" />
  </>
);

export const IconShield = createIcon(
  <>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </>
);

export const IconSliders = createIcon(
  <>
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
    <path d="M1 14h6M9 8h6M17 16h6" />
  </>
);

export const IconMenu = createIcon(
  <>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </>
);

export const IconFilter = createIcon(
  <path d="M22 3H2l8 9.46V19l4 2v-8.54Z" />
);

export const IconAlertTriangle = createIcon(
  <>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path d="M12 9v4M12 17h.01" />
  </>
);

export const IconAlertCircle = createIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </>
);

export const IconInfo = createIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </>
);

export const IconArrowRight = createIcon(
  <>
    <path d="M5 12h14" />
    <path d="M12 5l7 7-7 7" />
  </>
);

export const IconMail = createIcon(
  <>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M22 6l-10 7L2 6" />
  </>
);

export const IconPhone = createIcon(
  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
);

export const IconSend = createIcon(
  <>
    <path d="M22 2 11 13" />
    <path d="M22 2l-7 20-4-9-9-4Z" />
  </>
);

export const IconLock = createIcon(
  <>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </>
);

export const IconClipboard = createIcon(
  <>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="M9 12h6M9 16h4" />
  </>
);

/* Map tra cứu theo tên (cho menu động / sidebar cấu hình).
   Có cả key camelCase (chuẩn trong code) và kebab-case (alias tiện dụng). */
export const Icons = {
  home: IconHome,
  users: IconUsers,
  user: IconUser,
  building: IconBuilding,
  clock: IconClock,
  calendar: IconCalendar,
  money: IconMoney,
  wallet: IconWallet,
  briefcase: IconBriefcase,
  chat: IconChat,
  message: IconMessage,
  bell: IconBell,
  chart: IconChart,
  logout: IconLogout,
  search: IconSearch,
  plus: IconPlus,
  edit: IconEdit,
  trash: IconTrash,
  check: IconCheck,
  x: IconX,
  chevronLeft: IconChevronLeft,
  chevronRight: IconChevronRight,
  chevronDown: IconChevronDown,
  "chevron-left": IconChevronLeft,
  "chevron-right": IconChevronRight,
  "chevron-down": IconChevronDown,
  eye: IconEye,
  download: IconDownload,
  upload: IconUpload,
  fileText: IconFileText,
  "file-text": IconFileText,
  sparkles: IconSparkles,
  shield: IconShield,
  settings: IconSliders,
  menu: IconMenu,
  filter: IconFilter,
  alert: IconAlertTriangle,
  alertCircle: IconAlertCircle,
  "alert-circle": IconAlertCircle,
  info: IconInfo,
  arrowRight: IconArrowRight,
  "arrow-right": IconArrowRight,
  mail: IconMail,
  phone: IconPhone,
  send: IconSend,
  lock: IconLock,
  clipboard: IconClipboard,
};

/** Icon động theo tên: <Icon name="users" size={18} /> */
export function Icon({ name, ...props }) {
  const Cmp = Icons[name] || IconInfo;
  return <Cmp {...props} />;
}

export default Icons;
