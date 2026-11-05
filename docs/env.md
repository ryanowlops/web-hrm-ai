# Biến môi trường — bảng duy nhất

> **Nguồn sự thật duy nhất về biến môi trường.** Sinh từ `server/app/config.py` + `server/app/ai_service/provider.py` + `server/.env.example` + `server/Dockerfile` + `render.yaml` tại commit `5850581` (05/11/2026).
>
> Trước đây có 5 chỗ liệt kê env (README, `architecture.md` B7, `deployment-golden-combo.md`, `server/README.md`, `.env.example`) — không chỗ nào đầy đủ và giống nhau. Từ nay các file khác chỉ trỏ sang đây, không liệt kê lại.
>
> Quy ước cột "Production": chỉ ghi giá trị nào **đã xác minh** là đang đặt trên Render: model chat `gemini-3.5-flash-lite`, model embedding `gemini-embedding-001`, `AI_BASE_URL` là đầu mối OpenAI-compat của Google. Các giá trị production khác ghi **"theo Render env"** (chưa xác minh từ code — code không chứa giá trị production) hoặc **"chưa xác minh"**.

## 1. Cách đọc

- **Mặc định code**: giá trị dùng khi biến không được đặt. Mặc định chỉ dành cho dev local; production bắt buộc đặt các biến bí mật qua env của nền tảng deploy.
- **Nơi đọc**: `Config` = thuộc tính lớp trong `server/app/config.py`; `Provider` = đọc trực tiếp từ env trong `server/app/ai_service/provider.py` (qua `_config_value`, ưu tiên env rồi mới tới Flask config); `Dockerfile`/`render.yaml` = chỉ dùng khi chạy/deploy theo file đó.
- `.env.example` hiện **thiếu** nhiều biến dưới đây (`AI_BASE_URL`, `AI_FALLBACK_*`, `AUTO_SEED`, `AUTO_CREATE_TABLES`, `MAX_KB_SIZE_MB`, `RATELIMIT_STORAGE_URI`, `WORK_START_TIME`, `DEFAULT_ANNUAL_LEAVE_DAYS`) — đừng dùng nó làm danh sách đầy đủ.

## 2. Chung & môi trường

| Biến | Mặc định code | Production | Ghi chú |
|---|---|---|---|
| `APP_ENV` | `development` | theo Render env | `development \| testing \| production`. `FLASK_ENV` là tên thay thế (cùng đọc ở `__init__.py:67`). Production dùng `APP_ENV=production` (đặt trong `server/Dockerfile`: `ENV APP_ENV=production`). |
| `FLASK_ENV` | `development` | — | Tên thay thế của `APP_ENV`, cùng tác dụng. |
| `SECRET_KEY` | `dev-secret-key-change-me` | theo Render env | Khóa Flask. **Thiếu chỉ cảnh báo, app vẫn chạy** — khác với `JWT_SECRET_KEY` (xem §3). Giá trị mặc định đã công khai trong repo, tuyệt đối không dùng ở production. |
| `DATABASE_URL` | `sqlite:///hrm.db` | theo Render env (Neon) | Chuỗi `postgres://` được chuẩn hoá thành `postgresql+psycopg2://` trong `config.py`. Production bắt buộc PostgreSQL qua biến này. |
| `CORS_ORIGINS` | `http://localhost:5173` | theo Render env (domain Vercel) | Nhiều origin cách nhau bằng dấu phẩy. Chỉ origin trong danh sách mới được gọi `/api/*`. |
| `UPLOAD_FOLDER` | `uploads` | theo Render env | Đường dẫn tương đối được quy về thư mục `server/`. Trên Render là đĩa tạm — file mất khi restart/redeploy. |
| `HOST` | `0.0.0.0` | — | Chỉ dùng khi chạy dev bằng `python run.py`. Production chạy gunicorn, không dùng biến này. |
| `PORT` | `5000` | Render tự cấp | Gunicorn bind `0.0.0.0:${PORT:-5000}`. |

## 3. JWT & bảo mật

| Biến | Mặc định code | Production | Ghi chú |
|---|---|---|---|
| `JWT_SECRET_KEY` | `dev-jwt-secret-change-me-in-production-0123456789` | Render tự sinh (`render.yaml`: `generateValue`) | **Thiếu hoặc còn giá trị mặc định công khai thì production hard-fail**: `ProductionConfig.REQUIRE_REAL_SECRETS = True` khiến `create_app()` ném `RuntimeError` và từ chối khởi động (`__init__.py:140-155`). |
| `SECRET_KEY` | xem §2 | theo Render env | Nhắc lại ở đây để khỏi nhầm: `SECRET_KEY` thiếu **chỉ ghi warning**, app vẫn chạy (Flask session cookie không dùng cho xác thực — xác thực bằng JWT header). |

Không phải biến môi trường (hằng số trong code, không đổi được bằng env): access token hết hạn sau **30 phút**, refresh token sau **7 ngày** (`config.py:83-84`); claims JWT gồm `{role, email}`.

## 4. Khởi tạo DB & seed

| Biến | Mặc định code | Production | Ghi chú |
|---|---|---|---|
| `AUTO_CREATE_TABLES` | `0` (tắt) | `1` (trong `render.yaml`) | `=1` thì `create_app()` gọi `db.create_all()` khi khởi động. Không có thư mục `migrations/` nào được commit — production không dùng Flask-Migrate để tạo bảng. |
| `AUTO_SEED` | — (không có trong `config.py`) | `1` (trong `render.yaml`) | Chỉ đọc trong `server/Dockerfile` CMD: `=1` thì chạy `python seed.py` trước khi mở server mỗi lần khởi động. Seed get-or-create, chạy lại an toàn; lỗi seed không chặn server lên. |

## 5. Upload & rate limit

| Biến | Mặc định code | Production | Ghi chú |
|---|---|---|---|
| `MAX_CV_SIZE_MB` | `5` | theo Render env | Giới hạn CV ứng viên (PDF). |
| `MAX_KB_SIZE_MB` | `10` | theo Render env | Giới hạn tài liệu quy chế (KB). Flask chặn 413 sớm theo giới hạn lớn nhất trong hai giá trị. |
| `RATELIMIT_DEFAULT` | `600 per hour` | theo Render env | Hạn mức mặc định toàn API (Flask-Limiter, khoá theo IP qua ProxyFix 1 hop). Các endpoint nhạy cảm (login, nộp CV, gọi AI) có limit riêng trong code. |
| `RATELIMIT_STORAGE_URI` | `memory://` | theo Render env | Lưu trữ bộ đếm rate limit. `memory://` nghĩa là **bộ đếm reset khi process restart** (chưa xác minh production có đổi sang Redis hay không). |

## 6. AI — chat & embedding

| Biến | Mặc định code | Production (đã xác minh) | Ghi chú |
|---|---|---|---|
| `AI_PROVIDER` | `""` → provider hiểu là `openai` | theo Render env | Tên provider (vd `openai`). Chỉ là nhãn — provider nào cũng đi qua giao thức OpenAI-compatible. |
| `AI_BASE_URL` | không đặt → `None` | `https://generativelanguage.googleapis.com/v1beta/openai/` (đầu mối OpenAI-compat của Google) | **Không có trong `Config`** — provider đọc trực tiếp từ env (`provider.py:89`). Bắt buộc khi dùng Gemini; không đặt thì gọi thẳng OpenAI. |
| `AI_API_KEY` | `""` (không có key) | theo Render env | Chỉ ở server, không commit, không log. Chưa có key → provider ở chế độ "unavailable": mọi lời gọi AI raise lỗi rõ ràng (HTTP 503), nghiệp vụ HRM còn lại vẫn chạy. |
| `AI_MODEL` | `""` → provider dùng `gpt-4o-mini` | **`gemini-3.5-flash-lite`** | Model chat. Lưu ý: `gemini-2.5-flash-lite` đã RETIRED → 404; `text-embedding-004` 404 trên endpoint Google OpenAI-compat. |
| `AI_EMBEDDING_MODEL` | `text-embedding-3-small` | **`gemini-embedding-001`** | Model embedding cho RAG (KB/chatbot). |
| `EMBEDDING_MODEL` | `""` | theo Render env | Tên biến legacy, không còn được provider đọc (provider đọc `AI_EMBEDDING_MODEL`). Giữ lại chỉ vì còn xuất hiện trong `.env.example`. |
| `AI_MAX_CANDIDATES_PER_RUN` | `20` | theo Render env | Giới hạn số CV mỗi lượt phân tích AI. |
| `AI_REQUEST_TIMEOUT` | `60` (giây) | theo Render env | **Lưu ý:** khai trong `Config` nhưng **provider hiện không đọc biến này** — provider đọc `AI_TIMEOUT` (dòng dưới). Chưa xác minh có nơi nào khác dùng `AI_REQUEST_TIMEOUT`. |
| `AI_TIMEOUT` | `60` (giây) | theo Render env | Timeout mỗi lần gọi AI — đây mới là biến provider thực sự dùng (`provider.py:90`). Không có trong `Config` hay `.env.example`. |
| `AI_CHAT_TEMPERATURE` | `0.7` | theo Render env | Nhiệt độ sinh văn cho chatbot hỏi đáp. Các tác vụ cấu trúc (CV, rerank, phân loại ý định) giữ 0.2 trong provider, không dùng giá trị này. |

### 6.1. AI dự phòng (FallbackProvider)

| Biến | Mặc định code | Production | Ghi chú |
|---|---|---|---|
| `AI_FALLBACK_PROVIDER` | `fallback` | chưa xác minh | Tên nhãn của provider dự phòng. |
| `AI_FALLBACK_BASE_URL` | — | chưa xác minh | Bắt buộc để kích hoạt fallback. |
| `AI_FALLBACK_API_KEY` | — | chưa xác minh | Bắt buộc để kích hoạt fallback. |
| `AI_FALLBACK_MODEL` | — | chưa xác minh | Bắt buộc để kích hoạt fallback. |

Cả 3 biến `AI_FALLBACK_BASE_URL` + `AI_FALLBACK_API_KEY` + `AI_FALLBACK_MODEL` phải đủ thì `get_provider()` mới bọc `FallbackProvider` cho chat (chính lỗi → thử lại đúng 1 lần ở provider dự phòng). Thiếu 1 trong 3 → không có fallback. **Production hiện chưa kích hoạt** (cần key Groq/OpenRouter — xem `docs/operations-status.md`). Embedding **không bao giờ** dùng provider dự phòng (vector phải đồng nhất trong cùng kho tri thức).

## 7. Nghiệp vụ mặc định (ghi đè được bằng bảng `settings`)

| Biến | Mặc định code | Production | Ghi chú |
|---|---|---|---|
| `WORK_START_TIME` | `08:30` | theo Render env | Giờ bắt đầu làm việc — vào sau giờ này thì chấm công tính "đi muộn". |
| `DEFAULT_ANNUAL_LEAVE_DAYS` | `12` | theo Render env | Số ngày phép năm mặc định cho nhân viên mới. |

## 8. Biến do nền tảng deploy tự cấp (không đặt tay)

| Biến | Nguồn | Ghi chú |
|---|---|---|
| `RENDER_GIT_COMMIT` | Render tự cấp | Route gốc `GET /` trả trường `commit` = 7 ký tự đầu — dùng để kiểm tra bản đang chạy (xem `docs/deployment.md` §4). |
| `WEB_CONCURRENCY` | Mặc định `1` trong `server/Dockerfile` | Số worker Gunicorn. Production: 1 worker × 8 threads. |
| `GUNICORN_THREADS` | Mặc định `8` trong `server/Dockerfile` | Số thread gthread mỗi worker. |

## 9. Biến chỉ dùng khi test

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `TEST_DATABASE_URL` | `sqlite:///:memory:` | Chỉ `TestingConfig` đọc. |
