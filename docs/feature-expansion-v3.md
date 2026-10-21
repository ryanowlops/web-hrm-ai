# Hợp đồng mở rộng tính năng v3 — HRM hiện đại (3 gói)

Ngày: 2026-10-21. Người dùng đã duyệt LÀM HẾT 3 gói. Tài liệu này là nguồn sự
thật duy nhất cho các đội triển khai song song. Mọi đội ĐỌC KỸ mục 0 (quy ước
chung) + mục của đội mình trước khi code.

## 0. Quy ước chung (bắt buộc)

### 0.1 Phân chia file — không đội nào được sửa file của đội khác / file dùng chung

File DÙNG CHUNG do người tích hợp (parent) sửa ở bước tích hợp. Các đội chỉ
BÁO CÁO nhu cầu đăng ký trong báo cáo cuối, TUYỆT ĐỐI không tự sửa:

- `server/app/__init__.py` (danh sách `_MODULE_BLUEPRINTS`)
- `server/app/models/__init__.py`
- `server/seed.py`
- `client/src/app/pages.js`, `client/src/app/router.jsx`
- `client/src/layouts/AppLayout.jsx`
- `client/src/api/index.js`

Mỗi đội sở hữu trọn: blueprint folder của mình, model file của mình,
feature folder frontend của mình, và file `seed_demo.py` trong blueprint
folder của mình.

### 0.2 Backend — theo đúng khuôn các module v2 (đọc `blueprints/training/` và `blueprints/leave/` trước khi code)

- Blueprint package: `server/app/blueprints/<name>/` gồm `__init__.py`
  (khai báo `bp = Blueprint("<name>", __name__, url_prefix="/api/v1/<name>")`
  rồi import routes), `routes.py`, `services.py`, `schemas.py` (marshmallow
  như các module khác), `seed_demo.py`.
- Bảo mật: dùng `require_roles` từ `app.blueprints.auth.guards`; lỗi trả
  `ApiError` (định nghĩa trong services của module, theo mẫu training) →
  envelope `{"error": {"code", "message", "details"}}`; thành công trả
  `{"data": ...}` hoặc `{"data": [...], "meta": {...}}` như các module hiện có.
- Phân quyền theo scope dữ liệu: employee = chỉ bản thân; manager = phòng ban
  mình (employee.department_id == department của manager, theo cách các
  module hiện có xác định manager scope — đọc `leave/services.py`);
  hr/admin = toàn công ty. KHÔNG tin dữ liệu role từ client.
- Models: file mới `server/app/models/<name>.py`, dùng `db` từ
  `app.extensions`, `TimestampMixin`/`utcnow` từ `app.models.users` nếu phù
  hợp; quan hệ khóa ngoại tới `employees.id` / `users.id` như models hiện có.
- Quy trình duyệt 2 cấp (tăng ca, giải trình, giấy xác nhận) bám đúng mẫu
  `leave`: trạng thái `pending → manager_approved → approved`, hoặc
  `rejected` ở bất kỳ cấp nào; endpoint quyết định tách
  `manager-decision` / `hr-decision` với body `{decision: "approve"|"reject", note}`.
- `seed_demo()`: hàm trong `seed_demo.py`, IDEMPOTENT (kiểm tra tồn tại trước
  khi insert), tra cứu tài khoản demo bằng email (`admin@hrm.local`,
  `hr@hrm.local`, `manager@hrm.local`, `employee@hrm.local` → employee
  NV0002/NV0001/NV0003), ngày tháng tính TƯƠNG ĐỐI theo ngày chạy seed
  (không hardcode ngày quá khứ xa). Không commit trong seed_demo — parent
  seed.py quản lý transaction; dùng `db.session.flush()` khi cần id.
- Kiểm chứng của đội (bắt buộc trước khi báo cáo): dùng DB TẠM
  `DATABASE_URL=sqlite:////tmp/<team>-smoke.db`, `create_app()` + 
  `db.create_all()` + tạo tối thiểu user/employee fixture trong script khói
  của đội (đặt ở /tmp, không commit vào repo), đăng nhập lấy JWT bằng
  test_client và gọi thử các endpoint chính của đội (kèm kiểm tra 1 trường
  hợp bị cấm theo role). KHÔNG chạy seed.py / seed_demo vào DB dev dùng chung
  (`server/instance/hrm.db`). Ghi kết quả khói vào báo cáo.

### 0.3 Frontend — hợp đồng v4 phẳng (docs/frontend-design-v4.md) + khuôn feature v2

- Feature folder: `client/src/features/<name>/` gồm `pages/<Page>.jsx` và
  `services.js` (dùng `api` từ `../../api/axiosClient` — interceptor đã bóc
  `data`; KHÔNG bóc lại lần nữa).
- Dùng UI kit `client/src/components/ui` (Button, Card, CardHeader, CardBody,
  Badge, Modal, Input, Select, Skeleton, EmptyState, Alert, PageHeader,
  StatCard...), màu phẳng, KHÔNG gradient/glass/hero tối; nhãn tiếng Việt;
  có đủ trạng thái loading (Skeleton), rỗng (EmptyState), lỗi (Alert + nút
  thử lại); nút bấm ẩn/disable theo role của user hiện tại (`useAuth`).
- KHÔNG import recharts trực tiếp trong page: nếu thật sự cần biểu đồ thì
  theo mẫu lazy `DeferredMount` + chunk riêng như Dashboard (ưu tiên thanh
  CSS đơn giản cho biểu đồ khảo sát — xem mục 3.2).
- Trang mới phải tự chạy độc lập được khi parent đăng ký route (đội không tự
  sửa router/pages.js/AppLayout).

### 0.4 Đăng ký mà parent sẽ làm ở bước tích hợp (đội chỉ cần báo cáo khớp)

- `_MODULE_BLUEPRINTS` += `shifts`, `documents`, `offboarding`,
  `engagement`, `people_ai`.
- Routes FE: `/shifts`, `/documents`, `/offboarding`, `/kudos`, `/surveys`,
  `/attrition-risk`.
- Menu: Ca làm → nhóm Quản lý; Hồ sơ & giấy tờ → Quản lý; Nghỉ việc → Tổ
  chức; Vinh danh → Truyền thông; Khảo sát → Truyền thông; Nguy cơ nghỉ
  việc (admin/hr/manager) → Tuyển dụng & AI.

---

## 1. Gói 1A — Đội SHIFTS: Ca làm, tăng ca, giải trình chấm công

Blueprint `shifts` (prefix `/api/v1/shifts`), models `server/app/models/shifts.py`,
FE `client/src/features/shifts/pages/ShiftsPage.jsx` (route `/shifts`,
3 tab: Lịch ca / Tăng ca / Giải trình).

### 1.1 Dữ liệu

- `ShiftDefinition`: id, name (vd "Ca hành chính"), start_time (Time),
  end_time (Time), break_minutes (int, mặc định 60), is_overnight (bool),
  is_active.
- `ShiftAssignment`: id, employee_id FK, shift_id FK, work_date (Date),
  note; UNIQUE(employee_id, work_date).
- `OvertimeRequest`: id, employee_id FK, work_date, hours (Float),
  reason, status (pending/manager_approved/approved/rejected),
  manager_decision_by/at/note, hr_decision_by/at/note (theo mẫu leave).
- `AttendanceCorrection`: id, employee_id FK, attendance_id FK nullable,
  work_date, requested_check_in (DateTime nullable), requested_check_out
  (DateTime nullable), reason, status (cùng máy trạng thái duyệt 2 cấp).

### 1.2 API

- `GET /shifts/definitions` (mọi role đọc), `POST/PATCH/DELETE
  /shifts/definitions` (admin/hr).
- `GET /shifts/week?date=YYYY-MM-DD&department_id=` → lịch ca tuần (Thứ 2–CN
  chứa `date`): danh sách nhân viên (theo scope) × ngày, kèm ca đã gán.
  `POST /shifts/assignments` {employee_id, shift_id, work_date} (admin/hr;
  manager chỉ trong phòng mình), `DELETE /shifts/assignments/<id>`.
- `GET /shifts/my-schedule?month=YYYY-MM` (employee: lịch ca của mình).
- Tăng ca: `POST /shifts/overtime` (employee tạo cho mình; hr/admin tạo hộ),
  `GET /shifts/overtime?scope=mine|team|all&status=`,
  `POST /shifts/overtime/<id>/manager-decision`,
  `POST /shifts/overtime/<id>/hr-decision` — bám mẫu leave routes/services.
- Giải trình: `POST /shifts/corrections`, `GET /shifts/corrections?...`
  (cùng tham số scope/status), 2 endpoint decision tương tự. Khi HR duyệt
  (approved): cập nhật bản ghi `Attendance` tương ứng (tạo mới nếu chưa có)
  với check_in/check_out đã duyệt + đánh dấu nguồn giải trình trong
  `note`/trường hiện có của model Attendance (đọc model trước, không thêm
  cột tùy tiện — nếu model có trường `source`/`note` thì dùng, không thì
  chỉ cập nhật giờ).

### 1.3 FE — ShiftsPage 3 tab

- Tab Lịch ca: bảng tuần (cột Thứ 2–CN, hàng nhân viên theo scope), ô hiển
  thị tên ca; admin/hr/manager bấm ô để gán/đổi ca (Modal chọn ca hoặc xoá).
  Bộ lọc phòng ban cho hr/admin. Employee chỉ thấy lịch của mình + đồng
  nghiệp cùng phòng (đọc-only).
- Tab Tăng ca: bảng đơn (của tôi / chờ tôi duyệt theo role), tạo đơn (Modal
  form), nút Duyệt/Từ chối theo đúng cấp đang chờ.
- Tab Giải trình: tương tự — tạo giải trình (chọn ngày, giờ đề xuất, lý do),
  hàng chờ duyệt theo role.
- Định nghĩa ca: khu vực quản trị nhỏ trong tab Lịch ca (admin/hr): liệt
  kê + tạo/sửa ca.

### 1.4 Seed demo

3 ca (Hành chính 08:00–17:00 nghỉ 60', Ca sáng 06:00–14:00, Ca chiều
14:00–22:00); gán Ca hành chính cho NV0001–NV0004 các ngày Thứ 2–Thứ 6 của
tuần hiện tại; tăng ca: 1 đơn NV0003 `pending` (mai, 2h, "Hoàn thiện báo
cáo tháng"), 1 đơn NV0002 `manager_approved`; giải trình: 1 đơn NV0003
`pending` (hôm qua, quên check-in, đề xuất 08:02).

---

## 2. Gói 1B — Đội DOCUMENTS: Hồ sơ điện tử + giấy xác nhận

Blueprint `documents` (prefix `/api/v1/documents`), models
`server/app/models/documents.py`, FE
`client/src/features/documents/pages/DocumentsPage.jsx` (route `/documents`).

### 2.1 Dữ liệu

- `EmployeeDocument`: id, employee_id FK, doc_type
  (contract/cccd/degree/certificate/other), title, original_filename,
  stored_path, expiry_date (Date nullable), note, uploaded_by FK users.
- `CertificateRequest`: id, employee_id FK, cert_type (salary/employment),
  purpose, status (pending/approved/rejected — duyệt 1 cấp HR/Admin là đủ,
  nhưng giữ trường decided_by/decided_at/decision_note), issued_content
  (Text nullable — nội dung giấy xác nhận khi đã cấp).

### 2.2 API

- `GET /documents?employee_id=` (scope: employee = chỉ mình; manager =
  phòng mình; hr/admin = tất cả; employee_id lạ ngoài scope → 403/rỗng
  theo quy ước module khác).
- `POST /documents` (multipart form: file + employee_id + doc_type +
  title + expiry_date + note): employee chỉ upload cho mình; hr/admin
  cho bất kỳ ai. Lưu file vào `server/uploads/documents/` (tạo thư mục
  nếu chưa có; tên file an toàn: uuid + đuôi gốc; giới hạn 10MB; từ chối
  đuôi nguy hiểm .exe/.sh/.bat). Đọc cách `kb`/`recruitment` lưu file để
  nhất quán.
- `GET /documents/<id>/download` (đúng scope mới tải được), 
  `DELETE /documents/<id>` (hr/admin hoặc chính chủ).
- `GET /documents/expiring?days=30` (hr/admin): giấy tờ sắp hết hạn.
- Giấy xác nhận: `POST /documents/certificates` {cert_type, purpose}
  (employee tạo cho mình), `GET /documents/certificates?scope=&status=`,
  `POST /documents/certificates/<id>/decision` (hr/admin)
  {decision, note} → khi approve: sinh `issued_content` dạng văn bản trang
  trọng tiếng Việt (tên công ty "Công ty HRM Demo", họ tên, chức vụ, phòng
  ban, mức lương cơ bản nếu cert_type=salary — lấy từ hồ sơ/payroll hiện
  có, số liệu nào không có thì ghi "theo hồ sơ nhân sự"), đóng dấu ngày cấp
  + mã xác nhận `XN-<id>-<năm>`. `GET /documents/certificates/<id>/download`
  trả file .txt UTF-8 của issued_content (chỉ chủ đơn hoặc hr/admin, và
  chỉ khi approved).

### 2.3 FE — DocumentsPage

- Khu "Hồ sơ nhân viên": chọn nhân viên (hr/admin/manager) hoặc hồ sơ của
  tôi (employee); bảng tài liệu (loại, tên, hết hạn, người tải), nút Tải
  lên (Modal form có input file), Tải xuống, Xoá; badge cảnh báo đỏ/vàng
  cho hết hạn/ sắp hết hạn (≤30 ngày).
- Khu "Giấy xác nhận": bảng đơn của tôi + hàng chờ cấp (hr/admin) với nút
  Cấp phép/Từ chối (Modal xem trước nội dung khi approve xong → nút tải
  file). Form xin giấy mới cho employee.

### 2.4 Seed demo

Tài liệu: NV0001 — HĐLĐ (hết hạn sau 20 ngày), NV0002 — CCCD (không hết
hạn), NV0003 — Bằng đại học, NV0004 — Chứng chỉ tiếng Anh (đã hết hạn 10
ngày trước). File vật lý: tạo file .txt giả lập trong uploads/documents
khi seed (nội dung "Tài liệu demo"). Giấy xác nhận: NV0003 xin salary
`pending`; NV0001 xin employment `approved` kèm issued_content đầy đủ.

---

## 3. Gói 1C — Đội OFFBOARDING: Quy trình nghỉ việc & bàn giao

Blueprint `offboarding` (prefix `/api/v1/offboarding`), models
`server/app/models/offboarding.py`, FE
`client/src/features/offboarding/pages/OffboardingPage.jsx`
(route `/offboarding`). Đọc trước blueprint `onboarding` để bám khuôn
checklist/template.

### 3.1 Dữ liệu

- `OffboardingProcess`: id, employee_id FK, last_working_day (Date),
  reason, status (in_progress/completed/cancelled), initiated_by FK,
  completed_at nullable. UNIQUE phần tử: một nhân viên chỉ có 1 process
  in_progress (kiểm tra ở service).
- `OffboardingTask`: id, process_id FK, title, category
  (assets/it/hr/finance/knowledge/other), assignee_role
  (hr/manager/employee/it), is_done, done_by FK nullable, done_at, note,
  sort_order.

### 3.2 API

- `POST /offboarding` (hr/admin) {employee_id, last_working_day, reason}
  → tạo process + tự sinh checklist mặc định ở services:
  (assets) "Thu hồi tài sản đã cấp phát" + 1 task riêng cho TỪNG tài sản
  đang gán cho nhân viên này (đọc `AssetAssignment` hiện có),
  (it) "Thu hồi tài khoản & quyền truy cập",
  (knowledge) "Bàn giao công việc & tài liệu cho người thay thế",
  (finance) "Quyết toán lương & các khoản tạm ứng",
  (hr) "Chấm dứt hợp đồng & chốt sổ BHXH nội bộ",
  (hr) "Phỏng vấn nghỉ việc (exit interview)".
- `GET /offboarding` (scope: hr/admin tất cả; manager = phòng mình) kèm
  tiến độ % task xong; `GET /offboarding/<id>` chi tiết + tasks.
- `PATCH /offboarding/tasks/<id>` {is_done, note} — người được phép:
  hr/admin mọi task; manager task assignee_role=manager của phòng mình;
  employee task assignee_role=employee của chính process của mình.
- `POST /offboarding/<id>/complete` (hr/admin): chỉ khi 100% task xong →
  status completed; đặt Employee về trạng thái nghỉ việc theo đúng trường
  trạng thái model Employee hiện có (đọc model: vd `status="resigned"` —
  bám giá trị các module khác đang dùng, không bịa enum mới); vô hiệu hoá
  tài khoản đăng nhập của nhân viên (trường active của User — đọc model
  users trước). `POST /offboarding/<id>/cancel` (hr/admin) huỷ process.

### 3.3 FE — OffboardingPage

Danh sách process (nhân viên, ngày cuối, lý do, thanh tiến độ, trạng
thái); bấm vào xem chi tiết: checklist theo nhóm category, tick hoàn
thành (theo quyền), nút Hoàn tất nghỉ việc (chỉ bật khi 100%), Huỷ quy
trình; nút "Tạo quy trình nghỉ việc" (hr/admin, Modal chọn nhân viên +
ngày cuối + lý do). Giao diện bám OnboardingPage hiện có.

### 3.4 Seed demo

Tạo nhân viên NV0005 "Đỗ Văn Hùng" (phòng Kỹ thuật, chức vụ như NV0003,
KHÔNG cần tài khoản đăng nhập — nếu Employee bắt buộc user thì tạo user
`hung.do@hrm.local` bị khoá ngay từ đầu theo quy ước model), 1 tài sản
(laptop) đang gán cho NV0005 (dùng models/service của assets, chỉ ở mức
dữ liệu), process nghỉ việc in_progress (ngày cuối = cuối tháng này),
checklist đã sinh gồm task tài sản theo đúng tài sản đó, 2 task đánh dấu
xong (knowledge + exit interview chưa xong... chọn: it xong, knowledge
xong; còn lại mở).

---

## 4. Gói 2 — Đội ENGAGEMENT: Kudos, khảo sát xung (pulse) + eNPS, cột mốc

Blueprint `engagement` (prefix `/api/v1/engagement`), models
`server/app/models/engagement.py`, FE: `features/kudos/pages/KudosPage.jsx`
(route `/kudos`, 2 tab: Tường vinh danh / Cột mốc) +
`features/surveys/pages/SurveysPage.jsx` (route `/surveys`).
Đội này được sửa DUY NHẤT một chỗ ngoài folder mình: thêm widget "Vinh
danh mới nhất" vào `DashboardPage.jsx` (khu DashboardExtras — thêm section
đọc từ API kudos; giữ nguyên mọi thứ khác, không đội nào khác chạm
DashboardPage ở vòng này).

### 4.1 Dữ liệu

- `Kudo`: id, from_user_id FK users, to_employee_id FK employees, badge
  (teamwork/innovation/dedication/leadership/thanks), message,
  created_at. (Điểm = số kudo, không cần bảng điểm riêng.)
- `Survey`: id, title, description, questions (JSON: list
  {id, type: enps|scale|single|text, text, options?}), status
  (draft/active/closed), created_by, ends_at nullable.
- `SurveyResponse`: id, survey_id FK, answers (JSON theo question id),
  created_at. **KHÔNG lưu user_id** (ẩn danh thật).
- `SurveyParticipation`: id, survey_id FK, user_id FK, UNIQUE(survey_id,
  user_id) — chỉ để chống trả lời 2 lần; API kết quả KHÔNG BAO GIỜ join
  bảng này với responses.

### 4.2 API

- Kudos: `POST /engagement/kudos` {to_employee_id, badge, message} (mọi
  role; cấm tự tặng cho chính mình → 400), `GET /engagement/kudos?limit=`
  (tường vinh danh, mới nhất trước, kèm tên người tặng/nhận + phòng ban),
  `GET /engagement/kudos/leaderboard?month=YYYY-MM` (top nhận kudo tháng
  + top người tặng), `GET /engagement/kudos/mine` (tôi đã nhận/đã tặng).
- Cột mốc: `GET /engagement/milestones?month=YYYY-MM` → sinh nhật trong
  tháng + kỷ niệm năm vào làm (≥1 năm, tính tròn năm tại tháng đó) từ dữ
  liệu Employee; kèm số năm công tác.
- Khảo sát: `POST /engagement/surveys` (hr/admin) tạo + đặt active;
  `GET /engagement/surveys` — hr/admin thấy tất cả + trạng thái tôi đã
  trả lời chưa (từ Participation), employee/manager thấy survey active +
  đã trả lời hay chưa; `POST /engagement/surveys/<id>/responses`
  {answers} (mỗi user 1 lần → lần 2 trả 409 ALREADY_RESPONDED; validate
  answers theo questions: enps 0–10, scale 1–5, single thuộc options,
  text ≤ 1000 ký tự); `GET /engagement/surveys/<id>/results` (hr/admin;
  manager chỉ xem — quyết định: hr/admin only để bảo vệ ẩn danh nhóm
  nhỏ): tổng lượt trả lời, eNPS trung bình + phân bổ promoter/passive/
  detractor, trung bình từng câu scale, đếm từng lựa chọn single, danh
  sách câu trả lời text. `POST /engagement/surveys/<id>/close` (hr/admin).

### 4.3 FE

- KudosPage tab Vinh danh: lưới thẻ kudo (avatar chữ cái, badge màu theo
  loại, lời nhắn), nút "Tặng kudos" (Modal: chọn đồng nghiệp + loại +
  lời nhắn), cột phải: bảng xếp hạng tháng (nhận nhiều nhất). Tab Cột
  mốc: 2 danh sách (sinh nhật tháng này / kỷ niệm vào làm) kèm số năm.
- SurveysPage: danh sách khảo sát; employee: nút "Trả lời" mở Modal form
  theo từng loại câu (eNPS 0–10 dạng nút số, scale 1–5 sao/nút, single
  radio, text textarea), đã trả lời → badge "Đã tham gia", không xem lại
  được đáp án. HR/Admin: tạo khảo sát (form builder đơn giản: thêm câu
  hỏi từng loại), xem kết quả (thanh CSS tỉ lệ + số trung bình — KHÔNG
  dùng recharts ở trang này), đóng khảo sát.
- Widget Dashboard "Vinh danh mới nhất": 3 kudo gần nhất + link sang
  /kudos, theo mẫu DashboardExtras hiện có (dùng query key riêng
  ['engagement','kudos-latest']).

### 4.4 Seed demo

6 kudo trong tháng này giữa NV0001–NV0004 (đủ 5 loại badge, lời nhắn
tiếng Việt tự nhiên). Khảo sát active "Khảo sát mức độ gắn kết — Quý
4/2026": 1 câu eNPS, 2 câu scale, 1 câu single (ca làm việc), 1 câu text;
4 response ẩn danh mẫu (điểm eNPS: 9, 8, 6, 10); participation cho
hr@ + employee@ (2 người đã trả lời), manager@ chưa — để demo cả 2 trạng
thái.

---

## 5. Gói 3 — Đội PEOPLE-AI: Chatbot tra dữ liệu thật + dự báo nguy cơ nghỉ việc

Hai phần: (a) mở rộng blueprint `chat` hiện có (đội sở hữu
`server/app/blueprints/chat/**` ở vòng này; đọc kỹ chat services + RAG
hiện tại trong `kb` trước khi sửa — KHÔNG phá luồng RAG tài liệu hiện
có), (b) blueprint mới `people_ai` (prefix `/api/v1/people-ai`) + FE
`features/attrition/pages/AttritionPage.jsx` (route `/attrition-risk`) và
sửa `features/chatbot/pages/ChatbotPage.jsx` (chips gợi ý + nhãn chế độ).

### 5.1 Chatbot agentic — tra dữ liệu thật theo quyền người hỏi

- Tool layer trong `chat/services.py` (hoặc module con `chat/tools.py`):
  mỗi tool là hàm Python nhận (current_user, **args) và TỰ ép scope theo
  role như các service khác — model AI không quyết định được phạm vi dữ
  liệu:
  - `my_leave_balance()` — số phép còn lại của chính người hỏi.
  - `my_payslip(month, year)` — phiếu lương của chính người hỏi (chỉ khi
    kỳ đã khoá mới trả số liệu, theo quy ước payroll hiện có).
  - `my_attendance(month, year)` — tổng hợp chấm công của người hỏi
    (đúng giờ/muộn/vắng/số ngày công).
  - `who_on_leave(date)` — ai đang nghỉ phép ngày đó: employee → chỉ
    biết của mình (trả lời không có dữ liệu người khác); manager → phòng
    mình; hr/admin → toàn công ty.
  - `my_pending_approvals()` — manager/hr: số đơn đang chờ mình duyệt
    (theo đúng cấp của mình).
  - `team_overview()` — manager/hr/admin: sĩ số phòng/toàn công ty, số
    đang nghỉ hôm nay (dùng stats services hiện có nếu tái sử dụng được).
- Luồng trả lời: nếu có AI key → gọi provider (ai_service/provider.py)
  theo kiểu function-calling nếu provider hỗ trợ; nếu provider không hỗ
  trợ tool-calling hoặc không có key → FALLBACK tất định bằng nhận diện
  ý định (từ khoá tiếng Việt có/không dấu: "ngày phép", "còn bao nhiêu
  phép", "lương tháng", "phiếu lương", "ai đang nghỉ", "chấm công tháng",
  "đơn chờ duyệt", "sĩ số"...) rồi gọi đúng tool và dựng câu trả lời từ
  dữ liệu thật. Mọi câu trả lời dùng dữ liệu thật phải kết thúc bằng
  dòng nguồn: "Nguồn: dữ liệu trực tiếp từ hệ thống (theo quyền truy cập
  của bạn)." Không bịa số ngoài tool result. Câu hỏi ngoài phạm vi tool
  + tài liệu → giữ hành vi RAG hiện tại.
- Ghi ChatLog như hiện tại + đánh dấu mode (`rag` | `live_data`) trong
  metadata nếu schema cho phép (không thì thêm tiền tố nội bộ an toàn —
  đọc model ChatLog trước).
- API giữ nguyên endpoint chat hiện có (đọc routes trước); response bổ
  sung trường `mode` ("live_data" khi dùng tool) để FE hiện nhãn.

### 5.2 FE ChatbotPage

- Chips gợi ý phía trên ô nhập: "Tôi còn bao nhiêu ngày phép?", "Phiếu
  lương tháng này của tôi", "Hôm nay ai đang nghỉ phép?", "Chấm công
  tháng này của tôi" (bấm là gửi luôn).
- Nhãn chế độ trong bong bóng trả lời: nếu `mode=live_data` hiện badge
  nhỏ "Dữ liệu trực tiếp"; RAG giữ trích dẫn như hiện tại.

### 5.3 Dự báo nguy cơ nghỉ việc (people_ai) — chấm điểm theo luật, giải thích được

- `GET /people-ai/attrition-risk?department_id=&level=` (admin/hr toàn
  công ty; manager chỉ phòng mình; employee → 403). Tính tại chỗ (không
  bảng lưu trữ), cửa sổ 60 ngày gần nhất:
  - Đi muộn ≥4 lần/60 ngày: +15; vắng không phép ≥2 ngày: +20 (đọc
    Attendance status theo quy ước model hiện có).
  - Đơn phép tăng đột biến (số ngày phép 30 ngày gần nhất ≥ 2× 30 ngày
    trước đó và ≥3 ngày): +10.
  - Điểm hiệu suất kỳ gần nhất giảm ≥15 điểm so với kỳ trước (models
    performance): +15; điểm kỳ gần nhất < 50: +10.
  - Thâm niên < 1 năm: +10 (giai đoạn dễ rời đi); thâm niên 1–2 năm: +5.
  - Không tăng ca/không hoạt động đào tạo 60 ngày: KHÔNG cộng (tránh suy
    diễn) — chỉ dùng tín hiệu đo được ở trên.
  - Trần 100. Mức: <30 Thấp, 30–59 Trung bình, ≥60 Cao.
  - Mỗi nhân viên trả kèm `factors`: danh sách câu tiếng Việt mô tả tín
    hiệu đã cộng điểm (vd "Đi muộn 5 lần trong 60 ngày (+15)").
- Response: {generated_at, window_days: 60, items: [{employee, score,
  level, factors}], summary: {high, medium, low}}.
- FE AttritionPage: StatCard tổng hợp 3 mức; bảng nhân viên (điểm, badge
  mức màu, các yếu tố chính dạng text nhỏ), lọc theo mức + phòng ban;
  khung lưu ý cố định đầu trang: "Điểm tham khảo phục vụ chăm sóc nhân
  viên — không dùng làm căn cứ kỷ luật hay đánh giá chính thức." Employee
  không thấy menu (parent đã gate route theo role).

### 5.4 Seed demo

Không seed dữ liệu riêng: điểm rủi ro tính từ dữ liệu thật đã có. (Nếu dữ
liệu demo hiện tại khiến mọi người đều "Thấp" thì vẫn đúng — trang phải
hiển thị đẹp cả khi ít tín hiệu.) Chatbot fallback phải demo được với tài
khoản employee@/manager@ trên dữ liệu seed hiện có.

---

## 6. Tiêu chí nghiệm thu (parent kiểm chứng sau tích hợp)

1. `npm run build` PASS; không lỗi console ở các trang mới.
2. Seed lại từ DB rỗng chạy sạch (kể cả seed_demo của 5 đội), đăng nhập
   được 4 tài khoản demo.
3. API các module mới trả 200 với dữ liệu thật theo từng role; employee
   bị chặn đúng ở attrition (403), documents ngoài scope, survey results.
4. Luồng nghiệp vụ chạy trọn: gán ca tuần → xem lịch; tạo đơn tăng ca →
   manager duyệt → HR duyệt; xin giấy xác nhận → HR cấp → tải file;
   tạo offboarding → tick task → hoàn tất → nhân viên chuyển trạng thái
   nghỉ việc; tặng kudos → hiện trên tường + widget Dashboard; trả lời
   khảo sát → lần 2 bị 409 → HR xem kết quả; chatbot hỏi "còn bao nhiêu
   ngày phép" bằng tài khoản employee → trả số thật + dòng nguồn.
5. Chụp ảnh kiểm chứng từng trang mới; commit + push; deploy backend lên
   Render (manual deploy) + frontend tự deploy qua Vercel; kiểm tra live.
