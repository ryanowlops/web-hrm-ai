# Checklist bảo mật — Web HRM tích hợp AI

> Cập nhật 2026-11-05 (đợt kiểm kê docs, commit `5850581`): viết lại bảng trạng thái §0 theo code thật, sửa các khẳng định sai (bcrypt, JWT claims, `SECRET_KEY`, audit log, token lưu ở đâu, logout), thêm mục logout revoke bug đang mở và các residual đã kiểm chứng trong code.
>
> File này là **checklist bảo mật duy nhất** của dự án. `docs/architecture.md` mục B8/B9 mô tả bảo mật bằng các khẳng định cũ (bcrypt, audit log "đã chạy") — khi writer kiến trúc rút gọn B8/B9, hai mục đó nên chỉ còn là con trỏ sang file này (ghi chú cho điều phối viên; file này không sửa `architecture.md`).
>
> Quy ước trạng thái: **Đã triển khai** = có code + đã nối vào app · **Chưa** = chưa có code hoặc có code nhưng chưa chạy · **Residual đã chấp nhận** = đã biết, chấp nhận rủi ro ở quy mô đồ án/demo, ghi rõ để không ai tưởng là "đã an toàn".
> Nguyên tắc xuyên suốt: **server (Flask) là nguồn sự thật cho mọi quyết định bảo mật** — frontend chỉ ẩn/hiện giao diện, không phải lớp bảo vệ.

## 0. Tổng quan ánh xạ — trạng thái THẬT

| # | Hạng mục | Nơi triển khai trong code | Trạng thái |
|---|---|---|---|
| 1 | JWT access + refresh | Flask-JWT-Extended (`extensions.py`) + blueprint `auth` + blocklist trong RAM (`auth/services.py:15-46`) | **Đã triển khai** — access 30 phút, refresh 7 ngày (`config.py:77-78`), claims `{role, email}` |
| 2 | Hash mật khẩu | `generate_password_hash` / `check_password_hash` của Werkzeug (PBKDF2 mặc định) trong `auth/services.py` | **Đã triển khai** — **không phải bcrypt** (xem §2) |
| 3 | Phân quyền theo dữ liệu (chống IDOR) | Service layer từng blueprint + `get_employee_in_scope`/`can_read_employee` + test phân quyền (mục 10) | **Đã triển khai** (service layer); suite test T1–T10 **Chưa** có (xem §10) |
| 4 | Upload file (CV, tài liệu) | `server/app/security.py` → `validate_upload()`, `sanitize_filename()` | **Chưa** — hàm tồn tại nhưng **0 caller**; recruitment/KB tự check inline, lệch nhau (xem §4) |
| 5 | Security headers | `server/app/security.py` → `add_security_headers(app)`, đăng ký trong app factory (`__init__.py:203-204`) | **Đã triển khai** |
| 6 | CORS allowlist | Flask-CORS gọi trực tiếp trong app factory (`__init__.py:188`), allowlist từ `CORS_ORIGINS` | **Đã triển khai** |
| 7 | Rate limit | Flask-Limiter, storage mặc định `memory://` (`config.py:98`) | **Đã triển khai** — login 10/phút + 100/giờ, CV check 10/phút + 30/giờ, JD 10/giờ, chat 30/phút/user |
| 8 | Log redaction + audit log | `server/app/security.py` → `redact_sensitive()`, `log_audit_event()`, `record_audit_log()` | **Chưa** — `redact_sensitive` có sẵn nhưng `log_audit_event`/`record_audit_log` có **0 caller: audit log chưa chạy** (xem §8) |
| 9 | Secrets qua biến môi trường | `.env` (đã có trong `.gitignore`) + `.env.example` không chứa giá trị thật | **Đã triển khai** (`.gitignore`); `JWT_SECRET_KEY` thiếu thì hard-fail ở production, `SECRET_KEY` thiếu chỉ cảnh báo (xem §9) |
| 10 | Kiểm thử phân quyền | Test API theo tiêu chí mục 10 + quét Strix (xem `docs/security-test-plan.md`) | **Chưa** — suite T1–T10 **không tồn tại** (không có `server/tests/`; CI bỏ qua pytest) |
| 11 | Thu hồi token khi logout / đổi mật khẩu | `POST /auth/logout` có nhánh revoke refresh token trong body (`auth/routes.py:73-85`) | **Chưa (bug đang mở)** — FE logout không gửi token trong body nên refresh token sống đủ 7 ngày; đổi mật khẩu cũng không revoke (xem §1) |
| 12 | Token lưu ở client | Web: localStorage; Mobile: DataStore không mã hoá | **Residual đã chấp nhận** (xem §1, §9) |

## 1. JWT — xác thực phiên

- [x] Access token **30 phút**, refresh token **7 ngày** (Flask-JWT-Extended, `config.py:77-78`).
- [x] Payload: `sub` (user id) + claims **`{role, email}`** (`auth/services.py:54-55`). **JWT có chứa email** — token chỉ được ký, không mã hoá, ai cầm token cũng đọc được email + role. Không nhét thêm dữ liệu nhạy cảm (lương…) vào token.
- [x] Khóa ký lấy từ biến môi trường `JWT_SECRET_KEY`, khác nhau giữa dev/production, đủ dài và ngẫu nhiên. Thiếu key thật ở production → app **từ chối khởi động** (xem §9).
- [x] Mọi endpoint cần đăng nhập đều kiểm tra: chữ ký hợp lệ, chưa hết hạn, role phù hợp, token chưa bị thu hồi (blocklist `jti` trong RAM, `auth/services.py:21-46`), **và tài khoản còn `is_active`** (`auth/guards.py:63`, `auth/services.py:99` — tài khoản bị khóa trả 403 `ACCOUNT_DISABLED` ngay cả khi token chưa hết hạn).
- [ ] Frontend: access token giữ trong bộ nhớ ứng dụng; gặp 401 thì refresh đúng 1 lần, thất bại → đăng xuất. Không lưu mật khẩu ở frontend trong bất kỳ trường hợp nào.
- [ ] **Đăng xuất/đổi mật khẩu: thu hồi refresh token phía server (blocklist) — không chỉ xóa token ở client.** Xem mục bug dưới đây.

### 1.1. BUG ĐANG MỞ — logout không thu hồi refresh token (phát hiện 2026-11-05, chưa sửa code)

Server có nhánh revoke (`auth/routes.py:73-85`): logout luôn thu hồi access token hiện tại (theo `jti`), và thu hồi luôn refresh token **chỉ khi client gửi nó trong body** (`{refresh_token}`). Nhưng:

- **Web:** `logout()` trong `client/src/features/auth/services.js:173-175` gọi `api.post('/auth/logout')` **không body** → refresh token **sống đủ 7 ngày sau khi người dùng đã "đăng xuất"**, vẫn cấp access token mới được.
- **Mobile:** đăng xuất chỉ xoá phiên ở máy (`ProfileViewModel.logout()` → `sessionStore.clear()`), **không gọi `POST /auth/logout`** — cùng hậu quả.
- **Đổi mật khẩu cũng không revoke:** `change_password()` (`auth/services.py:108-124`) chỉ cập nhật `password_hash` rồi commit — token cũ (cấp trước khi đổi mật khẩu) vẫn dùng được đủ hạn.

Hướng sửa (task riêng, không thuộc đợt viết docs này): FE/mobile gửi `{refresh_token}` trong body khi logout (web đã có token trong localStorage); `change_password` gọi `revoke_token` cho cả access `jti` hiện tại và refresh token của user; về lâu dài chuyển blocklist từ RAM sang Redis/DB để không mất khi restart (xem §11).

### 1.2. Token lưu ở client — residual đã chấp nhận

- **Web:** access + refresh token lưu trong **localStorage** (`hrm_access_token` / `hrm_refresh_token`, `features/auth/services.js:6-8`) — không phải "bộ nhớ ứng dụng" như bản cũ ghi. XSS thành công sẽ đọc được token. Đây là **residual đã chấp nhận** ở quy mô đồ án (đổi sang httpOnly cookie là việc lớn, cần sửa cả axios interceptor + CSRF); không ghi nhận là "đã an toàn".
- **Mobile:** token lưu trong DataStore (`core/datastore/SessionStore.kt`, key `access_token`/`refresh_token`) **không mã hoá** — ai đọc được dữ liệu app là đọc được token. Cùng residual như web. Địa chỉ server người dùng sửa được trong màn đăng nhập + `usesCleartextTraffic=true` (`AndroidManifest.xml:20`) cho phép gọi cả `http://` tới server local khi test — chấp nhận cho môi trường demo, không dùng với dữ liệu thật ngoài máy chủ của mình.

## 2. Hash mật khẩu

- [x] Băm bằng **Werkzeug `generate_password_hash` mặc định (PBKDF2)** — **không phải bcrypt/Argon2**. Bản cũ của file này (và `architecture.md` B8) ghi "bcrypt" là **sai**: không có bcrypt trong code. Không bao giờ dùng MD5/SHA thuần, không lưu mật khẩu dạng rõ ở bất kỳ đâu (kể cả log, file seed chứa mật khẩu thật, hay response API).
- [x] Kiểm tra mật khẩu bằng `check_password_hash` của Werkzeug (so sánh constant-time của thư viện), không tự so sánh chuỗi thủ công cho bí mật.
- [ ] Mật khẩu mẫu trong seed/demo phải là tài khoản **demo riêng**, ghi rõ trong README nội bộ là cần đổi/xóa khi dùng thật.
- [ ] Response của mọi endpoint không chứa `password_hash` — schema response (Marshmallow) khai báo tường minh các trường được trả.

## 3. Phân quyền theo dữ liệu — chống IDOR (hạng mục quan trọng nhất của HRM)

Role đúng vẫn chưa đủ: **mọi thao tác đọc/ghi một bản ghi cụ thể đều phải kiểm tra quyền sở hữu/phạm vi ở service layer** (kiến trúc B3.3), vì Employee sửa `id` trên URL là cách tấn công đầu tiên (và là trọng tâm quét Strix).

- [x] Employee: chỉ truy cập bản ghi có `employee_id` = chính mình (hồ sơ, chấm công, đơn nghỉ, phiếu lương) — kiểm tra ở service (`get_employee_in_scope` trả 404 ngoài phạm vi).
- [x] Manager: chỉ nhân viên thuộc phòng ban mình quản lý (`departments.manager_id` / `employees.manager_id`) — `can_read_employee` (`employees/services.py:129-143`).
- [ ] Phiếu lương: chỉ chủ sở hữu + HR/Admin. Manager **không** xem lương nhân viên nếu nghiệp vụ không cho phép.
- [ ] File CV/tài liệu: chỉ HR và Manager được gán vị trí đó; tải file phải qua endpoint có kiểm tra quyền, **không** dùng URL file tĩnh đoán được.
- [ ] Tài nguyên riêng tư của người khác: trả **404** (không lộ việc bản ghi tồn tại) hoặc 403 thống nhất theo quy ước B3.4 — chọn một kiểu và áp dụng nhất quán.
- [ ] Kiểm tra quyền nằm ở **service**, không chỉ ở route/decorator role — decorator chỉ chặn theo role, service chặn theo dữ liệu.

### 3.1. Residual đã kiểm chứng: manager đọc được `base_salary` của direct reports

`GET /employees/{id}/contracts` cho mọi role đã đăng nhập (`@require_roles(*READ_ROLES)`, `employees/routes.py:176-178`), phạm vi qua `get_employee_in_scope` → `can_read_employee` (manager được đọc nhân viên trực tiếp + phòng mình quản lý), và serializer `contract_to_dict` trả cả `base_salary` (`employees/schemas.py:61`). Tức **manager đọc được lương cơ bản của nhân viên trực thuộc** qua endpoint hợp đồng — đúng thiết kế hiện tại (quản lý cần thấy lương để duyệt?), nhưng cần ghi rõ: nếu nghiệp vụ chốt "manager không được xem lương" thì phải tách `base_salary` khỏi serializer này hoặc siết endpoint về HR/Admin. Hiện tại ghi nhận là residual, không phải bug.

## 4. Upload file (CV ứng viên, tài liệu quy chế)

Module: `server/app/security.py` — `validate_upload(file, allowed_exts, max_mb)` và `sanitize_filename(name)`.

> **Trạng thái thật: hàm tồn tại nhưng có 0 caller — kiểm tra upload tập trung CHƯA chạy.** Recruitment và KB tự check inline ở từng chỗ, lệch nhau: một chỗ kiểm `%PDF`, chỗ khác kiểm `%PDF-`. Các checkbox dưới đây mô tả hành vi của các điểm check inline hiện tại, không phải của `validate_upload`.

- [x] Kiểm tra **đuôi file** theo allowlist (CV: chỉ `.pdf`).
- [x] Kiểm tra **kích thước tối đa** (CV ≤ 5 MB; KB ≤ 10 MB) và chặn file rỗng.
- [ ] Kiểm tra **magic bytes** thống nhất: PDF phải bắt đầu bằng `%PDF-` — chặn file HTML/thực thi đội lốt PDF mà kiểm tra đuôi/content-type không phát hiện được. **Cần thống nhất về `%PDF-` và nối `validate_upload` vào các endpoint upload** (task riêng).
- [x] `sanitize_filename` loại bỏ path traversal (`../`), dấu tiếng Việt và ký tự nguy hiểm.
- [ ] Khi lưu: sinh **tên file mới bằng UUID**, lưu **ngoài thư mục public**, không giữ tên gốc làm đường dẫn.
- [ ] Endpoint nộp CV công khai (không đăng nhập) bắt buộc có **rate limit + giới hạn số lượt/ngày** (mục 7) và không trả về bất kỳ thông tin nội bộ nào trong response. (Rate limit hiện có: CV check 10/phút + 30/giờ; nộp CV 10/phút + 50/giờ — xem §7.)
- [ ] File chỉ được tải xuống qua endpoint kiểm tra quyền (mục 3), đặt `Content-Disposition: attachment`.

## 5. Security headers

Module: `server/app/security.py` — `add_security_headers(app)` đăng ký một `after_request` duy nhất trong app factory (`__init__.py:203-204`).

- [x] `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` — phù hợp vì Flask chỉ trả API JSON; SPA React có CSP riêng ở tầng phục vụ frontend (`client/vercel.json`).
- [x] `X-Content-Type-Options: nosniff`.
- [x] `Referrer-Policy: no-referrer` — tránh rò rỉ URL chứa id bản ghi.
- [x] `X-Frame-Options: DENY` — chống clickjacking.
- [x] `Strict-Transport-Security` (max-age 1 năm) — sẵn sàng cho khi triển khai HTTPS.
- [x] `Cache-Control: no-store` cho response JSON — dữ liệu lương/hồ sơ không bị lưu đệm ở trình duyệt/proxy dùng chung máy.
- [ ] Kiểm tra lại headers trên môi trường chạy thật (dev + bản demo) bằng trang Security Headers hoặc tab Network trước khi bảo vệ.

## 6. CORS

- [x] Dùng Flask-CORS với **allowlist** lấy từ biến môi trường `CORS_ORIGINS` (chỉ domain frontend của dự án) — đăng ký trong app factory (`__init__.py:188`, chỉ áp cho `/api/*`).
- [ ] Không bao giờ đặt `CORS_ORIGINS=*` kèm credentials/token — cấu hình này tương đương mở cửa API cho mọi website.
- [ ] Môi trường dev chỉ thêm `http://localhost:5173` (Vite), không để lọt cấu hình dev lên bản demo/production.

## 7. Rate limit

Flask-Limiter; storage mặc định `memory://` (`config.py:98`) — **in-RAM, reset khi restart** (xem §11).

- [x] `POST /auth/login`: **10/phút + 100/giờ** (`auth/routes.py:44`); refresh token: 30/phút.
- [x] Nộp CV công khai: 10/phút + 50/giờ (`recruitment/routes.py:216`); CV check AI: **10/phút + 30/giờ** (`:246-247`).
- [x] Endpoint gọi AI: chat 30/phút theo user (`chat/routes.py:33`); JD generate 10/giờ (`recruitment/routes.py:272`).
- [x] `RATELIMIT_DEFAULT` = `600 per hour` (`config.py:97`).
- [ ] Vượt giới hạn trả **429** theo đúng quy ước lỗi B3.4.
- [ ] Hạn mức để ở cấu hình/môi trường để chỉnh khi demo mà không sửa code.

## 8. Log redaction & audit log

Module: `server/app/security.py` — `redact_sensitive(data)`, `log_audit_event(...)`, `record_audit_log(db_session, audit_model, ...)`.

> **Trạng thái thật: audit log CHƯA chạy.** `log_audit_event`/`record_audit_log` có **0 caller** trong toàn bộ `server/app/` (đã grep). Bản cũ của file này ghi "mọi thao tác xem/xuất lương, duyệt đơn, phân tích CV đều ghi audit log" là **sai** — hiện tại không có thao tác nào ghi audit log.

- [x] `redact_sensitive` đệ quy che mọi khóa chứa: `password`, `token`, `secret`, `api_key`, `authorization`, `cookie`, `session`, `salary`, `cv_text`, toàn văn tài liệu... trước khi ghi log/audit.
- [ ] Mọi log kỹ thuật (kể cả log lỗi 500 và log của background worker AI) đi qua redaction hoặc chỉ log trường an toàn: **tuyệt đối không** log mật khẩu, JWT, API key AI, nội dung CV, toàn văn tài liệu quy chế, chi tiết phiếu lương.
- [ ] **Audit log bắt buộc** cho: đăng nhập (thành công/thất bại), xem/xuất phiếu lương, duyệt/từ chối đơn nghỉ, sửa hợp đồng/lương, chốt kỳ lương, chạy phân tích CV. Nội dung mỗi bản ghi: ai (id + role), hành động gì, lên đối tượng nào (type + id), kết quả, thời gian, IP. **Cần nối `log_audit_event`/`record_audit_log` vào các service này trước (task riêng)** — hiện tại chưa có caller nào.
- [ ] Audit ghi cùng transaction với nghiệp vụ (`record_audit_log` chỉ `flush`, service quyết định `commit`) để không có thao tác nhạy cảm nào "xảy ra mà không có dấu vết".

## 9. Secrets & cấu hình

- [x] `.env` nằm trong `.gitignore` ngay từ commit đầu; repo chỉ có `.env.example` với **giá trị rỗng/mẫu**, không có key thật.
- [x] **Production bắt buộc `JWT_SECRET_KEY` thật:** khi `REQUIRE_REAL_SECRETS=True` (production config), `create_app()` **từ chối khởi động** nếu `JWT_SECRET_KEY` còn là giá trị mặc định công khai (`__init__.py:143-160`). Riêng **`SECRET_KEY` của Flask thiếu/chưa đổi chỉ cảnh báo (warning), app vẫn chạy** — vì app xác thực bằng JWT header, không dùng session cookie. Bản cũ ghi "`SECRET_KEY` bắt buộc, thiếu thì app không khởi động" là **sai một nửa**.
- [ ] Các biến bắt buộc qua môi trường: `DATABASE_URL`, `JWT_SECRET_KEY`, `AI_API_KEY`, `CORS_ORIGINS` (xem B7). Bảng env đầy đủ xem `docs/env.md` (nguồn duy nhất).
- [ ] API key AI **chỉ tồn tại ở server**: frontend gọi Flask, Flask gọi AI (B8/A6.3). Kiểm tra bundle frontend không chứa chuỗi key trước khi demo.
- [ ] Nếu một key từng bị lộ (dán vào chat, commit nhầm, gửi qua kênh không an toàn): **thu hồi và tạo key mới ngay** — xóa khỏi lịch sử chat/commit không làm key an toàn trở lại.

### 9.1. Residual: keystore debug mobile đã commit

`mobile/debug.p12` — keystore debug cố định đã commit trong repo để CI ký APK debug (`mobile/app/build.gradle.kts`). Keystore debug công khai là chấp nhận được cho bản debug/demo (không dùng để phát hành), nhưng **không bao giờ dùng keystore này cho bản release** và không nhầm nó với keystore phát hành thật.

## 10. Tiêu chí kiểm thử phân quyền (nghiệm thu bắt buộc)

> **Trạng thái: suite T1–T10 CHƯA TỒN TẠI.** Không có thư mục `server/tests/`; CI bỏ qua pytest khi không có tests. Bản cũ của file này liệt kê bảng T1–T10 như "test API tự động" đã có là sai — đây là **tiêu chí cần viết thành test**, chưa phải test đang chạy. Viết suite này trước khi chạy `docs/security-test-plan.md` §5 bước 1.

Viết thành test API tự động (pytest + Flask test client), mỗi test dùng 2 tài khoản khác vai trò/phòng ban. **Toàn bộ phải đạt trước demo/bảo vệ:**

| # | Tình huống test | Kỳ vọng |
|---|---|---|
| T1 | Employee A dùng token của mình GET phiếu lương của Employee B | 403/404, không lộ bất kỳ trường lương nào |
| T2 | Employee sửa `employee_id` trong body khi tạo đơn nghỉ cho người khác | Bị chặn hoặc bị ghi đè thành chính mình; không tạo được đơn hộ |
| T3 | Manager phòng X GET danh sách/chi tiết nhân viên phòng Y | Chỉ thấy phòng X; bản ghi phòng Y trả 404/403 |
| T4 | Employee gọi endpoint của HR (tạo kỳ lương, chốt lương, xem toàn bộ bảng công) | 403 ở mọi endpoint |
| T5 | Chưa đăng nhập / token hết hạn / token bị sửa 1 ký tự gọi API nội bộ | 401 ở mọi trường hợp |
| T6 | Tài khoản đã bị khóa (`is_active=false`) dùng token cũ còn hạn | Bị chặn (401/403) — code đã có check `is_active` (`auth/guards.py:63`) |
| T7 | Employee tải file CV của ứng viên / tài liệu quy chế qua URL file đoán id | 403/404, không tải được |
| T8 | Upload file `.html` đổi tên thành `.pdf` vào endpoint CV | Bị chặn bởi magic bytes, trả 400, không có file nào được lưu |
| T9 | Đăng nhập sai liên tiếp vượt hạn mức cấu hình | Bị 429 theo rate limit |
| T10 | Kiểm tra response của các endpoint chính | Không chứa `password_hash`, API key, hay dữ liệu của người dùng khác |

## 11. Việc còn mở (ngoài phạm vi checklist này)

- **Logout revoke bug (§1.1) + audit log chưa chạy (§8) + `validate_upload` 0 caller (§4):** ba việc cần sửa code, không chỉ sửa docs. Thứ tự ưu tiên: logout revoke (token sống 7 ngày sau đăng xuất) → nối audit log → thống nhất check upload.
- **Endpoint chết `GET /notifications/unread-count`:** không tồn tại trên server nhưng cả web lẫn mobile đều gọi (web chuông luôn hiện 0, mobile có fallback). Xem `docs/mobile-api-map.md` mục "Endpoint chết" — cần quyết định: web/mobile dùng `GET /notifications` lấy `unreadCount`, hoặc thêm endpoint thật trên server.
- **Trạng thái trong RAM reset khi restart:** limiter dùng `memory://` và token blocklist là `set` trong RAM (`auth/services.py:21`) — restart server là mất hết: rate limit đếm lại từ đầu, token đã thu hồi bỗng dùng lại được. Chấp nhận ở 1 worker / demo; khi chạy nhiều instance hoặc cần revoke bền thì chuyển cả hai sang Redis/DB (code đã ghi chú sẵn hướng này).
- Quét bảo mật chủ động bằng Strix trên bản local: xem kế hoạch riêng `docs/security-test-plan.md` và phạm vi quét `security/strix-instructions.md`.
- HTTPS thật, backup dữ liệu và quy trình khôi phục: xử lý ở bước triển khai (B7), ngoài phạm vi đồ án local.
