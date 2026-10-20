# Design System — Web HRM tích hợp AI (Client)

> Áp dụng nguyên tắc của **ui-ux-pro-max-skill** (nextlevelbuilder): design system nhất quán trước, component sau. Ngành: **B2B SaaS / HR Tech** — ưu tiên tin cậy, rõ ràng, mật độ thông tin vừa phải. Giao diện tiếng Việt, dùng bởi HR/Manager/Employee trên cả máy tính và điện thoại (chấm công ở 360–375px).

Tài liệu này là "nguồn sự thật" về giao diện. Mọi page/feature mới phải dùng token + component ở đây, **không tự chế màu/kiểu riêng**.

## 0. Cách dùng nhanh

```jsx
// main.jsx — import đúng thứ tự này, MỘT lần duy nhất
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/animations.css";
```

| File | Nội dung |
|---|---|
| `src/styles/tokens.css` | Toàn bộ CSS variables: màu, font, spacing, radius, shadow, motion |
| `src/styles/base.css` | Reset, typography, focus-visible, layout khung app, responsive nền |
| `src/styles/components.css` | Class component dùng chung (btn, card, table, badge, form, modal, sidebar, toast, skeleton...) |
| `src/styles/animations.css` | Keyframes + class hiệu ứng, tất cả ≤ 300ms |
| `src/components/icons.jsx` | Icon SVG inline (components + map `Icons` + `<Icon name="..."/>`) |
| `src/components/ui.jsx` | `Button, Card, Badge, StatusBadge, Input, Select, DataTable, Modal, ConfirmModal, ToastProvider/useToast, StatCard, Skeleton, EmptyState, Spinner` |

## 1. Pattern đã chọn

- **Kiểu ứng dụng:** Admin dashboard cổ điển — sidebar navy cố định bên trái (desktop) + topbar + vùng nội dung tối đa 1440px. Đây là pattern người dùng B2B quen thuộc, học 1 lần dùng mọi màn hình.
- **Bố cục danh sách chuẩn (mọi trang CRUD):** tiêu đề trang (`.page-title` + `.page-subtitle`) → `.list-toolbar` (ô tìm kiếm + nút "Thêm mới") → `.table-wrap` (bảng + phân trang) → xác nhận xoá bằng `ConfirmModal` → phản hồi bằng Toast.
- **Dashboard:** `.grid-stats` 4 cột (→ 2 cột ≤1024px → 1 cột ≤375px) `StatCard`, dưới là lưới `.grid-2` biểu đồ/bảng tóm tắt.
- **Màu trạng thái nghiệp vụ thống nhất** qua `StatusBadge` + bảng `STATUS_BADGE` trong `ui.jsx` (đang làm/chờ duyệt/đã duyệt/từ chối/đi muộn...) — không tự đặt màu trạng thái ở từng trang.
- **AI được nhận diện riêng nhưng không lòe loẹt:** icon `IconSparkles`, accent teal, thanh `.progress` cho điểm phù hợp CV 0–100, luôn kèm badge/chú thích "AI gợi ý — HR quyết định".

## 2. Bảng màu (hex)

### Brand — xanh dương tin cậy
| Token | Hex | Dùng cho |
|---|---|---|
| `--color-primary-600` | `#2563EB` | Nút chính, sidebar active, trang đang chọn |
| `--color-primary-700` | `#1D4ED8` | Hover nút chính, link |
| `--color-primary-50/100` | `#EFF6FF` / `#DBEAFE` | Nền icon stat, hover ghost, vòng focus mềm |
| `--color-primary-900` | `#1E3A8A` | Chữ nhấn mạnh trên nền sáng |

### Accent — teal (dùng tiết chế)
| Token | Hex | Dùng cho |
|---|---|---|
| `--color-accent-600` | `#0D9488` | Thanh progress điểm AI, điểm nhấn phụ |
| `--color-accent-700` | `#0F766E` | Chữ/icon accent (stat card loại 2), badge accent |
| `--color-accent-100` | `#CCFBF1` | Nền icon accent |

### Neutral & surface (slate)
`#F8FAFC` nền app · `#FFFFFF` surface/card · `#F1F5F9` nền phụ/hover · viền `#E2E8F0` (mạnh: `#CBD5E1`) · chữ chính `#0F172A` · chữ phụ `#475569` · chữ mờ `#64748B` · sidebar navy đặc `#0F2440` (màu phẳng, không gradient).

### Semantic (chữ luôn dùng bản đậm để đạt tương phản)
| Trạng thái | Chữ | Nền | Viền |
|---|---|---|---|
| Success | `#15803D` | `#F0FDF4` | `#BBF7D0` |
| Warning | `#B45309` | `#FFFBEB` | `#FDE68A` |
| Danger | `#B91C1C` (nút: `#DC2626`) | `#FEF2F2` | `#FECACA` |
| Info | `#1D4ED8` | `#EFF6FF` | `#BFDBFE` |

**Tương phản:** mọi cặp chữ/nền trên đều ≥ 4.5:1 cho chữ thường (primary `#2563EB` trên trắng = 5.2:1, chữ phụ `#475569` trên trắng = 7.5:1, danger `#B91C1C` trên `#FEF2F2` ≈ 5.9:1). Không dùng chữ gray-400 (`#94A3B8`) cho nội dung — chỉ dùng cho placeholder/icon trang trí.

## 3. Typography

- **Font stack:** `"Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` — Inter hỗ trợ tiếng Việt tốt, hợp số liệu bảng lương. Mono: `"JetBrains Mono", Consolas, monospace` cho mã NV/mã đơn.
- **Thang cỡ:** 12 / 14 / 16 / 18 / 20 / 24 / 30px (`--text-xs` → `--text-3xl`). Body 16px, nội dung bảng/form 14px, tiêu đề trang 24px bold.
- **Weight:** 400 thường · 500 medium (nút, menu) · 600 semibold (tiêu đề, th bảng) · 700 bold (số liệu stat, tiêu đề trang).
- Số tiền/số liệu dùng `font-variant-numeric: tabular-nums` (đã đặt ở `.cell-numeric`) để cột số thẳng hàng.

## 4. Spacing, radius, shadow

- Spacing thang 4px: `--space-1..12` (4 → 48px). Padding card 20px, trang 24px (16px mobile, 12px ở 375px).
- Radius: 6px (chip, nút nhỏ) · 10px (nút, input) · 14px (card, modal) · full (badge, avatar).
- Shadow: chỉ 3 mức `--shadow-sm/md/lg`, tông `rgba(15,23,42,...)` rất nhẹ — flat là chính, shadow chỉ để phân lớp (card nổi nhẹ, modal/toast nổi rõ).

## 5. Motion

- Mọi hiệu ứng **≤ 300ms**, chỉ animate `transform`/`opacity` (không animate width/height/top) để giữ 60fps và tải trang mượt.
- Page mới: `.animate-page` (fade + trượt lên 8px, 300ms, ease-out) gắn ở container của route.
- Modal: overlay fade 150ms + dialog scale 0.97→1 (200ms). Toast: trượt từ phải 200ms. Skeleton: shimmer 1.4s tuyến tính. Nút: `:active` lún 1px. Hover thẻ: nâng −2px + shadow-md (class `.card-hover`).
- `prefers-reduced-motion: reduce` ⇒ tắt toàn bộ animation/transition (khai báo ở cả `base.css` và `animations.css`).

## 6. Icon

- 37 icon SVG stroke (1.8px, bo góc, `currentColor`) trong `icons.jsx`: `home, users, user, building, clock, calendar, money, briefcase, chat, bell, chart, logout, search, plus, edit, trash, check, x, chevronLeft/Right/Down, eye, download, upload, fileText, sparkles (AI), shield, settings (sliders), menu, filter, alert, info, arrowRight, mail, phone, send, lock, clipboard`.
- Dùng: `import { IconUsers } from "../components/icons"` hoặc `<Icon name="users" size={18} />`. Kích thước chuẩn: 18–20px trong nút/menu, 22–24px ở stat card.
- **Không dùng emoji làm icon**, không dùng icon font ngoài.

## 7. Responsive

| Breakpoint | Hành vi |
|---|---|
| 375px (mobile nhỏ) | Stats 1 cột, phân trang xếp dọc, nút footer modal full-width, padding trang 12px — luồng chấm công/xem phiếu lương dùng tốt bằng 1 tay |
| 768px (tablet) | Sidebar ẩn (app shell dùng menu trượt riêng), `.grid-2` → 1 cột, padding 16px |
| 1024px (laptop) | Stats 2 cột, padding 20px |
| 1440px (desktop) | Nội dung khóa tối đa `--content-max: 1440px`, stats 4 cột |

Bảng luôn cuộn ngang trong `.table-wrap` thay vì vỡ layout.

## 8. Anti-patterns ĐÃ TRÁNH (theo ui-ux-pro-max)

- ❌ Gradient tím–hồng/xanh–tím "AI style", màu neon, glassmorphism — ✅ màu phẳng, primary blue + 1 accent teal.
- ❌ Emoji làm icon, icon không nhất quán độ dày nét — ✅ 1 bộ SVG stroke duy nhất.
- ❌ Chữ xám nhạt trên nền sáng không đạt tương phản; trạng thái chỉ khác nhau bằng màu mà không có nhãn chữ — ✅ badge luôn có chữ, màu chữ semantic ≥ 4.5:1.
- ❌ `outline: none` khi focus — ✅ `:focus-visible` có vòng focus 2px toàn cục + ring riêng cho input.
- ❌ Animation dài > 400ms, animate layout, hiệu ứng lòe loẹt gây chậm — ✅ ≤ 300ms, transform/opacity, có reduced-motion.
- ❌ Nút/link không có `cursor: pointer`, vùng bấm quá nhỏ — ✅ mọi `.btn`/`.btn-icon`/`.sidebar-link`/`.pagination-btn` đều có cursor pointer, chiều cao bấm tối thiểu 32–40px.
- ❌ Mỗi trang tự chế bảng/form/nút — ✅ bắt buộc dùng component dùng chung ở `ui.jsx` + class ở `components.css`.
- ❌ Shadow nặng, bo góc quá tròn kiểu "app giải trí" — ✅ shadow nhẹ, radius tối đa 14px cho khối lớn.
- ❌ Loading trắng trang không phản hồi — ✅ `Skeleton` shimmer cho bảng/card, spinner trong nút khi submit, `EmptyState` có hướng dẫn khi chưa có dữ liệu.

## 9. Checklist ui-ux-pro-max đã đạt

- [x] Có design token tập trung (màu/font/spacing/radius/shadow/motion) — không hardcode rải rác.
- [x] Palette theo ngành B2B SaaS/HR: xanh dương tin cậy + neutral slate, 1 accent.
- [x] Typography: 1 font chính hỗ trợ tiếng Việt, thang cỡ rõ ràng, phân cấp tiêu đề.
- [x] Tương phản chữ/nền ≥ 4.5:1 cho mọi trạng thái.
- [x] Focus visible trên mọi phần tử tương tác; điều hướng bàn phím dùng được (Modal đóng bằng Esc, nút đều là `<button>` thật).
- [x] Icon SVG nhất quán, không emoji; icon kèm nhãn chữ ở menu/nút quan trọng.
- [x] Cursor pointer + trạng thái hover/active/disabled cho mọi control; nút loading chặn double-submit.
- [x] Motion ≤ 300ms, tôn trọng `prefers-reduced-motion`.
- [x] Responsive kiểm theo 375 / 768 / 1024 / 1440px; bảng cuộn ngang an toàn.
- [x] Trạng thái rỗng (EmptyState), đang tải (Skeleton/Spinner), lỗi form (chữ dưới field + `role="alert"`), thông báo kết quả (Toast có `aria-live`).
- [x] Phân trang mặc định 20/trang phía server, Table hiển thị meta tổng bản ghi.
- [x] Nhất quán trạng thái nghiệp vụ HRM qua `STATUS_BADGE` dùng chung toàn app.

## 10. Quy ước khi thêm component mới

1. Cần màu/spacing mới → thêm **token** vào `tokens.css` trước, không hardcode hex trong CSS component.
2. Class mới đặt tên kebab-case theo khối (`.payroll-*` nếu đặc thù feature thì để ở CSS của feature, không đưa vào file dùng chung).
3. Mọi hiệu ứng mới phải ≤ 300ms và tự tắt khi reduced-motion.
4. Component React dùng chung đặt ở `src/components/`, nhận dữ liệu qua props, không tự gọi API.
