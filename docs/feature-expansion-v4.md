# Hợp đồng mở rộng v4 — Trực quan & Game hoá (gói 1 + 2)

Ngày: 2026-10-21. Người dùng duyệt gói 1 (trực quan & sống động) + gói 2
(game hoá & phúc lợi). Gói 3 (QR/GPS, AI JD/phỏng vấn, trợ lý điều hành)
để đợt sau — KHÔNG làm ở vòng này.

Quy ước chung: áp dụng nguyên mục 0 của `docs/feature-expansion-v3.md`
(phân chia file dùng chung do parent tích hợp; khuôn blueprint
routes/services/schemas theo module training/leave; envelope lỗi chuẩn;
scope dữ liệu theo role; seed_demo() idempotent tra cứu bằng email, không
tự commit; kiểm chứng bằng DB tạm + test_client + JWT, không đụng DB dev;
frontend phẳng v4, UI kit, services.js theo feature, đủ loading/rỗng/lỗi).
Bổ sung cho vòng này: MỌI đội đọc thêm `docs/feature-expansion-v3.md` mục
0 nếu chưa đọc.

Đăng ký parent sẽ làm: `_MODULE_BLUEPRINTS` += `feed`, `gamification`;
routes FE `/feed`, `/rewards`, `/my-journey`; menu: Bảng tin → Truyền
thông; Hành trình của tôi + Cửa hàng quà → nhóm mới "Trải nghiệm".

---

## 1. Đội FEED — Bảng tin nội bộ + dòng hoạt động

Blueprint `feed` (prefix `/api/v1/feed`), models
`server/app/models/feed.py`, FE `client/src/features/feed/pages/FeedPage.jsx`
(route `/feed`). Đội này được sửa DUY NHẤT một chỗ ngoài folder mình:
thêm widget "Hoạt động mới nhất" (`LatestActivityWidget`, query key
['feed','activity-latest']) vào khu DashboardExtras của
`client/src/features/dashboard/pages/DashboardPage.jsx` — chỉ thêm ở
cuối extras như widget kudos đợt v3, không đổi phần khác.

### 1.1 Dữ liệu
- `FeedPost`: id, author_id FK users, content (Text), is_pinned (bool),
  created_at/updated_at.
- `FeedLike`: id, post_id FK, user_id FK, UNIQUE(post_id, user_id).
- `FeedComment`: id, post_id FK, author_id FK users, content, created_at.

### 1.2 API
- `GET /feed/posts?page=&limit=` — ghim trước, mới nhất sau; mỗi post kèm
  author (tên, employee code, phòng ban), like_count, comment_count,
  liked_by_me, comments_preview (3 bình luận mới nhất).
- `POST /feed/posts` {content} (mọi role; content 1–2000 ký tự).
- `DELETE /feed/posts/<id>` — tác giả hoặc hr/admin.
- `POST /feed/posts/<id>/pin` {is_pinned} — hr/admin.
- `POST /feed/posts/<id>/like` — toggle tim, trả {liked, like_count}.
- `GET /feed/posts/<id>/comments` (phân trang nhẹ), `POST
  /feed/posts/<id>/comments` {content}, `DELETE
  /feed/comments/<id>` — tác giả bình luận hoặc hr/admin.
- `GET /feed/activity?limit=10` — dòng sự kiện tổng hợp (chỉ đọc, suy từ
  bảng có sẵn, mới nhất trước): kudo mới (Kudo), thông báo mới
  (Announcement), nhân viên mới gia nhập (Employee.created_at trong 30
  ngày), chấm công hôm nay (Attendance có check_in hôm nay — gom theo
  người, text "đã chấm công lúc HH:MM"), bài viết mới (FeedPost). Mỗi
  item: {type, actor_name, text, at, link} — link trỏ trang liên quan
  (/kudos, /announcements, /employees, /attendance, /feed).

### 1.3 FE — FeedPage
- Cột chính: khung đăng bài (textarea + nút Đăng; avatar chữ cái của
  mình), danh sách bài dạng thẻ phẳng: đầu bài (avatar, tên, phòng ban,
  thời gian tương đối kiểu "2 giờ trước"), nội dung, hàng hành động
  (tim + số, bình luận + số), khu bình luận mở inline (3 bình luận gần
  nhất + ô nhập + link xem tất cả). Bài ghim có badge "Đã ghim" + nút
  ghim/bỏ ghim cho hr/admin; nút xoá cho tác giả/hr/admin.
- Cột phải (desktop): thẻ "Hoạt động mới nhất" (dùng chung dữ liệu với
  widget Dashboard) + thẻ gợi ý "Tặng kudos" link sang /kudos.
- Widget Dashboard: 5 hoạt động mới nhất, mỗi dòng 1 icon theo type +
  text + thời gian; lỗi thì ẩn như các widget extras khác.

### 1.4 Seed demo
3 bài: (1) HR (NV0002) GHIM — chào mừng + nhắc khảo sát gắn kết Q4;
(2) Manager (NV0001) — chúc mừng team đạt mục tiêu tháng; (3) Employee
NV0004 — bài cảm ơn đồng nghiệp hỗ trợ onboard. Tim chéo nhau 5–6 lượt;
4 bình luận qua lại. Thời gian rải trong 3 ngày gần nhất (tương đối).

---

## 2. Đội GAME — Điểm thưởng, cửa hàng quà, huy hiệu, xếp hạng

Blueprint `gamification` (prefix `/api/v1/gamification`), models
`server/app/models/gamification.py`, FE
`client/src/features/rewards/pages/RewardsPage.jsx` (route `/rewards`).
Đội này KHÔNG sửa code của module khác: điểm được cộng bằng cơ chế
**đồng bộ lười (lazy sync)** mô tả ở 2.2.

### 2.1 Dữ liệu
- `PointsLedger`: id, employee_id FK, delta (int, + cộng / − trừ),
  source_type (kudo_received | training_completed | ontime_day |
  redemption | manual), source_ref (chuỗi định danh nguồn, vd
  "kudo:12", "course:3", "attendance:2026-10-05", "redemption:4"),
  note, created_at. UNIQUE(employee_id, source_type, source_ref) —
  chống cộng trùng.
- `Reward`: id, name, description, points_cost (int), stock (int,
  null = không giới hạn), image_emoji (1 ký tự emoji hiển thị), is_active.
- `Redemption`: id, employee_id FK, reward_id FK, points_cost (chụp lại
  tại thời điểm đổi), status (pending/approved/rejected), decided_by,
  decided_at, note, created_at.

### 2.2 Điểm thưởng — quy tắc + lazy sync
Bảng điểm: nhận 1 kudo **+10**; hoàn thành 1 khoá học **+50**; mỗi ngày
chấm công đúng giờ (check_in không muộn theo quy ước model Attendance
hiện có — đọc kỹ trường trạng thái/muộn của attendance services) **+2**.
Hàm `sync_points(employee_id)` trong services: quét 3 nguồn (Kudo theo
to_employee_id, CourseEnrollment status completed, Attendance đúng giờ)
và chèn các dòng ledger còn thiếu (bỏ qua trùng nhờ UNIQUE + kiểm tra
trước). `sync_points` được gọi ở đầu các endpoint đọc điểm của chính
người dùng (my-points, rewards list, leaderboard — leaderboard sync cho
mọi nhân viên active, số lượng nhỏ nên chấp nhận được) và trước khi tạo
Redemption. Số dư = SUM(delta). Trừ điểm khi redemption được duyệt: chèn
dòng delta âm source_type=redemption, source_ref="redemption:<id>" —
tạo redemption ở trạng thái pending CHƯA trừ; HR duyệt mới trừ (kiểm
tra lại số dư tại thời điểm duyệt; không đủ → 409).

### 2.3 API
- `GET /gamification/my-points` → {balance, total_earned, total_spent,
  recent: [10 dòng ledger gần nhất kèm note + thời gian]} (sync trước).
- `GET /gamification/leaderboard?limit=10` → top theo tổng điểm đã kiếm
  (total_earned): [{employee, department, total_earned, balance}].
- `GET /gamification/my-badges` → danh sách huy hiệu TÍNH TẠI CHỖ từ dữ
  liệu thật (không lưu bảng): mỗi huy hiệu {key, name, emoji, description,
  earned: bool, progress_text}. Bộ huy hiệu cố định:
  - `punctual_7` "Đúng giờ 7 ngày liên tiếp" 🔥 — chuỗi ngày đúng giờ dài
    nhất ≥ 7 (tính từ Attendance).
  - `perfect_month` "Chuyên cần tháng này" ⭐ — tháng hiện tại chưa muộn
    lần nào và đã có ≥ 10 ngày công.
  - `learner_1` "Bước đầu học tập" 📚 (≥1 khoá xong), `learner_3`
    "Chiến binh học tập" 🎓 (≥3 khoá xong).
  - `star_5` "Ngôi sao gắn kết" 💛 — nhận ≥ 5 kudo.
  - `giver_5` "Người truyền lửa" 🎁 — tặng ≥ 5 kudo (theo from_user).
- `GET /gamification/rewards` → catalog đang active kèm `affordable`
  theo số dư của người gọi (sync trước).
- `POST /gamification/rewards` (hr/admin) tạo quà; `PATCH
  /gamification/rewards/<id>` (hr/admin) sửa/stock/khoá.
- `POST /gamification/redemptions` {reward_id} — kiểm tra: quà active,
  còn stock (nếu có), số dư ≥ giá → tạo pending; số dư không đủ → 400
  INSUFFICIENT_POINTS.
- `GET /gamification/redemptions?scope=mine|all` — mine: của tôi; all:
  hr/admin tất cả, hỗ trợ ?status=.
- `POST /gamification/redemptions/<id>/decision` (hr/admin)
  {decision, note} — approve: trừ điểm (2.2) + giảm stock (nếu có) →
  approved; reject → rejected. Đã quyết → 409.

### 2.4 FE — RewardsPage
- Đầu trang: thẻ số dư điểm của tôi (số lớn) + tổng đã kiếm/đã tiêu +
  nút xem lịch sử điểm (mở Modal hoặc khu mở rộng liệt kê ledger gần
  nhất).
- Lưới quà: thẻ từng món (emoji lớn, tên, mô tả, giá điểm, còn/hết kho),
  nút "Đổi quà" — disable + ghi chú nếu chưa đủ điểm; xác nhận qua Modal.
- Khu "Yêu cầu của tôi": bảng redemption + trạng thái.
- HR/Admin thêm: panel quản lý quà (tạo/sửa nhanh) + hàng chờ duyệt đổi
  quà (Duyệt/Từ chối).
- Huy hiệu + xếp hạng KHÔNG đặt ở trang này (nằm ở /my-journey và cột
  phải /rewards chỉ gồm số dư + lịch sử) — giữ trang gọn.

### 2.5 Seed demo
Catalog 5 món: "Voucher cà phê 50.000đ" 50đ ☕ (stock 20), "Bình giữ
nhiệt công ty" 200đ 🍶 (stock 10), "Áo thun Web HRM AI" 150đ 👕 (stock
15), "Chuột không dây" 300đ 🖱️ (stock 5), "Thêm 0.5 ngày phép" 500đ 🌴
(stock null). Redemption mẫu: NV0003 đổi voucher cà phê đã approved (đã
trừ điểm qua ledger), NV0001 đổi bình giữ nhiệt đang pending. Seed gọi
sync_points cho NV0001–NV0004 trước khi tạo redemption để số dư nhất
quán; idempotent (redemption kiểm tra theo employee+reward+status).

---

## 3. Đội JOURNEY — "Hành trình của tôi"

FE chính: `client/src/features/journey/pages/JourneyPage.jsx` (route
`/my-journey`) + backend nhỏ: bổ sung endpoint vào blueprint `attendance`
hiện có (đội này được sửa `server/app/blueprints/attendance/**` CHỈ để
thêm endpoint dưới đây, không đổi hành vi cũ).

### 3.1 API bổ sung
- `GET /attendance/my-year?year=YYYY` → mọi role đã đăng nhập; trả
  {year, days: [{date, status, check_in, check_out}]} cho mọi ngày có dữ
  liệu chấm công của CHÍNH người gọi trong năm + tổng hợp {total_days,
  on_time_days, late_days, current_streak (chuỗi ngày đúng giờ liên tiếp
  tính tới ngày công gần nhất), best_streak}. Trạng thái lấy theo đúng
  quy ước model Attendance/attendance services hiện có.

### 3.2 FE — JourneyPage (chỉ của người đang đăng nhập)
- Hàng StatCard: Chuỗi đúng giờ hiện tại (ngày), Tổng ngày công năm nay,
  Điểm thưởng của tôi (gọi gamification my-points), Kudo đã nhận (gọi
  engagement kudos/mine).
- **Bản đồ nhiệt chấm công**: lưới 53 tuần × 7 ngày của năm hiện tại
  (CSS grid thuần, không thư viện): ô màu theo trạng thái — đúng giờ
  (xanh lá theo đậm nhạt), muộn (vàng/cam), vắng/nghỉ (xám), cuối tuần
  (rất nhạt), hôm nay (viền đậm); hover hiện tooltip ngày + trạng thái;
  chú thích màu ở dưới. Cuộn ngang trên mobile.
- **Huy hiệu của tôi**: lưới huy hiệu từ gamification my-badges — đạt:
  màu + emoji lớn; chưa đạt: xám + dòng tiến độ (progress_text).
- **Xếp hạng công ty**: top 10 từ gamification leaderboard, đánh dấu
  dòng của chính mình; nút sang /rewards.
- Trạng thái rỗng thân thiện nếu chưa có dữ liệu (nhân viên mới).

### 3.3 Seed demo
Không seed riêng: trang chạy từ dữ liệu chấm công/kudo/điểm đã có. Đảm
bảo không lỗi khi attendance của người gọi trống.

---

## 4. Nghiệm thu (parent)
1. `npm run build` PASS, seed lại sạch, đăng nhập 4 tài khoản OK.
2. Luồng chạy trọn: đăng bài → tim → bình luận → ghim (HR); widget hoạt
   động hiện trên Dashboard; vào /my-journey thấy heatmap có dữ liệu +
   chuỗi đúng giờ; điểm tự sync từ kudo/đào tạo/chấm công; đổi quà bằng
   điểm → HR duyệt → điểm trừ đúng, stock giảm; huy hiệu sáng đúng điều
   kiện; employee không xem được hàng duyệt quà của người khác.
3. Chụp ảnh kiểm chứng /feed, /rewards, /my-journey + Dashboard; commit,
   push, deploy, kiểm tra live.
