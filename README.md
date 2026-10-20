# Web HRM tích hợp AI

Hệ thống quản lý nhân sự (HRM) trên web, tích hợp AI sàng lọc CV ứng viên và chatbot hỏi đáp quy chế nội bộ.

**Tech stack:** Backend Flask (Python) · Frontend React JS (Vite) · Database PostgreSQL

## Tài liệu

- [Phân tích & Kiến trúc hệ thống](docs/architecture.md) — phân tích nghiệp vụ chi tiết (tác nhân, phân quyền, quy trình chấm công / nghỉ phép / tính lương / tuyển dụng), phân tích AI (sàng lọc CV, chatbot RAG), mô hình dữ liệu, và kiến trúc Flask + React JS (C4, blueprint, API, bảo mật, triển khai Docker, lộ trình 6 tuần).

## Trạng thái

Đã có mã nguồn chạy được: backend Flask (`server/`), frontend React JS (`client/`), Docker Compose, CI, tài liệu hiệu năng và bảo mật (kèm kế hoạch quét Strix trong `docs/security-test-plan.md`).

## Cách chạy local (không cần Docker)

```bash
# Backend (Flask) — cổng 5000
cd server
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python seed.py        # tạo DB + dữ liệu mẫu (chạy 1 lần)
python run.py

# Frontend (React JS) — cổng 5173, tự proxy /api sang backend
cd client
npm install
npm run dev
```

Mở http://localhost:5173 và đăng nhập bằng tài khoản mẫu (chỉ dùng cho demo):

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Admin | admin@hrm.local | Admin@123 |
| HR | hr@hrm.local | Hr@12345 |
| Manager | manager@hrm.local | Manager@123 |
| Employee | employee@hrm.local | Employee@123 |

Trang tuyển dụng công khai cho ứng viên: http://localhost:5173/jobs

## Chạy bằng Docker

```bash
docker compose up --build
```

Frontend tại http://localhost:5173, API tại http://localhost:5000/api/v1/health.

## Tính năng AI

Đặt `AI_API_KEY` (và `AI_MODEL`) trong biến môi trường của server để bật AI sàng lọc CV và chatbot trả lời bằng LLM. Chưa có key, hệ thống báo rõ "AI chưa được cấu hình" (503) và mọi chức năng HRM lõi vẫn chạy bình thường.

## Lưu ý bảo mật

Không commit file `.env` hay bất kỳ API key / mật khẩu nào lên repository. Chỉ commit `.env.example` với giá trị mẫu rỗng.
