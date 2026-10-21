# Hợp đồng triển khai — Đợt mở rộng tính năng v2 (sau KPI/OKR + Onboarding)

> Bối cảnh: người dùng yêu cầu thêm nhiều chức năng chi tiết và "hay ho" hơn ("vậy chưa đủ lắm"). Tài liệu này là HỢP ĐỒNG tên gọi/đường dẫn bắt buộc để các đội làm song song không giẫm file nhau. KPI/OKR và Onboarding làm đúng `docs/kpi-okr-onboarding.md`; giao diện mọi trang mới theo `docs/frontend-design-v4.md` (phẳng, template shadcn-admin, cấm gradient/hero trang trí).
> Nguyên tắc: giữ nguyên mọi module/API/route cũ; phân quyền dùng guard + data-scope hiện tại (Employee chỉ thấy của mình, Manager thấy team, HR/Admin toàn cục); thông báo qua module `notifications` (bảng Notification trong `app/models/misc.py`) khi có sự kiện đáng thông báo.

## 1. Các module mới

### A. Performance — KPI/OKR + đánh giá (theo docs/kpi-okr-onboarding.md mục 4)
- BE: `server/app/models/performance.py` — `PerformanceCycle, Objective, KeyResult, GoalCheckin, PerformanceReview`. Blueprint `server/app/blueprints/performance/` (routes/services/schemas như pattern hiện tại), prefix `/api/v1/performance`.
- Thêm hay ho: `GET /performance/suggestions` trả về mục tiêu + KR mẫu theo chức vụ/phòng ban từ catalog tĩnh trong service (nhãn "Gợi ý mẫu", không cần AI key) để người dùng bấm áp dụng khi tạo mục tiêu.
- FE: `client/src/features/performance/` — `services.js`, `pages/PerformancePage.jsx` (tab: Mục tiêu của tôi / Team (duyệt + tiến độ) / Đánh giá; dashboard chu kỳ bằng StatCard + ProgressRing phẳng).

### B. Onboarding — hội nhập nhân viên mới (theo docs/kpi-okr-onboarding.md mục 5)
- BE: `server/app/models/onboarding.py` — `OnboardingTemplate, OnboardingTemplateTask, OnboardingPlan, OnboardingTask`. Blueprint `server/app/blueprints/onboarding/`, prefix `/api/v1/onboarding`. Hook sinh plan khi tạo employee mới nằm trong service của onboarding và được gọi từ luồng tạo employee — CHỈ đội Onboarding được sửa `server/app/blueprints/employees/services.py` cho điểm chạm này, sửa tối thiểu.
- FE: `client/src/features/onboarding/` — `services.js`, `pages/OnboardingPage.jsx` (HR/Manager: board danh sách plan + chi tiết checklist; Employee: "Hội nhập của tôi").

### C. Assets — quản lý tài sản cấp phát
- BE: `server/app/models/assets.py` — `Asset` (code, name, category, serial, status: available/assigned/maintenance/retired, purchase_date, notes), `AssetAssignment` (asset_id, employee_id, assigned_at, returned_at, status: active/returned, note). Blueprint `server/app/blueprints/assets/`, prefix `/api/v1/assets`: CRUD asset (HR/Admin), cấp phát (`POST /assets/<id>/assign`), thu hồi (`POST /assignments/<id>/return`), `GET /assets/my` cho nhân viên xem tài sản của mình, lịch sử theo asset. Cấp phát/thu hồi tạo Notification cho nhân viên.
- FE: `client/src/features/assets/` — `services.js`, `pages/AssetsPage.jsx` (bảng tài sản + Badge trạng thái, modal cấp phát/thu hồi, tab "Tài sản của tôi" cho employee).

### D. Training — đào tạo nội bộ
- BE: `server/app/models/training.py` — `Course` (title, description, category, duration_hours, is_mandatory, is_active), `CourseEnrollment` (course_id, employee_id, status: assigned/in_progress/completed, progress 0-100, enrolled_by, completed_at). Blueprint `server/app/blueprints/training/`, prefix `/api/v1/training`: CRUD khoá học (HR/Admin), gán học viên, `GET /training/my`, học viên cập nhật tiến độ/hoàn thành (`PATCH /training/enrollments/<id>`).
- FE: `client/src/features/training/` — `services.js`, `pages/TrainingPage.jsx` (HR: danh sách khoá + gán; Employee: khoá của tôi, thanh tiến độ phẳng, nút cập nhật tiến độ/hoàn thành).

### E. Announcements + Trung tâm thông báo + widget Dashboard
- BE: `server/app/models/announcements.py` — `Announcement` (title, content, category: general/policy/event, is_pinned, author_id, created via TimestampMixin). Blueprint `server/app/blueprints/announcements/`, prefix `/api/v1/announcements`: list (pinned trước), tạo/sửa/xoá (HR/Admin), tạo mới thì Notification cho toàn bộ nhân viên đang làm việc.
- FE: `client/src/features/announcements/` — `services.js`, `pages/AnnouncementsPage.jsx` (danh sách dạng dòng thời gian phẳng, ghim lên đầu, HR có form đăng).
- FE: `client/src/features/notifications/pages/NotificationsPage.jsx` — dùng `notificationsApi` sẵn có trong `src/api/index.js` (list, mark read, mark all read); trang danh sách đầy đủ + nút "Đánh dấu đã đọc tất cả".
- FE Dashboard (CHỈ đội E sửa `client/src/features/dashboard/pages/DashboardPage.jsx`): thêm 2 thẻ phẳng theo v4 — "Thông báo mới nhất" (3 announcement mới, bấm sang /announcements) và "Tháng này" (sinh nhật + nhân viên mới, lấy từ API employees hiện có). Không đổi các khối hiện tại.

### F. Org Chart + Lịch team + Báo cáo (FE là chính)
- FE Org Chart: `client/src/features/orgchart/pages/OrgChartPage.jsx` — cây tổ chức từ dữ liệu employees hiện có (manager_id + departments): hiển thị theo phòng ban → trưởng phòng → nhân viên, thẻ phẳng có avatar/tên/chức vụ, bấm vào thẻ sang `/employees/:id`. Vẽ bằng HTML/CSS thuần (không thêm thư viện).
- FE Lịch team: `client/src/features/calendar/pages/TeamCalendarPage.jsx` — lưới tháng: ngày có người nghỉ (leave đã duyệt, từ API leave hiện có theo scope), sinh nhật nhân viên, ngày nhân viên mới bắt đầu; chú thích màu theo Badge; chuyển tháng trước/sau.
- BE Reports (CHỈ đội F sửa `server/app/blueprints/stats/routes.py`, thêm không sửa cũ): `GET /api/v1/stats/reports/summary?month=&year=` (tổng hợp: headcount theo phòng, chấm công tháng, nghỉ phép theo loại, chi phí lương theo phòng) + `GET /api/v1/stats/reports/export?type=attendance|payroll|leave&month=&year=` trả file CSV (Content-Disposition attachment).
- FE Reports: `client/src/features/reports/` — `services.js`, `pages/ReportsPage.jsx` (biểu đồ Recharts phẳng + nút tải CSV).

## 2. File dùng chung — CHỈ đội Foundation được sửa

- BE: `server/app/__init__.py` (thêm `"performance", "onboarding", "assets", "training", "announcements"` vào `_MODULE_BLUEPRINTS`), `server/app/models/__init__.py` (import + `__all__` cho 11 class mới ở mục 1), `server/seed.py` (dữ liệu mẫu: 1 chu kỳ + objectives/KR/check-in cho nhân viên mẫu; template onboarding chung + của phòng Kỹ thuật + 1 plan ~40% có task quá hạn; 6 tài sản — 3 đã cấp; 3 khoá học + vài enrollment; 3 thông báo — 1 ghim. Viết theo đúng pattern/idempotent của seed hiện tại, đọc kỹ file trước khi sửa).
- FE: `client/src/app/router.jsx` (lazy routes mới: `performance`, `onboarding`, `assets`, `training`, `announcements`, `notifications`, `org-chart`, `team-calendar`, `reports` — theo pattern guardedPage/lazyPage hiện tại, trang nghiệp vụ mở cho mọi user đã đăng nhập), `client/src/layouts/AppLayout.jsx` (thêm mục menu + nhóm: giữ nhóm hiện tại, thêm "Hiệu suất" + "Hội nhập" vào nhóm Quản lý; nhóm mới "Tổ chức": Sơ đồ tổ chức, Lịch team; nhóm mới "Vận hành": Tài sản, Đào tạo; nhóm mới "Truyền thông": Thông báo. Chuông thông báo ở topbar bấm sang `/notifications`. Dùng icon từ `components/icons.jsx`/lucide sẵn có, giữ phong cách v4 và mọi logic hiện tại).

## 3. Quy ước chung cho mọi đội

- Backend theo đúng pattern blueprint hiện tại (routes/services/schemas, `bp`, lỗi qua cơ chế hiện tại, JWT guard + scope). Model dùng `TimestampMixin` từ `app.models.users`, tiền/số theo quy ước hiện tại. Sau khi viết: `python -m py_compile` mọi file .py đã sửa.
- Frontend: mỗi feature có `services.js` dùng `axiosClient` như các feature hiện tại; trang dùng UI kit + PageHeader v4; sau khi viết: kiểm tra cú pháp bằng `client/node_modules/.bin/esbuild`.
- KHÔNG đội nào (trừ Foundation) sửa file dùng chung ở mục 2; KHÔNG sửa module cũ ngoài điểm chạm đã ghi rõ (employees/services.py cho Onboarding, stats/routes.py cho Reports, DashboardPage cho đội E).
- Không git, không push, không đổi package.json (không thêm thư viện mới).
- Báo cáo cuối: file đã tạo/sửa, endpoint/trang đã làm, kết quả kiểm tra cú pháp, điểm chưa chắc chắn để đội tích hợp rà lại.
