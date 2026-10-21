# Phân tích & Phạm vi: KPI/OKR + Onboarding

> Trạng thái: ĐÃ CHỐT ƯU TIÊN (2026-10-21) — đây là đợt mở rộng chức năng tiếp theo của Web HRM tích hợp AI, sau khi các module lõi (nhân viên, chấm công, nghỉ phép, lương, tuyển dụng + AI CV, chatbot KB) đã hoàn thành.
> Nguyên tắc xuyên suốt: bám đúng kiến trúc hiện tại — backend blueprint mới dưới `server/app/blueprints/`, model mới dưới `server/app/models/`, frontend feature mới dưới `client/src/features/`, dùng lại guard role + data-scope, module `notifications` và `stats` sẵn có. Không sửa vỡ contract của các module cũ.

---

## 1. Vì sao chọn hai module này

- **KPI/OKR** biến hệ thống từ "chấm công – tính lương" thành "quản trị hiệu suất": có mục tiêu, có tiến độ, có đánh giá cuối kỳ. Đây là nghiệp vụ HRM mà ban chấm đồ án dễ nhận diện là chiều sâu nghiệp vụ.
- **Onboarding** nối thẳng vào module tuyển dụng đã có: ứng viên `passed` → tạo hồ sơ nhân viên → tự sinh kế hoạch hội nhập. Tạo thành một luồng demo xuyên suốt: *Tuyển dụng → Onboarding → KPI/OKR → Đánh giá*, thay vì các module rời rạc.
- Cả hai đều có yếu tố trực quan mạnh để demo: vòng tiến độ OKR, biểu đồ phân bổ điểm, thanh tiến độ onboarding theo từng nhân viên mới.

## 2. Phạm vi

### 2.1. Trong MVP (bắt buộc)

**Performance (KPI/OKR):**
1. Chu kỳ đánh giá (cycle) theo quý/năm: tạo, kích hoạt, đóng.
2. Mục tiêu (Objective) cấp cá nhân; mục tiêu phòng ban do Manager/HR tạo và gán xuống.
3. Mỗi Objective có 1–5 Key Result đo được (giá trị mục tiêu, giá trị hiện tại, trọng số, đơn vị).
4. Nhân viên tự cập nhật tiến độ (check-in) kèm ghi chú; điểm tự tính từ tiến độ.
5. Manager duyệt mục tiêu lúc tạo (`draft → pending → active`) và đánh giá cuối kỳ (điểm + nhận xét).
6. Nhân viên tự đánh giá cuối kỳ trước khi Manager đánh giá.
7. Dashboard hiệu suất: tiến độ theo cá nhân/phòng ban, phân bổ mức xếp loại.

**Onboarding:**
1. Mẫu kế hoạch (template) theo phòng ban/chức vụ, gồm các đầu việc mẫu.
2. Tự sinh kế hoạch cho nhân viên mới từ template khi HR tạo hồ sơ (hoặc khi ứng viên `passed` được chuyển thành nhân viên); cho phép tạo thủ công.
3. Đầu việc có: người phụ trách (HR / Manager / IT / Buddy / chính nhân viên mới), hạn hoàn thành tính theo ngày bắt đầu làm việc, trạng thái.
4. Các bên liên quan tick hoàn thành phần việc của mình; HR xác nhận các đầu việc thuộc loại hồ sơ/giấy tờ.
5. Tiến độ % theo từng nhân viên mới; cảnh báo việc quá hạn qua `notifications`.
6. Hoàn thành 100% → kế hoạch `completed`, ghi dấu mốc vào hồ sơ nhân viên.

### 2.2. Ngoài MVP (ghi rõ để không phình phạm vi)

- Đánh giá 360° đầy đủ (đồng nghiệp chéo nhiều người) — để giai đoạn 2 nếu còn thời gian; MVP chỉ có tự đánh giá + Manager.
- Tự động lấy số liệu KPI từ chấm công/doanh thu — MVP nhập tay qua check-in.
- Tự động quy điểm hiệu suất sang lương/thưởng — MVP chỉ *hiển thị* điểm ở hồ sơ; payroll giữ công thức hiện tại.
- Offboarding (bàn giao khi nghỉ việc) — cùng khung template, để giai đoạn 2.
- Chữ ký điện tử cho giấy tờ onboarding — MVP là HR xác nhận đã nhận đủ.

---

## 3. Phân quyền (dùng lại guard hiện tại)

| Hành động | Admin | HR | Manager | Employee |
|---|:---:|:---:|:---:|:---:|
| Tạo/đóng chu kỳ đánh giá | ✓ | ✓ | | |
| Tạo mục tiêu phòng ban | | ✓ | ✓ (phòng mình) | |
| Tạo mục tiêu cá nhân | | | ✓ (cho cấp dưới) | ✓ (cho mình, chờ duyệt) |
| Duyệt mục tiêu | | ✓ | ✓ (cấp dưới trực tiếp) | |
| Check-in tiến độ KR | | | ✓ (của mình) | ✓ (của mình) |
| Tự đánh giá / Manager đánh giá | | | ✓ (cấp dưới) | ✓ (tự đánh giá) |
| Xem dashboard toàn công ty | ✓ | ✓ | | |
| Xem dashboard team | | | ✓ (team mình) | |
| Tạo/sửa template onboarding | ✓ | ✓ | | |
| Sinh & theo dõi kế hoạch onboarding | | ✓ | ✓ (nhân viên mới của team) | |
| Hoàn thành đầu việc được giao | ✓ | ✓ | ✓ | ✓ (việc của mình) |
| Xác nhận hồ sơ giấy tờ | | ✓ | | |

Data-scope: Employee chỉ thấy dữ liệu của mình; Manager thấy cấp dưới trực tiếp (`employees.manager_id`) và nhân viên cùng phòng mình quản lý — đúng quy ước scope hiện tại của leave/attendance.

---

## 4. Module Performance (KPI/OKR)

### 4.1. Khái niệm & công thức điểm

- **Key Result (KR):** `progress = clamp(current_value / target_value, 0, 1)` — với KR dạng "giảm" (vd: giảm tỉ lệ lỗi) dùng `progress = clamp(target_value / current_value, 0, 1)` khi `current_value > 0`, khai báo bằng trường `direction` (`increase`/`decrease`).
- **Điểm Objective:** trung bình có trọng số của các KR: `Σ(progress_i × weight_i) / Σ(weight_i)` (trọng số mặc định bằng nhau).
- **Điểm chu kỳ của nhân viên:** trung bình có trọng số các Objective trong chu kỳ.
- **Xếp loại** (từ điểm chu kỳ, thang 0–100): ≥90 Xuất sắc · ≥75 Tốt · ≥60 Đạt · ≥40 Cần cải thiện · <40 Không đạt.
- Điểm hiển thị dạng % tiến độ trong suốt kỳ; điểm xếp loại chỉ chốt khi Manager đánh giá xong (`reviewed`).

### 4.2. Luồng nghiệp vụ

```
HR tạo cycle (draft) → HR kích hoạt (active)
  → Employee/Manager tạo Objective + KR (draft)
  → gửi duyệt (pending) → Manager/HR duyệt (active) hoặc trả lại (draft + lý do)
  → trong kỳ: Employee check-in cập nhật current_value cho KR (lưu lịch sử)
  → cuối kỳ: HR chuyển cycle sang in_review
  → Employee tự đánh giá (self review: điểm tự chấm + nhận xét)
  → Manager đánh giá (manager review: điểm chốt + nhận xét) → Objective/cycle của NV: completed
  → HR đóng cycle (closed) → kết quả hiện ở hồ sơ nhân viên & dashboard
```

### 4.3. Mô hình dữ liệu — `server/app/models/performance.py`

| Bảng | Trường chính |
|---|---|
| `performance_cycles` | `id`, `name` (vd "Q1/2027"), `start_date`, `end_date`, `status` (`draft/active/in_review/closed`) |
| `objectives` | `id`, `cycle_id` FK, `employee_id` FK (chủ mục tiêu; null nếu là mục tiêu phòng ban), `department_id` FK (nullable), `title`, `description`, `weight`, `status` (`draft/pending/active/completed/cancelled`), `created_by` FK employees |
| `key_results` | `id`, `objective_id` FK, `title`, `unit`, `target_value` (Numeric), `current_value` (Numeric, default 0), `weight`, `direction` (`increase/decrease`) |
| `goal_checkins` | `id`, `key_result_id` FK, `author_id` FK employees, `old_value`, `new_value`, `note`, `created_at` |
| `performance_reviews` | `id`, `cycle_id` FK, `employee_id` FK, `reviewer_id` FK employees, `review_type` (`self/manager`), `score` (Numeric 0–100, nullable), `comment`, `status` (`draft/submitted`) |

Quan hệ: `Employee` 1–N `objectives`, `performance_reviews`. Xóa mềm theo quy ước hiện tại (đổi `status`), không hard-delete dữ liệu đánh giá.

### 4.4. API — blueprint `performance`, tiền tố `/api/v1/performance`

| Method & path | Mô tả | Quyền |
|---|---|---|
| `GET /cycles` · `POST /cycles` | Danh sách / tạo chu kỳ | GET: đã đăng nhập · POST: HR, Admin |
| `PATCH /cycles/<id>/status` | Chuyển trạng thái chu kỳ | HR, Admin |
| `GET /objectives?cycle_id=&employee_id=&department_id=` | Danh sách mục tiêu (theo scope) | Theo scope |
| `POST /objectives` (kèm `key_results[]`) | Tạo mục tiêu + KR | Employee (của mình), Manager, HR |
| `PATCH /objectives/<id>` · `DELETE /objectives/<id>` | Sửa / hủy mục tiêu (chỉ khi `draft`) | Chủ mục tiêu, HR |
| `POST /objectives/<id>/submit` · `/approve` · `/return` | Gửi duyệt / duyệt / trả lại | Chủ mục tiêu / Manager, HR |
| `POST /key-results/<id>/check-in` | Cập nhật tiến độ + ghi chú | Chủ mục tiêu |
| `GET /key-results/<id>/check-ins` | Lịch sử check-in | Theo scope |
| `POST /reviews` · `GET /reviews?cycle_id=&employee_id=` | Gửi / xem tự đánh giá & đánh giá của Manager | Theo scope |
| `GET /dashboard?cycle_id=` | Tổng hợp: tiến độ TB, phân bổ xếp loại, top phòng ban | HR/Admin: toàn công ty · Manager: team |

### 4.5. Màn hình frontend — `client/src/features/performance/`

- `PerformanceDashboardPage`: thẻ tổng quan chu kỳ hiện tại, biểu đồ cột tiến độ theo phòng ban, biểu đồ phân bổ xếp loại, danh sách nhân viên sắp đến hạn đánh giá.
- `MyGoalsPage` (Employee/Manager): danh sách Objective dạng thẻ với vòng tiến độ %, nút check-in mở form cập nhật KR.
- `TeamGoalsPage` (Manager/HR): hàng chờ duyệt mục tiêu, bảng tiến độ team.
- `ReviewPage`: form tự đánh giá / đánh giá cấp dưới, hiển thị điểm hệ thống gợi ý cạnh điểm người đánh giá nhập.
- Điều hướng: thêm mục "Hiệu suất" vào sidebar (nhóm Quản trị nhân sự), route lazy-load như các feature hiện tại.

---

## 5. Module Onboarding

### 5.1. Luồng nghiệp vụ

```
Ứng viên recruitment đạt passed
  → HR bấm "Tạo hồ sơ nhân viên" (dùng lại luồng employees hiện tại)
  → hệ thống tự chọn template theo department + position của nhân viên mới
  → sinh OnboardingPlan + tasks, hạn từng task = start_date + offset_days của task mẫu
  → gửi notification cho: nhân viên mới, Manager, người phụ trách từng task
  → các bên cập nhật task: pending → in_progress → done (HR verify nếu task loại document)
  → task quá hạn (due_date < hôm nay, chưa done) → notification nhắc HR + người phụ trách (khi mở dashboard / chạy kiểm tra lúc đăng nhập — MVP không cần scheduler riêng)
  → mọi task done/verified → plan completed, % tiến độ = 100
```

### 5.2. Template mặc định (seed sẵn, HR sửa được)

| Giai đoạn | Đầu việc | Phụ trách | Hạn (theo ngày đi làm) |
|---|---|---|---|
| Trước ngày đầu | Tạo tài khoản hệ thống + email công ty | HR/IT | −1 ngày |
| Trước ngày đầu | Chuẩn bị máy tính & chỗ ngồi | IT | −1 ngày |
| Ngày đầu | Nộp CCCD, bằng cấp, ảnh thẻ | Nhân viên mới | Ngày 0 |
| Ngày đầu | Ký hợp đồng thử việc | HR xác nhận | Ngày 0 |
| Ngày đầu | Đọc quy chế nội bộ & hỏi chatbot KB | Nhân viên mới | Ngày 0 |
| Tuần 1 | Gặp Manager: nhận mục tiêu thử việc (liên kết module Performance) | Manager | +3 ngày |
| Tuần 1 | Buddy hướng dẫn công việc & team | Buddy (Manager chỉ định) | +5 ngày |
| Tuần 1 | Hoàn thành đào tạo hội nhập (quy trình, an toàn thông tin) | Nhân viên mới | +7 ngày |
| Cuối thử việc | Đánh giá kết thúc thử việc | Manager + HR | Theo hợp đồng thử việc |

### 5.3. Mô hình dữ liệu — `server/app/models/onboarding.py`

| Bảng | Trường chính |
|---|---|
| `onboarding_templates` | `id`, `name`, `department_id` FK (nullable = áp dụng chung), `position_id` FK (nullable), `is_active` |
| `onboarding_template_tasks` | `id`, `template_id` FK, `title`, `description`, `assignee_role` (`hr/manager/it/buddy/employee`), `due_offset_days` (int, có thể âm), `task_type` (`task/document/training/meeting`), `sort_order` |
| `onboarding_plans` | `id`, `employee_id` FK (unique — 1 NV 1 plan onboarding), `template_id` FK, `start_date`, `status` (`in_progress/completed/cancelled`) |
| `onboarding_tasks` | `id`, `plan_id` FK, `title`, `description`, `assignee_id` FK employees (nullable nếu giao theo role chưa rõ người), `assignee_role`, `due_date`, `task_type`, `status` (`pending/in_progress/done/verified/overdue/skipped`), `completed_at`, `completed_by`, `note` |

Tiến độ plan tính từ tasks: `done + verified` / tổng task (trừ `skipped`).

### 5.4. API — blueprint `onboarding`, tiền tố `/api/v1/onboarding`

| Method & path | Mô tả | Quyền |
|---|---|---|
| `GET /templates` · `POST /templates` · `PATCH /templates/<id>` | Quản lý template + task mẫu | HR, Admin |
| `GET /plans?status=&department_id=` | Danh sách kế hoạch (bảng theo dõi của HR) | HR, Admin, Manager (team) |
| `POST /plans` | Sinh plan thủ công cho 1 nhân viên từ template | HR |
| `GET /plans/<id>` | Chi tiết plan + tasks + % tiến độ | Theo scope |
| `GET /my-plan` | Plan của nhân viên đang đăng nhập | Employee |
| `GET /my-tasks` | Mọi task được giao cho tôi (kể cả vai trò buddy/IT) | Đã đăng nhập |
| `PATCH /tasks/<id>` | Cập nhật trạng thái / ghi chú / người phụ trách | Người được giao, HR |
| `POST /tasks/<id>/verify` | HR xác nhận task loại document | HR |

Sinh plan tự động: hook ở service tạo employee mới — nếu employee chưa có plan và có template khớp (ưu tiên template theo position > department > template chung) thì sinh plan trong cùng transaction.

### 5.5. Màn hình frontend — `client/src/features/onboarding/`

- `OnboardingBoardPage` (HR/Manager): bảng nhân viên mới với avatar, ngày bắt đầu, thanh tiến độ %, số việc quá hạn đỏ — một màn hình trả lời ngay "ai đang hội nhập tới đâu".
- `OnboardingPlanPage`: chi tiết theo timeline 3 giai đoạn (Trước ngày đầu / Ngày đầu / Tuần đầu), checklist tick trực tiếp, badge người phụ trách.
- `MyOnboardingPage` (nhân viên mới): checklist của riêng mình, hiện ở dashboard cá nhân khi plan chưa hoàn thành.
- `TemplateListPage` + editor (HR): CRUD template và task mẫu.
- Điều hướng: mục "Hội nhập" trong sidebar; widget tiến độ onboarding trên Dashboard chung.

---

## 6. Điểm tích hợp với hệ thống hiện tại

| Điểm chạm | Cách dùng lại |
|---|---|
| `employees` | Chủ thể của Objective, Review, OnboardingPlan; `manager_id` quyết định quan hệ duyệt/đánh giá |
| `departments` / `positions` | Mục tiêu phòng ban; chọn template onboarding |
| `recruitment` | Sự kiện `Candidate.status = passed` là điểm bắt đầu luồng chuyển thành nhân viên |
| `notifications` | Nhắc duyệt mục tiêu, nhắc check-in cuối kỳ, nhắc task onboarding sắp/quá hạn |
| `stats` | Bổ sung chỉ số: % onboarding đúng hạn, điểm hiệu suất TB theo chu kỳ |
| `kb` / chatbot | Task "đọc quy chế" liên kết thẳng tới chatbot KB hiện có |
| Auth guard | Role + data-scope như leave/attendance; không tạo cơ chế phân quyền mới |

## 7. Dữ liệu mẫu (seed) cho demo

- 1 chu kỳ đang `active` (quý hiện tại), mỗi nhân viên mẫu có 2 Objective × 2–3 KR, vài check-in ở các mức tiến độ khác nhau; 1 nhân viên mẫu đã có review hoàn chỉnh để dashboard có phân bổ xếp loại.
- 1 template chung + 1 template riêng cho phòng Kỹ thuật.
- 1 nhân viên mới vào làm trong tuần (từ một ứng viên `passed` mẫu) với plan đang ở ~40%, có 1 task quá hạn để demo cảnh báo.
- Tài khoản demo hiện tại dùng nguyên; nhân viên mới dùng thêm 1 tài khoản employee mẫu thứ hai.

## 8. Lộ trình triển khai (thứ tự làm)

1. **Nền dữ liệu:** models `performance.py`, `onboarding.py` + đăng ký blueprint trong app factory + migration/seed mở rộng.
2. **Backend Onboarding** (luồng ngắn, demo sớm được): templates, plans, tasks, hook sinh plan khi tạo employee, notifications quá hạn.
3. **Frontend Onboarding:** board, plan detail, my-plan, template editor.
4. **Backend Performance:** cycles, objectives/KR, check-in, reviews, dashboard API + công thức điểm (có unit test cho công thức).
5. **Frontend Performance:** dashboard, my goals, team goals/duyệt, review.
6. **Tích hợp & kiểm thử:** stats widgets, seed demo, smoke test end-to-end 2 luồng ở mục 9, quay lại video demo.

## 9. Tiêu chí nghiệm thu (demo được là đạt)

**Luồng Onboarding (≤ 2 phút demo):** HR chuyển 1 ứng viên `passed` thành nhân viên → plan tự sinh đúng template → nhân viên mới đăng nhập thấy checklist của mình → tick xong các việc → HR verify giấy tờ → tiến độ lên 100%, plan `completed`, dashboard HR cập nhật.

**Luồng KPI/OKR (≤ 2 phút demo):** Employee tạo Objective + 2 KR → Manager duyệt → Employee check-in KR lên 80% → điểm Objective tự tính đúng công thức → HR mở `in_review` → Employee tự đánh giá → Manager chấm điểm chốt → dashboard hiện đúng xếp loại của nhân viên đó.

**Kỹ thuật:** API trả lỗi 403 đúng scope (Employee không xem được mục tiêu/plan của người khác), build frontend thành công, không regression ở các module cũ (chạy lại smoke test hiện có).
