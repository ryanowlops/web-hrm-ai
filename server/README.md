# HRM API — Backend (Flask)

API cho Web HRM tích hợp AI. Frontend React JS giao tiếp duy nhất qua REST API
JSON tại tiền tố `/api/v1` với JWT Bearer (kiến trúc B1/B6 trong
[`../docs/architecture.md`](../docs/architecture.md)).

## Cấu trúc

```text
server/
├── run.py                  # Điểm chạy (dev server / gunicorn)
├── requirements.txt
├── .env.example            # Mẫu biến môi trường (copy thành .env)
└── app/
    ├── __init__.py         # create_app() — Application Factory
    ├── config.py           # Config theo môi trường, đọc từ env
    ├── extensions.py       # db, migrate, jwt, limiter
    ├── errors.py           # ApiError + handler trả lỗi chuẩn
    ├── health.py           # GET /api/v1/health
    ├── models/             # SQLAlchemy models (module dữ liệu)
    └── <module>/routes.py  # Mỗi blueprint nghiệp vụ expose biến `bp`
```

**Quy ước blueprint:** mỗi module nghiệp vụ (`auth`, `users`, `departments`,
`employees`, `attendance`, `leave`, `payroll`, `recruitment`, `ai`, `kb`,
`chat`, `stats`, `notifications`, `admin`) nằm trong `app/<module>/routes.py`
(hoặc `app/blueprints/<module>/routes.py`), expose biến `bp` — blueprint tự
khai báo `url_prefix` của nó (ví dụ `/api/v1/auth`). `create_app()` tự đăng ký
module nào đã tồn tại; module chưa tạo sẽ bị bỏ qua, app không crash.

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

# Tạo bảng (lần đầu)
flask --app run db init     # chỉ lần đầu, tạo thư mục migrations/
flask --app run db migrate -m "initial schema"
flask --app run db upgrade
# (Mẹo chạy thử nhanh không cần migrations:
#  python -c "from app import create_app; from app.extensions import db; app=create_app(); ctx=app.app_context(); ctx.push(); db.create_all()")

# Chạy dev (mặc định SQLite hrm.db, cổng 5000)
python run.py
# hoặc: flask --app run run --debug --port 5000

curl http://localhost:5000/api/v1/health
# {"status":"ok","service":"hrm-ai-api"}
```

## Chạy production (gunicorn)

```bash
cd server
# Đặt DATABASE_URL (PostgreSQL) và JWT_SECRET_KEY thật trong môi trường
gunicorn run:app --bind 0.0.0.0:5000 --workers 2 --timeout 120
```

## Biến môi trường chính

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `APP_ENV` | `development` | `development` / `testing` / `production` |
| `DATABASE_URL` | `sqlite:///hrm.db` | Chuỗi kết nối SQLAlchemy (PostgreSQL ở production) |
| `JWT_SECRET_KEY` | dev placeholder | Khóa ký JWT — production bắt buộc đổi |
| `CORS_ORIGINS` | `http://localhost:5173` | Domain frontend được phép, cách nhau dấu phẩy |
| `UPLOAD_FOLDER` | `server/uploads` | Nơi lưu CV/tài liệu upload |
| `MAX_CV_SIZE_MB` | `5` | Giới hạn kích thước file upload |
| `AI_PROVIDER`, `AI_MODEL`, `EMBEDDING_MODEL` | rỗng | Nhà cung cấp & model AI (A6.3) |
| `AI_API_KEY` | rỗng | Khóa AI — **chỉ ở server**, không commit, không log |
| `RATELIMIT_DEFAULT` | `600 per hour` | Giới hạn request mặc định |
