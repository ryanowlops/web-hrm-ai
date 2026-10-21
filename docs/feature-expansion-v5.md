# Hợp đồng mở rộng v5 — 5 tính năng "wow" (AI hành động & trải nghiệm)

Ngày: 2026-10-22. Người dùng duyệt cả 5 ý mới: (A) chatbot hành động,
(B) phỏng vấn thử AI, (C) màn hình sảnh TV, (D) bản đồ năng lực,
(E) AI kiểm tra CV công khai. Gói QR/GPS + AI JD + trợ lý điều hành của
bản nháp trước KHÔNG thuộc vòng này.

Quy ước chung: áp dụng nguyên mục 0 của `docs/feature-expansion-v3.md`
và các bổ sung ở v4 (phân chia file dùng chung do parent tích hợp; khuôn
blueprint routes/services/schemas; envelope lỗi chuẩn; scope theo role;
seed_demo() idempotent, không tự commit; kiểm chứng bằng DB tạm +
test_client + JWT, không bọc chung app_context; frontend phẳng v4 +
UI kit + services.js theo feature, đủ loading/rỗng/lỗi).

Bối cảnh AI: production ĐÃ có Gemini thật (AI_BASE_URL Gemini
OpenAI-compatible, AI_MODEL=gemini-2.5-flash). Mọi tính năng AI phải:
dùng `app.ai_service` (provider.chat_completion — tác vụ cấu trúc giữ
mặc định json_mode + temperature nghiêm; hội thoại tự nhiên mới truyền
json_mode=False), và có đường dự phòng xác định (template/heuristic)
khi provider không khả dụng, ghi nhãn trung thực. TUYỆT ĐỐI không bịa
số liệu nghiệp vụ: số thật lấy từ DB qua services của module sở hữu.

Đăng ký parent sẽ làm: `_MODULE_BLUEPRINTS` += `interviews`, `skills`;
models `__init__` += model của 2 module; seed wiring (skills); routes
FE: `/mock-interview` (trang công khai, ngoài AppLayout — cùng cơ chế
trang /jobs), `/display` (route có đăng nhập nhưng KHÔNG layout —
parent xử lý theo cấu trúc router hiện tại), `/skills`; trang chat và
trang jobs công khai do các đội sửa trong phạm vi được ghi rõ.

---

## A. Đội ACTION — Chatbot hành động (agentic)

Phạm vi code: `server/app/blueprints/chat/**` (mở rộng) +
`client/src/features/chat/**` (trang ChatbotPage + services).

### A.1 Nguyên tắc an toàn (bắt buộc)
Chatbot chỉ ĐỀ XUẤT hành động, không tự thực thi. Luồng 2 bước:
(1) `POST /chat/ask` nhận diện ý định hành động → trả thêm trường
`action` trong đáp án (KHÔNG thay đổi dữ liệu); (2) người dùng bấm nút
xác nhận trên thẻ hành động ở FE → `POST /chat/actions/execute` mới
thực thi, và tầng execute PHẢI kiểm tra lại toàn bộ quyền + điều kiện
bằng services của module leave tại thời điểm chạy (không tin payload
đề xuất). Huỷ = không gọi execute, không có tác dụng phụ.

### A.2 Hành động hỗ trợ vòng này (chỉ 2 loại)
- `create_leave` (mọi nhân viên cho CHÍNH MÌNH): trích từ câu nói —
  loại phép (năm/ốm/không lương theo enum hiện có của leave), ngày bắt
  đầu/kết thúc, lý do. Phân tích ngày tháng tiếng Việt xác định:
  "ngày mai", "thứ Sáu này/tuần này", "dd/mm", "dd/mm/yyyy", khoảng
  "từ X đến Y", "nghỉ N ngày từ X". Mọi ngày tính theo ICT. Thiếu
  thông tin bắt buộc hoặc mơ hồ → trả câu hỏi làm rõ (không kèm
  action). Payload: {leave_type, start_date, end_date, reason}.
- `decide_leave` (chỉ người đang là cấp duyệt hiện tại của đơn):
  câu nói kiểu "duyệt đơn của Lan", "từ chối đơn nghỉ của Minh vì…".
  Tìm đơn PENDING trong scope duyệt của người gọi, khớp theo tên/Mã
  NV người xin; khớp đúng 1 đơn → đề xuất {request_id, decision:
  approve|reject, note?}; khớp nhiều → trả danh sách để chọn (không
  action); không khớp → trả lời thường.

Nhận diện: mẫu từ khoá xác định trước (mở rộng bộ phân loại hiện có
trong tools.py); khi có AI key, được phép nhờ LLM phân loại bổ sung
như cơ chế hiện tại — nhưng việc TRÍCH payload ngày/loại phép vẫn do
code xác định đảm nhiệm để không sai số liệu.

### A.3 API + hợp đồng FE
- `POST /chat/ask` — đáp án thêm `action` (null khi không có):
  {type, title, summary, details: [{label, value}], payload}.
  `mode` khi có action = "action". Lưu lịch sử: nhét {"_action": {...}}
  vào sources như cơ chế {"_meta"} hiện tại; get_history trả lại
  trường `action` cho tin nhắn đó (đã thực thi hay chưa do FE suy từ
  tin nhắn kết quả phía sau — không cần trạng thái riêng).
- `POST /chat/actions/execute` {type, payload} → thực thi qua leave
  services; thành công: 200 {result_text, leave_request} (leave_request
  theo serializer của module leave); lỗi nghiệp vụ (không đủ phép,
  trùng lịch, không phải cấp duyệt, đơn đã xử lý): 400/403/409 theo
  đúng ApiError của leave services.
- FE ChatbotPage: tin nhắn có `action` hiển thị THẺ HÀNH ĐỘNG trong
  luồng chat (tiêu đề, các dòng chi tiết, nút "Xác nhận thực hiện" +
  "Huỷ"); bấm Huỷ → thẻ chuyển trạng thái "Đã huỷ" (chỉ FE); bấm Xác
  nhận → gọi execute → thẻ chuyển "Đã thực hiện" + chèn tin nhắn kết
  quả (result_text) vào cuộc trò chuyện; lỗi → Alert trong thẻ, cho
  thử lại. Các chip gợi ý thêm 2 mẫu: "Xin nghỉ phép giúp tôi…" và
  (manager/hr) "Duyệt đơn đang chờ của team tôi".

### A.4 Kiểm chứng bắt buộc
DB tạm: employee nói "cho tôi xin nghỉ phép năm thứ Sáu này, lý do
việc nhà" → ask trả action create_leave với ngày thứ Sáu đúng ICT +
chưa có đơn nào được tạo trong DB; execute → đơn xuất hiện, số dư
phép trừ đúng qua leave services; execute lại với payload bị sửa
ngày chồng đơn khác → lỗi nghiệp vụ; employee execute decide_leave
cho đơn của người khác → 403/400; manager đề xuất + execute duyệt
đơn → trạng thái đơn đổi đúng cấp; câu hỏi chính sách thường → không
action, luồng RAG nguyên vẹn.

---

## B. Đội INTERVIEW — Phỏng vấn thử với AI

Blueprint `interviews` (prefix `/api/v1/interviews`), models
`server/app/models/interview.py`, FE feature
`client/src/features/interviews/` với trang công khai
`MockInterviewPage.jsx` (route `/mock-interview`, ngoài AppLayout —
parent đăng ký; trang tự chứa khung hiển thị riêng tối giản theo v4).

### B.1 Dữ liệu
- `InterviewSession`: id, job_id FK job_postings, user_id FK users
  NULL (khách), guest_name, guest_email, access_token (chuỗi ngẫu
  nhiên — chỉ khách mới cần), status (in_progress/finished),
  current_index, overall_score (float NULL), summary (JSON text:
  strengths[], improvements[], verdict), created_at/finished_at.
- `InterviewQA`: id, session_id FK, order_no, question (Text),
  keywords (JSON text — từ khoá kỳ vọng để chấm dự phòng),
  answer (Text NULL), score (float NULL), comment (Text NULL).

### B.2 Luồng + API
- `POST /interviews/start` — 2 dạng: JWT (user đã đăng nhập) hoặc
  khách {job_id, guest_name, guest_email}. Tạo phiên + sinh 5 câu hỏi
  từ JD của vị trí: AI (json mode) trả [{question, keywords[]}] theo
  JD (kỹ thuật + tình huống + văn hoá); dự phòng: ngân hàng câu hỏi
  mẫu theo nhóm từ khoá JD (đội tự soạn ≥12 mẫu, chọn 5 theo khớp từ
  khoá, keywords lấy từ JD). Trả {session_id, access_token? (chỉ
  khách), job {id, title}, total_questions, first_question}.
- `GET /interviews/<id>` — chủ phiên (JWT khớp user_id hoặc header
  `X-Session-Token` khớp access_token): trạng thái + câu hỏi hiện tại
  + tiến độ; phiên finished → kèm báo cáo.
- `POST /interviews/<id>/answer` {answer} — lưu trả lời cho câu hiện
  tại, trả câu hỏi kế tiếp hoặc {done: true} khi hết.
- `POST /interviews/<id>/finish` — chấm điểm: AI (json mode) chấm
  từng câu 0–10 + nhận xét + tổng kết {overall_score (thang 100),
  strengths, improvements, verdict}; dự phòng xác định: điểm theo độ
  dài + độ phủ keywords của từng câu, nhận xét mẫu theo mức điểm,
  tổng kết mẫu — ghi rõ trong summary nguồn là "AI" hay "tham khảo"
  qua trường summary.source = "ai" | "heuristic". Chấm xong →
  status finished.
- `GET /interviews/mine` (JWT) — phiên của tôi gần đây + điểm.

### B.3 FE — MockInterviewPage
- Màn mở đầu: nếu có ?job=<id> thì chọn sẵn; dropdown chọn vị trí
  đang tuyển (lấy từ API jobs công khai); khách nhập tên + email
  (user đã đăng nhập bỏ qua); nút Bắt đầu.
- Màn phỏng vấn: bong bóng câu hỏi của "Phỏng vấn viên AI", ô trả lời
  lớn, tiến độ "Câu 2/5", nút "Trả lời & tiếp tục", nút "Kết thúc
  sớm" (vẫn chấm các câu đã trả lời).
- Màn báo cáo: điểm tổng /100 (vòng tròn điểm), từng câu: câu hỏi —
  câu trả lời — điểm — nhận xét; khối điểm mạnh/cần cải thiện; nút
  "Phỏng vấn lại" + "Xem các vị trí đang tuyển" (về /jobs).
- Giao diện trang công khai theo đúng khung trang /jobs hiện có
  (đội đọc features/recruitment để bám), phẳng v4.

### B.4 Kiểm chứng bắt buộc
Fixture job có JD; chạy không AI key (provider unavailable): start
sinh đủ 5 câu từ ngân hàng mẫu; trả lời hết → finish chấm heuristic
có điểm từng câu + overall; khách không có token → 401/403 khi đọc
phiên; token sai → 403; user A đọc phiên user B → 403; finish 2 lần
→ 409 hoặc trả lại báo cáo cũ (chọn 1, ghi rõ); job không tồn tại →
404. FE esbuild parse OK.

---

## C. Đội DISPLAY — Màn hình sảnh (chế độ TV)

FE-only: `client/src/features/display/pages/DisplayPage.jsx` (route
`/display` — parent đăng ký ngoài AppLayout nhưng vẫn trong vùng đã
đăng nhập) + sửa DUY NHẤT một chỗ ngoài folder: thêm nút "Màn hình
sảnh" (mở /display ở tab mới) vào khu đầu trang Dashboard trong
`DashboardPage.jsx` (chỉ thêm nút, không đổi khối khác).

### C.1 Nội dung + hành vi
- Toàn màn hình, nền navy đậm (#0B1B3A) + điểm nhấn brand #274FEA/
  xanh nhạt — đây là chế độ hiển thị TV, NGOẠI LỆ được dùng nền tối
  (không áp dụng cho các trang thường). Đầu trang: logo + tên công
  ty + đồng hồ giờ ICT cập nhật từng giây + ngày tháng tiếng Việt.
- Tự luân chuyển 4 cảnh, mỗi cảnh 12 giây, có chấm tiến trình; di
  chuột → tạm dừng luân chuyển; phím Esc → quay về Dashboard:
  1. **Vinh danh**: kudo mới nhất (lớn, trang trọng) + top 5 bảng
     xếp hạng điểm thưởng.
  2. **Cột mốc tháng này**: sinh nhật + kỷ niệm vào làm (từ API
     milestones hiện có) — thẻ lớn từng người.
  3. **Thông báo**: 3 thông báo mới nhất (tiêu đề + trích đoạn).
  4. **Nhịp công ty**: số liệu tổng quan (tổng nhân viên, đang làm
     hôm nay, đang nghỉ phép hôm nay — từ stats/attendance hiện có)
     + dòng hoạt động mới nhất (feed activity).
- Dữ liệu: CHỈ dùng endpoint sẵn có (gamification leaderboard,
  engagement kudos, stats milestones/overview, announcements,
  feed activity) qua services của các feature tương ứng hoặc
  services.js riêng gọi cùng đường API; refetch mỗi 60 giây
  (refetchInterval) để treo lâu vẫn mới. Cảnh nào lỗi/thiếu dữ liệu
  → hiển thị trạng thái rỗng đẹp (logo + thông điệp chào), không
  sập vòng luân chuyển.
- Chữ lớn (tiêu đề ≥ 40px), tương phản cao, animation chuyển cảnh
  mờ/trượt nhẹ bằng CSS (transform/opacity), không thư viện mới.

### C.2 Kiểm chứng bắt buộc
Build PASS; chụp ảnh kiểm chứng 2 cảnh ở viewport 1920×1080 (parent
sẽ chụp); kiểm tra Esc + tạm dừng khi hover bằng đọc code/thao tác
thử ở bước tích hợp.

---

## D. Đội SKILLS — Bản đồ năng lực

Blueprint `skills` (prefix `/api/v1/skills`), models
`server/app/models/skill.py`, FE `client/src/features/skills/pages/
SkillsPage.jsx` (route `/skills`, menu Tổ chức → "Bản đồ năng lực").

### D.1 Dữ liệu
- `Skill`: id, name (unique), category (Kỹ thuật/Chuyên môn/Mềm/
  Ngoại ngữ/Khác), description.
- `EmployeeSkill`: id, employee_id FK, skill_id FK, level (1–5),
  UNIQUE(employee_id, skill_id).

### D.2 API
- `GET /skills` — danh mục kỹ năng (mọi role).
- `POST /skills`, `PATCH /skills/<id>`, `DELETE /skills/<id>` —
  hr/admin.
- `GET /skills/matrix` — mọi role: cho mỗi kỹ năng × phòng ban:
  {avg_level (làm tròn 1 số lẻ), headcount (số người có kỹ năng)} +
  danh sách phòng ban; phòng ban không có ai có kỹ năng → ô trống
  (null), không tính 0.
- `GET /skills/employees/<id>` — hồ sơ kỹ năng 1 người (scope: chính
  mình, hoặc cùng scope xem nhân viên như module employees);
  `PUT /skills/employees/<id>` {items: [{skill_id, level}]} — tự
  cập nhật cho chính mình; hr/admin sửa cho bất kỳ ai; manager sửa
  cho nhân viên trong scope quản lý.
- `POST /skills/employees/<id>/suggest` — gợi ý khoá học lấp khoảng
  trống: kỹ năng đang < 3 khớp với khoá học training theo từ khoá
  (title/description chứa từ khoá của kỹ năng — bảng ánh xạ từ khoá
  đội định nghĩa trong services); khi có AI key: nhờ AI xếp hạng +
  viết lý do ngắn cho từng gợi ý (json mode); dự phòng: trả khớp từ
  khoá thuần kèm lý do mẫu. Trả [{skill, current_level, course
  {id, title}, reason}].

### D.3 FE — SkillsPage (3 tab)
- **Bản đồ công ty**: bảng nhiệt — hàng = kỹ năng, cột = phòng ban;
  ô tô màu xanh theo avg_level (nhạt → đậm), trong ô hiện số mức +
  số người; hover ô → tooltip; bấm ô → mở panel/danh sách nhân viên
  của phòng ban có kỹ năng đó kèm mức (lấy từ endpoint matrix mở
  rộng hoặc employees theo id — đội chọn cách gọn nhất bằng endpoint
  sẵn có, nếu cần thêm `GET /skills/matrix/cell?skill_id=&
  department_id=` thì bổ sung vào API ở D.2).
- **Kỹ năng của tôi**: danh sách kỹ năng của bản thân, chỉnh mức
  bằng thang 1–5 (nút chọn), lưu; biểu đồ radar (recharts
  RadarChart, nạp lười như các trang biểu đồ khác); nút "Gợi ý khoá
  học cho tôi" → danh sách gợi ý + link sang /training.
- **Quản trị** (hr/admin): CRUD danh mục kỹ năng (bảng + Modal như
  các trang quản trị khác).

### D.4 Seed demo
10 kỹ năng: Python, React/JavaScript, SQL & dữ liệu, Excel, Tiếng
Anh giao tiếp, Giao tiếp & thuyết trình, Quản lý dự án, Phân tích
dữ liệu, Kiểm thử phần mềm, Lãnh đạo nhóm. Mức cho NV0001–NV0005
theo đúng vị trí/phòng ban của họ (kỹ thuật mạnh kỹ thuật, kinh
doanh mạnh giao tiếp...), mỗi người 5–7 kỹ năng.

### D.5 Kiểm chứng bắt buộc
DB tạm: CRUD skill (employee tạo → 403); PUT mức cho chính mình OK,
sửa cho người ngoài scope → 403; matrix tính avg đúng fixture (2
người mức 4+2 → 3.0, headcount 2; ô không người → null); suggest:
người có Python mức 1 → gợi ý chứa khoá học có từ khoá Python trong
fixture training; trùng (employee_id, skill_id) không tạo 2 dòng.

---

## E. Đội CVCHECK — AI kiểm tra CV trên trang tuyển dụng công khai

Phạm vi: backend mở rộng trong `server/app/blueprints/recruitment/**`
(hoặc blueprint ai nếu hợp lý hơn — đội chọn và báo parent) + FE
`client/src/features/recruitment/pages/PublicJobsPage.jsx` (đội này
được sửa trang này — gồm CẢ 2 nút: "AI kiểm tra CV" và "Luyện phỏng
vấn với AI" link sang /mock-interview?job=<id>).

### E.1 API
- `POST /public/cv-check` (KHÔNG cần đăng nhập; gắn rate limit
  riêng chặt hơn mặc định — dùng cơ chế limiter hiện có của app,
  khai báo limit cụ thể trên route): body {job_id, cv_text} hoặc
  multipart file (PDF/TXT — tái dùng bộ trích text CV sẵn có của
  recruitment). cv_text tối đa ~12.000 ký tự.
- Phân tích: AI (json mode) theo JD của vị trí → {score (0–100),
  verdict (1 câu), strengths[] (≤5), improvements[] (≤5),
  matched_keywords[], missing_keywords[]}; dự phòng xác định khi
  không có key: chấm theo độ phủ từ khoá JD trong CV (công thức ghi
  rõ trong code) + strengths/improvements mẫu theo từ khoá khớp/
  thiếu; đáp án luôn có trường `source`: "ai" | "heuristic" để FE
  hiển thị trung thực.
- KHÔNG lưu CV hay kết quả vào DB (phân tích xong bỏ) — ghi rõ
  trong docstring + câu chữ trên FE ("CV của bạn chỉ dùng để phân
  tích tức thời, không lưu lại").
- Lỗi: job không tồn tại/đã đóng → 404/400; CV trống/quá dài →
  422; file sai định dạng → 422 theo bộ trích text hiện có.

### E.2 FE — trong PublicJobsPage
- Mỗi tin tuyển thêm 2 nút: "AI kiểm tra CV" (mở Modal) + "Luyện
  phỏng vấn với AI" (link /mock-interview?job=<id>).
- Modal kiểm tra CV: chọn dán văn bản hoặc tải file; nút "Phân
  tích" (trạng thái đang phân tích có spinner + chữ "AI đang đọc
  CV…"); kết quả: vòng tròn/điểm số lớn /100, verdict, 2 cột Điểm
  mạnh / Cần cải thiện, chips từ khoá khớp + còn thiếu, nhãn nguồn
  phân tích; nút "Ứng tuyển vị trí này" dẫn xuống form ứng tuyển
  hiện có của trang.

### E.3 Kiểm chứng bắt buộc
Không AI key: CV chứa nhiều từ khoá JD → điểm cao hơn rõ rệt CV
không liên quan (fixture 2 CV); source=heuristic hiển thị đúng;
job đóng → lỗi đúng; cv_text rỗng → 422; gọi quá rate limit →
429 (nếu limiter kiểm chứng được ở test — không bắt buộc nếu
limiter dùng storage memory khó ép; ghi chú lại). Không có bản ghi
nào được tạo trong DB sau khi check (đếm Candidate không đổi).

---

## Nghiệm thu (parent)
1. `npm run build` PASS, seed lại sạch, đăng nhập 4+1 tài khoản OK.
2. Luồng trọn: chat ra thẻ hành động → xác nhận → đơn phép thật xuất
   hiện; phỏng vấn thử chạy hết 5 câu có báo cáo điểm; /display luân
   chuyển cảnh; /skills matrix có số đúng + sửa mức được; trang
   /jobs kiểm tra CV cho kết quả có điểm + góp ý.
3. Chụp ảnh: thẻ hành động trong chat, báo cáo phỏng vấn, 1 cảnh
   /display, bản đồ năng lực, modal kiểm tra CV. Commit, push (CD
   tự deploy), kiểm tra live.
