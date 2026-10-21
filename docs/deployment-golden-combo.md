# Triển khai production — Combo Vercel (FE) + Koyeb (BE) + Neon (DB)

Kiến trúc: trình duyệt → **Vercel** (React build tĩnh) → gọi API → **Koyeb** (Flask + Gunicorn) → **Neon** (PostgreSQL). Cả ba đều có gói miễn phí và đăng ký bằng tài khoản GitHub.

Code đã chuẩn bị sẵn trong repo:
- `client/vercel.json` — build Vite + rewrite SPA (mọi đường dẫn về `index.html`).
- `client/src/api/axiosClient.js` — đọc `VITE_API_BASE_URL`; để trống thì dùng `/api/v1` qua proxy local.
- `server/Procfile` — `gunicorn run:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120`.
- `server/app/config.py` — tự chuẩn hoá `DATABASE_URL` dạng `postgres://` → `postgresql://` (URL của Neon), và cờ `AUTO_CREATE_TABLES=1` để service tự tạo bảng khi DB còn trống.
- `requirements.txt` đã có `gunicorn` + `psycopg2-binary`.

## Bước 1 — Neon (làm trước, lấy chuỗi kết nối)

1. Vào https://neon.tech → Sign up bằng GitHub → Create project (đặt tên `hrm-ai`, region chọn Singapore cho gần Việt Nam).
2. Ở trang project, mở **Connection string** (Connection details) → chép chuỗi dạng:
   `postgresql://<user>:<password>@ep-xxxx.aws.neon.tech/neondb?sslmode=require`

## Bước 2 — Koyeb (backend)

1. Vào https://www.koyeb.com → Sign up bằng GitHub.
2. **Create App → Deploy a git repository** → chọn repo `web-hrm-ai`, branch `main`.
3. Builder: Buildpack; **Work directory / root: `server`** (nếu Koyeb hỏi) — Procfile trong `server/` sẽ được dùng. Health check path: `/api/v1/health`.
4. Environment variables:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | Chuỗi kết nối Neon ở bước 1 |
   | `JWT_SECRET_KEY` | Một chuỗi ngẫu nhiên dài ≥ 40 ký tự (tự đặt, chỉ lưu ở đây) |
   | `AUTO_CREATE_TABLES` | `1` |
   | `CORS_ORIGINS` | `https://<ten-app-cua-ban>.vercel.app` (điền sau bước 3 rồi quay lại sửa; tạm thời để `*` KHÔNG được — hệ thống chỉ nhận origin cụ thể, hãy quay lại điền sau khi có domain Vercel) |
   | `AI_API_KEY` | (tuỳ chọn) key Gemini/OpenAI để bật AI thật |
   | `AI_BASE_URL` | (nếu dùng Gemini) `https://generativelanguage.googleapis.com/v1beta/openai/` |
   | `AI_MODEL` | (nếu dùng Gemini) `gemini-2.5-flash` |
   | `AI_EMBEDDING_MODEL` | (nếu dùng Gemini) `text-embedding-004` |

5. Deploy. Khi service báo Healthy, ghi lại domain dạng `https://<app>-<org>.koyeb.app` và mở thử `https://<domain>/api/v1/health` → phải trả `{"status":"ok"}`.

## Bước 3 — Vercel (frontend)

1. Vào https://vercel.com → Sign up bằng GitHub → **Add New → Project** → Import repo `web-hrm-ai`.
2. **Root Directory: `client`**. Framework Preset: Vite (vercel.json đã khai sẵn build/output/rewrite).
3. Environment Variables: `VITE_API_BASE_URL` = `https://<domain-koyeb>/api/v1`.
4. Deploy → có domain `https://<ten-app>.vercel.app`.
5. **Quay lại Koyeb** sửa `CORS_ORIGINS` = đúng domain Vercel đó → Koyeb tự redeploy.

## Bước 4 — Nạp dữ liệu mẫu (seed) vào Neon

Từ máy local trong thư mục `server/` (sau khi `pip install -r requirements.txt`):

```bash
DATABASE_URL="<chuỗi Neon>" python seed.py
```

Seed là get-or-create (chạy lại an toàn). Sau đó đăng nhập web bằng tài khoản mẫu trong README.

## Kiểm tra cuối

- [ ] `https://<domain-koyeb>/api/v1/health` trả ok
- [ ] Mở web Vercel → đăng nhập tài khoản mẫu → Dashboard có số liệu
- [ ] Tạo thử 1 đơn nghỉ / check-in → dữ liệu lưu (qua Neon)
- [ ] Chatbot trả lời từ tài liệu KB mẫu (chế độ từ khoá nếu chưa có AI key)

## Giới hạn cần biết (đồ án)

- **File tải lên** (CV, tài liệu KB) lưu trên đĩa tạm của Koyeb — mất khi service restart/redeploy. Muốn bền vững cần chuyển sang object storage (S3/Cloudinary) ở giai đoạn sau.
- Gói miễn phí: Neon tự ngủ khi không dùng (lần gọi đầu sau ngủ chậm vài giây), Koyeb free instance cũng có thể ngủ — demo nên mở sẵn web trước vài phút.
- JWT secret và DATABASE_URL chỉ đặt ở biến môi trường Koyeb, tuyệt đối không commit vào repo.

---

## Phụ lục 2026-10-21: phương án đang dùng thực tế — Render (Docker) thay Koyeb

Koyeb sau khi sáp nhập Mistral đã gỡ toàn bộ giao diện deploy và cả trang tạo API token (trang `user/settings/api` chỉ còn thông báo), CLI cũng không đăng nhập được nếu không có token — không deploy mới được ở thời điểm này. Backend chuyển sang **Render (gói Free, region Singapore)**, vẫn giữ Neon + Vercel.

- Cấu hình dạng code: `render.yaml` ở gốc repo (runtime Docker, rootDir `server`, healthCheckPath `/api/v1/health`; `DATABASE_URL` và `CORS_ORIGINS` để `sync: false` — Render hỏi khi tạo; `JWT_SECRET_KEY` để Render tự sinh).
- Tạo thủ công cũng được: New + → Web Service → repo này → Root Directory `server` → Runtime **Docker** (Render tự nhận Dockerfile) → Instance Free → env: `DATABASE_URL` (Neon), `AUTO_CREATE_TABLES=1`, `CORS_ORIGINS=<domain Vercel>`; JWT: đặt tay hoặc dùng Blueprint để được tự sinh.
- `server/Dockerfile` đã tối ưu cho 512 MB RAM: python:3.12-slim 2 stage (venv build riêng, image chạy không chứa công cụ biên dịch), Gunicorn **1 worker × 8 threads (gthread)** + `MALLOC_ARENA_MAX=2`, bind theo `$PORT`. Đo thực tế tại máy dev (SQLite local): master ~23 MB + worker ~81 MB sau 24 request xác thực đồng thời ≈ **103 MB tổng** — dư ~400 MB so với giới hạn 512 MB.
