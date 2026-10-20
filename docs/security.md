# Checklist bảo mật — Web HRM tích hợp AI

> Ánh xạ từ kiến trúc bảo mật (mục B8, `docs/architecture.md`) tới code cụ thể.
> Quy ước trạng thái: **Đã có** = đã tồn tại trong repo · **Sẵn sàng tích hợp** = module đã viết, chờ app factory/blueprint nối vào · **Theo thiết kế** = chốt trong architecture, triển khai cùng module nghiệp vụ tương ứng.
> Nguyên tắc xuyên suốt: **server (Flask) là nguồn sự thật cho mọi quyết định bảo mật** — frontend chỉ ẩn/hiện giao diện, không phải lớp bảo vệ.

## 0. Tổng quan ánh xạ

| # | Hạng mục | Nơi triển khai trong code | Trạng thái |
|---|---|---|---|
| 1 | JWT access + refresh | `server/app/` extensions (Flask-JWT-Extended) + blueprint `auth` + decorator kiểm tra ở từng route | Theo thiết kế |
| 2 | Hash mật khẩu | Service của blueprint `auth`/`users` (werkzeug/argon2) | Theo thiết kế |
| 3 | Phân quyền theo dữ liệu (chống IDOR) | Service layer từng blueprint (B3.3) + test phân quyền (mục 10) | Theo thiết kế |
| 4 | Upload file (CV, tài liệu) | `server/app/security.py` → `validate_upload()`, `sanitize_filename()` | **Sẵn sàng tích hợp** |
| 5 | Security headers | `server/app/security.py` → `add_security_headers(app)` trong app factory | **Sẵn sàng tích hợp** |
| 6 | CORS allowlist | Flask-CORS cấu hình từ biến môi trường `CORS_ORIGINS` trong app factory | Theo thiết kế |
| 7 | Rate limit | Flask-Limiter: đăng nhập, nộp CV công khai, gọi AI | Theo thiết kế |
| 8 | Log redaction + audit log | `server/app/security.py` → `redact_sensitive()`, `log_audit_event()`, `record_audit_log()` | **Sẵn sàng tích hợp** |
| 9 | Secrets qua biến môi trường | `.env` (đã có trong `.gitignore`) + `.env.example` không chứa giá trị thật | **Đã có** (`.gitignore`) |
| 10 | Kiểm thử phân quyền | Test API theo tiêu chí mục 10 dưới đây + quét Strix (xem `docs/security-test-plan.md`) | Theo thiết kế |

## 1. JWT — xác thực phiên

- [ ] Access token ngắn hạn **15–60 phút**, refresh token **7 ngày** (Flask-JWT-Extended), đúng ADR-7.
- [ ] Payload tối thiểu: `sub` (user id) + `role`. Không nhét dữ liệu nhạy cảm (lương, email cá nhân...) vào token — JWT chỉ được ký, **không mã hóa**, ai cầm token cũng đọc được payload.
- [ ] Khóa ký lấy từ biến môi trường `JWT_SECRET_KEY`, khác nhau giữa dev/production, đủ dài và ngẫu nhiên.
- [ ] Mọi endpoint cần đăng nhập đều kiểm tra: chữ ký hợp lệ, chưa hết hạn, role phù hợp, **và tài khoản còn `is_active`** (tài khoản bị khóa phải mất quyền ngay cả khi token chưa hết hạn).
- [ ] Frontend: access token giữ trong bộ nhớ ứng dụng; gặp 401 thì refresh đúng 1 lần, thất bại → đăng xuất. Không lưu mật khẩu ở frontend trong bất kỳ trường hợp nào.
- [ ] Đăng xuất/đổi mật khẩu: thu hồi refresh token phía server (blocklist) — không chỉ xóa token ở client.

## 2. Hash mật khẩu

- [ ] Băm bằng **werkzeug (scrypt/pbkdf2) hoặc Argon2id/bcrypt** — không bao giờ dùng MD5/SHA thuần, không lưu mật khẩu dạng rõ ở bất kỳ đâu (kể cả log, file seed chứa mật khẩu thật, hay response API).
- [ ] Kiểm tra mật khẩu bằng hàm so sánh constant-time của thư viện (`check_password_hash`), không tự so sánh chuỗi thủ công cho bí mật.
- [ ] Mật khẩu mẫu trong seed/demo phải là tài khoản **demo riêng**, ghi rõ trong README nội bộ là cần đổi/xóa khi dùng thật.
- [ ] Response của mọi endpoint không chứa `password_hash` — schema response (Marshmallow) khai báo tường minh các trường được trả.

## 3. Phân quyền theo dữ liệu — chống IDOR (hạng mục quan trọng nhất của HRM)

Role đúng vẫn chưa đủ: **mọi thao tác đọc/ghi một bản ghi cụ thể đều phải kiểm tra quyền sở hữu/phạm vi ở service layer** (kiến trúc B3.3), vì Employee sửa `id` trên URL là cách tấn công đầu tiên (và là trọng tâm quét Strix).

- [ ] Employee: chỉ truy cập bản ghi có `employee_id` = chính mình (hồ sơ, chấm công, đơn nghỉ, phiếu lương).
- [ ] Manager: chỉ nhân viên thuộc phòng ban mình quản lý (`departments.manager_id` / `employees.manager_id`).
- [ ] Phiếu lương: chỉ chủ sở hữu + HR/Admin. Manager **không** xem lương nhân viên nếu nghiệp vụ không cho phép.
- [ ] File CV/tài liệu: chỉ HR và Manager được gán vị trí đó; tải file phải qua endpoint có kiểm tra quyền, **không** dùng URL file tĩnh đoán được.
- [ ] Tài nguyên riêng tư của người khác: trả **404** (không lộ việc bản ghi tồn tại) hoặc 403 thống nhất theo quy ước B3.4 — chọn một kiểu và áp dụng nhất quán.
- [ ] Kiểm tra quyền nằm ở **service**, không chỉ ở route/decorator role — decorator chỉ chặn theo role, service chặn theo dữ liệu.

## 4. Upload file (CV ứng viên, tài liệu quy chế)

Module: `server/app/security.py` — `validate_upload(file, allowed_exts, max_mb)` và `sanitize_filename(name)`.

- [x] Kiểm tra **đuôi file** theo allowlist (CV: chỉ `.pdf`).
- [x] Kiểm tra **kích thước tối đa** (CV ≤ 5 MB theo A5.4) và chặn file rỗng.
- [x] Kiểm tra **magic bytes**: PDF phải bắt đầu bằng `%PDF-` — chặn file HTML/thực thi đội lốt PDF mà kiểm tra đuôi/content-type không phát hiện được.
- [x] `sanitize_filename` loại bỏ path traversal (`../`), dấu tiếng Việt và ký tự nguy hiểm.
- [ ] Khi lưu: sinh **tên file mới bằng UUID**, lưu **ngoài thư mục public**, không giữ tên gốc làm đường dẫn.
- [ ] Endpoint nộp CV công khai (không đăng nhập) bắt buộc có **rate limit + giới hạn số lượt/ngày** (mục 7) và không trả về bất kỳ thông tin nội bộ nào trong response.
- [ ] File chỉ được tải xuống qua endpoint kiểm tra quyền (mục 3), đặt `Content-Disposition: attachment`.

## 5. Security headers

Module: `server/app/security.py` — `add_security_headers(app)` đăng ký một `after_request` duy nhất trong app factory.

- [x] `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` — phù hợp vì Flask chỉ trả API JSON; SPA React có CSP riêng ở tầng phục vụ frontend.
- [x] `X-Content-Type-Options: nosniff`.
- [x] `Referrer-Policy: no-referrer` — tránh rò rỉ URL chứa id bản ghi.
- [x] `X-Frame-Options: DENY` — chống clickjacking.
- [x] `Strict-Transport-Security` (max-age 1 năm) — sẵn sàng cho khi triển khai HTTPS.
- [x] `Cache-Control: no-store` cho response JSON — dữ liệu lương/hồ sơ không bị lưu đệm ở trình duyệt/proxy dùng chung máy.
- [ ] Kiểm tra lại headers trên môi trường chạy thật (dev + bản demo) bằng trang Security Headers hoặc tab Network trước khi bảo vệ.

## 6. CORS

- [ ] Dùng Flask-CORS với **allowlist** lấy từ biến môi trường `CORS_ORIGINS` (chỉ domain frontend của dự án).
- [ ] Không bao giờ đặt `CORS_ORIGINS=*` kèm credentials/token — cấu hình này tương đương mở cửa API cho mọi website.
- [ ] Môi trường dev chỉ thêm `http://localhost:5173` (Vite), không để lọt cấu hình dev lên bản demo/production.

## 7. Rate limit

- [ ] Flask-Limiter (hoặc cơ chế tương đương) áp dụng tối thiểu cho: `POST /auth/login` (chống dò mật khẩu), `POST /jobs/:id/apply` nộp CV công khai, các endpoint gọi AI (`/ai/*`, `/chat/*` — chống đốt quota/chi phí).
- [ ] Vượt giới hạn trả **429** theo đúng quy ước lỗi B3.4.
- [ ] Hạn mức để ở cấu hình/môi trường để chỉnh khi demo mà không sửa code.

## 8. Log redaction & audit log

Module: `server/app/security.py` — `redact_sensitive(data)`, `log_audit_event(...)`, `record_audit_log(db_session, audit_model, ...)`.

- [x] `redact_sensitive` đệ quy che mọi khóa chứa: `password`, `token`, `secret`, `api_key`, `authorization`, `cookie`, `session`, `salary`, `cv_text`, toàn văn tài liệu... trước khi ghi log/audit.
- [ ] Mọi log kỹ thuật (kể cả log lỗi 500 và log của background worker AI) đi qua redaction hoặc chỉ log trường an toàn: **tuyệt đối không** log mật khẩu, JWT, API key AI, nội dung CV, toàn văn tài liệu quy chế, chi tiết phiếu lương.
- [ ] **Audit log bắt buộc** cho: đăng nhập (thành công/thất bại), xem/xuất phiếu lương, duyệt/từ chối đơn nghỉ, sửa hợp đồng/lương, chốt kỳ lương, chạy phân tích CV. Nội dung mỗi bản ghi: ai (id + role), hành động gì, lên đối tượng nào (type + id), kết quả, thời gian, IP.
- [ ] Audit ghi cùng transaction với nghiệp vụ (`record_audit_log` chỉ `flush`, service quyết định `commit`) để không có thao tác nhạy cảm nào "xảy ra mà không có dấu vết".

## 9. Secrets & cấu hình

- [x] `.env` nằm trong `.gitignore` ngay từ commit đầu; repo chỉ có `.env.example` với **giá trị rỗng/mẫu**, không có key thật.
- [ ] Các biến bắt buộc qua môi trường: `DATABASE_URL`, `JWT_SECRET_KEY`, `AI_API_KEY`, `CORS_ORIGINS` (xem B7). Thiếu biến bắt buộc → app **không khởi động** và báo lỗi rõ, thay vì chạy với giá trị mặc định yếu.
- [ ] API key AI **chỉ tồn tại ở server**: frontend gọi Flask, Flask gọi AI (B8/A6.3). Kiểm tra bundle frontend không chứa chuỗi key trước khi demo.
- [ ] Nếu một key từng bị lộ (dán vào chat, commit nhầm, gửi qua kênh không an toàn): **thu hồi và tạo key mới ngay** — xóa khỏi lịch sử chat/commit không làm key an toàn trở lại.

## 10. Tiêu chí kiểm thử phân quyền (nghiệm thu bắt buộc)

Viết thành test API tự động (pytest + Flask test client), mỗi test dùng 2 tài khoản khác vai trò/phòng ban. **Toàn bộ phải đạt trước demo/bảo vệ:**

| # | Tình huống test | Kỳ vọng |
|---|---|---|
| T1 | Employee A dùng token của mình GET phiếu lương của Employee B | 403/404, không lộ bất kỳ trường lương nào |
| T2 | Employee sửa `employee_id` trong body khi tạo đơn nghỉ cho người khác | Bị chặn hoặc bị ghi đè thành chính mình; không tạo được đơn hộ |
| T3 | Manager phòng X GET danh sách/chi tiết nhân viên phòng Y | Chỉ thấy phòng X; bản ghi phòng Y trả 404/403 |
| T4 | Employee gọi endpoint của HR (tạo kỳ lương, chốt lương, xem toàn bộ bảng công) | 403 ở mọi endpoint |
| T5 | Chưa đăng nhập / token hết hạn / token bị sửa 1 ký tự gọi API nội bộ | 401 ở mọi trường hợp |
| T6 | Tài khoản đã bị khóa (`is_active=false`) dùng token cũ còn hạn | Bị chặn (401/403) |
| T7 | Employee tải file CV của ứng viên / tài liệu quy chế qua URL file đoán id | 403/404, không tải được |
| T8 | Upload file `.html` đổi tên thành `.pdf` vào endpoint CV | Bị chặn bởi magic bytes, trả 400, không có file nào được lưu |
| T9 | Đăng nhập sai liên tiếp vượt hạn mức cấu hình | Bị 429 theo rate limit |
| T10 | Kiểm tra response của các endpoint chính | Không chứa `password_hash`, API key, hay dữ liệu của người dùng khác |

## 11. Việc còn mở (ngoài phạm vi checklist này)

- Quét bảo mật chủ động bằng Strix trên bản local: xem kế hoạch riêng `docs/security-test-plan.md` và phạm vi quét `security/strix-instructions.md`.
- HTTPS thật, backup dữ liệu và quy trình khôi phục: xử lý ở bước triển khai (B7), ngoài phạm vi đồ án local.
