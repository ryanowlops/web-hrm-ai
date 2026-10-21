# Design System v4 — Web HRM AI (bám template thật)

Tài liệu này là **nguồn sự thật về giao diện** của `client/` kể từ v4. Mọi page/feature phải dùng token, component và số đo ở đây — **không tự chế màu, bóng đổ, bo góc hay animation riêng**. Nguồn token gốc: `tailwind.config.js` + `src/styles/tokens.css` (sửa màu phải sửa đồng bộ cả hai). Cấu trúc thư mục: xem [STRUCTURE.md](./STRUCTURE.md). Hợp đồng đầy đủ: `../docs/frontend-design-v4.md`.

> **v4 thay thế hoàn toàn v3** ("Nhịp nhân sự"). Lý do: v3 bị nhận xét "nhìn AI quá" — gradient navy, hero band trang trí, thẻ bo tròn đều nhau, hiệu ứng trang trí tự chế. v4 bỏ hẳn ngôn ngữ tự chế và **bám sát các template do người thiết kế thật**:
>
> 1. **shadcn-admin** (satnaing) — khung chính: sidebar SÁNG (trắng), palette trung tính, topbar có ô tìm kiếm ⌘K, bảng dữ liệu phẳng, light theme. Stack trùng hệt dự án: React + Vite + Tailwind.
> 2. **Untitled UI** — hệ số đo: thang xám, border, radius, shadow siêu nhẹ, typography Inter.
> 3. **TailAdmin React** — pattern component phụ: badge, dropdown, bảng.
> 4. **thefrontkit HR Dashboard / BambooHR** — pattern nghiệp vụ HR: danh bạ nhân viên dạng bảng avatar 2 dòng, hàng chờ duyệt phép, bảng chấm công, pipeline tuyển dụng.

Phong cách v4: **phẳng, sáng, kỷ luật** — giao diện như một công cụ làm việc hằng ngày của HR, không như trang marketing. Nếu một chi tiết nào trông "trang trí" mà không mang thông tin, chi tiết đó sai hợp đồng.

---

## 1. Cấm tuyệt đối (dấu hiệu "AI")

- Không gradient (linear/radial/conic) ở bất kỳ đâu trong UI.
- Không hero band tối màu, không panel navy trang trí, không glassmorphism/blur trang trí, không blob/quầng sáng/glow, không PulseBar/timeline trang trí, không vòng trang trí.
- Không bo góc lớn đồng loạt: nút/input `rounded-lg` (8px), thẻ `rounded-xl` (12px) là tối đa; không `rounded-2xl/3xl` cho thẻ nội dung.
- Không shadow nổi (lift/pop/glow): thẻ chỉ dùng **border + shadow-xs**. Shadow lớn chỉ cho modal/dropdown (`shadow-lg` nhẹ).
- Không font hiển thị riêng: **Inter cho mọi thứ** (đã bỏ Be Vietnam Pro khỏi giao diện; class `font-display` chỉ còn là ánh xạ tương thích về Inter).
- Không eyebrow chữ hoa trang trí trên tiêu đề trang; không số liệu khổng lồ trang trí.

## 2. Bảng màu v4

### 2.1. Thang xám Untitled UI (ghi đè thang `gray` của Tailwind)

| Token | Hex | Token | Hex |
|---|---|---|---|
| gray-25 | `#FCFCFD` | gray-500 | `#667085` |
| gray-50 | `#F9FAFB` | gray-600 | `#475467` |
| gray-100 | `#F2F4F7` | gray-700 | `#344054` |
| gray-200 | `#EAECF0` | gray-800 | `#1D2939` |
| gray-300 | `#D0D5DD` | gray-900 | `#101828` |
| gray-400 | `#98A2B3` | gray-950 | `#0C111D` |

Quy ước dùng: nền app gray-50 · bề mặt trắng · border mặc định gray-200 · chữ chính gray-900 · chữ phụ gray-500 · chữ mờ gray-400. **Không dùng thang `slate` nữa** — mọi trung tính đi qua `gray`.

### 2.2. Màu chính (brand)

Giữ thang `brand` hiện có. Hành động chính dùng **brand-600**, hover brand-700, nền nhấn nhẹ brand-50, chữ nhấn brand-700. Nút primary = nền brand-600, chữ trắng.

### 2.3. Màu ngữ nghĩa (chỉ dùng qua Badge/Alert tones)

| Nghĩa | Nền | Chữ | Chấm (dot) |
|---|---|---|---|
| success | `#ECFDF3` | `#067647` | `#12B76A` |
| warning | `#FFFAEB` | `#B54708` | `#F79009` |
| error | `#FEF3F2` | `#B42318` | `#F04438` |
| info | dùng thang brand | | |
| neutral | dùng thang gray | | |

Page không tự đặt màu trạng thái bằng hex rời ngoài bảng này; cần trạng thái thì dùng `Badge`/`Alert` của UI kit (kit đã ánh xạ tone sang đúng các giá trị trên).

### 2.4. Biểu đồ (Recharts)

Màu phẳng: brand-600, accent-500 (teal), gray-300, amber-500 — fill đặc opacity thấp, **không gradient fill**.

## 3. Typography & số đo (Untitled UI)

- Font: **Inter Variable cho mọi thứ**, đóng gói local (`@fontsource-variable/inter`). `tabular-nums` cho mọi số liệu/cột số (class `.tnum`; `table` đã áp sẵn trong `base.css`).
- Tiêu đề trang: **20px, semibold (600), gray-900, tracking −0.01em**, mô tả 14px gray-500 ngay dưới (qua `PageHeader`).
- Tiêu đề thẻ: 14–16px semibold. Nhãn nhỏ: 13px gray-500. Thân: 14px.
- Nút: cao 36–40px, 14px medium, `rounded-lg`. Primary = brand-600/chữ trắng; secondary = trắng, border gray-300, chữ gray-700, hover bg-gray-50.
- Input/Select: cao 40px, border gray-300, `rounded-lg`, focus: ring brand-600/20 + border brand-600.
- Thẻ: trắng, `border border-gray-200 rounded-xl`, shadow token `shadow-card` = `0 1px 2px rgba(16,24,40,0.05)`.
- Bảng: thead bg-gray-50, chữ 12px medium gray-500; hàng border-t gray-200 (trong thẻ) / gray-100; hover bg-gray-50; padding ô 12px 16px; ô tên có avatar tròn 32–36px + 2 dòng (tên 14px medium gray-900, dòng phụ 13px gray-500).

## 4. Khung ứng dụng (theo shadcn-admin)

- **Sidebar TRẮNG** 264px, border-r gray-200 (không còn sidebar navy): logo = ô vuông brand-600 `rounded-lg` 32px chứa chữ "H" trắng + tên "Web HRM AI" 15px semibold gray-900, phụ đề 12px gray-500. Nhãn nhóm: 12px medium gray-500, không viết hoa. Mục menu: icon 18px, chữ 14px gray-700, `rounded-lg`, hover bg-gray-50; đang chọn: **bg-brand-50, chữ brand-700, medium**. Cuối sidebar: thẻ người dùng (avatar + tên + vai trò + nút đăng xuất) tách bằng border-t.
- **Topbar trắng** 64px, border-b gray-200: trái = ô tìm kiếm kiểu shadcn-admin (border gray-300, `rounded-lg`, placeholder "Tìm kiếm...", phím ⌘K dạng kbd ở phải ô — chỉ trình bày, giữ nguyên hành vi tìm kiếm hiện có nếu có); phải = chuông thông báo có chấm đỏ nhỏ + khối người dùng.
- Nội dung: bg-gray-50, padding 24px (lg: 32px), không giới hạn max-width kiểu marketing.
- Mobile: giữ hành vi thu gọn/hamburger hiện tại.

## 5. Mẫu trang chuẩn

1. **PageHeader:** trái = tiêu đề 20px + mô tả; phải = cụm nút hành động (secondary trước, primary sau).
2. **Thanh lọc** (nếu có): hàng ngang trên nền trắng trong thẻ mỏng hoặc ngay dưới header — input tìm kiếm + select lọc + nút.
3. **Nội dung chính:** thẻ bảng full-width (bảng tràn viền thẻ, thead như mục 3) hoặc lưới thẻ theo nghiệp vụ; đang tải = Skeleton đúng hình dạng; rỗng = EmptyState có nút hành động.
4. **Dashboard** (theo trang Overview của shadcn-admin): hàng **4 StatCard phẳng** (nhãn 13px gray-500, số 24px semibold, dòng phụ 13px — không bịa số liệu/% không có từ API); hàng 2: biểu đồ chấm công (2/3) + thẻ "Cần xử lý" (1/3) dạng danh sách việc có Badge; hàng 3: cơ cấu phòng ban + bảng đơn phép gần đây. **Không hero, không band tối.**
5. **Login** (theo auth của shadcn-admin/TailAdmin): nền gray-50, form giữa màn hình max-w ~400px — logo, tiêu đề 24px semibold, mô tả, thẻ trắng border chứa form (hoặc form trực tiếp trên nền như shadcn-admin), nút primary full-width; dưới form là khối tài khoản demo dạng bảng nhỏ/border. Không panel navy, không hero.
6. **Public Jobs** (theo trang careers Personio): nền trắng, header border-b (logo trái, nút "Đăng nhập nội bộ" phải), vùng đầu trang nền trắng — tiêu đề 30px semibold gray-900 + mô tả + ô tìm kiếm lớn; danh sách việc dạng hàng/thẻ border `rounded-xl`, hover border-brand-300; chi tiết/ứng tuyển giữ nguyên luồng.
7. **Chatbot:** khung chat trong thẻ trắng border gray-200 `rounded-xl`; header phẳng gồm tên chatbot + Badge "AI"; tin nhắn bot bg-gray-100, chữ gray-900, `rounded-xl`; tin nhắn user bg-brand-600, chữ trắng, `rounded-xl`; ô nhập border gray-300 `rounded-lg` + nút gửi primary. Trích dẫn nguồn giữ nguyên dưới tin nhắn bot (chip phẳng bg-white, ring gray-200).

## 6. Component kit (`src/components/ui/`)

Import qua barrel: `import { Button, Card, Badge } from '../../components/ui'`.

- **Button** — variant `primary | secondary | ghost | danger | accent | dark` (ưu tiên primary/secondary theo mục 3), size `sm | md | lg`, prop `loading`. Bo `rounded-lg`, không hiệu ứng nâng/co trang trí.
- **Card / CardHeader / CardBody** — thẻ theo số đo mục 3 (`.ui-card`); CardHeader: tiêu đề 14–16px semibold + subtitle 13px gray-500, border-b gray-200.
- **Form (FormField, Input, Select, Textarea)** — class `.ui-*`, số đo input theo mục 3.
- **Badge** — tone ánh xạ sang bảng ngữ nghĩa mục 2.3; prop `dot` thêm chấm màu.
- **Modal** — mở scale .98→1 + fade 160ms (mục 7); shadow `shadow-lg` nhẹ là nơi duy nhất dùng shadow lớn cùng dropdown.
- **Drawer** (trong `components/motion`) — panel trượt 200ms ease-out.
- **Feedback (Spinner, Skeleton, TableSkeleton, EmptyState, Alert)** — Skeleton đúng hình dạng nội dung; EmptyState luôn kèm hướng dẫn/nút hành động khi có thể.
- **PageHeader** — đúng mẫu trang mục 5.1; **không còn eyebrow**.
- **StatCard** — phẳng theo mục 5.4: nhãn 13px gray-500, số 24px semibold, dòng phụ 13px.

## 7. Chuyển động v4 — giảm liều (giữ thư viện `motion`)

Page/feature chỉ dùng primitives trong `src/components/motion/`, không tự chế hiệu ứng riêng:

| Primitive | Hành vi v4 | Thông số |
|---|---|---|
| `PageTransition` | Trang mới hiện dần + dịch nhẹ khi mount | opacity 0→1 + y 4px, **150ms** |
| `StaggerList` / `StaggerItem` | Danh sách xuất hiện nối tiếp | tối đa **6 phần tử đầu**, step **25ms** — quá đó hiện ngay |
| `AnimatedNumber` | Số đếm lên cho số liệu nhỏ | giữ, chỉ cho số liệu thật từ API |
| `ProgressRing` | Vòng % nhỏ cho số liệu thật (chuyên cần, tiến độ) | giữ, không dùng làm trang trí |
| `CheckMotion` | Tick xác nhận hoàn thành thao tác | giữ, ngắn |
| `Drawer` | Panel phải trượt vào | 200ms ease-out |
| `ActivePill` | Đánh dấu mục đang chọn (sidebar/tab) | giữ, không hiệu ứng nảy |
| `PulseBar` | **DEPRECATED — không trang nào được dùng** | giữ file cho tương thích, không import mới |

Luật bắt buộc:

1. **Xoá mọi hiệu ứng trang trí lặp vô hạn** — không pulse, không trôi nổi, không shimmer trang trí (shimmer chỉ còn trong Skeleton khi tải).
2. Chuyển động chỉ **đáp lại hành động** của người dùng hoặc báo thay đổi dữ liệu; mỗi màn hình không có "khoảnh khắc trình diễn".
3. **Tôn trọng `prefers-reduced-motion`**: mọi primitive dùng `useReducedMotion()`; CSS nền trong `base.css` tắt animation toàn cục khi người dùng bật tuỳ chọn này — không ghi đè bằng `!important`.
4. Thời lượng: tương tác ≤ 200ms theo bảng trên; modal 160ms; drawer 200ms.

## 8. Kiểm chứng

- `npm run build` pass.
- Mở từng trang đối chiếu hợp đồng: không gradient, không band tối, không bo góc > 12px ở thẻ, sidebar/topbar trắng, bảng đúng số đo mục 3.
- Bật `prefers-reduced-motion` → app tĩnh, dùng bình thường; focus-visible rõ ràng.
