# Cấu trúc thư mục Frontend — Web HRM AI (React + Vite)

Tài liệu này là **chuẩn cấu trúc** cho mọi dev làm việc trên `client/`. Mục tiêu: ai mới vào dự án cũng biết code nằm ở đâu, thêm tính năng mới đặt file vào đâu, và không phá vỡ kiến trúc. Quy tắc thiết kế giao diện xem thêm ở [DESIGN.md](./DESIGN.md).

Stack: **React 18 + Vite 5 + React Router 6 + TanStack Query 5 + Axios + Tailwind CSS 3 + Motion (`motion` — Motion for React) + `lucide-react`**. Font: **Inter Variable cho mọi thứ** (design system v4 — đã bỏ Be Vietnam Pro khỏi giao diện). Không dùng Redux — dữ liệu server đi qua TanStack Query, phiên đăng nhập đi qua `AuthContext`.

> Phiên bản tài liệu: **v4 — viết lại §§1/2/4/8.4 ngày 2026-11-05** (đợt kiểm kê docs, commit `5850581`): cây thư mục thật 34 feature, lazy importer tập trung ở `pages.js`, role gating qua `RouteGuard.jsx`/`guardedPage()`, quy trình thêm route 4 bước. Các mục còn lại (quy ước đặt tên, tổ chức features, styles, hooks/lib, màu, animation) giữ nguyên vì vẫn đúng.

---

## 1. Cây thư mục

```
client/
├── index.html                  # HTML gốc, mount #root
├── tailwind.config.js          # Design tokens cho Tailwind (màu, font, shadow, animation)
├── postcss.config.js
├── vite.config.js              # Dev server + proxy /api -> backend Flask :5000
├── vercel.json                 # Deploy production (Vercel): /assets/* immutable 1 năm, CSP
├── nginx.conf                  # Chỉ dùng cho docker-compose local (không phải production)
├── DESIGN.md                   # Stub trỏ sang docs/frontend-design-v4.md (nguồn sự thật duy nhất về thiết kế)
├── STRUCTURE.md                # Tài liệu này
└── src/
    ├── main.jsx                # Điểm vào: PersistQueryClientProvider + AuthProvider + RouterProvider, import styles
    ├── app/                    # Khung ứng dụng (routing + phiên đăng nhập)
    │   ├── pages.js            # LAZY IMPORTER tập trung: mọi page khai báo import() ở đây, router chỉ tham chiếu
    │   ├── router.jsx          # Khai báo toàn bộ route (38 route) + guardedPage()
    │   ├── RouteGuard.jsx      # Guard LẶNG theo role / needsEmployee (sai → redirect về /, không hiện lỗi)
    │   ├── ProtectedRoute.jsx  # Chặn theo phiên đăng nhập (bọc AppLayout); KHÔNG kiểm tra role từng trang
    │   ├── AuthContext.jsx     # AuthProvider + hook useAuth()
    │   └── PageLoading.jsx     # Skeleton chờ khôi phục phiên
    ├── api/                    # Tầng giao tiếp HTTP dùng chung
    │   ├── axiosClient.js      # Axios instance (baseURL /api/v1, gắn JWT, refresh token)
    │   └── index.js            # Barrel: export api + helper token + các API dùng chung (authApi...)
    ├── components/             # Component dùng lại trên toàn app
    │   ├── ui/                 # UI KIT — design system v4 (xem mục 3)
    │   ├── motion/             # Motion primitives v4, giảm liều (PageTransition, StaggerList, AnimatedNumber, ProgressRing, CheckMotion, Drawer, ActivePill; PulseBar deprecated — không dùng)
    │   └── icons.jsx           # Bộ icon SVG inline (kiểu Lucide/Feather, stroke, currentColor); icon mới ưu tiên lucide-react
    ├── layouts/
    │   └── AppLayout.jsx       # Khung sau đăng nhập: sidebar TRẮNG + topbar (⌘K, chuông) + <Outlet/>; NAV_ITEMS + lọc menu theo role/needsEmployee
    ├── features/               # Mỗi nghiệp vụ một thư mục (xem mục 4) — 34 thư mục:
    │   ├── admin/ announcements/ assets/ attendance/ attrition/ auth/
    │   ├── briefing/ calendar/ chatbot/ checkin/ dashboard/ departments/
    │   ├── display/ documents/ employees/ feed/ interviews/ journey/
    │   ├── kudos/ leave/ notifications/ offboarding/ onboarding/ orgchart/
    │   ├── payroll/ performance/ public/ recruitment/ reports/ rewards/
    │   ├── shifts/ skills/ surveys/ training/
    ├── hooks/                  # Hook dùng chung (useDebounce, useLocalStorage, useMediaQuery, useClickOutside)
    ├── lib/                    # Tiện ích thuần (format số/tiền/ngày...) — đặt helper không gắn UI vào đây
    ├── pages/
    │   └── NotFoundPage.jsx    # Trang tĩnh không thuộc feature nào (404)
    └── styles/                 # CSS nền tảng (xem mục 5)
        ├── tailwind.css        # @tailwind + component classes .ui-*
        ├── tokens.css          # Biến CSS :root (đồng bộ tailwind.config.js)
        ├── base.css            # Nền body, focus, cuộn, prefers-reduced-motion
        ├── animations.css      # Hiệu ứng bổ sung (stagger...)
        └── motion.css          # Micro-interaction bổ sung (hover/press...)
```

> Lưu ý đổi tên: `/settings` và `/profile` cũ nay là `/admin` và `/my-journey` (`router.jsx`). Trang `/display` (TV page) là ngoại lệ dark duy nhất của v4; trang `/checkin` nằm ngoài `AppLayout`.

## 2. Tầng app & api

- **`src/app/pages.js`** — nơi duy nhất khai báo lazy importer cho mọi page (`const importXxxPage = () => import('../features/...')` + `export const XxxPage = lazy(...)`) và `ROUTE_PREFETCHERS` (nạp trước chunk khi rê chuột vào menu). Thêm trang mới bắt đầu từ đây, không viết `lazy()` trong `router.jsx`.
- **`src/app/router.jsx`** — nơi duy nhất khai báo route (38 route: `/login`, `/jobs` công khai, `/checkin`, `/display` ngoài layout + 31 route con trong `AppLayout`). Router chỉ tham chiếu lại page đã `lazy` ở `pages.js`, và bọc từng route bằng `guardedPage(Component, roles, { needsEmployee })` (hàm này bọc `RouteGuard`).
- **`src/app/RouteGuard.jsx`** — guard LẶNG theo role và/hoặc `needsEmployee`: sai role hoặc tài khoản không gắn hồ sơ nhân viên thì `<Navigate to="/" replace />`, không hiện trang/banner lỗi. Đây là nơi duy nhất kiểm tra role từng trang.
- **`src/app/ProtectedRoute.jsx`** — chỉ bọc `AppLayout` để kiểm tra phiên đăng nhập (chưa đăng nhập → `/login`). File này có sẵn prop `roles` (hiện thẻ "Không có quyền truy cập") nhưng router hiện tại không dùng nó cho từng trang — đừng nhầm với `RouteGuard`.
- **`src/app/AuthContext.jsx`** — cung cấp `AuthProvider` và hook `useAuth()` (user hiện tại, login/logout). Đây là *state toàn cục duy nhất* của app. Không tạo context/store mới cho dữ liệu server.
- **`src/api/axiosClient.js`** — axios instance `baseURL: '/api/v1'`, tự gắn `Authorization: Bearer` từ localStorage (khóa `hrm_access_token` / `hrm_refresh_token`) và xử lý refresh khi 401. Response đã được bóc sẵn `data` — hàm gọi API nhận thẳng dữ liệu, không phải `AxiosResponse`.
- **`src/api/index.js`** — barrel export `api`, các helper token và API *dùng chung nhiều feature* (ví dụ `authApi`). API riêng của một nghiệp vụ thì đặt trong `services.js` của feature đó, không dồn hết vào đây.

## 3. UI kit — `src/components/ui/`

Import qua barrel, không import lẻ file con:

```jsx
import { Button, Card, CardHeader, CardBody, Badge, Modal } from '../../components/ui';
```

(Đường dẫn tương đối tùy độ sâu thư mục — page trong `features/*/pages/` đi lên 3 cấp.)

| Component | File | Cách dùng ngắn |
|---|---|---|
| `Button` | `Button.jsx` | `variant`: `primary` (mặc định) \| `accent` \| `secondary` \| `ghost` \| `danger` \| `dark`; `size`: `sm` \| `md` \| `lg`; prop `loading` tự hiện spinner và khóa nút. |
| `Card`, `CardHeader`, `CardBody` | `Card.jsx` | Thẻ nội dung chuẩn (`.ui-card`). `Card` nhận `hover` để bật hiệu ứng nhấc thẻ. `CardHeader` nhận `title`, `subtitle`, `actions`. |
| `FormField`, `Input`, `Select`, `Textarea` | `forms.jsx` | `FormField` bọc label + `hint` + `error` quanh ô nhập. Input/Select/Textarea dùng class `.ui-input/.ui-select/.ui-textarea` nên đồng nhất chiều cao/focus. |
| `Badge` | `Badge.jsx` | Nhãn trạng thái, `tone`: `slate` \| `blue` \| `green` \| `amber` \| `red` \| `violet` \| `teal`; prop `dot` thêm chấm màu phía trước. Ánh xạ trạng thái xem DESIGN.md. |
| `Modal` | `Modal.jsx` | Hộp thoại chuẩn: nền mờ + mở scale .98→1/fade 160ms, đóng bằng Esc/nút X/click nền, khóa cuộn body. Props: `open`, `title`, `subtitle`, `onClose`, `actions` (footer), `width` (mặc định `max-w-lg`). |
| `Spinner`, `Skeleton`, `TableSkeleton`, `EmptyState`, `Alert` | `feedback.jsx` | Phản hồi tải/lỗi/rỗng. Đang tải bảng dùng `TableSkeleton rows cols`; không có dữ liệu dùng `EmptyState` (icon, title, description, action); thông báo dùng `Alert tone`: `success` \| `error` \| `info` \| `warning`. |
| `PageHeader` | `PageHeader.jsx` | Đầu trang chuẩn v4: `title` (20px semibold), `subtitle` (14px gray-500), `actions` (nhóm nút bên phải, secondary trước primary sau). **Không còn `eyebrow`.** Mọi trang trong layout đều mở đầu bằng component này. |
| `StatCard` | `StatCard.jsx` | Thẻ số liệu dashboard phẳng v4: `label` (13px gray-500), `value` (24px semibold), `sub` (13px) — chỉ hiển thị số liệu thật từ API; kèm `icon`, `tone` khi cần. |

Quy tắc: **page không tự chế nút/thẻ/ô nhập bằng class rời** — luôn dùng kit ở trên hoặc class `.ui-*` trong `styles/tailwind.css` (`.ui-card`, `.ui-input`, `.ui-select`, `.ui-textarea`, `.ui-label`, `.ui-badge`, `.ui-table/.ui-th/.ui-td/.ui-tr`, `.ui-skeleton`, `.nice-scroll`).

### Icons — `src/components/icons.jsx`

Bộ icon SVG inline tự vẽ theo phong cách Lucide/Feather (stroke `currentColor`, **tuyệt đối không dùng emoji làm icon**). Dùng theo tên: `import { IconUsers } from '../../components/icons.jsx'` rồi `<IconUsers size={20} />`, hoặc component generic `<Icon name="users" />`. Thiếu icon thì thêm vào file này bằng factory `createIcon(children)` thay vì nhúng SVG rời trong page.

## 4. Features — `src/features/<tên>/`

Mỗi nghiệp vụ là một feature độc lập, cấu trúc giống hệt nhau:

```
features/<tên>/
├── pages/          # Component trang (route trỏ vào đây)
│   └── XxxPage.jsx
└── services.js     # Toàn bộ lời gọi API của feature
```

Quy ước bắt buộc:

- **Page chỉ lo hiển thị và tương tác**: render, form state cục bộ, gọi hook/service. Page **không** chứa URL API hay `axios` trực tiếp.
- **Mọi lời gọi API của feature nằm trong `services.js`** của chính feature đó, dùng instance `api` từ `src/api/`. Hàm đặt tên theo hành động (`getEmployees`, `createLeaveRequest`...), trả về dữ liệu đã bóc sẵn.
- **Dữ liệu server** (danh sách, chi tiết, thống kê) lấy qua **TanStack Query** (`useQuery`/`useMutation`) hoặc qua service + state của trang theo mẫu sẵn có của feature; sau mutation phải invalidate/refetch đúng query liên quan.
- **State phiên** (user, role) lấy từ `useAuth()` — không đọc localStorage trực tiếp trong page.
- Component con chỉ dùng trong 1 feature thì đặt cạnh page (thư mục con `components/` trong feature nếu nhiều); chỉ khi ≥2 feature cùng dùng mới đưa lên `src/components/`.

Danh sách feature hiện có (34 thư mục, kiểm chứng bằng `ls client/src/features/`): `admin` (AdminPage), `announcements`, `assets`, `attendance`, `attrition` (rủi ro nghỉ việc), `auth` (LoginPage), `briefing` (báo cáo điều hành AI), `calendar` (lịch team), `chatbot`, `checkin` (QR+GPS — ngoại lệ: page nằm thẳng ở `features/checkin/CheckinPage.jsx`, không qua `pages/`), `dashboard`, `departments`, `display` (TV page, nền navy — ngoại lệ dark duy nhất), `documents`, `employees` (list + detail), `feed`, `interviews` (phỏng vấn thử AI), `journey` (hành trình cá nhân, cần hồ sơ), `kudos`, `leave`, `notifications`, `offboarding`, `onboarding`, `orgchart`, `payroll`, `performance` (1 trang gộp 3 tab mine/team/review), `public` (PublicJobsPage — trang tuyển dụng công khai, không cần đăng nhập), `recruitment` (list + JobDetail — danh sách ứng viên & AI sàng lọc CV nằm trong JobDetail), `reports`, `rewards` (cửa hàng quà, cần hồ sơ), `shifts`, `skills`, `surveys`, `training`.

## 5. Styles — `src/styles/`

Thứ tự import trong `main.jsx` là cố định, không đổi thứ tự:

| File | Vai trò |
|---|---|
| `tailwind.css` | `@tailwind base/components/utilities` + định nghĩa các component class `.ui-*` trong `@layer components`. |
| `tokens.css` | Biến CSS `:root`: thang gray Untitled UI (ghi đè `gray` của Tailwind), màu brand, shadow, radius, thời lượng motion, màu biểu đồ Recharts (`--chart-1..5`). **Phải đồng bộ với `tailwind.config.js`** — sửa màu thì sửa cả hai nơi. |
| `base.css` | Font Inter, nền gray-50, màu chữ, focus-visible, thanh cuộn, và khối `@media (prefers-reduced-motion: reduce)` tắt animation toàn cục. |
| `animations.css` | Keyframes/tiện ích bổ sung ngoài config: hiệu ứng xuất hiện so le `.stagger`, các class chuyển động dùng chung. Keyframes chính (`fade-up`, `fade-in`, `scale-in`, `slide-in`, `shimmer`, `pulse-soft`) khai báo trong `tailwind.config.js`. |
| `motion.css` | Lớp micro-interaction bổ sung (hover/press/active) gắn vào class tiện ích riêng. CSS thuần, không `@apply`. |

## 6. Hooks & lib

- `src/hooks/` — hook tái sử dụng không gắn nghiệp vụ: `useDebounce`, `useLocalStorage`, `useMediaQuery`, `useClickOutside` (export qua `hooks/index.js`). Hook gắn chặt một feature thì để trong feature đó.
- `src/lib/` — hàm tiện ích thuần (format tiền VND, ngày tháng, cắt chuỗi...) dùng ở ≥2 nơi. Không để component hay lời gọi API trong `lib/`.

## 7. Quy ước đặt tên

- **File component/page**: PascalCase — `EmployeeListPage.jsx`, `StatCard.jsx`. Page luôn hậu tố `Page`.
- **File logic**: camelCase — `services.js`, `axiosClient.js`, `useDebounce.js` (hook tiền tố `use`).
- **Component**: PascalCase, trùng tên file. **Biến/hàm**: camelCase. **Hằng số cấu hình**: UPPER_SNAKE_CASE.
- **Feature**: tên thư mục một từ, thường, đúng tên nghiệp vụ (`payroll`, không phải `PayRoll` hay `salary-module`).
- Text hiển thị cho người dùng bằng **tiếng Việt**; tên biến/code/comment ngắn gọn tiếng Việt hoặc Anh đều được nhưng nhất quán trong một file.

## 8. Cách thêm một feature mới (từng bước)

Ví dụ thêm nghiệp vụ "Hợp đồng" (`contracts`) — đúng 4 bước, theo thứ tự:

1. Tạo thư mục `src/features/contracts/pages/` và `src/features/contracts/services.js`.
2. Viết `services.js`: import `api` từ `../../../api` (hoặc `../../../api/axiosClient`), export các hàm gọi endpoint (`getContracts`, `createContract`...) — không viết URL ở nơi khác.
3. Viết page `pages/ContractListPage.jsx`: mở đầu bằng `PageHeader`, nội dung trong `Card`, bảng dùng `.ui-table`, trạng thái dùng `Badge`, tải dữ liệu qua service + TanStack Query, trạng thái loading/empty/error dùng `TableSkeleton`/`EmptyState`/`Alert` của UI kit.
4. **Bước 1 — lazy importer ở `src/app/pages.js`:** thêm `const importContractListPage = () => import('../features/contracts/pages/ContractListPage.jsx')` và export `export const ContractListPage = lazy(importContractListPage)` (thêm vào `ROUTE_PREFETCHERS` nếu muốn nạp trước khi rê chuột vào menu).
5. **Bước 2 — đăng ký route ở `src/app/router.jsx`:** thêm route con trong `AppLayout`, bọc `guardedPage(ContractListPage, ['admin', 'hr'])` nếu cần giới hạn vai trò (truyền `{ needsEmployee: true }` nếu trang yêu cầu tài khoản có hồ sơ nhân viên).
6. **Bước 3 — menu (nếu cần) ở `src/layouts/AppLayout.jsx`:** thêm mục vào `NAV_ITEMS` (kèm icon, khai báo `roles` và/hoặc `needsEmployee: true` để menu ẩn đúng vai trò — menu và route phải khớp nhau: mục nào route chặn thì menu cũng ẩn).
7. Tự kiểm tra: `npm run build` không lỗi, trang mở được ở cả vai trò được phép/không được phép (vai trò không được phép phải bị silent redirect về `/`, không hiện trang lỗi), không có màu/animation tự chế ngoài quy tắc ở mục 9–10.

## 9. Quy tắc dùng màu

- Chỉ dùng **palette v4 đã định nghĩa** trong `tailwind.config.js`: thang `gray` Untitled UI (ghi đè gray của Tailwind — chữ/viền/nền trung tính, nền app gray-50, sidebar trắng) và `brand` (hành động chính brand-600, hover brand-700, nền nhấn brand-50, chữ nhấn brand-700). Thang `accent` (teal) chỉ còn dùng cho màu biểu đồ/điểm nhấn AI nhỏ. **Không dùng thang `slate` nữa.**
- Màu khác chỉ được dùng cho **trạng thái ngữ nghĩa** qua `Badge`/`Alert` tones theo bảng hex ở `docs/frontend-design-v4.md` mục 2 (success/warning/error/info/neutral). Không tự nghĩ mã hex mới trong page; cần biến CSS thì dùng token trong `tokens.css` (`--chart-*` dành riêng cho biểu đồ Recharts).
- Cấm tuyệt đối (hợp đồng v4): mọi gradient, hero band/panel tối trang trí, glassmorphism/glow, bo góc thẻ quá `rounded-xl`, shadow nổi cho thẻ (thẻ chỉ border + `shadow-card` siêu nhẹ), màu neon, emoji làm icon, chữ tương phản thấp (giữ tương phản ≥ 4.5:1 cho text thường).

## 10. Quy tắc animation

- **v4 — giảm liều: chuyển động đi qua motion primitives trong `src/components/motion/`** (xem `docs/frontend-design-v4.md` mục 6) — PageTransition (opacity + y 4px, 150ms), StaggerList/StaggerItem (tối đa 6 phần tử đầu, step 25ms), AnimatedNumber, ProgressRing, CheckMotion, Drawer (200ms ease-out), ActivePill. **`PulseBar` deprecated — không trang nào được dùng.** Page/feature không tự chế hiệu ứng mới.
- Modal mở scale .98→1 + fade **160ms**; chuyển động chỉ đáp lại hành động của người dùng hoặc báo thay đổi dữ liệu — không "khoảnh khắc trình diễn", không hiệu ứng trang trí lặp vô hạn (shimmer chỉ còn trong Skeleton khi tải).
- **Bắt buộc tôn trọng `prefers-reduced-motion`**: `base.css` đã tắt animation/transition toàn cục khi người dùng bật tùy chọn này — không ghi đè bằng `!important` hay inline style trong page.
- Chuyển trang/modal/drawer đều đi qua primitives ở trên; nếu một thao tác không cần chuyển động để người dùng hiểu chuyện gì vừa xảy ra thì để tĩnh.
...[truncated 2600 chars]