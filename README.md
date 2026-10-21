# Web HRM tích hợp AI

Hệ thống quản lý nhân sự (HRM) trên web, tích hợp AI sàng lọc CV ứng viên và chatbot hỏi đáp quy chế nội bộ.

**Tech stack:** Backend Flask (Python) · Frontend React JS (Vite) · Database PostgreSQL

## Tài liệu

- [Phân tích & Kiến trúc hệ thống](docs/architecture.md) — phân tích nghiệp vụ chi tiết (tác nhân, phân quyền, quy trình chấm công / nghỉ phép / tính lương / tuyển dụng), phân tích AI (sàng lọc CV, chatbot RAG), mô hình dữ liệu, và kiến trúc Flask + React JS (C4, blueprint, API, bảo mật, triển khai Docker, lộ trình 6 tuần).
- [Phân tích & Phạm vi: KPI/OKR + Onboarding](docs/kpi-okr-onboarding.md) — đợt mở rộng ưu tiên tiếp theo: quản trị hiệu suất (chu kỳ, mục tiêu, Key Result, check-in, đánh giá) và hội nhập nhân viên mới (template, kế hoạch tự sinh từ tuyển dụng, checklist theo giai đoạn), gồm mô hình dữ liệu, API, phân quyền, lộ trình và tiêu chí nghiệm thu.

## Trạng thái

Đã có mã nguồn chạy được: backend Flask (`server/`), frontend React JS (`client/`), Docker Compose, CI, tài liệu hiệu năng và bảo mật (kèm kế hoạch quét Strix trong `docs/security-test-plan.md`).

Đợt mở rộng tính năng v2 (xem `docs/feature-expansion-v2.md`): **Hiệu suất KPI/OKR** (chu kỳ, mục tiêu, Key Result, check-in, đánh giá, gợi ý mục tiêu mẫu), **Hội nhập nhân viên mới** (template, kế hoạch tự sinh khi tạo nhân viên, checklist theo giai đoạn), **Sơ đồ tổ chức**, **Lịch team** (nghỉ phép/sinh nhật/ngày bắt đầu), **Quản lý tài sản** (cấp phát/thu hồi), **Đào tạo nội bộ** (khoá học + tiến độ học viên), **Thông báo nội bộ** + trung tâm thông báo, **Báo cáo nhân sự** (biểu đồ + xuất CSV).

## Cách chạy nhanh nhất — 1 lệnh duy nhất

Máy cần có sẵn: Git, Python 3.10+, Node.js 18+.

**Windows** (mở PowerShell hoặc CMD rồi dán):

```powershell
git clone https://github.com/ryanowlops/web-hrm-ai.git; cd web-hrm-ai; .\run.bat
```

**macOS / Linux:**

```bash
git clone https://github.com/ryanowlops/web-hrm-ai.git && cd web-hrm-ai && ./run.sh
```

Lệnh trên tự làm hết: tải code → cài thư viện cho backend + frontend → tạo dữ liệu mẫu → chạy Flask (cổng 5000) + React (cổng 5173) → tự mở trình duyệt vào http://localhost:5173. Dừng bằng `Ctrl+C`. Những lần sau chỉ cần vào thư mục `web-hrm-ai` chạy lại `run.bat` / `./run.sh` (không phải clone lại).

Nếu máy có Docker, còn gọn hơn nữa — không cần Python/Node:

```bash
git clone https://github.com/ryanowlops/web-hrm-ai.git && cd web-hrm-ai && docker compose up --build
```

## Cách chạy local thủ công (không cần Docker)

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
