# Trạng thái vận hành — Web HRM AI

> **1 trang, cập nhật khi trạng thái đổi.** File này giữ các con số/trạng thái thay đổi nhanh để các file khác không phải nhắc lại (và không lệch nhau khi nhắc lại). Cập nhật lần cuối: **05/11/2026**, đối chiếu code tại commit `5850581`.
>
> Chi tiết cố định (deploy, env, kiến trúc) xem `docs/deployment.md`, `docs/env.md`, `docs/architecture-current.md` — file này chỉ ghi **trạng thái hiện tại**.

## Trạng thái hiện tại

| Hạng mục | Trạng thái (05/11/2026) |
|---|---|
| **Model AI chat (production)** | `gemini-3.5-flash-lite` (Render env; mặc định code là `gpt-4o-mini`) |
| **Model AI embedding (production)** | `gemini-embedding-001` (Render env; mặc định code là `text-embedding-3-small`) |
| **AI_BASE_URL (production)** | Đầu mối OpenAI-compat của Google (`https://generativelanguage.googleapis.com/v1beta/openai/`) |
| **FallbackProvider** | **Code có sẵn nhưng CHƯA kích hoạt.** `FallbackProvider` bọc provider chính + dự phòng cho chat (`provider.py:285-364`); chỉ kích hoạt khi đủ cả 3 biến `AI_FALLBACK_BASE_URL` + `AI_FALLBACK_API_KEY` + `AI_FALLBACK_MODEL`. Cần key Groq/OpenRouter (hoặc provider tương thích khác) — chưa có. Embedding không bao giờ dùng fallback. |
| **Toạ độ văn phòng (production)** | **Đang trống.** Seed không tạo office config; `GET /checkin/config` production trả chưa cấu hình. Hệ quả: luồng quét QR + GPS trả lỗi `400 OFFICE_NOT_CONFIGURED` ("Văn phòng chưa được cấu hình toạ độ…"); **mã dự phòng 6 số vẫn chạy** (không kiểm khoảng cách). HR cấu hình toạ độ ở trang "Chấm công QR" (`PUT /checkin/config`); bán kính mặc định 150 m. |
| **Seed / dữ liệu demo** | **50 nhân viên / 5 phòng ban.** `AUTO_SEED=1` trên Render: seed chạy lại mỗi lần khởi động (get-or-create, an toàn). |
| **Tài khoản demo đăng nhập** | **Chỉ 4 tài khoản**: `admin@hrm.local` / `Admin@123` (**không gắn hồ sơ nhân viên**), `hr@hrm.local` / `Hr@12345` (NV0002), `manager@hrm.local` / `Manager@123` (NV0001), `employee@hrm.local` / `Employee@123` (NV0003). `duc.lv@hrm.local` **không phải tài khoản đăng nhập** (chỉ là email của Employee NV0004). |
| **Keep-warm (chống Render/Neon ngủ)** | **Chưa có pinger trong repo — chưa xác minh hook có chạy.** Docstring `server/app/health.py` mô tả hook giữ ấm gọi health mỗi 10 phút, nhưng không tìm thấy scheduler/pinger/cron nào trong repo gọi nó. Nếu hook không chạy, Render Free ngủ sau ~15 phút không hoạt động và lần mở đầu chờ tới ~1 phút. Cần quyết định: cron bên ngoài / UptimeRobot / bỏ hook. |
| **Render Auto-Deploy** | **Không kích hoạt.** Deploy backend đi qua Render Deploy Hook: CI xanh trên `main` → `.github/workflows/cd.yml` POST hook (secret `RENDER_DEPLOY_HOOK`). Push lên `main` không tự deploy backend. Vercel (frontend) tự deploy. |
| **Bản đang chạy** | Kiểm tra qua trường `commit` ở `GET /` trên `https://hrm-ai-api.onrender.com/` (7 ký tự đầu commit, từ `RENDER_GIT_COMMIT`). |

## Bug đang mở (ghi trạng thái — KHÔNG sửa code ở đây)

| Bug | Trạng thái | Chi tiết |
|---|---|---|
| **Logout web chưa thu hồi refresh token** | **Đang mở.** Server có nhánh thu hồi (`auth/routes.py:73-85`) nhưng chỉ khi client gửi refresh token trong body của `POST /auth/logout`; frontend gọi `api.post('/auth/logout')` không body (`features/auth/services.js:173-175`) nên refresh token sống đủ 7 ngày sau "đăng xuất". Đổi mật khẩu cũng không revoke token cũ. |
| **`GET /notifications/unread-count` không tồn tại** | **Đang mở (lỗi code, không chỉ lỗi docs).** Server chỉ có `GET /notifications` (trả `unreadCount` trong body), `PATCH /notifications/<id>/read`, `POST /notifications/read-all`. Web vẫn gọi endpoint chết (`client/src/api/index.js:44`); `AppLayout.jsx` catch rỗng nên **chuông web luôn hiện 0**. Mobile có fallback đúng sang `GET /notifications` lấy `unreadCount`. Hướng sửa (quyết định của dev): web dùng fallback như mobile, hoặc thêm endpoint thật trên server. |
| **Audit log có 0 caller** | **Đang mở.** `log_audit_event` / `record_audit_log` trong `server/app/security.py` tồn tại nhưng không nơi nào gọi — các thao tác xem/xuất lương, duyệt đơn, phân tích CV hiện **không** ghi audit log, dù docs cũ khẳng định là có. |

## Ghi chú vận hành khác

- **JD production** chạy bằng AI thật (`source: "ai"`); **InterviewKit v1** sinh bằng template (`generated_by: "template"`) — fallback trung thực khi AI không khả dụng.
- **File upload** trên Render nằm ở đĩa tạm, mất khi restart/redeploy (CV, tài liệu KB).
- **Rate limit** mặc định `600/giờ`, lưu trong bộ nhớ process (`memory://`) — reset khi restart; login có limit riêng (xem `docs/security.md` sau khi file đó được viết lại).
