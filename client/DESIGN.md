# Design System v3 — "Nhịp nhân sự" — Web HRM AI

Tài liệu này là **nguồn sự thật về giao diện** của `client/`. Mọi page/feature phải dùng token, component và motion primitives ở đây — **không tự chế màu, bóng đổ, bo góc hay animation riêng**. Nguồn token gốc: `tailwind.config.js` + `src/styles/tokens.css` (sửa màu phải sửa đồng bộ cả hai). Cấu trúc thư mục: xem [STRUCTURE.md](./STRUCTURE.md). Kế hoạch gốc: `../docs/frontend-design-v3.md`.

Phong cách: **HR Tech doanh nghiệp Việt Nam** — ý tưởng chủ đạo là *nhịp ngày làm việc*: đường nhịp/timeline ngang (vào ca → nghỉ trưa → chiều → tan ca) thay cho lưới thẻ tĩnh đều nhau. Một màn hình chỉ có **một khoảnh khắc chuyển động lớn**; mọi chuyển động còn lại đáp lại hành động của người dùng.

---

## 1. Bảng màu v3

| Tên | Hex | Token | Dùng cho |
|---|---|---|---|
| Ink Navy | `#081A3A` | `ink`, `navy-950` | Sidebar, hero tối ("nền sân khấu") |
| Navy 900/800 | `#0C2144` / `#12294D` | `navy-900/800` | Gradient sidebar, vùng tối phụ |
| Pulse Blue | `#274FEA` | `brand-600` (thang brand giữ từ v2) | Màu chính: nút primary, link, focus ring |
| Pulse Teal | `#0DB795` | `accent-500` (thang accent giữ từ v2) | AI, trạng thái tích cực, đầu nhịp hoàn thành |
| Signal Amber | `#F59E0B` | `signal`, amber-500 | Cảnh báo/chờ duyệt — tiết kiệm, đúng ngữ nghĩa |
| Canvas Mist | `#EEF2F9` | `canvas` | Nền toàn ứng dụng |

- Thang `brand` (50–950) và `accent` (50–700) giữ nguyên giá trị v2; `navy-950` đổi từ `#0A1730` → `#081A3A`, `canvas` đổi từ `#F4F7FB` → `#EEF2F9` (lạnh và sâu hơn để thẻ trắng nổi khối).
- Màu trạng thái ngữ nghĩa giữ quy ước v2 qua `Badge`/`Alert` tones: emerald (thành công/đã duyệt), amber (chờ/cảnh báo), rose (lỗi/từ chối), violet (đặc biệt), slate (trung tính).
- Màu biểu đồ Recharts: `--chart-1..5` trong `tokens.css` (`#274FEA`, `#0DB795`, `#F59E0B`, `#8B5CF6`, `#EC4899`), lưới `--chart-grid: #DDE5F0`.

## 2. Typography v3

- **Tiêu đề (h1–h3, class `font-display`): Be Vietnam Pro** 600/700/800 — đóng gói local qua `@fontsource/be-vietnam-pro` (import weight trong `main.jsx`). Font thiết kế cho tiếng Việt: dấu thanh cân đẹp, tạo bản sắc "làm cho người Việt".
- **Nội dung & số liệu: Inter Variable** (`@fontsource-variable/inter`) — giữ từ v2.
- Mọi số liệu/bảng dùng `font-variant-numeric: tabular-nums` (class `.tnum`; `table` đã được áp sẵn trong `base.css`).
- **Không còn eyebrow uppercase** ở tiêu đề trang: `PageHeader` hiển thị eyebrow (nếu có) dạng sentence case 13px; tiêu đề trang là Be Vietnam Pro 28px (lg: 32px), sentence case, kèm một dòng mô tả đúng việc người dùng sắp làm.

## 3. Spacing, radius, shadow

Giữ nguyên thang v2 (spacing 4px; `rounded-2xl` cho Card, `rounded-3xl` cho Modal/hero; shadow tokens `shadow-card`, `shadow-lift`, `shadow-pop`, `shadow-glow` trong `tailwind.config.js`). Không tự chế `box-shadow` inline.

## 4. Component kit (`src/components/ui/`)

Import qua barrel: `import { Button, Card, Badge } from '../../components/ui'`.

- **Button** — nay là `motion.button`: hover nâng −1px, press co `0.98` (120ms), tự tắt khi `prefers-reduced-motion`. Variant/size giữ nguyên v2 (`primary|accent|secondary|ghost|danger|dark`; `sm|md|lg`).
- **Card / CardHeader / CardBody** — giữ nguyên v2; tiêu đề thẻ tự dùng Be Vietnam Pro qua selector `h3` trong `base.css`.
- **Form (FormField, Input, Select, Textarea)** — giữ nguyên v2 (class `.ui-*`).
- **Badge** — giữ nguyên ánh xạ trạng thái v2.
- **Modal** — v3: mở bằng **spring** (`stiffness 380, damping 34`, hằng số `SPRING_PANEL` trong `components/motion/Drawer.jsx`) qua `AnimatePresence`; nền mờ dần 180ms; đóng Esc/click nền/nút X như cũ.
- **Drawer** (mới, trong `components/motion`) — panel trượt từ phải bằng cùng spring trên.
- **Feedback (Spinner, Skeleton, TableSkeleton, EmptyState, Alert)** — giữ nguyên v2; EmptyState luôn kèm hướng dẫn hành động tiếp theo khi có thể.
- **PageHeader** — v3 như mục 2 (bỏ eyebrow uppercase, font-display).
- **StatCard** — v3: giá trị dạng số tự đếm lên bằng `AnimatedNumber`; vẫn dùng cho số liệu phụ, Dashboard chính không còn dùng lưới StatCard đều nhau.

## 5. Motion system v3 (`src/components/motion/`)

**Luật bắt buộc:** page/feature chỉ dùng primitives dưới đây (import từ `components/motion`), không tự viết hiệu ứng riêng bằng CSS keyframes mới hay inline transition ngoài UI kit.

| Primitive | Hành vi | Thông số |
|---|---|---|
| `PageTransition` | Bọc Outlet trong AppLayout: trang mới mờ + trượt lên khi mount | 240ms, ease `[0.22, 1, 0.36, 1]` |
| `StaggerList` / `StaggerItem` | Danh sách xuất hiện nối tiếp khi dữ liệu về | stagger 40ms/phần tử |
| `AnimatedNumber` | Số đếm lên khi xuất hiện/đổi giá trị | ~600ms ease-out |
| `ProgressRing` | Vòng % (chuyên cần, hội nhập, OKR) vẽ theo giá trị thật; hỗ trợ nền tối qua `labelClassName/subClassName/track` | 800ms ease-out |
| `PulseBar` | Thanh nhịp "Nhịp nhân sự": phần hoàn thành vẽ dần + mốc giờ dạng chấm nảy spring | 800ms; mốc delay 120ms/mốc |
| `CheckMotion` | Tick hoàn thành việc: vòng + nét check tự vẽ | 350ms |
| `Drawer` | Panel phải mở bằng spring | spring 380/34 |
| `ActivePill` | Khung chọn `layoutId` (sidebar đang chọn, tab) trượt sang vị trí mới | spring 480/38 |

Luật chuyển động (từ skill frontend-design + khả dụng):
1. **Một khoảnh khắc lớn duy nhất** mỗi màn hình (hero "Nhịp hôm nay" ở Dashboard, đường nhịp ở Login/`/jobs`); còn lại là chuyển động đáp lại hành động.
2. **Tôn trọng `prefers-reduced-motion`**: mọi primitive dùng `useReducedMotion()` của `motion/react` để tắt hiệu ứng; `base.css` vẫn tắt animation CSS toàn cục như v2. Không ghi đè bằng `!important`.
3. Không hiệu ứng trôi nổi lặp vô hạn trang trí trong màn hình nghiệp vụ.
4. Thời lượng: tương tác ≤ 400ms; khoảnh khắc chính ≤ 800ms.

App shell v3 (`src/layouts/AppLayout.jsx`): sidebar Ink Navy **thu gọn 76px ↔ mở rộng 264px bằng spring** (nút PanelLeft ở đầu sidebar, chỉ desktop), mục đang chọn dùng `ActivePill layoutId="sidebar-active"`, `PageTransition` bọc `Outlet` theo `location.pathname`, vùng nội dung giữ `.page-shell`.

## 6. Bố cục Dashboard v3

Bỏ lưới StatCard đều nhau (mặc định SaaS-card của v2). Cấu trúc: **hero Ink Navy "Nhịp hôm nay"** (lời chào theo giờ + PulseBar mốc 07:30/12:00/13:00/17:30 + ProgressRing chuyên cần theo dữ liệu `/stats/overview`) → hàng bất đối xứng: biểu đồ cơ cấu phòng ban (2/3) + cột **"Cần xử lý"** (1/3: đơn phép chờ duyệt, hợp đồng sắp hết hạn, vị trí đang tuyển — số đếm bằng AnimatedNumber) → hàng dưới: biểu đồ chuyên cần, khối **Hội nhập nhân viên mới** (số liệu nhân viên mới/nghỉ việc trong tháng từ stats hiện có — module Onboarding checklist thuộc lộ trình riêng, không bịa dữ liệu), hợp đồng sắp hết hạn.

## 7. Kiểm chứng

- `npm run build` pass.
- Screenshot kiểm chứng: `~/workspace/your_files/shots-v3/` (login, dashboard, employees, attendance, leave, payroll, recruitment, chatbot, public jobs).
- Bật `prefers-reduced-motion` → app tĩnh, dùng bình thường; focus-visible giữ nguyên.
