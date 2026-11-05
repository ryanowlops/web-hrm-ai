# HRM API — Backend (Flask)

API cho Web HRM tích hợp AI. Frontend React JS giao tiếp duy nhất qua REST API
JSON tại tiền tố `/api/v1` với JWT Bearer (kiến trúc B1/B6 trong
[`../docs/architecture.md`](../docs/architecture.md)).

> Cập nhật 2026-11-05 (đợt kiểm kê docs, commit `5850581`): viết lại mục "Cấu trúc" theo code thật (`bp` trong `__init__.py`, không có module `admin`), lệnh gunicorn theo `Dockerfile`, mục migrations ghi rõ chưa có `migrations/` được commit, bảng env trỏ sang `docs/env.md` làm nguồn duy nhất.

## Cấu trúc

```text
server/
├── run.py                  # Điểm chạy (dev server / gunicorn)
├── requirements.txt
├── Dockerfile              # Production (Render): gunicorn 1 worker × 8 threads, AUTO_SEED
├── seed.py                 # Seed demo (50 nhân viên / 5 phòng ban) + db.create_all() cho dev
├── check_*.py              # Suite kiểm tra theo tính năng (check_v6_checkin, check_v6_briefing,
│                           #   check_v6_recruitment_ai, check_leave_noprofile) — chạy bằng python, không phải pytest
├── .env.example            # Mẫu biến môi trường (copy thành .env)
└── app/
    ├── __init__.py         # create_app() — Application Factory; đăng ký 30 blueprint
    ├── config.py           # Config theo môi trường, đọc từ env
    ├── extensions.py       # db, migrate, jwt, limiter (KHÔNG có cors — CORS gọi trực tiếp ở __init__.py)
    ├── errors.py           # ApiError + handler trả lỗi chuẩn
    ├── health.py           # GET /api/v1/health (trả thêm trường db)
    ├── security.py         # Security headers, validate_upload, redact_sensitive, audit log (xem docs/security.md)
    ├── http_cache.py       # Cache GET trong RAM, TTL 30s, header X-Cache HIT/MISS (xem docs/performance.md)
    ├── ai_service/         # Tầng gọi AI (provider, CV analysis, embedding)
    ├── models/             # SQLAlchemy models TẬP TRUNG (mọi blueprint dùng chung, không có models.py riêng)
    └── blueprints/<module>/
        ├── __init__.py     # Khai báo biến `bp` (Blueprint + url_prefix) — ĐÂY là nơi expose blueprint
        ├── routes.py       # Route + decorator @require_roles / @jwt_required
        ├── services.py     # Nghiệp vụ + kiểm tra quyền theo dữ liệu (chống IDOR)
        └── schemas.py      # Marshmallow schema validate đầu vào / serialize đầu ra
```

**Quy ước blueprint:** mỗi module nghiệp vụ nằm trong `app/blueprints/<module>/`
(không có `app/<module>/` nào). `bp` khai trong **`__init__.py`** của module
(ví dụ `leave/__init__.py:5`), prefix ví dụ `auth` → `/api/v1/auth`,
`leave` → `/api/v1/leave`, `people_ai` → `/api/v1/people-ai`; một số module
dùng prefix `/api/v1` chung và tự ghi route con (ví dụ `recruitment` →
`/api/v1/jobs`, `/api/v1/candidates`). `create_app()` tự đăng ký module nào đã
tồn tại; module chưa tạo sẽ bị bỏ qua, app không crash.

**29 thư mục blueprint** (`ls server/app/blueprints/`): `ai`, `announcements`,
`assets`, `attendance`, `auth`, `briefing`, `chat`, `checkin`, `departments`,
`documents`, `employees`, `engagement`, `feed`, `gamification`, `interviews`,
`kb`, `leave`, `notifications`, `offboarding`, `onboarding`, `payroll`,
`people_ai`, `performance`, `recruitment`, `shifts`, `skills`, `stats`,
`training`, `users`. **Module `admin` KHÔNG tồn tại** — không có thư mục
`blueprints/admin/`; tên `"admin"` vẫn nằm trong danh sách đăng ký
(`__init__.py`) nhưng bị bỏ qua lặng lẽ. Chức năng quản trị thật nằm ở route
`/admin` của client + các endpoint `@require_roles("admin")` (ví dụ trong
`blueprints/users/routes.py`).

## Quy ước phản hồi

```jsonc
// Thành công (một đối tượng)
{ "data": { /* ... */ } }

// Danh sách (luôn phân trang)
{ "data": [ /* ... */ ],
  "meta": { "page": 1, "limit": 20, "totalItems": 57, "totalPages": 3 } }

// Lỗi — mọi lỗi, mọi module
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [] } }
```

Lỗi nghiệp vụ: `raise ApiError(409, "EMAIL_EXISTS", "Email đã được sử dụng.")`
từ `app.errors`. Validate dữ liệu vào bằng Marshmallow schema — `ValidationError`
sẽ tự trả về 400 `VALIDATION_ERROR` với `details` theo từng trường.

## Cài đặt & chạy

Yêu cầu: Python 3.11+.

```bash
cd server
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # điền JWT_SECRET_KEY và cấu hình AI nếu có

# Tạo bảng (lần đầu) — KHÔNG dùng Flask-Migrate ở đây (xem mục Migrations dưới):
python seed.py              # db.create_all() + seed dữ liệu demo (idempotent, chạy lại an toàn)

# Chạy dev (mặc định SQLite hrm.db, cổng 5000)
python run.py
# hoặc: flask --app run run --debug --port 5000

curl http://localhost:5000/api/v1/health
# {"status":"ok","service":"hrm-ai-api","db":"ok"}
```

## Migrations

**Chưa có thư mục `server/migrations/` được commit.** Repo không dùng
Flask-Migrate để tạo bảng:

- **Production (Render):** `AUTO_CREATE_TABLES=1` → `create_app()` gọi
  `db.create_all()` khi khởi động (`app/__init__.py:243-248`); `AUTO_SEED=1`
  chạy thêm `seed.py` (idempotent) trước khi mở server.
- **Dev/local:** chạy `python seed.py` (gọi `db.create_all()` rồi seed).

Hệ quả: thay đổi model chỉ cần sửa code model rồi restart (dev) hoặc deploy
(prod tự tạo bảng mới); **không có migrate lên/xuống, không rollback schema
bằng migration** — đổi tên/xoá cột trên Neon production phải xử lý tay.
Đừng chạy `flask db init/migrate/upgrade` theo hướng dẫn cũ: thư mục
`migrations/` đó chưa từng được commit và không thuộc quy trình hiện tại.

## Chạy production (gunicorn)

Theo đúng `server/Dockerfile` (Render chạy image này):

```bash
cd server
# Đặt DATABASE_URL (PostgreSQL) và JWT_SECRET_KEY thật trong môi trường
gunicorn run:app --bind 0.0.0.0:5000 --worker-class gthread --workers 1 --threads 8 \
  --timeout 120 --max-requests 1000 --max-requests-jitter 100
```

1 worker × 8 threads là có chủ đích: cache HTTP trong tiến trình
(`http_cache.py`) và token blocklist đều nằm trong RAM của worker đó (xem
`docs/performance.md` §3). Lệnh cũ `--workers 2` (từ thời Procfile Koyeb) đã
không còn dùng — đừng copy từ tài liệu cũ.

## Biến môi trường

**Bảng env đầy đủ xem [`../docs/env.md`](../docs/env.md) — đó là nguồn duy nhất.** File này không lặp lại bảng dài đó (trước đây 5 chỗ liệt kê env, không chỗ nào đầy đủ và giống nhau — xem kiểm kê docs 2026-11-05).

Tối thiểu để chạy local:

| Biến | Ý nghĩa |
|---|---|
| `JWT_SECRET_KEY` | Khóa ký JWT — **production bắt buộc đổi, thiếu thì app từ chối khởi động**; dev có giá trị mặc định (xem `docs/security.md` §9) |
| `DATABASE_URL` | Chuỗi kết nối SQLAlchemy (mặc định SQLite `hrm.db`; PostgreSQL ở production) |
| `CORS_ORIGINS` | Domain frontend được phép, cách nhau dấu phẩy (mặc định `http://localhost:5173`) |

Các nhóm biến khác (đầy đủ trong `docs/env.md`): AI (`AI_BASE_URL` bắt buộc với Gemini, `AI_MODEL`, `AI_EMBEDDING_MODEL`, `AI_FALLBACK_*`), seed/tự tạo bảng (`AUTO_SEED`, `AUTO_CREATE_TABLES`), upload (`UPLOAD_FOLDER`, `MAX_CV_SIZE_MB`, `MAX_KB_SIZE_MB`), rate limit (`RATELIMIT_DEFAULT`, `RATELIMIT_STORAGE_URI`), nghiệp vụ (`WORK_START_TIME`, `DEFAULT_ANNUAL_LEAVE_DAYS`).
