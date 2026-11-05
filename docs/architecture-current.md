# Kiến trúc hiện tại — Web HRM AI

> **Nguồn sự thật về kiến trúc hệ thống đang chạy.** Tài liệu này suy ra trực tiếp từ code tại commit `5850581` (05/11/2026). Tài liệu phân tích gốc ngày 21/10/2026 giữ lại ở `docs/architecture.md` — chỉ còn giá trị phân tích bài toán, không mô tả hệ thống hiện tại.
>
> Quy ước: mọi khẳng định về endpoint/role/số liệu trong file này đều đối chiếu với code; chỗ nào chưa xác minh được ghi rõ.

## 1. Sơ đồ triển khai

```text
Trình duyệt
  → Vercel (frontend React + Vite, build tĩnh) — https://hrm-ai-gray.vercel.app
  → Render (backend Flask + Gunicorn, Docker, region Singapore, gói Free)
       — https://hrm-ai-api.onrender.com
  → Neon PostgreSQL (region Singapore)
  → Google AI (OpenAI-compatible) — chat + embedding cho các tính năng AI
```

- Frontend và backend tách riêng hoàn toàn, giao tiếp duy nhất qua REST JSON `/api/v1` + JWT Bearer.
- Chi tiết deploy và vận hành: xem `docs/deployment.md`. Bảng biến môi trường duy nhất: xem `docs/env.md`. Trạng thái vận hành thay đổi nhanh (model AI, fallback, office GPS…): xem `docs/operations-status.md`.

## 2. Nguyên tắc kiến trúc (trích lại từ `architecture.md`, vẫn đúng)

1. **Server là nguồn sự thật.** Phân quyền, tính ngày công, tính lương, trừ phép, điểm AI đều xử lý ở Flask. React không tự tính lương, không tự quyết quyền; ẩn nút ở frontend chỉ là trải nghiệm.
2. **AI draft-first & human-in-loop.** Kết quả AI lưu ở bảng riêng (`cv_analyses`, bản nháp JD, bản nháp briefing…), không tự thay đổi trạng thái nghiệp vụ. HR là người ra quyết định cuối cùng.
3. **Bí mật chỉ ở server.** API key AI không bao giờ xuống frontend; React gọi Flask, Flask mới gọi AI.

## 3. Backend — Flask (modular monolith)

Application Factory `create_app()` trong `server/app/__init__.py`. Cấu hình chỉ đọc từ biến môi trường qua lớp `Config` (`server/app/config.py`); file `.env` không commit, chỉ có `server/.env.example`.

### 3.1. Blueprint — 30 tên đăng ký, 29 module thật

`_MODULE_BLUEPRINTS` (`server/app/__init__.py:27-58`) liệt kê 30 tên; factory đăng ký lần lượt module nào đã tồn tại, module chưa có thì bỏ qua lặng lẽ, app không crash.

| Module | Tiền tố | Ghi chú |
|---|---|---|
| `auth` | `/api/v1/auth` | Đăng nhập, refresh, logout, đổi mật khẩu |
| `users` | `/api/v1/users` | Tài khoản, vai trò (Admin) |
| `departments` | `/api/v1` | Route con tự ghi: `/departments`, `/positions` |
| `employees` | `/api/v1/employees` | Hồ sơ, hợp đồng, import Excel |
| `attendance` | `/api/v1` | Route con tự ghi: `/attendance/check-in`, `/attendance/monthly`… |
| `leave` | `/api/v1/leave` | Đơn nghỉ, duyệt 2 cấp |
| `payroll` | `/api/v1` | Route con tự ghi: `/payroll/periods`, `/payroll/my-payslip` |
| `recruitment` | `/api/v1` | Route con tự ghi: `/jobs`, `/jd/generate`, `/public/cv-check` |
| `performance` | `/api/v1/performance` | KPI/OKR, chu kỳ đánh giá |
| `onboarding` | `/api/v1/onboarding` | Checklist hội nhập |
| `assets` | `/api/v1` | Route con tự ghi: `/assets`, `/assignments` |
| `training` | `/api/v1/training` | Khoá học nội bộ |
| `announcements` | `/api/v1/announcements` | Thông báo toàn công ty |
| `shifts` | `/api/v1/shifts` | Ca làm, tăng ca, giải trình chấm công |
| `documents` | `/api/v1/documents` | Hồ sơ điện tử, giấy xác nhận |
| `offboarding` | `/api/v1/offboarding` | Quy trình nghỉ việc |
| `engagement` | `/api/v1/engagement` | Kudos, khảo sát, eNPS |
| `people_ai` | `/api/v1/people-ai` | Tra dữ liệu thật, dự báo nghỉ việc |
| `feed` | `/api/v1/feed` | Bảng tin nội bộ |
| `gamification` | `/api/v1/gamification` | Điểm thưởng, cửa hàng quà, huy hiệu |
| `skills` | `/api/v1/skills` | Bản đồ năng lực |
| `interviews` | `/api/v1/interviews` | Phỏng vấn thử với AI |
| `checkin` | `/api/v1` | Route con tự ghi: `/checkin/today-qr`, `/checkin/scan`, `/checkin/config`, `/checkin/logs` |
| `briefing` | `/api/v1/briefing` | AI briefing điều hành |
| `ai` | `/api/v1/ai` | Job phân tích CV, xếp hạng ứng viên |
| `kb` | `/api/v1/kb` | Tài liệu quy chế, embedding |
| `chat` | `/api/v1/chat` | Hỏi đáp RAG + hành động trong chat |
| `stats` | `/api/v1/stats` | Dashboard, báo cáo |
| `notifications` | `/api/v1/notifications` | Thông báo trong hệ thống |
| `admin` | — | **Không có thư mục `server/app/blueprints/admin/` nên đăng ký bị bỏ qua.** Chức năng quản trị nằm ở các endpoint `@require_roles("admin")` rải trong các blueprint khác (vd `users`) và route `/admin` phía frontend. |

Ngoài các blueprint nghiệp vụ còn có blueprint `health` (`GET /api/v1/health`, trả `{status, service, db}`) và route gốc `GET /` trả `{service, health, api_prefix, commit}` — trường `commit` lấy từ `RENDER_GIT_COMMIT`, dùng để kiểm tra bản đang chạy.

### 3.2. Quy ước trong mỗi blueprint

- **`bp` khai trong `__init__.py` của mỗi blueprint** (vd `server/app/blueprints/leave/__init__.py`), kèm `url_prefix`. Đây là điểm khác với tài liệu gốc: **không có `models.py` trong từng blueprint**.
- **Models tập trung** ở `server/app/models/` (một file theo miền: `employees.py`, `leave.py`, `payroll.py`, `recruitment.py`, `kb.py`, `checkin_log.py`, `interview_kit.py`, `briefing.py`…), import chung qua `server/app/models/__init__.py`.
- Phân lớp trong blueprint: `routes.py` (nhận request → kiểm tra JWT/role → validate Marshmallow → gọi service → trả JSON, không chứa logic nghiệp vụ), `services.py` (toàn bộ logic + kiểm tra quyền theo dữ liệu + transaction), `schemas.py` (Marshmallow; response không bao giờ lộ `password_hash`).
- Extensions tập trung ở `server/app/extensions.py`: chỉ có `db`, `migrate`, `jwt`, `limiter` — **không có `cors`**; CORS gọi trực tiếp trong `create_app()` (`__init__.py:180`), chỉ cho phép origin trong `CORS_ORIGINS`.

### 3.3. Auth — JWT

- Access token **30 phút**, refresh token **7 ngày** (`config.py:83-84`); vị trí token: header `Authorization: Bearer`.
- Claims thêm trong token: `{role, email}` (`auth/services.py:54-55`); `sub` là id người dùng.
- Mật khẩu băm bằng **Werkzeug `generate_password_hash` (PBKDF2 mặc định) — KHÔNG phải bcrypt**.
- Logout thu hồi access token qua blocklist theo `jti`; refresh token chỉ bị thu hồi khi client gửi nó trong body của `POST /auth/logout` — xem `docs/operations-status.md` (bug đang mở: frontend web hiện không gửi body).
- Phân quyền: kiểm tra role bằng decorator ở route **và** kiểm tra phạm vi dữ liệu (cá nhân / phòng ban / toàn công ty) ở tầng service. Tài khoản thuần hệ thống (vd `admin@hrm.local` không gắn hồ sơ nhân viên) vẫn đăng nhập và dùng được các chức năng theo vai trò; các endpoint theo phạm vi cá nhân chỉ bắt buộc hồ sơ khi `scope=mine` hoặc role employee/manager (quy tắc sửa ở commit `5850581`).

### 3.4. Quy ước lỗi

Mọi lỗi trả về một định dạng duy nhất (`server/app/errors.py`):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Thông báo tiếng Việt dễ hiểu", "details": [] } }
```

Mã HTTP chuẩn: 400 dữ liệu sai, 401 chưa đăng nhập/token hết hạn, 403 không đủ quyền, 404 không tồn tại (dùng cho tài nguyên riêng tư của người khác), 409 xung đột, 413 file quá lớn, 422 file hợp lệ nhưng không trích được text/AI không phân tích được, 429 vượt hạn mức, 503 AI không khả dụng. Frontend dựa vào `error.code` để hiển thị, không dựa vào nội dung `message`.

### 3.5. AI — không khoá nhà cung cấp, không hàng đợi

- Mọi lời gọi AI đi qua một điểm duy nhất: `server/app/ai_service/provider.py` (`get_provider()`), giao thức OpenAI-compatible qua HTTP JSON thuần, cấu hình hoàn toàn bằng biến môi trường (`AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_EMBEDDING_MODEL`, `AI_FALLBACK_*`). Xem `docs/env.md`.
- **KHÔNG có Celery/RQ.** Không có worker nền riêng; `docker-compose.yml` có thể còn service `redis` nhưng app không dùng Celery. Các tác vụ AI chạy trong request (đồng bộ) hoặc theo luồng riêng của từng tính năng — xem từng file `feature-expansion-*.md`.
- **KHÔNG dùng pgvector.** RAG dùng cosine tính trong Python + truy hồi lai (vector 0.7 / từ khoá 0.3, tối đa 20 ứng viên mỗi phía, `TOP_K = 5`) + rerank bằng LLM — xem `docs/rag-upgrade.md`. Embedding lưu dạng JSON list[float]; pgvector chỉ là hướng mở rộng, không có trong code.
- FallbackProvider (bọc provider chính + dự phòng cho chat) có code sẵn nhưng **chưa kích hoạt** — xem `docs/operations-status.md`.

## 4. Luồng nghiệp vụ chính (trích lại từ `architecture.md`, vẫn đúng)

### 4.1. Duyệt đơn nghỉ 2 cấp

Employee tạo đơn → kiểm tra số dư phép + trùng đơn → Manager duyệt cấp 1 (`POST /leave/requests/<id>/manager-decision`) → HR duyệt cấp cuối (`POST /leave/requests/<id>/hr-decision`) → **trong 1 transaction**: trạng thái `approved` + trừ `leave_balances` + cập nhật bảng công các ngày nghỉ. Từ chối ở cấp nào → đơn kết thúc, ghi lý do, không trừ phép.

> Lưu ý: endpoint duyệt thật là `/manager-decision` và `/hr-decision` — tài liệu gốc ghi `/approve` / `/reject` là **không tồn tại**.

### 4.2. Tính lương tháng (đơn giản hoá, theo cấu hình)

```text
Lương theo ngày công = Lương cơ bản × (Ngày công hưởng lương / Ngày công chuẩn)
  Ngày công hưởng lương = ngày làm thực tế + ngày nghỉ có phép (không gồm nghỉ không lương)
Khấu trừ bảo hiểm = Lương cơ bản × Tỷ lệ BHXH/BHYT/BHTN (lấy từ cấu hình)
Thu nhập tính được = Lương theo ngày công + Phụ cấp − Khấu trừ bảo hiểm − Khấu trừ khác (nếu có)
```

HR xem trước toàn bộ bảng lương → kiểm tra bất thường → chốt kỳ (`POST /payroll/periods/<id>/lock`) → sinh phiếu lương cho từng nhân viên. Kỳ đã chốt không tính lại trực tiếp. Kết quả tính lưu kèm `breakdown` JSON để đối chiếu từng thành phần. Đây là mô hình lương đơn giản hoá cho đồ án, không triển khai đầy đủ luật BHXH/thuế TNCN.

### 4.3. Pipeline sàng lọc CV bằng AI

`Upload CV (PDF ≤ 5 MB) → kiểm tra file → trích xuất text → làm sạch → gọi AI kèm JD → validate JSON (match_score 0–100, các trường danh sách phải là mảng chuỗi) → lưu kết quả phân tích (draft/gợi ý) → HR xem và quyết định`. Đầu ra bắt buộc: `match_score`, `matched_skills`, `missing_skills`, `experience_years_estimate`, `education_summary`, `strengths`, `concerns`, `summary`. Xếp hạng ứng viên theo `match_score` giảm dần, kèm cảnh báo "điểm do AI gợi ý". Giới hạn mặc định 20 CV/lượt (`AI_MAX_CANDIDATES_PER_RUN`).

### 4.4. Chatbot RAG

HR upload tài liệu quy chế → tách chunk 500–1.000 ký tự, overlap 100 → tạo embedding → lưu chunk. Người dùng hỏi → truy hồi lai + rerank → AI trả lời chỉ dựa trên các đoạn tìm được, kèm trích dẫn nguồn. Không tìm thấy trong tài liệu → trả lời rõ "chưa có thông tin", không bịa chính sách. Chi tiết từng con số: xem `docs/rag-upgrade.md`.

## 5. Frontend — React + Vite (chuẩn v4)

- React JS + Vite, React Router, TanStack Query, Tailwind CSS, Recharts. Thiết kế theo chuẩn v4: sidebar trắng, topbar trắng, canvas gray-50, flat border card, tiêu đề 20px, không gradient/dark hero/pulse/glass — nguồn sự thật duy nhất: `docs/frontend-design-v4.md`.
- Tổ chức theo feature: `client/src/features/<domain>/` (pages/services/components), lazy import tập trung ở `client/src/app/pages.js`, đăng ký route ở `router.jsx`.
- Role-visibility: menu ẩn theo role qua `NAV_ITEMS` + `needsEmployee` trong `AppLayout.jsx`; route chặn lặng lẽ qua `RouteGuard.jsx` (chuyển về `/` thay vì trang 403). Tài khoản không có hồ sơ nhân viên bị ẩn `/my-journey` và `/rewards`.
- Token: access token lưu ở frontend, gặp 401 thì thử refresh đúng 1 lần rồi đăng xuất về trang đăng nhập.

## 6. Triển khai & vận hành

- Deploy: xem `docs/deployment.md` (Render Blueprint + deploy hook qua GitHub Actions, Vercel tự deploy).
- Biến môi trường: xem `docs/env.md` — bảng duy nhất, sinh từ `server/app/config.py` + `server/.env.example`.
- Trạng thái vận hành thay đổi nhanh: xem `docs/operations-status.md`.

## 7. Những gì tài liệu gốc nói sai (để khỏi tra lại)

| Tài liệu gốc nói | Thực tế ở commit `5850581` |
|---|---|
| 12 blueprint | 30 tên đăng ký, 29 module thật (`admin` không tồn tại) |
| `models.py` trong từng blueprint | Models tập trung ở `server/app/models/` |
| `bp` khai trong `routes.py` | `bp` khai trong `__init__.py` của mỗi blueprint |
| Mật khẩu bcrypt | Werkzeug PBKDF2 |
| RAG dùng pgvector, top-k 3–5 | Cosine trong Python, hybrid 0.7/0.3, TOP_K = 5, rerank LLM |
| Worker Celery/RQ + Redis queue | Không có Celery/RQ |
| Leave `/approve` / `/reject` | `/manager-decision` và `/hr-decision` |
| Đào tạo / KPI / tài sản "ngoài phạm vi" | Đã triển khai đầy đủ (blueprint `training`, `performance`, `assets`) |
| Chấm công "không GPS ở v1.0" | Đã có QR+GPS check-in (xem `docs/feature-expansion-v6.md`) |
| Deploy chính bằng Docker Compose | Production: Vercel + Render Docker + Neon |
