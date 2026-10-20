# Design System v2 (Enterprise) — Web HRM AI

Tài liệu này là **nguồn sự thật về giao diện** của `client/`. Mọi page/feature phải dùng token và component ở đây — **không tự chế màu, bóng đổ, bo góc hay animation riêng**. Nguồn token gốc: `tailwind.config.js` + `src/styles/tokens.css` (sửa màu phải sửa đồng bộ cả hai). Cấu trúc thư mục và quy ước code: xem [STRUCTURE.md](./STRUCTURE.md).

Phong cách: **B2B SaaS / HR Tech chuẩn doanh nghiệp** — tin cậy, sạch, mật độ thông tin vừa phải, phân cấp thị giác rõ. Tham chiếu tinh thần: Linear/Stripe Dashboard (tinh gọn, tương phản tốt) trên nền nhận diện xanh doanh nghiệp + navy.

---

## 1. Bảng màu

### 1.1 Brand — xanh doanh nghiệp (màu chính)

| Token | Hex | Dùng cho |
|---|---|---|
| `brand-50` | `#EEF4FF` | Nền nhạt: ô icon, badge blue, vùng nhấn nhẹ |
| `brand-100` | `#DCE7FD` | Viền/ring nhạt cho StatCard |
| `brand-200` | `#C0D4FE` | Viền Alert info |
| `brand-300` | `#94B8FD` | Điểm biểu đồ phụ, trạng thái nhẹ |
| `brand-400` | `#6193FA` | Hover phụ, icon phụ |
| `brand-500` | `#3D6EF5` | Spinner, điểm nhấn, `--chart-1` đi cùng tông 600 |
| `brand-600` | `#274FEA` | **Màu chính**: nút primary, link, eyebrow, focus ring |
| `brand-700` | `#1F3FD8` | Hover của primary, chữ badge blue |
| `brand-800` | `#2134AE` | Active của primary |
| `brand-900` | `#0F2160` | Chữ trên nền brand-50 (Alert info) |
| `brand-950` | `#0A1638` | Điểm tối nhất của brand (hiếm dùng) |

### 1.2 Navy — vùng tối

| Token | Hex | Dùng cho |
|---|---|---|
| `navy-700` | `#1B3358` | Hover trong sidebar |
| `navy-800` | `#14294B` | Nút `dark` active, lớp phủ sidebar |
| `navy-900` | `#0E1F3C` | **Sidebar**, nút `dark` |
| `navy-950` | `#0A1730` | Nền sâu nhất, lớp phủ modal (`navy-950/55`) |

### 1.3 Accent — teal (điểm nhấn phụ, tính năng AI)

| Token | Hex | Dùng cho |
|---|---|---|
| `accent-50` | `#EFFDF9` | Nền badge teal, ô icon |
| `accent-100` | `#C9F7EA` | Ring StatCard teal |
| `accent-300` | `#5FE3C3` | Điểm biểu đồ, trạng thái nhẹ |
| `accent-400` | `#27CFA9` | Icon/điểm nhấn phụ |
| `accent-500` | `#0DB795` | Nút `accent`, badge teal |
| `accent-600` | `#02957B` | Hover của accent |
| `accent-700` | `#017763` | Active của accent, chữ badge teal |

### 1.4 Nền & trung tính

- `canvas` `#F4F7FB` — nền toàn ứng dụng (body).
- Thang `slate` của Tailwind cho chữ và viền: chữ chính `slate-900`, chữ phụ `slate-500`, chữ mờ `slate-400`, viền thẻ `slate-200`, đường kẻ trong thẻ `slate-100`, nền phụ `slate-50`.
- Thẻ nội dung luôn **trắng** (`bg-white`) trên nền canvas — không đặt màu nền lạ cho card.

### 1.5 Màu trạng thái (ngữ nghĩa — chỉ dùng qua Badge/Alert tones)

| Nghĩa | Tông Tailwind | Hex đại diện | Ví dụ trạng thái HRM |
|---|---|---|---|
| Thành công / đã duyệt | emerald | `#059669` (600) trên nền `#ECFDF5` (50) | Đã duyệt, Đang làm việc, Kỳ lương đã chốt |
| Chờ / cảnh báo | amber | `#D97706` (600) trên nền `#FFFBEB` (50) | Chờ quản lý duyệt, Chờ HR duyệt, Sắp hết hạn |
| Lỗi / từ chối / nguy hiểm | rose | `#E11D48` (600) trên nền `#FFF1F2` (50) | Đã từ chối, nút xóa, thông báo lỗi |
| Thông tin / đang xử lý | brand | `#274FEA` trên nền `#EEF4FF` | Mới nộp, Đang tuyển, Alert info |
| Đặc biệt | violet | `#7C3AED` (600) trên nền `#F5F3FF` (50) | Nhóm trạng thái riêng cần tách biệt |
| Trung tính | slate | `#475569` (600) trên nền `#F1F5F9` (100) | Nháp, Đã đóng, Đã huỷ |

### 1.6 Màu biểu đồ (Recharts — biến CSS trong `tokens.css`)

`--chart-1` `#274FEA` · `--chart-2` `#0DB795` · `--chart-3` `#F59E0B` · `--chart-4` `#8B5CF6` · `--chart-5` `#EC4899` · lưới `--chart-grid` `#E6ECF5`. Chỉ dùng cho biểu đồ, không dùng cho chữ/nút.

## 2. Typography — Inter

- Font duy nhất: **Inter Variable / Inter** (đóng gói qua `@fontsource-variable/inter`, không phụ thuộc CDN), fallback `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Bật `antialiased` + `optimizeLegibility` ở `base.css`.
- Thang cỡ chữ đang dùng trong kit:

| Vai trò | Cỡ / trọng lượng |
|---|---|
| Eyebrow (nhãn mục nhỏ) | 11px, bold, uppercase, tracking `0.14em`, `brand-600` |
| Tiêu đề trang (PageHeader) | 26px (lg: 30px), extrabold (800), tracking `-0.02em` |
| Tiêu đề thẻ (CardHeader) | 15px, bold (700) |
| Tiêu đề modal | 18px, bold (700) |
| Số liệu lớn (StatCard) | 26px, extrabold (800), tracking `-0.02em` |
| Nhãn ô số liệu / nhãn phụ | 13px, semibold (600), `slate-500` |
| Thân bài | 14px (text-sm), line-height relaxed |
| Mô tả phụ | 13–14px, `slate-500` |
| Chữ nhỏ/ghi chú | 12px, `slate-400` |

- Chỉ dùng trọng lượng 400/500/600/700/800. Tiêu đề luôn đậm hơn nội dung ít nhất 2 cấp thị giác (cỡ + trọng lượng).

## 3. Spacing, radius, shadow

### 3.1 Spacing

Thang spacing Tailwind gốc **4px** (1 đơn vị = 0.25rem). Mật độ chuẩn enterprise:

- Padding thẻ: `px-5 py-4` (CardHeader/CardBody); thẻ số liệu `p-5`.
- Khoảng cách giữa các khối trong trang: `gap-4`/`gap-5`; khoảng dưới PageHeader: `mb-6`.
- Form: label cách ô nhập `mb-1.5` (class `.ui-label`), các trường cách nhau theo lưới `gap-4`.
- Nút trong cùng nhóm: `gap-2`–`gap-2.5`.

### 3.2 Radius (bo góc)

| Token/class | Giá trị | Dùng cho |
|---|---|---|
| `rounded-lg` | 8px | Nút nhỏ, phần tử nhỏ |
| `rounded-xl` | 12px | Nút md/lg, ô nhập, Alert |
| `rounded-2xl` | 16px | **Card** (`.ui-card`), `--radius-lg` |
| `rounded-xl2` | 20px (1.25rem) | Khối nhấn lớn, `--radius-xl` |
| `rounded-3xl` | 24px | Modal |
| `rounded-full` | 999px | Badge, avatar, chấm trạng thái |

### 3.3 Shadow (khai báo trong `tailwind.config.js`)

| Token | Giá trị | Dùng cho |
|---|---|---|
| `shadow-card` | `0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.06)` | Card ở trạng thái thường |
| `shadow-lift` | `0 8px 24px -8px rgba(16,24,40,.16), 0 4px 8px -4px rgba(16,24,40,.08)` | Card hover (`.ui-card-hover`), phần tử nổi nhẹ |
| `shadow-pop` | `0 16px 40px -12px rgba(10,22,56,.25), 0 4px 12px -4px rgba(10,22,56,.12)` | Modal, popover |
| `shadow-glow` | `0 0 0 4px rgba(39,79,234,.14)` | Vòng focus nhấn mạnh quanh phần tử brand |

Không tự chế `box-shadow` inline — cần bóng đổ thì dùng 4 token trên.

## 4. Component kit (`src/components/ui/`)

Import qua barrel: `import { Button, Card, Badge } from '../../components/ui'`.

### 4.1 Button

- Variant: `primary` (brand-600, mặc định) · `accent` (teal) · `secondary` (trắng, viền slate) · `ghost` (trong suốt) · `danger` (rose-600) · `dark` (navy-900).
- Size: `sm` (cao 36px) · `md` (42px, mặc định) · `lg` (48px).
- Hành vi: hover nhấc `-1px`, active thu `scale .99`, focus ring 4px, `loading` hiện spinner và khóa nút, disabled mờ 55%.
- Mỗi màn hình chỉ **một** nút `primary` cho hành động chính; hành động phụ dùng `secondary`/`ghost`; hành động phá hủy dùng `danger` và phải có bước xác nhận (Modal).

### 4.2 Card / CardHeader / CardBody

- `.ui-card`: trắng, viền `slate-200/90`, `rounded-2xl`, `shadow-card`. `hover` → `.ui-card-hover` (nhấc + `shadow-lift`).
- `CardHeader`: tiêu đề 15px bold + subtitle 13px `slate-500` + `actions` bên phải, kẻ dưới `slate-100`.
- Nội dung bảng/form đặt trong `CardBody` (`px-5 py-4`).

### 4.3 Form (FormField, Input, Select, Textarea)

- Dùng class `.ui-input/.ui-select/.ui-textarea` (đồng nhất chiều cao, viền, focus ring brand) và `.ui-label` cho nhãn.
- `FormField` quản lý `label` + `hint` (12px, slate-400) + `error` (12px, rose-600, font-medium). Lỗi luôn hiển thị chữ, không chỉ đổi màu viền.

### 4.4 Badge — ánh xạ trạng thái

`tone`: `slate` (trung tính) · `blue` (thông tin) · `green` (thành công) · `amber` (chờ/cảnh báo) · `red` (lỗi/từ chối) · `violet` (đặc biệt) · `teal` (AI/nhấn phụ). Prop `dot` thêm chấm tròn cùng màu chữ.

Ánh xạ chuẩn cho nghiệp vụ HRM (giữ nhất quán toàn hệ thống):

| Trạng thái | Tone |
|---|---|
| Chờ quản lý duyệt / Chờ HR duyệt | `amber` |
| Đã duyệt / Đã chốt kỳ lương / Đang làm việc | `green` |
| Đã từ chối / Đã loại (ứng viên) | `red` |
| Mới nộp / Đang tuyển / Chưa phân tích | `blue` |
| Kết quả/gợi ý AI | `teal` |
| Nháp / Đã đóng / Đã huỷ / Nghỉ việc | `slate` |

### 4.5 Modal

Nền `navy-950/55` + blur nhẹ, hộp thoại `rounded-3xl` + `shadow-pop`, mở bằng `animate-scale-in`. Có header (title/subtitle/nút X), vùng nội dung cuộn riêng, footer `actions` nền `slate-50/70`. Đóng bằng Esc/click nền/nút X. Độ rộng qua prop `width` (`max-w-lg` mặc định, `max-w-2xl`/`max-w-3xl` cho form dài).

### 4.6 Feedback (Spinner, Skeleton, TableSkeleton, EmptyState, Alert)

- Đang tải trang/bảng: `Skeleton`/`TableSkeleton` (hiệu ứng `shimmer`), không để màn hình trắng.
- Không có dữ liệu: `EmptyState` — ô icon 56px nền brand-50, tiêu đề 15px bold, mô tả tối đa ~2 dòng, kèm một `action` duy nhất khi có hành động tiếp theo.
- Thông báo kết quả: `Alert` tone `success` | `error` | `info` | `warning` (nền 50, viền 200, chữ 800 của tông tương ứng), xuất hiện bằng `animate-fade-in`.
- `Spinner` dùng trong nút loading và vùng tải nhỏ.

### 4.7 PageHeader & StatCard

- `PageHeader`: eyebrow + title 26/30px + subtitle tối đa 2 dòng + `actions` phải. Mọi trang trong layout bắt đầu bằng component này.
- `StatCard`: ô icon 44px bo 12px theo `tone` (`blue` mặc định, `teal`, `amber`, `violet`, `rose`, `slate`) + nhãn 13px + giá trị 26px extrabold + dòng phụ. Dùng cho hàng số liệu đầu dashboard.

### 4.8 Bảng dữ liệu (class `.ui-*`)

Bảng trong card dùng `.ui-table` với `.ui-th` (đầu bảng), `.ui-td`, `.ui-tr` (hàng, hover nền nhẹ). Đầu bảng chữ nhỏ semibold `slate-500`; cột số căn phải; trạng thái trong bảng luôn là `Badge`.

## 5. Chuyển động (motion)

- Keyframes chuẩn trong `tailwind.config.js`: `animate-fade-up` (0.45s — nội dung trang xuất hiện), `animate-fade-in` (0.3s), `animate-scale-in` (0.28s — modal), `animate-slide-in` (0.35s — panel từ phải), `animate-shimmer` (skeleton), `animate-pulse-soft` (chấm trạng thái tải). Easing chung: `ease-spring` = `cubic-bezier(.21,.9,.35,1)`.
- Thời lượng tương tác nằm trong **150–450ms** (token `--motion-fast/base/slow` = 150/250/400ms). Danh sách dài dùng `.stagger` (mỗi phần tử trễ thêm 0.05s) ở `animations.css`; micro-interaction bổ sung ở `mot
...[truncated 1270 chars]