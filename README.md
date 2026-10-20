# Web HRM tích hợp AI

Hệ thống quản lý nhân sự (HRM) trên web, tích hợp AI sàng lọc CV ứng viên và chatbot hỏi đáp quy chế nội bộ.

**Tech stack:** Backend Flask (Python) · Frontend React JS (Vite) · Database PostgreSQL

## Tài liệu

- [Phân tích & Kiến trúc hệ thống](docs/architecture.md) — phân tích nghiệp vụ chi tiết (tác nhân, phân quyền, quy trình chấm công / nghỉ phép / tính lương / tuyển dụng), phân tích AI (sàng lọc CV, chatbot RAG), mô hình dữ liệu, và kiến trúc Flask + React JS (C4, blueprint, API, bảo mật, triển khai Docker, lộ trình 6 tuần).

## Trạng thái

Đang ở giai đoạn tài liệu thiết kế (docs). Mã nguồn sẽ được khởi tạo theo cấu trúc trong tài liệu kiến trúc: `client/` (React JS), `server/` (Flask), `docker-compose.yml`, `.env.example`.

## Lưu ý bảo mật

Không commit file `.env` hay bất kỳ API key / mật khẩu nào lên repository. Chỉ commit `.env.example` với giá trị mẫu rỗng.
