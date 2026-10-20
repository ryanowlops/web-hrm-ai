# Ngân sách hiệu năng & Tối ưu tốc độ — Web HRM tích hợp AI

> Tài liệu đi kèm [architecture.md](architecture.md). Mục tiêu: trang tải nhanh, chuyển trang mượt, API phản hồi nhanh — và **đo được bằng số**, không cảm tính. Mọi con số dưới đây là ngân sách (budget) để kiểm tra ở mỗi lần release/demo, không phải cam kết tuyệt đối trên mọi thiết bị.

## 1. Ngân sách hiệu năng (Performance Budget)

| Hạng mục | Ngân sách | Cách đo |
|---|---|---|
| JS tải lần đầu (initial bundle, đã gzip) | ≤ 200 KB | Cỡ các file trong `client/dist/assets` sau `npm run build` |
| CSS tải lần đầu (đã gzip) | ≤ 40 KB | Như trên |
| Chunk của từng trang (route chunk) | ≤ 80 KB gzip/trang | Như trên, xem theo từng file chunk |
| Tổng tài nguyên lần tải đầu (trang đăng nhập/dashboard) | ≤ 600 KB | DevTools → Network, lọc lần tải đầu (Disable cache) |
| LCP (Largest Contentful Paint) — mobile giả lập | < 2.5 s | Lighthouse (mục 5) |
| INP (Interaction to Next Paint) | < 200 ms | Lighthouse / Web Vitals |
| CLS (Cumulative Layout Shift) | < 0.1 | Lighthouse |
| Điểm Lighthouse Performance (desktop, chạy local/Docker) | ≥ 85 | Lighthouse |
| API thường (không phải AI) | p95 < 500 ms với dữ liệu mẫu | Log server / test tải nhẹ (mục 6) |
| Phân trang danh sách | Luôn 20 bản ghi/trang (tối đa 100) | Quy ước API — xem architecture mục B6 |

Vượt ngân sách ở hạng mục nào thì xử lý đúng hạng mục đó trước khi release; không "để sau" âm thầm.

## 2. Tối ưu phía Frontend (React JS + Vite)

### 2.1. Code-splitting theo route bằng `React.lazy` (đã áp dụng ở router)

- Mọi page trong `client/src/app/router` đều được nạp bằng `React.lazy(() => import(...))` kèm `Suspense` với fallback là skeleton/spinner nhẹ. Kết quả: người dùng ở trang Đăng nhập **không phải tải** mã của Bảng lương, Tuyển dụng, Chatbot… cho tới khi thật sự vào các trang đó.
- Không import "nguyên thư viện" vào các trang dùng chung: tránh `import _ from 'lodash'`, tránh import toàn bộ thư viện icon — import đúng biểu tượng cần dùng để bundler tree-shake được.

### 2.2. Tách chunk vendor trong cấu hình Vite

- `build.rollupOptions.output.manualChunks` tách các thư viện ít thay đổi (`react`, `react-dom`, `react-router-dom`, thư viện HTTP/state) thành chunk `vendor` riêng. Nhờ tên file của chunk vendor ổn định qua các lần deploy, trình duyệt giữ được bản đã cache 1 năm (xem 2.4) thay vì tải lại toàn bộ JS mỗi lần sửa code nghiệp vụ.
- Biểu đồ (Recharts) là phần nặng nhất của giao diện: **chỉ lazy-load ở các trang Dashboard/Thống kê** (nằm trong route chunk của chính trang đó), tuyệt đối không đưa vào bundle chung — nhân viên chỉ chấm công/xem phiếu lương không phải trả chi phí tải thư viện biểu đồ.

### 2.3. Dữ liệu và render

- Danh sách luôn gọi API có phân trang (20/trang) — không bao giờ tải "toàn bộ nhân viên" về rồi cắt ở frontend.
- TanStack Query cache theo query key, `staleTime` hợp lý cho dữ liệu ít đổi (phòng ban, loại nghỉ) để chuyển trang qua lại không gọi lại API thừa; dữ liệu chấm công/lương để `staleTime` ngắn hoặc invalidate đúng sau thao tác ghi.
- Ảnh đại diện nén về kích thước hiển thị thực tế, ưu tiên định dạng WebP; ảnh trong trang công khai (tin tuyển dụng) dùng `loading="lazy"`.
- Tránh re-render diện rộng: tách component bảng/biểu đồ, dùng `React.memo` cho hàng/cell nặng khi danh sách dài; không để state toàn cục (phiên đăng nhập) kéo theo re-render của cây component không liên quan.

### 2.4. Nén và cache (đã cấu hình ở `client/nginx.conf`)

| Tài nguyên | Chính sách |
|---|---|
| Toàn bộ text (JS/CSS/JSON/SVG/font) | `gzip on`, mức nén 6 — JS/CSS thường giảm 60–75% dung lượng |
| `/assets/*` (file có hash của Vite) | `Cache-Control: public, immutable`, `expires 1y` — cache dài hạn an toàn vì đổi nội dung là đổi tên file |
| Ảnh/font tĩnh | Cache 30 ngày |
| `index.html` | `no-cache, no-store, must-revalidate` — luôn lấy bản mới nhất để trỏ đúng hash mới sau deploy |

Khi chạy Docker, FE gọi API qua proxy `/api/` của chính Nginx (cùng origin) nên không phát sinh request preflight CORS và không cần một lần phân giải/kết nối tới domain khác.

## 3. Tối ưu phía Backend (Flask)

- **Phân trang bắt buộc ở SQL**, không phân trang ở Python sau khi đã lấy hết: `query.limit()/offset()` hoặc keyset cho danh sách dài; response tuân thủ định dạng `{ data, meta }` (architecture B6).
- **Chỉ mục đúng các truy vấn nóng** (đã liệt kê ở architecture A7): `attendance(employee_id, work_date)`, `leave_requests(employee_id, status)`, `payroll_items(period_id, employee_id)`, `candidates(job_id, status)`, chỉ mục vector pgvector cho `kb_chunks.embedding`.
- **Tránh N+1:** dùng `joinedload/selectinload` của SQLAlchemy khi trả danh sách kèm phòng ban/chức vụ/quản lý; một trang danh sách 20 nhân viên chỉ được phát sinh số query hằng số, không tăng theo số dòng.
- **Tác vụ chậm không nằm trong request:** trích text PDF, gọi AI phân tích CV, tạo embedding chạy ở tiến trình nền (worker) có trạng thái job; request HTTP trả `202` ngay (architecture B5.2). Đây là tối ưu hiệu năng quan trọng nhất của hệ thống: người dùng không bao giờ phải chờ AI.
- **Gunicorn:** 2 workers × 4 threads là điểm khởi đầu trong `server/Dockerfile`; khi đo thấy nghẽn CPU ở xử lý PDF thì tăng workers, nghẽn chờ I/O thì tăng threads — chỉnh bằng số đo, không đoán.
- **Tính lương theo lô:** khi chốt kỳ, tính bằng truy vấn tổng hợp theo kỳ cho toàn bộ nhân viên thay vì vòng lặp query từng người; kết quả lưu kèm `breakdown` để lần đọc sau không tính lại.
- **Nén/đệm phía API (mở rộng nếu cần):** bật nén gzip cho JSON response lớn (Flask-Compress) khi đo thấy payload danh sách/báo cáo lớn; dữ liệu tham chiếu ít đổi (loại nghỉ, phòng ban) có thể kèm header `Cache-Control` ngắn để TanStack Query/HTTP cache tận dụng.

## 4. Ngân sách theo trang (áp dụng khi kiểm thử)

| Trang | Lưu ý hiệu năng riêng |
|---|---|
| Đăng nhập | Trang nhẹ nhất: không chunk biểu đồ, không ảnh nền nặng — mục tiêu hiển thị < 1 s trên mạng khá |
| Dashboard HR | Biểu đồ lazy; số liệu tổng hợp lấy từ `/stats/overview` một lần, không gọi lẻ từng chỉ số |
| Danh sách nhân viên | Phân trang 20, avatar lazy, lọc/tìm kiếm debounce ~300 ms ở client, truy vấn ở server |
| Chấm công (mobile 360px) | Ít tài nguyên nhất có thể — nhân viên dùng hằng ngày trên điện thoại/mạng yếu |
| Phân tích CV | Không chặn UI: hiển thị trạng thái job và cho phép rời trang, quay lại xem kết quả sau |
| Chatbot | Trả lời có thể đến chậm theo AI — hiển thị trạng thái "đang tra cứu tài liệu" rõ ràng, không treo toàn trang |

## 5. Checklist đo bằng Lighthouse

Chạy trên bản **production build qua Docker** (không đo trên dev server của Vite — số sẽ sai):

1. `docker compose up --build` → mở `http://localhost:5173`.
2. Chrome DevTools → Lighthouse → Mode: Navigation, Device: Mobile (và chạy lại Desktop) → Analyze.
3. Đối chiếu 4 chỉ số ở mục 1: Performance ≥ 85 (desktop), LCP < 2.5 s, CLS < 0.1, INP < 200 ms (INP xem thêm ở mục Performance/Web Vitals khi thao tác thật).
4. Đọc mục **Opportunities/Diagnostics**: xử lý theo thứ tự tác động lớn nhất — thường là: ảnh quá khổ, JS chưa dùng ở lần tải đầu (kiểm tra lại việc lazy-load), thiếu cache (kiểm tra lại header ở `nginx.conf`).
5. Ghi lại điểm số + ngày đo vào ghi chú release; điểm tụt > 5 so với lần trước thì tìm nguyên nhân trước khi demo.

Đo thêm thủ công: DevTools → Network → bật "Disable cache", tải lại trang Dashboard — kiểm tra (a) không có file nào trong `/assets/` bị tải 2 lần, (b) sau khi tải lại lần hai (bỏ Disable cache), các file `/assets/` phải hiện "(from disk cache)".

## 6. Kiểm tra bundle và API

**Bundle (frontend):**

```bash
cd client
npm run build
# Xem kích thước từng chunk sau build — đối chiếu ngân sách mục 1
ls -la dist/assets
# (Tùy chọn) Trực quan hóa bundle để tìm thư viện chiếm dung lượng bất thường:
npx vite-bundle-visualizer
```

Quy tắc xử lý khi vượt ngân sách: tìm chunk lớn nhất trước → kiểm tra có thư viện nào bị import toàn bộ không → kiểm tra trang nặng đã lazy đúng chưa → cuối cùng mới cân nhắc đổi thư viện.

**API (backend):**

- Kiểm tra nhanh bằng thời gian response trong log Gunicorn hoặc `curl -w '%{time_total}\n'` với các endpoint nóng: danh sách nhân viên, bảng công tháng, phiếu lương.
- Với dữ liệu mẫu đúng quy mô đồ án (200 nhân viên, 500 CV), endpoint danh sách phải về dưới 500 ms ở p95; nếu chậm, kiểm tra theo thứ tự: thiếu index → N+1 → đang trả thừa trường dữ liệu → phân trang chưa áp ở SQL.
- Riêng endpoint AI: chỉ đo thời gian **nhận job** (phải nhanh, trả `202`), thời gian xử lý job đo riêng ở log worker, không tính vào ngân sách API thường.

## 7. Nguyên tắc chung

1. Đo trước — tối ưu sau; mọi tối ưu phải chỉ được số đo nào cải thiện.
2. Ngân sách là cổng kiểm tra release, không phải khẩu hiệu: vượt ngân sách thì sửa hoặc ghi rõ lý do chấp nhận vào ghi chú release.
3. Không đánh đổi bảo mật lấy tốc độ: cache dài hạn chỉ áp cho tài nguyên tĩnh công khai có hash; dữ liệu lương/CV không bao giờ cache ở tầng Nginx/proxy.
