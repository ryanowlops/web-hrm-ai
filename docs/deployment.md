# Triển khai production — Vercel (FE) + Render (BE) + Neon (DB)

> Tài liệu này **viết lại hoàn toàn** ngày 05/11/2026, thay thế `docs/deployment-golden-combo.md` (file cũ đã xoá — thân bài của nó hướng dẫn deploy lên Koyeb, dịch vụ đã không còn dùng được với dự án, và khẳng định sai về Render Auto-Deploy). Mọi khẳng định dưới đây đối chiếu với code tại commit `5850581`.

Kiến trúc: trình duyệt → **Vercel** (React build tĩnh) → gọi API → **Render** (Flask + Gunicorn, Docker, Singapore) → **Neon** (PostgreSQL, Singapore). Cả ba đều có gói miễn phí.

| Tầng | Dịch vụ | URL production |
|---|---|---|
| Frontend | Vercel | https://hrm-ai-gray.vercel.app |
| Backend | Render, Docker, region Singapore, gói Free | https://hrm-ai-api.onrender.com |
| Database | Neon PostgreSQL, Singapore | (chuỗi kết nối chỉ nằm trong env Render, không commit) |

Code đã chuẩn bị sẵn trong repo:

- `client/vercel.json` — build Vite + rewrite SPA (mọi đường dẫn về `index.html`).
- `client/src/api/axiosClient.js` — đọc `VITE_API_BASE_URL`; để trống thì dùng `/api/v1` qua proxy local.
- `server/Dockerfile` — image python:3.12-slim 2 stage; Gunicorn **1 worker × 8 threads (gthread)** (`--workers ${WEB_CONCURRENCY:-1} --threads ${GUNICORN_THREADS:-8} --timeout 120 --max-requests 1000`), bind theo `$PORT`.
- `render.yaml` ở gốc repo — Render Blueprint của backend (xem §1).
- `server/app/config.py` — tự chuẩn hoá `DATABASE_URL` dạng `postgres://` → `postgresql+psycopg2://` (URL của Neon), và cờ `AUTO_CREATE_TABLES=1` để service tự tạo bảng khi DB còn trống.

## 1. Backend — Render Blueprint (`render.yaml`)

Service `hrm-ai-api`: `runtime: docker`, `rootDir: server`, `region: singapore`, `plan: free`, `healthCheckPath: /api/v1/health`.

Các biến môi trường khai trong Blueprint:

| Key | Giá trị |
|---|---|
| `AUTO_CREATE_TABLES` | `1` — tự tạo bảng khi DB còn trống (`db.create_all()` trong `create_app()`) |
| `AUTO_SEED` | `1` — chạy `seed.py` trước khi mở server mỗi lần khởi động (xem §3) |
| `DATABASE_URL` | `sync: false` — Render hỏi khi tạo Blueprint (chuỗi kết nối Neon) |
| `JWT_SECRET_KEY` | Render tự sinh (`generateValue`) — không lưu trong repo |
| `CORS_ORIGINS` | `sync: false` — điền domain Vercel (vd `https://hrm-ai-gray.vercel.app`) |

Các biến AI đặt thêm trên Render (không nằm trong `render.yaml`): `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_EMBEDDING_MODEL` — bảng đầy đủ xem `docs/env.md`.

Tạo lại từ đầu: Render Dashboard → New + → Blueprint → chọn repo này → Render hỏi `DATABASE_URL` và `CORS_ORIGINS` khi tạo. Tạo thủ công cũng được: New + → Web Service → repo này → Root Directory `server` → Runtime **Docker** → Instance Free → env như bảng trên.

## 2. Triển khai (CD) — deploy hook, KHÔNG phải Auto-Deploy

**Render Auto-Deploy KHÔNG tự chạy.** Đã kiểm chứng 2026-10-21: hai commit liên tiếp lên `main` không sinh bản deploy nào trên service `hrm-ai-api`. Đừng tưởng push là tự deploy backend.

Luồng deploy thật (`.github/workflows/cd.yml`):

```text
push lên main → CI chạy (workflow "CI")
  → CI xanh → workflow "CD" (workflow_run, chỉ chạy khi CI success)
  → POST Render Deploy Hook (curl -X POST $RENDER_DEPLOY_HOOK)
  → Render build image Docker + deploy service hrm-ai-api
```

- Secret cần có trong repo: **`RENDER_DEPLOY_HOOK`** (GitHub → Settings → Secrets and variables → Actions). URL hook lấy ở Render: service `hrm-ai-api` → Settings → Deploy Hook.
- Khi chưa có secret, workflow CD kết thúc êm (không báo đỏ) kèm thông báo hướng dẫn — nghĩa là **không có deploy nào xảy ra**.
- Chạy tay: workflow CD hỗ trợ `workflow_dispatch`.
- **Vercel tự deploy**: frontend do Vercel tự build/deploy từ Git khi push lên `main`, không cần workflow. Root Directory trên Vercel là `client`; biến `VITE_API_BASE_URL` = `https://hrm-ai-api.onrender.com/api/v1`.

## 3. Seed dữ liệu — tự chạy mỗi lần khởi động

`AUTO_SEED=1` (khai trong `render.yaml`): entrypoint trong `server/Dockerfile` chạy `python seed.py` trước khi mở server. Seed là get-or-create (chạy lại an toàn); **lỗi seed cũng không chặn server lên** (in thông báo rồi vẫn khởi động).

Dữ liệu seed (`server/seed.py`): **50 nhân viên / 5 phòng ban** (Kinh doanh, Kỹ thuật, Nhân sự, Marketing, Kế toán). Chỉ có **4 tài khoản đăng nhập demo**:

| Vai trò | Email | Mật khẩu | Hồ sơ nhân viên |
|---|---|---|---|
| Admin | `admin@hrm.local` | `Admin@123` | **Không có** (tài khoản thuần hệ thống) |
| HR | `hr@hrm.local` | `Hr@12345` | NV0002 |
| Manager | `manager@hrm.local` | `Manager@123` | NV0001 |
| Employee | `employee@hrm.local` | `Employee@123` | NV0003 |

40 nhân viên NV0011–NV0050 đều có tài khoản đăng nhập: trưởng phòng/nhóm dùng mật khẩu `Manager@123`, nhân viên dùng `Employee@123`, email theo mẫu `ten.ho@hrm.local`. Lưu ý: `duc.lv@hrm.local` **không phải tài khoản đăng nhập** — đó chỉ là email của Employee NV0004, seed không tạo `User` cho người này.

Seed thủ công từ máy local (khi cần nạp vào Neon): trong thư mục `server/`, sau khi `pip install -r requirements.txt`:

```bash
DATABASE_URL="<chuỗi Neon>" python seed.py
```

## 4. Kiểm tra bản đang chạy

- **Bản backend đang chạy:** mở URL gốc của API https://hrm-ai-api.onrender.com/ — trường `commit` cho biết 7 ký tự đầu của commit đang được phục vụ (lấy từ `RENDER_GIT_COMMIT`; rỗng khi chạy local).
- **Health check:** `GET /api/v1/health` trả `{"status": "ok", "service": "hrm-ai-api", "db": "ok"}` — có thêm trường `service` và `db` (db là kết quả `SELECT 1` best-effort; lỗi DB vẫn trả 200 để Render không báo động oan).
- **Kiểm tra cuối sau mỗi lần deploy:**
  - [ ] `GET /api/v1/health` trả ok, `db: "ok"`
  - [ ] URL gốc `/` trả đúng `commit` mới nhất trên `main`
  - [ ] Mở web Vercel → đăng nhập tài khoản mẫu → Dashboard có số liệu thật
  - [ ] Tạo thử 1 đơn nghỉ / check-in → dữ liệu lưu (qua Neon)
  - [ ] Chatbot trả lời từ tài liệu KB mẫu (chế độ từ khoá nếu chưa có AI key)

## 5. Giới hạn cần biết (đồ án)

- **Render Free "ngủ" sau ~15 phút không dùng** — lần mở đầu sau khi ngủ chờ tới ~1 phút (mở sẵn trước khi demo). Neon free cũng tự suspend compute khi không có truy vấn (lần gọi đầu chậm vài giây).
- **File tải lên** (CV, tài liệu KB) lưu trên đĩa tạm của Render — **mất khi service restart/redeploy**. Muốn bền vững cần chuyển sang object storage (S3/Cloudinary) ở giai đoạn sau.
- **Keep-warm chưa xác minh:** docstring của `server/app/health.py` mô tả một hook giữ ấm gọi health mỗi 10 phút để giữ Render/Neon không ngủ, nhưng **không tìm thấy scheduler/pinger nào trong repo** gọi nó. Chưa xác minh hook có đang chạy hay không — xem `docs/operations-status.md`.
- JWT secret và `DATABASE_URL` chỉ đặt ở biến môi trường Render, tuyệt đối không commit vào repo.

## 6. Lịch sử: Koyeb (đã bỏ 21/10/2026 — sáp nhập Mistral, gỡ deploy UI/API)

Backend ban đầu định deploy lên Koyeb (combo Vercel + Koyeb + Neon). Ngày 21/10/2026, sau khi Koyeb sáp nhập Mistral, Koyeb đã gỡ toàn bộ giao diện deploy và cả trang tạo API token (trang `user/settings/api` chỉ còn thông báo), CLI cũng không đăng nhập được nếu không có token — không deploy mới được. Backend chuyển sang **Render (Docker)** như mô tả ở trên; Neon + Vercel giữ nguyên.

Dấu vết còn lại trong repo: `server/Procfile` (lệnh gunicorn cũ cho Koyeb, `--workers 2`) — **không còn được dùng**; Render chạy theo `server/Dockerfile` (1 worker × 8 threads). Đừng làm theo hướng dẫn Koyeb trong các bản docs cũ.
