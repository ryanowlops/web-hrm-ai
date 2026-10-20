# Strix — Phạm vi & luật tham gia quét bảo mật cho dự án Web HRM

> File này dùng làm `--instruction-file` cho Strix khi quét dự án này
> (kế hoạch đầy đủ: `docs/security-test-plan.md`).
> Đây là tài liệu phạm vi — **không chứa thông tin đăng nhập thật** và
> bản thân nó không khởi chạy bất kỳ lần quét nào.

## 1. Căn cứ ủy quyền

- Hệ thống được quét là **dự án Web HRM của chính chủ sở hữu repo này**,
  chạy **cục bộ trên máy của chủ sở hữu** phục vụ học tập/phòng thủ.
- Chủ sở hữu cho phép kiểm thử xâm nhập (pentest) hệ thống này để tìm và vá
  lỗ hổng trước khi demo/bảo vệ đồ án.
- Ngoài phạm vi nêu ở mục 2, **không** có bất kỳ hệ thống nào khác được phép
  kiểm thử.

## 2. Phạm vi ĐƯỢC quét (chỉ hai mục tiêu sau)

1. **Mã nguồn của repo này** (white-box): thư mục gốc của dự án HRM
   (`server/` — Flask, `client/` — React JS).
2. **Ứng dụng chạy local bằng Docker Compose của dự án này** (black-box):
   - API Flask tại `http://localhost:5000` (cổng theo `docker-compose.yml`).
   - Frontend React tại cổng local do compose của dự án cấp.
- Mọi mục tiêu phải là `localhost`/`127.0.0.1` hoặc đường dẫn thư mục của
  repo này. Không có ngoại lệ.

## 3. Trọng tâm kiểm thử

Ưu tiên theo đúng các bề mặt rủi ro của HRM (ánh xạ `docs/security.md`):

1. **Phân quyền theo dữ liệu / IDOR** — Employee hoặc Manager truy cập hồ sơ,
   phiếu lương, đơn nghỉ, file CV của người khác/phòng khác bằng cách thay
   `id` trên URL/body; leo thang vai trò (Employee gọi endpoint của HR/Admin).
2. **JWT & xác thực** — token giả mạo/sửa payload, thuật toán yếu, token hết
   hạn vẫn dùng được, tài khoản đã khóa vẫn gọi được API, thiếu rate limit ở
   đăng nhập, lỗi ở luồng refresh token.
3. **Upload CV** — file đội lốt (đổi đuôi, magic bytes giả), file quá lớn,
   path traversal qua tên file, tải file CV không qua kiểm tra quyền,
   nội dung file gây XSS khi hiển thị lại.
4. **Injection** — SQL injection qua tham số tìm kiếm/lọc/sắp xếp, command
   injection ở các điểm xử lý file/gọi công cụ ngoài (nếu có).
5. **XSS** — dữ liệu người dùng nhập (tên, lý do nghỉ, ghi chú HR, nội dung
   trích từ CV/tài liệu) hiển thị lại ở frontend mà không escape.
6. **Logic nghiệp vụ** — duyệt đơn nghỉ bỏ qua cấp, trừ phép âm, tính lại
   lương sau khi kỳ lương đã chốt, race condition khi chốt lương/duyệt đơn.
7. **Cấu hình** — CORS mở quá rộng, thiếu security headers, response lộ
   `password_hash`/thông tin stack trace/dữ liệu người dùng khác.

## 4. Loại trừ TUYỆT ĐỐI (không được làm)

- **Không** tấn công/quét bất kỳ dịch vụ bên thứ ba nào: API của nhà cung
  cấp AI/LLM, GitHub, máy chủ của trường, hay bất kỳ host nào không phải
  `localhost` của máy chủ sở hữu. Nếu một luồng của app gọi ra ngoài, chỉ
  ghi nhận ở mức quan sát request từ phía app local — không kiểm thử đầu xa.
- **Không** dùng dữ liệu thật: chỉ dùng tài khoản và dữ liệu **seed/giả lập**
  do dự án tạo cho môi trường local. Không nhập, không trích xuất, không
  lưu trữ dữ liệu nhân sự thật vào báo cáo.
- **Không** tấn công từ chối dịch vụ, không brute-force diện rộng, không
  tạo hàng loạt tài khoản/bản ghi ngoài mức tối thiểu để chứng minh lỗ hổng.
- **Không** phá hoại dữ liệu kể cả trong môi trường local: PoC phải ở mức
  tối thiểu chứng minh được lỗ hổng (đọc 1 bản ghi ngoài quyền là đủ —
  không xuất toàn bộ dữ liệu).
- **Không** dùng thông tin đăng nhập thật của bất kỳ ai. Tài khoản kiểm thử
  là tài khoản seed local riêng cho việc quét, tạo và hủy trong môi trường
  local; mật khẩu của chúng không ghi vào file này và không commit lên repo.
- **Không** tự mở rộng phạm vi: phát hiện dẫn tới một hệ thống khác ngoài
  mục 2 thì dừng lại và ghi vào báo cáo, không tiếp tục kiểm thử hệ thống đó.

## 5. Yêu cầu báo cáo

Mỗi phát hiện cần: mức độ nghiêm trọng (Critical/High/Medium/Low), vị trí
(endpoint/file), các bước tái hiện/PoC tối thiểu, tác động thực tế tới dữ
liệu HRM, và đề xuất cách vá. Ưu tiên phát hiện **đã kiểm chứng được bằng
PoC** hơn suy đoán. Báo cáo và PoC chỉ lưu cục bộ; trước khi chia sẻ phải
loại bỏ mọi bí mật/dữ liệu cá nhân (kể cả dữ liệu seed có vẻ "giống thật").
