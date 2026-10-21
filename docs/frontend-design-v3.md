# Kế hoạch thiết kế Frontend v3 — theo skill `frontend-design` (Anthropic)

> Nguồn skill: https://github.com/anthropics/skills/tree/main/skills/frontend-design — áp dụng đúng quy trình của skill: **(1) lên kế hoạch tokens/layout → (2) tự phê bình đối chiếu brief, sửa phần nào giống mẫu generic → (3) mới code**.
> Brief: Web HRM cho doanh nghiệp Việt Nam — người dùng là HR, Manager, nhân viên văn phòng; sản phẩm phải trông như của một công ty lớn, **nhiều animation nhưng animation phải có chủ đích**; giữ nguyên toàn bộ chức năng và contract API hiện tại.
> Tài liệu này thay thế hướng thiết kế của `client/DESIGN.md` (v2) khi triển khai v3. v2 vẫn là hiện trạng đang chạy cho tới khi v3 hoàn tất.

---

## 1. Chốt công nghệ (framework)

| Lớp | Chọn | Lý do |
|---|---|---|
| App framework | **Giữ React 18 + Vite 5** (không đổi) | Toàn bộ code, route, React Query, Recharts đang chạy tốt trên SPA nội bộ. Đổi sang Next.js/Vue/Angular = viết lại từ đầu, không thêm giá trị thị giác nào cho dashboard nội bộ, rủi ro vỡ chức năng. |
| CSS | **Giữ Tailwind CSS 3** + tokens CSS | Đã là nền của v2; v3 đổi *giá trị token* và *bố cục*, không đổi công cụ. |
| **Animation** | **`motion` (Motion for React — bản kế nhiệm của Framer Motion)** | Thư viện animation chuẩn cho React: chuyển trang (`AnimatePresence`), animation layout dùng chung phần tử (`layoutId`), spring cho modal/drawer, stagger danh sách, đếm số, vòng tiến độ, kéo–thả. Một thư viện lo toàn bộ chuyển động, bundle gọn, tôn trọng `prefers-reduced-motion`. |
| Icon | **`lucide-react`** | Bộ icon nét mảnh đồng nhất kiểu Linear/Stripe; thay các icon rời rạc hiện tại. |
| Biểu đồ | Giữ **Recharts** (đã có animation sẵn) | Chỉ đổi palette + style theo tokens v3. |
| KHÔNG dùng | GSAP cùng lúc với Motion; thư viện UI nặng (MUI/AntD) | Hai engine animation chồng nhau gây xung đột & nặng bundle. AntD/MUI áp đặt ngoại hình mẫu, ngược tinh thần skill (tránh vẻ templated). |

Cài thêm duy nhất 2 package: `motion`, `lucide-react`.

## 2. Tự phê bình v2 theo skill — vì sao phải làm v3

Skill liệt kê các "mặc định AI-generated" phải tránh. Đối chiếu thẳng, v2 dính đúng mục số 4:

- ✗ **SaaS-card kit:** mọi trang đều là lưới thẻ trắng bo góc giống hệt nhau, cùng một bóng đổ mềm, không phân cấp thị giác thật — đây là lý do nhìn "đúng chuẩn nhưng nhạt".
- ✗ Eyebrow chữ hoa tracked-out ở mọi tiêu đề trang — chrome mẫu, xuất hiện bất kể nội dung.
- ✗ Chỉ có hover transition lẻ tẻ; chuyển trang, mở modal, đổi dữ liệu không có chuyển động kể chuyện.
- ✓ Giữ lại từ v2: kỷ luật token/component, cấu trúc `features/`, màu trạng thái theo ngữ nghĩa, font đóng gói local (không CDN).

## 3. Hướng thiết kế v3 — "Nhịp nhân sự"

Ý tưởng chủ đạo lấy từ chính nghiệp vụ HR: **một ngày làm việc của công ty là một nhịp** — người vào ca, người nghỉ, người mới hội nhập, mục tiêu chạy theo chu kỳ. Toàn bộ nhận diện xoay quanh *đường nhịp / timeline ngang* thay vì lưới thẻ tĩnh.

### 3.1. Màu (5 màu đặt tên + thang phụ giữ từ v2)

| Tên | Hex | Vai trò |
|---|---|---|
| Ink Navy | `#081A3A` | Sidebar + vùng tối; sâu hơn navy v2, là "nền sân khấu" |
| Pulse Blue | `#274FEA` | Màu chính (giữ từ v2 để liên tục nhận diện): nút, link, điểm nhịp đang chạy |
| Pulse Teal | `#0DB795` | AI + trạng thái tích cực, đầu nhịp hoàn thành |
| Signal Amber | `#F59E0B` | Cảnh báo/chờ duyệt — dùng tiết kiệm, đúng ngữ nghĩa |
| Canvas Mist | `#EEF2F9` | Nền app; lạnh và sâu hơn canvas v2 `#F4F7FB` để thẻ trắng nổi khối |

Trạng thái (emerald/amber/rose/violet/slate) giữ nguyên quy ước v2 qua Badge — không đổi ngữ nghĩa người dùng đã quen.

### 3.2. Typography — điểm khác biệt có chủ đích

- **Tiêu đề: Be Vietnam Pro** (700/800) — font thiết kế cho tiếng Việt, dấu thanh hiển thị đẹp và cân, cho sản phẩm cảm giác "làm cho người Việt" thay vì font quốc tế mặc định. Đóng gói local qua `@fontsource/be-vietnam-pro`.
- **Nội dung & số liệu: Inter Variable** (giữ) — bật `font-variant-numeric: tabular-nums` cho mọi số liệu/bảng để cột số thẳng hàng.
- Bỏ eyebrow uppercase ở tiêu đề trang; tiêu đề trang là Be Vietnam Pro 28–32px, sentence case, kèm một dòng mô tả ngắn đúng việc người dùng sắp làm.

### 3.3. Bố cục (layout)

App shell: sidebar Ink Navy thu gọn 76px ↔ mở rộng 264px có spring animation; topbar mỏng chứa tìm kiếm toàn cục + nút hành động chính theo trang; vùng nội dung tối đa 1440px, lưới 12 cột.

Dashboard — bỏ lưới StatCard đều nhau, thay bằng bố cục bất đối xứng có "khoảnh khắc chính" duy nhất:

```
┌──────────────────────────────────────────────────────────────┐
│ Chào buổi sáng, [Tên]              [Hôm nay: thứ Tư 21/10]   │
│ ▓▓▓ NHỊP HÔM NAY ▓▓▓▓▓▓▓▓░░░  42/58 đã chấm công · 3 nghỉ   │  ← hero: thanh nhịp
│      ●───●───●───◐───○  07:30  09:00  12:00  17:30           │    animated theo giờ thật
├──────────────────────────────┬───────────────────────────────┤
│ Biểu đồ chấm công tuần       │ Cần xử lý (hàng chờ duyệt)    │
│ (Recharts, animate)          │ đơn phép · CV mới · task      │
│                              │ onboarding quá hạn — có số    │
│                              │ đếm động + nút xử lý tại chỗ  │
├──────────────────┬───────────┴───────────────────────────────┤
│ Hội nhập: 2 NV   │ Hiệu suất chu kỳ: vòng tiến độ OKR của    │
│ mới, tiến độ %   │ team (chuẩn bị cho module Performance)    │
└──────────────────┴───────────────────────────────────────────┘
```

Các trang danh sách/bảng (nhân viên, lương, phép): giữ bảng nhưng thêm *hàng mở rộng có animation*, skeleton shimmer đúng hình dạng nội dung, và trạng thái rỗng có hướng dẫn hành động (theo mục "writing" của skill).
Trang công khai `/jobs` + đăng nhập: nơi duy nhất dùng chuyển động lớn — hero có đường nhịp chạy một lần khi tải trang (orchestrated moment duy nhất của toàn app, đúng chỉ dẫn skill).

### 3.4. Hệ thống animation (motion system) — "nhiều nhưng có luật"

Mọi chuyển động đi qua primitives dùng chung trong `client/src/components/motion/` — page/feature **không** tự chế hiệu ứng riêng:

| Primitive | Hành vi | Thông số |
|---|---|---|
| `PageTransition` | Nội dung trang mới trượt–mờ vào theo chiều điều hướng; trang cũ mờ ra | 240ms, ease `[0.22, 1, 0.36, 1]` |
| `StaggerList` | Danh sách/hàng bảng xuất hiện nối tiếp khi dữ liệu về | stagger 40ms, tối đa 12 phần tử |
| `AnimatedNumber` | Số liệu đếm lên khi xuất hiện/đổi giá trị | spring, ~600ms |
| `ProgressRing` / `PulseBar` | Vòng % (OKR, onboarding) và thanh nhịp vẽ theo giá trị thật | 800ms ease-out |
| `Modal` / `Drawer` | Mở bằng spring từ phía tương tác; nền mờ dần | spring stiffness 380, damping 34 |
| `CheckMotion` | Tick hoàn thành việc (onboarding, duyệt đơn): vòng tròn vẽ + nảy nhẹ | 350ms |
| `LayoutShift` (`layoutId`) | Chuyển tab/lọc: gạch chân & khung chọn trượt sang vị trí mới thay vì nhảy | spring |
| Hover/press | Nút & hàng tương tác: nâng 1px + bóng, press co 0.98 | 120ms |

Luật bắt buộc (từ skill + khả dụng):
1. **Một khoảnh khắc lớn duy nhất** mỗi màn hình (hero nhịp ở Dashboard, hero ở /jobs); còn lại là chuyển động *đáp lại hành động* của người dùng.
2. Tôn trọng `prefers-reduced-motion`: tắt toàn bộ primitives về trạng thái tĩnh.
3. Không hiệu ứng trôi nổi lặp vô hạn (floating/parallax trang trí) trong màn hình nghiệp vụ.
4. Thời lượng ≤ 400ms cho tương tác, ≤ 800ms cho khoảnh khắc chính — nhanh hơn là "mượt", chậm hơn là "màu mè".

## 4. Phạm vi triển khai (thứ tự)

1. **Nền móng:** cài `motion` + `lucide-react` + font Be Vietnam Pro; tokens v3 (màu, font, easing) đồng bộ `tailwind.config.js` + `src/styles/tokens.css`; dựng `components/motion/` primitives + cập nhật UI kit (Button/Card/Modal/Badge dùng primitives).
2. **App shell:** AppLayout + sidebar/topbar mới (spring thu/mở, `layoutId` cho mục đang chọn, PageTransition bọc Outlet).
3. **Dashboard:** bố cục "Nhịp hôm nay" như wireframe mục 3.3.
4. **Trang điểm nhấn:** Đăng nhập, `/jobs` công khai (hero lớn), chi tiết nhân viên.
5. **Lan ra toàn bộ trang còn lại:** áp StaggerList/skeleton/trạng thái rỗng — không đổi logic, chỉ lớp trình bày.
6. **Kiểm chứng:** build, chụp screenshot từng trang chính đối chiếu brief (tự phê bình theo skill), quay video demo mới; kiểm tra reduced-motion và bàn phím (focus visible).

Ngoài phạm vi: đổi framework, đổi API/logic nghiệp vụ, dark mode (để đợt sau nếu muốn).

## 5. Tiêu chí đạt

- Mở Dashboard thấy ngay một khoảnh khắc chuyển động có chủ đích (thanh nhịp hôm nay chạy), không còn lưới thẻ đều tăm tắp.
- Chuyển trang, mở modal, duyệt đơn, tick việc — mọi thao tác đều có chuyển động đáp lại, mượt và ≤ 400ms.
- Bật `prefers-reduced-motion` → app tĩnh hoàn toàn, dùng bình thường.
- Build pass, không regression chức năng (chạy lại luồng demo: đăng nhập, chấm công, duyệt phép 2 cấp, khóa lương, ứng tuyển + AI CV).
