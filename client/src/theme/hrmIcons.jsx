// ============================================================
// HRM ICONS — icon riêng của HRM đăng ký vào registry Astryx.
//
// Vấn đề: registry của theme neutral chỉ có 29 tên chung (không có
// icon người/phòng ban/tiền/túi quà...) nên 19/30 mục sidebar phải
// dùng tên gần nghĩa (Nhân viên=menu, Phòng ban=funnel...).
// Cách sửa: đăng ký thêm key namespaced 'hrm:tên' bằng registerIcons
// (Astryx chấp nhận key này ở mọi chỗ tên built-in được dùng, kể cả
// <Icon icon> trong SideNavItem và palette ⌘K). Không cần build lại
// theme (theme đang import từ '@astryxdesign/theme-neutral/built',
// đã pre-compile) — registerIcons chạy ở module-level, một lần duy
// nhất khi app khởi động (import trong main.jsx).
//
// Kiểu entry theo đúng registry gốc (theme-neutral/dist/icons.mjs):
// component lucide với size "1em", aria-hidden. Icon lấy cỡ chữ
// hiện tại của theme nên không lệch cỡ với icon built-in.
//
// Thêm icon mới: import component lucide ở dưới, thêm một dòng
// 'hrm:tên': <Component {...iconProps} />, rồi dùng chuỗi 'hrm:tên'
// trong NAV_ITEMS (AppLayout.jsx). Không cần sửa gì khác.
// ============================================================

import { registerIcons } from '@astryxdesign/core';
import {
  LayoutDashboard,
  Users,
  Building2,
  QrCode,
  Banknote,
  TrendingUp,
  UserCheck,
  CalendarClock,
  FileText,
  Network,
  CalendarRange,
  Map,
  UserX,
  Package,
  GraduationCap,
  Briefcase,
  Bot,
  Megaphone,
  Award,
  ClipboardList,
  Newspaper,
  Route,
  Gift,
  ChartColumn,
  Presentation,
  Settings,
} from 'lucide-react';

// Cùng props với registry gốc: cỡ theo font hiện tại, ẩn với screen reader.
const iconProps = { size: '1em', 'aria-hidden': true };

registerIcons({
  'hrm:dashboard': <LayoutDashboard {...iconProps} />,
  'hrm:users': <Users {...iconProps} />,
  'hrm:building': <Building2 {...iconProps} />,
  'hrm:qrcode': <QrCode {...iconProps} />,
  'hrm:payroll': <Banknote {...iconProps} />,
  'hrm:performance': <TrendingUp {...iconProps} />,
  'hrm:onboarding': <UserCheck {...iconProps} />,
  'hrm:shifts': <CalendarClock {...iconProps} />,
  'hrm:documents': <FileText {...iconProps} />,
  'hrm:orgchart': <Network {...iconProps} />,
  'hrm:teamcalendar': <CalendarRange {...iconProps} />,
  'hrm:skills': <Map {...iconProps} />,
  'hrm:offboarding': <UserX {...iconProps} />,
  'hrm:assets': <Package {...iconProps} />,
  'hrm:training': <GraduationCap {...iconProps} />,
  'hrm:recruitment': <Briefcase {...iconProps} />,
  'hrm:chatbot': <Bot {...iconProps} />,
  'hrm:announcements': <Megaphone {...iconProps} />,
  'hrm:kudos': <Award {...iconProps} />,
  'hrm:surveys': <ClipboardList {...iconProps} />,
  'hrm:feed': <Newspaper {...iconProps} />,
  'hrm:journey': <Route {...iconProps} />,
  'hrm:rewards': <Gift {...iconProps} />,
  'hrm:reports': <ChartColumn {...iconProps} />,
  'hrm:briefing': <Presentation {...iconProps} />,
  'hrm:admin': <Settings {...iconProps} />,
});
