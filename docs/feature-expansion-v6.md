# Hợp đồng mở rộng v6 — Gói 3 "wow" (QR+GPS, AI tuyển dụng, báo cáo điều hành)

Ngày soạn: 2026-10-22. **TRẠNG THÁI: ĐÃ ĐƯỢC USER DUYỆT 2026-10-22 ~22:33
("làm thêm cho anh mấy tính năng hay hay") — ĐANG TRIỂN KHAI theo hợp đồng này.**

Nguồn phạm vi: gói 3 bị HOÃN từ vòng v4 (2026-10-21, user chọn "Làm gói 1 + 2
trước") — gồm (1) QR+GPS check-in, (2) AI JD generator, (3) AI interview kit,
(4) AI executive briefing. Hai ý phụ từ nháp v5-draft-A (chatbot voice input,
announcement polisher) KHÔNG thuộc gói 3 nhưng cũng chưa bị từ chối — để ở
mục "Tùy chọn" cuối, chỉ làm khi user gọi tên.

Quy ước chung: áp dụng nguyên mục 0 của `docs/feature-expansion-v3.md` và các
bổ sung ở v4/v5 (phân chia file dùng chung do parent tích hợp; khuôn blueprint
routes/services/schemas; envelope lỗi chuẩn `{error:{code,message,details}}`;
scope theo role; seed idempotent, không tự commit; kiểm chứng bằng DB tạm +
test_client + JWT, không bọc chung app_context; frontend phẳng v4 + UI kit +
services.js theo feature, đủ loading/rỗng/lỗi).

Quy tắc schema (bắt buộc): production dùng `db.create_all()` qua
AUTO_CREATE_TABLES, KHÔNG có migration — mọi thay đổi schema CHỈ được thêm
bảng mới, không ALTER bảng cũ. Cấu hình văn phòng dùng model `Setting` có sẵn
(key-value), không tạo bảng config riêng.

Bối cảnh AI: production ĐÃ có Gemini thật (AI_MODEL=gemini-3.5-flash-lite, đổi từ
gemini-2.5-flash ngày 2026-10-22 ~11:13 UTC sau khi quota free-tier của pool cũ cạn) nhưng
hạn mức free-tier đã từng cạn (2026-10-22) — mọi tính năng AI trong vòng này
PHẢI: dùng `app.ai_service` (tác vụ cấu trúc giữ json_mode mặc định +
temperature nghiêm; văn xuôi mới truyền json_mode=False), có đường dự phòng
xác định (template/heuristic) khi provider không khả dụng, ghi nhãn trung thực
(`source: "ai" | "template"`). TUYỆT ĐỐI không bịa số liệu nghiệp vụ: số thật
lấy từ DB qua services của module sở hữu, LLM chỉ viết văn xuôi quanh các số
đã cho. Không tạo API key mới để lách quota (quota tính theo project).

Đăng ký parent sẽ làm: `_MODULE_BLUEPRINTS` += `checkin`, `briefing`;
models `__init__` += `CheckinLog`, `InterviewKit`, `Briefing`; seed: KHÔNG
seed dữ liệu demo cho vòng này (office config để trống cho HR cấu hình lúc
demo — đó chính là điểm demo); routes FE: `/checkin` (route công khai yêu cầu
đăng nhập, NGOÀI AppLayout — cùng cơ chế /jobs), `/checkin-qr` + `/briefing`
(trong AppLayout, HR/Admin), JD/kit nằm trong trang tuyển dụng hiện có.

---

## 1. Đội CHECKIN — Chấm công QR + GPS

Phạm vi code: `server/app/blueprints/checkin/**` (mới) + `client/src/features/checkin/**`.

### 1.1 Nguyên tắc chống gian lận (bắt buộc, mức đồ án)
- Mã QR XOAY THEO NGÀY, hiển thị tại chỗ (màn hình HR). Mã là HMAC-SHA256
  stateless: `HMAC(JWT_SECRET_KEY, "qr-checkin:YYYY-MM-DD")` (ngày theo ICT);
  token = 12 ký tự hex đầu; mã dự phòng 6 số = HMAC mod 1_000_000 (zero-pad).
  Server tự tính lại — không lưu DB, không cần dọn dẹp. So sánh bằng
  `hmac.compare_digest`. Mã hôm qua tự hết hiệu lực.
- Server KHÔNG tin toạ độ do máy client tự khai: tự tính khoảng cách Haversine
  giữa (lat, lon) client gửi và toạ độ văn phòng trong `Setting`
  (`checkin.office_lat`, `checkin.office_lon`, `checkin.office_radius_m`
  mặc định 150). Trong phạm vi → check-in thành công, ghi khoảng cách
  (vd "GPS ✓ — cách văn phòng 42m"); ngoài phạm vi → từ chối + hiện đúng
  khoảng cách thật (vd "Bạn đang cách văn phòng 812m — ngoài phạm vi 150m").
- Không chặn fake-GPS ở mức OS như app ngân hàng (không khả thi trên web) —
  ghi rõ giới hạn này trong tài liệu demo.
- GPS trên trình duyệt yêu cầu HTTPS (site live đã có).

### 1.2 Dữ liệu
- `CheckinLog` (bảng mới): id, employee_id FK, date (ICT), method
  (`qr_gps` | `qr_code`), lat/lon (nullable), distance_m (nullable),
  result (`ok` | `rejected`), reason (nullable). UNIQUE(employee_id, date,
  method) — mỗi ngày mỗi phương thức 1 dòng.
- Cấu hình văn phòng qua `Setting` (không bảng mới). Chưa cấu hình toạ độ →
  luồng GPS trả lỗi nghiệp vụ hướng dẫn HR cấu hình; luồng mã 6 số vẫn chạy
  (method=`qr_code`, không kiểm khoảng cách) cho máy không có GPS.

### 1.3 API
- `GET /checkin/today-qr` (hr, admin) → {date, token, code6, expires_in_s}.
  FE tự dựng URL QR = `window.location.origin + "/checkin?d=..&t=.."` (không
  hardcode domain → chạy được cả local lẫn production).
- `POST /checkin/scan` (jwt, mọi role có employee) {date, token, lat?, lon?}:
  1. token khớp mã của date (mã 12 ký tự hoặc mã 6 số) — sai → 403
     "Mã đã hết hiệu lực hoặc không đúng";
  2. có lat/lon + đã cấu hình văn phòng → tính khoảng cách; ngoài phạm vi →
     ghi log rejected + 403 kèm distance_m thật;
  3. hợp lệ → gọi `attendance.services.check_in()` (tái dùng logic 1 lần/ngày,
     muộn/đúng giờ) → ghi log ok → 201 {attendance, distance_m, message}.
  Lỗi "đã check-in hôm nay" của attendance service được truyền nguyên (409).
- `GET /checkin/config` / `PUT /checkin/config` (hr, admin): {lat, lon,
  radius_m}. Validate: lat [-90,90], lon [-180,180], radius 10–2000.
- `GET /checkin/logs?date=` (hr, admin): nhật ký chấm công QR trong ngày.

### 1.4 FE
- `/checkin-qr` (AppLayout, HR/Admin): QR lớn giữa trang (thêm dep
  `qrcode.react`), mã 6 số dự phòng, đếm ngược tới giờ xoay mã (nửa đêm ICT),
  form cấu hình văn phòng (có nút "Dùng vị trí hiện tại của tôi" lấy GPS của
  máy HR), bảng log hôm nay.
- `/checkin` (ngoài AppLayout, yêu cầu đăng nhập — chưa login thì chuyển về
  login rồi quay lại): tự xin quyền vị trí 1 lần → tự POST → thẻ kết quả
  (thành công: "GPS ✓ — cách văn phòng 42m · Check-in lúc 08:02"; thất bại:
  lý do + khoảng cách). Có tab nhập mã 6 số thủ công.
- Trường hợp GPS bị từ chối quyền: hiện hướng dẫn bật quyền + chuyển sang
  nhập mã 6 số.

### 1.5 Kiểm chứng bắt buộc
- Mã: token đúng/ngày đúng → pass; token sai → 403; mã hôm qua dùng hôm nay →
  403; biên trong/ngoài bán kính (mock toạ độ) → ok/rejected đúng; chưa cấu
  hình văn phòng + gửi lat/lon → lỗi nghiệp vụ rõ ràng; check-in 2 lần → 409
  từ attendance service; `hmac.compare_digest` được dùng.
- Suite ≥ 15 case, chạy trên DB tạm + test_client + JWT thật.

---

## 2. Đội JDBUILDER — AI tạo mô tả công việc (JD)

Phạm vi code: mở rộng `server/app/blueprints/recruitment/**` (routes/services/
schemas hiện có) + `client/src/features/recruitment/**`.

### 2.1 Luồng
HR nhập: chức danh + phòng ban + cấp bậc + vài kỹ năng chính + ghi chú lương
(tuỳ chọn) → `POST /recruitment/jd/generate` → AI trả JD có cấu trúc
{summary, responsibilities[], requirements[], benefits[]} → FE hiện form xem
trước CHO PHÉP SỬA từng mục → HR bấm "Dùng JD này" → điền vào
`description`/`requirements` của form tạo tin tuyển dụng (human-in-loop: JD
chỉ lưu khi HR tạo/sửa JobPosting như bình thường, không tự đăng).

### 2.2 AI + dự phòng
- Có AI key: `provider.chat_completion` với json_mode (giữ mặc định nghiêm),
  schema ép 4 trường trên; system prompt: viết tiếng Việt, yêu cầu cụ thể đo
  được, không bịa mức lương nếu input không cho (ghi "thoả thuận").
- Không AI key / lỗi provider: template xác định theo cấp bậc + kỹ năng, nhãn
  `source: "template"`. Response luôn kèm `source`.

### 2.3 Kiểm chứng bắt buộc
- Sinh JD với provider bị mock tắt → template hợp lệ, đủ 4 trường; JSON từ AI
  (mock) validate đúng schema; không có chuyện tự tạo JobPosting khi chỉ gọi
  generate; FE build pass.

---

## 3. Đội INTERVIEWKIT — Bộ câu hỏi phỏng vấn AI theo tin tuyển

Phạm vi code: `server/app/models/interview_kit.py` (mới) + mở rộng
`server/app/blueprints/recruitment/**` + `client/src/features/recruitment/**`.

### 3.1 Dữ liệu
`InterviewKit` (bảng mới): id, job_posting_id FK UNIQUE, questions JSON
[{round, topic, question, rubric, weight}], generated_by (`ai`|`template`),
version (tăng mỗi lần tái tạo), updated_by.

### 3.2 API (hr, admin)
- `POST /recruitment/jobs/<id>/interview-kit/generate` → đọc JD + cấp bậc của
  tin → AI sinh câu hỏi nhóm theo vòng (vòng 1: kiến thức nền; vòng 2: tình
  huống/kỹ năng; vòng 3: văn hoá/động lực), mỗi câu kèm rubric chấm + trọng số.
  Ghi đè bản cũ nhưng tăng version (giữ lịch sử đơn giản: version + updated_at).
- `GET /recruitment/jobs/<id>/interview-kit`, `PUT` (HR sửa tay từng câu).
- Dự phòng không AI: template câu hỏi theo kỹ năng/cấp bậc, nhãn trung thực.

### 3.3 FE
Tab "Bộ câu hỏi phỏng vấn" trong trang chi tiết tin tuyển (HR): xem theo vòng,
nút "Tạo lại bằng AI", sửa inline từng câu, lưu; nút in (print CSS đơn giản).

### 3.4 Kiểm chứng bắt buộc
- Generate → đủ 3 vòng, mỗi câu có rubric + weight; regenerate → version tăng;
  PUT sửa persist; tin không tồn tại → 404; suite ≥ 12 case; FE build pass.

---

## 4. Đội BRIEFING — Báo cáo điều hành AI (tuần/tháng)

Phạm vi code: `server/app/blueprints/briefing/**` (mới) + model mới +
`client/src/features/briefing/**`.

### 4.1 Nguyên tắc số liệu (bắt buộc)
LLM KHÔNG BAO GIỜ tự nghĩ ra số. Service gom "gói số liệu" từ services có sẵn:
tổng nhân sự, vào mới, nghỉ việc/offboarding, tỉ lệ chấm công đúng giờ,
đơn nghỉ chờ duyệt/đã duyệt, tin tuyển đang mở, ứng viên mới, kudos, eNPS
(nếu có), số nhân sự nguy cơ nghỉ việc cao (qua people_ai). Gói số được đưa
nguyên văn vào prompt; system prompt yêu cầu văn xuôi tiếng Việt điều hành
chỉ diễn giải các số đã cho, không thêm số mới. Fallback: template dựng báo
cáo từ cùng gói số, nhãn `source: "template"`.

### 4.2 Dữ liệu + API (admin, hr)
`Briefing` (bảng mới): id, period (`week`|`month`), ref_date, numbers JSON,
prose Text, source (`ai`|`template`), created_by.
- `POST /briefing/generate` {period, ref_date?} → 200 {briefing}.
- `GET /briefing/latest?period=` và `GET /briefing/history?period=&limit=`.

### 4.3 FE
`/briefing` (AppLayout, Admin/HR): chọn tuần/tháng, nút "Tạo báo cáo", hiển thị
văn xuôi + bảng số liệu gốc (đối chiếu), lịch sử các kỳ trước.

### 4.4 Kiểm chứng bắt buộc
- Mọi số trong `numbers` khớp kết quả gọi trực tiếp services gốc (viết test
  so sánh); provider tắt → template đầy đủ số; prose của AI (mock) không chứa
  số nào ngoài gói số (test regex trích số); suite ≥ 12 case; FE build pass.

---

## Tùy chọn (không thuộc gói 3 — chỉ làm khi user gọi tên)
- **Chatbot voice input**: nút mic ở ChatbotPage, Web Speech API
  (miễn phí, chạy trên trình duyệt) → điền văn bản vào ô chat; không cần
  backend mới. Lưu ý: Chrome yêu cầu HTTPS (live đã có).
- **Announcement polisher**: trong form tạo thông báo (HR), nút "Gọt câu chữ
  bằng AI" → LLM viết lại cho trang trọng/rõ ràng, HR duyệt trước khi đăng.

---

## Nghiệm thu (parent — chỉ chạy khi user duyệt v6)
1. Đăng ký blueprint `checkin`, `briefing`; models `__init__` += 3 model mới;
   seed idempotent (không seed dữ liệu demo vòng này).
2. Nav FE: "Chấm công QR" (mục Chấm công, HR/Admin), "Báo cáo điều hành"
   (mục Báo cáo, Admin/HR); route `/checkin` ngoài AppLayout.
3. Mỗi đội: suite kiểm chứng pass (tổng ≥ 50 case), `npm run build` PASS,
   chụp màn hình các trang mới (QR hiển thị, /checkin, JD modal, kit, briefing).
4. Chạy thật local: luồng QR end-to-end (mock vị trí trong phạm vi + ngoài
   phạm vi), JD → tạo tin, kit → in, briefing tuần.
5. Push + CD deploy, kiểm production: QR xoay đúng ngày ICT, briefing tạo được
   với source template khi AI hết quota (đúng bối cảnh hiện tại).
