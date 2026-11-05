# Bản đồ API cho app mobile (Kotlin)

> Tái tạo từ code ngày 2026-11-05 (đợt kiểm kê docs, commit `5850581`). Nguồn: quét toàn bộ Retrofit annotations (`@GET`/`@POST`/`@PUT`/`@PATCH`/`@DELETE` trong `mobile/app/src/main/java/com/hrmai/app/feature/**/*Api.kt` — 130 annotations, 39 file) + đối chiếu từng endpoint với `server/app/blueprints/**/routes.py` (prefix trong từng `__init__.py` + decorator `@require_roles`/`@jwt_required`). **113 endpoint duy nhất** (method + path).
>
> File này là **nguồn sự thật duy nhất cho mobile API**. `docs/mobile-app.md` chỉ trỏ sang đây, không liệt kê endpoint riêng. Muốn thêm/sửa endpoint mobile: sửa `*Api.kt` rồi chạy lại script quét (xem cuối file) và đối chiếu bảng này — không sửa bảng bằng cảm tính.
>
> Mọi path dưới đây đã bao gồm tiền tố `/api/v1` — app cộng vào sau base URL (mặc định production `https://hrm-ai-api.onrender.com`, xem `BuildConfig.DEFAULT_BASE_URL`, đổi được trong màn đăng nhập; địa chỉ nhập vào được chuẩn hoá về dạng `<gốc>/api/v1/`).

## Quy ước chung
- Auth: header `Authorization: Bearer <access_token>`; khi gặp 401 thì interceptor gọi `POST /auth/refresh` một lần rồi thử lại (xem mục Auth). Envelope lỗi chuẩn của server: `{ error: { code, message, details } }`.
- Cột **Role (server)** ghi đúng decorator trên route server: `admin,hr,...` = `@require_roles(...)`; **JWT (quyền chi tiết ở service)** = route chỉ có `@jwt_required()`, quyền theo dữ liệu (IDOR/scope) nằm trong service layer — đọc code service trước khi giả định role nào cũng gọi được; **public** = không cần JWT.
- List có thể trả mảng thuần HOẶC `{ data, meta, ... }` — DTO phải chịu được cả hai dạng (bản web chuẩn hoá ở tầng services).

## Auth

| Method | Path | Role (server) | Tham số bắt buộc / ghi chú | Mobile gọi từ |
|---|---|---|---|---|
| POST | `/api/v1/auth/login` | public (không cần JWT) | body `{email, password}` → `{access_token, refresh_token, user}` | auth.login |
| POST | `/api/v1/auth/refresh` | public (không cần JWT) | body `{refresh_token}` — **không nằm trong interface Retrofit nào**: interceptor gọi qua `RefreshApi` riêng trong `core/datastore/SessionStore.kt` | SessionStore.refreshBlocking |
| POST | `/api/v1/auth/logout` | JWT (quyền chi tiết ở service) | **Mobile KHÔNG gọi endpoint này** — đăng xuất trên mobile chỉ xoá phiên ở máy (`ProfileViewModel.logout()` → `sessionStore.clear()`), refresh token vẫn sống đủ 7 ngày (xem `docs/security.md` §1) | — (không gọi) |

## Trang chủ (Home)

| Method | Path | Role (server) | Tham số bắt buộc / ghi chú | Mobile gọi từ |
|---|---|---|---|---|
| GET | `/api/v1/feed/activity` | admin,hr,manager,employee | limit | home.activity |
| GET | `/api/v1/gamification/my-badges` | admin,hr,manager,employee | — | home.myBadges, journey.getMyBadges, kudos.getMyBadges |
| GET | `/api/v1/gamification/my-points` | admin,hr,manager,employee | — | home.myPoints, journey.getMyPoints, kudos.getMyPoints, rewards.getMyPoints |
| GET | `/api/v1/leave/balance/me` | JWT (quyền chi tiết ở service) | year (tuỳ chọn) | home.myLeaveBalances, leave.getMyBalances |
| GET | `/api/v1/notifications` | JWT (quyền chi tiết ở service) | limit — dùng để đếm chưa đọc (fallback, xem mục Endpoint chết) | home.notificationsCountFallback, notifications.getNotifications |
| GET | `/api/v1/notifications/unread-count` | ☠️ KHÔNG TỒN TẠI | — | home.unreadCount |

## Chấm công

| Method | Path | Role (server) | Tham số bắt buộc / ghi chú | Mobile gọi từ |
|---|---|---|---|---|
| POST | `/api/v1/attendance/check-in` | JWT (quyền chi tiết ở service) | — | attendance.checkIn |
| POST | `/api/v1/attendance/check-out` | JWT (quyền chi tiết ở service) | — | attendance.checkOut |
| GET | `/api/v1/attendance/monthly` | hr,admin,manager,employee | month=YYYY-MM, **mine=1 (bắt buộc)** — không có `mine=1` server không trả danh sách phẳng của chính mình | attendance.getMonthly |
| GET | `/api/v1/attendance/today` | JWT (quyền chi tiết ở service) | — | attendance.getToday, home.todayAttendance |

## Nghỉ phép

| Method | Path | Role (server) | Tham số bắt buộc / ghi chú | Mobile gọi từ |
|---|---|---|---|---|
| GET | `/api/v1/leave/calendar` | JWT (quyền chi tiết ở service) | month=YYYY-MM | teamcalendar.getCalendar |
| GET | `/api/v1/leave/requests` | JWT (quyền chi tiết ở service) | **scope=mine|team** (bắt buộc về mặt ngữ nghĩa; `scope=all` **không hợp lệ**), status, page, limit | leave.getRequests |
| POST | `/api/v1/leave/requests` | JWT (quyền chi tiết ở service) | body (xem DTO trong `*Api.kt`) | leave.createRequest |
| POST | `/api/v1/leave/requests/{id}/cancel` | JWT (quyền chi tiết ở service) | — | leave.cancelRequest |
| POST | `/api/v1/leave/requests/{id}/hr-decision` | hr,admin | body `{decision: approved|rejected, note}` — cấp 2, chỉ duyệt đơn đã `manager_approved` | leave.hrDecision |
| POST | `/api/v1/leave/requests/{id}/manager-decision` | manager,admin | body `{decision: approved|rejected, note}` — cấp 1 | leave.managerDecision |
| GET | `/api/v1/leave/types` | JWT (quyền chi tiết ở service) | — | leave.getTypes |

## Lương

| Method | Path | Role (server) | Tham số bắt buộc / ghi chú | Mobile gọi từ |
|---|---|---|---|---|
| GET | `/api/v1/payroll/my-payslip` | JWT (quyền chi tiết ở service) | period_id (tuỳ chọn) | payroll.myPayslip |
| GET | `/api/v1/payroll/periods` | admin,hr | page, limit — **chỉ admin/hr** | payroll.periods, payrolladmin.periods |
| POST | `/api/v1/payroll/periods/{id}/calculate` | admin,hr | — | payrolladmin.calculate |
| GET | `/api/v1/payroll/periods/{id}/items` | admin,hr | limit, page | payrolladmin.periodItems |
| POST | `/api/v1/payroll/periods/{id}/lock` | admin,hr | — | payrolladmin.lock |

## Bảng tin (Feed)

| Method | Path | Role (server) | Tham số bắt buộc / ghi chú | Mobile gọi từ |
|---|---|---|---|---|
| DELETE | `/api/v1/feed/comments/{id}` | admin,hr,manager,employee | — | feed.deleteComment |
| GET | `/api/v1/feed/posts` | admin,hr,manager,employee | — | feed.getPosts |
| POST | `/api/v1/feed/posts` | admin,hr,manager,employee | body (xem DTO trong `*Api.kt`) | feed.createPost |
| DELETE | `/api/v1/feed/posts/{id}` | admin,hr,manager,employee | — | feed.deletePost |
| POST | `/api/v1/feed/posts/{id}/like` | admin,hr,manager,employee | — | feed.toggleLike |
| GET | `/api/v1/feed/posts/{postId}/comments` | admin,hr,manager,employee | — | feed.getComments |
| POST | `/api/v1/feed/posts/{postId}/comments` | admin,hr,manager,employee | body (xem DTO trong `*Api.kt`) | feed.createComment |

## Vinh danh & điểm thưởng

| Method | Path | Role (server) | Tham số bắt buộc / ghi chú | Mobile gọi từ |
|---|---|---|---|---|
| GET | `/api/v1/attendance/my-year` | JWT (quyền chi tiết ở service) | year (tuỳ chọn) | journey.getMyYear |
| GET | `/api/v1/engagement/kudos` | admin,hr,manager,employee | — | kudos.getKudos |
| POST | `/api/v1/engagement/kudos` | admin,hr,manager,employee | body (xem DTO trong `*Api.kt`) | kudos.createKudo |
| GET | `/api/v1/engagement/kudos/leaderboard` | admin,hr,manager,employee | — | kudos.getKudosLeaderboard |
| GET | `/api/v1/engagement/milestones` | admin,hr,manager,employee | — | kudos.getMilestones |
| GET | `/api/v1/gamification/leaderboard` | admin,hr,manager,employee | limit | journey.getPointsLeaderboard, kudos.getPointsLeaderboard |
| GET | `/api/v1/gamification/redemptions` | admin,hr,manager,employee | limit, page, scope | rewards.getMyRedemptions |
| POST | `/api/v1/gamification/redemptions` | admin,hr,manager,employee | body (xem DTO trong `*Api.kt`) | rewards.createRedemption |
| GET | `/api/v1/gamification/rewards` | admin,hr,manager,employee | — | rewards.getRewards |

## Thông báo

| Method | Path | Role (server) | Tham số bắt buộc / ghi chú | Mobile gọi từ |
|---|---|---|---|---|
| GET | `/api/v1/announcements` | admin,hr,manager,employee | limit | announcements.getAnnouncements, home.announcements |
| POST | `/api/v1/notifications/read-all` | JWT (quyền chi tiết ở service) | — | notifications.markAllRead |
| PATCH | `/api/v1/notifications/{id}/read` | JWT (quyền chi tiết ở service) | — | notifications.markRead |

## Chatbot HR

| Method | Path | Role (server) | Tham số bắt buộc / ghi chú | Mobile gọi từ |
|---|---|---|---|---|
| POST | `/api/v1/chat/actions/execute` | JWT (quyền chi tiết ở service) | body — **chỉ gọi sau khi user bấm xác nhận** trên thẻ hành động | chatbot.executeAction |
| POST | `/api/v1/chat/ask` | JWT (quyền chi tiết ở service) | body — trả `mode` (`rag`|`live_data`|`action`) + `retrieval_mode` | chatbot.ask |
| GET | `/api/v1/chat/history` | JWT (quyền chi tiết ở service) | limit, page | chatbot.history |

## Hồ sơ & nhân sự

| Method | Path | Role (server) | Tham số bắt buộc / ghi chú | Mobile gọi từ |
|---|---|---|---|---|
| GET | `/api/v1/employees/{id}` | admin,hr,manager,employee | — | employees.getEmployee, profile.employee |
| GET | `/api/v1/org/departments` | ☠️ KHÔNG TỒN TẠI | limit, page, sortBy, sortOrder | departments.getDepartments |
| GET | `/api/v1/skills/employees/{id}` | admin,hr,manager,employee | — | profile.employeeSkills, skills.getEmployeeSkills |

## Tuyển dụng & AI

| Method | Path | Role (server) | Tham số bắt buộc / ghi chú | Mobile gọi từ |
|---|---|---|---|---|
| GET | `/api/v1/candidates` | admin,hr | job_id, limit, page | recruitment.listCandidates |
| PATCH | `/api/v1/candidates/{id}/status` | admin,hr | body (xem DTO trong `*Api.kt`) | recruitment.updateCandidateStatus |
| POST | `/api/v1/interviews/start` | public (không cần JWT) | body — guest qua `access_token` + header `X-Session-Token`, token hết hạn 48h | mockinterview.start |
| POST | `/api/v1/interviews/{id}/answer` | public (không cần JWT) | body (xem DTO trong `*Api.kt`) | mockinterview.answer |
| POST | `/api/v1/interviews/{id}/finish` | public (không cần JWT) | — | mockinterview.finish |
| POST | `/api/v1/jd/generate` | admin,hr | body (xem DTO trong `*Api.kt`) | jd.generate |
| GET | `/api/v1/jobs` | JWT (quyền chi tiết ở service) | limit, page, status | jobs.listOpenJobs, recruitment.listJobs |
| GET | `/api/v1/jobs/{id}` | public (không cần JWT) | — | jobs.getJob, recruitment.getJob |
| GET | `/api/v1/jobs/{id}/interview-kit` | admin,hr | — | recruitment.getKit |
| PUT | `/api/v1/jobs/{id}/interview-kit` | admin,hr | body (xem DTO trong `*Api.kt`) | recruitment.updateKit |
| POST | `/api/v1/jobs/{id}/interview-kit/generate` | admin,hr | — | recruitment.generateKit |
| POST | `/api/v1/public/cv-check` | public (không cần JWT) | body `{cv_text ≤ 12.000 ký tự, job_id}` — rate limit 10/phút + 30/giờ | cvcheck.checkCv |

## QR+GPS check-in

| Method | Path | Role (server) | Tham số bắt buộc / ghi chú | Mobile gọi từ |
|---|---|---|---|---|
| POST | `/api/v1/briefing/generate` | admin,hr | body (xem DTO trong `*Api.kt`) | briefing.generate |
| GET | `/api/v1/briefing/history` | admin,hr | limit, period | briefing.getHistory |
| GET | `/api/v1/briefing/latest` | admin,hr | period | briefing.getLatest |
| GET | `/api/v1/checkin/config` | hr,admin | — | checkinadmin.getConfig |
| PUT | `/api/v1/checkin/config` | hr,admin | body (xem DTO trong `*Api.kt`) | checkinadmin.updateConfig |
| GET | `/api/v1/checkin/logs` | hr,admin | date | checkinadmin.getLogs |
| POST | `/api/v1/checkin/scan` | JWT (quyền chi tiết ở service) | body `{date, token, lat, lon}` — **lat/lon bắt buộc với luồng QR**, bỏ trống với mã 6 số | checkin.scan |
| GET | `/api/v1/checkin/today-qr` | hr,admin | — | checkinadmin.getTodayQr |

## Ca làm & giải trình

| Method | Path | Role (server) | Tham số bắt buộc / ghi chú | Mobile gọi từ |
|---|---|---|---|---|
| GET | `/api/v1/shifts/corrections` | admin,hr,manager,employee | limit, page, scope, status | shifts.getCorrections |
| POST | `/api/v1/shifts/corrections` | admin,hr,manager,employee | body (xem DTO trong `*Api.kt`) | shifts.createCorrection |
| POST | `/api/v1/shifts/corrections/{id}/hr-decision` | hr,admin | body (xem DTO trong `*Api.kt`) | shifts.correctionHrDecision |
| POST | `/api/v1/shifts/corrections/{id}/manager-decision` | manager,admin | body (xem DTO trong `*Api.kt`) | shifts.correctionManagerDecision |
| GET | `/api/v1/shifts/definitions` | admin,hr,manager,employee | — | shifts.getDefinitions |
| GET | `/api/v1/shifts/my-schedule` | admin,hr,manager,employee | month | shifts.getMySchedule |
| GET | `/api/v1/shifts/overtime` | admin,hr,manager,employee | limit, page, scope, status | shifts.getOvertime |
| POST | `/api/v1/shifts/overtime` | admin,hr,manager,employee | body (xem DTO trong `*Api.kt`) | shifts.createOvertime |
| POST | `/api/v1/shifts/overtime/{id}/hr-decision` | hr,admin | body (xem DTO trong `*Api.kt`) | shifts.overtimeHrDecision |
| POST | `/api/v1/shifts/overtime/{id}/manager-decision` | manager,admin | body (xem DTO trong `*Api.kt`) | shifts.overtimeManagerDecision |

## Kỹ năng & đào tạo

| Method | Path | Role (server) | Tham số bắt buộc / ghi chú | Mobile gọi từ |
|---|---|---|---|---|
| GET | `/api/v1/skills` | admin,hr,manager,employee | — | skills.listSkills |
| POST | `/api/v1/skills/employees/{id}/suggest` | admin,hr,manager,employee | — | skills.suggestCourses |
| GET | `/api/v1/skills/matrix` | admin,hr,manager,employee | — | skills.getMatrix |
| GET | `/api/v1/training/courses` | admin,hr,manager,employee | limit, page | training.getCourses |
| POST | `/api/v1/training/courses/{id}/enroll` | admin,hr | body (xem DTO trong `*Api.kt`) | training.enroll |
| PATCH | `/api/v1/training/enrollments/{id}` | admin,hr,manager,employee | body (xem DTO trong `*Api.kt`) | training.updateEnrollment |
| GET | `/api/v1/training/my` | admin,hr,manager,employee | — | training.getMyCourses |

## Hội nhập & nghỉ việc

| Method | Path | Role (server) | Tham số bắt buộc / ghi chú | Mobile gọi từ |
|---|---|---|---|---|
| GET | `/api/v1/offboarding` | JWT (quyền chi tiết ở service) | status | offboarding.getProcesses |
| PATCH | `/api/v1/offboarding/tasks/{id}` | JWT (quyền chi tiết ở service) | body (xem DTO trong `*Api.kt`) | offboarding.updateTask |
| GET | `/api/v1/offboarding/{id}` | JWT (quyền chi tiết ở service) | — | offboarding.getProcessDetail |
| GET | `/api/v1/onboarding/my-plan` | JWT (quyền chi tiết ở service) | — | onboarding.getMyPlan |
| GET | `/api/v1/onboarding/my-tasks` | JWT (quyền chi tiết ở service) | — | onboarding.getMyTasks |
| GET | `/api/v1/onboarding/plans` | JWT (quyền chi tiết ở service) | — | onboarding.getPlans |
| GET | `/api/v1/onboarding/plans/{id}` | JWT (quyền chi tiết ở service) | — | onboarding.getPlanDetail |
| PATCH | `/api/v1/onboarding/tasks/{id}` | JWT (quyền chi tiết ở service) | body (xem DTO trong `*Api.kt`) | onboarding.updateTask |

## Tài sản & tài liệu

| Method | Path | Role (server) | Tham số bắt buộc / ghi chú | Mobile gọi từ |
|---|---|---|---|---|
| GET | `/api/v1/assets` | admin,hr,manager | limit, page, status | assets.getAssets |
| POST | `/api/v1/assets/assignments/{id}/return` | ☠️ KHÔNG TỒN TẠI | body (xem DTO trong `*Api.kt`) | assets.returnAssignment |
| GET | `/api/v1/assets/my` | admin,hr,manager,employee | — | assets.getMyAssets |
| POST | `/api/v1/assets/{id}/assign` | admin,hr | body (xem DTO trong `*Api.kt`) | assets.assignAsset |
| GET | `/api/v1/documents` | admin,hr,manager,employee | employee_id, limit, page | documents.getDocuments |
| GET | `/api/v1/documents/certificates` | admin,hr,manager,employee | limit, page, scope, status | documents.getCertificates |
| POST | `/api/v1/documents/certificates` | admin,hr,manager,employee | body (xem DTO trong `*Api.kt`) | documents.createCertificate |
| POST | `/api/v1/documents/certificates/{id}/decision` | admin,hr | body (xem DTO trong `*Api.kt`) | documents.decideCertificate |
| GET | `/api/v1/employees` | admin,hr,manager,employee | department_id, limit, page, search, sortBy, sortOrder, status | assets.getEmployees, employees.getEmployees, kudos.getEmployees |

## Hiệu suất & attrition

| Method | Path | Role (server) | Tham số bắt buộc / ghi chú | Mobile gọi từ |
|---|---|---|---|---|
| GET | `/api/v1/people-ai/attrition-risk` | admin,hr,manager | level | attrition.getAttritionRisk |
| GET | `/api/v1/performance/cycles` | JWT (quyền chi tiết ở service) | — | performance.getCycles |
| POST | `/api/v1/performance/key-results/{id}/check-in` | JWT (quyền chi tiết ở service) | body (xem DTO trong `*Api.kt`) | performance.checkIn |
| GET | `/api/v1/performance/objectives` | JWT (quyền chi tiết ở service) | cycle_id, employee_id | performance.getObjectives |
| GET | `/api/v1/performance/reviews` | JWT (quyền chi tiết ở service) | cycle_id, employee_id | performance.getReviews |

## Báo cáo & quản trị

| Method | Path | Role (server) | Tham số bắt buộc / ghi chú | Mobile gọi từ |
|---|---|---|---|---|
| GET | `/api/v1/stats/reports/summary` | admin,hr,manager | month, year | reports.getSummary |
| GET | `/api/v1/users` | admin | limit, page, search | admin.getUsers |
| PATCH | `/api/v1/users/{id}` | admin | body (xem DTO trong `*Api.kt`) | admin.updateUser |

## Khác

| Method | Path | Role (server) | Tham số bắt buộc / ghi chú | Mobile gọi từ |
|---|---|---|---|---|
| GET | `/api/v1/engagement/surveys` | admin,hr,manager,employee | — | surveys.listSurveys |
| POST | `/api/v1/engagement/surveys/{id}/responses` | admin,hr,manager,employee | body (xem DTO trong `*Api.kt`) | surveys.respond |
| GET | `/api/v1/engagement/surveys/{id}/results` | admin,hr | — | surveys.results |

## Endpoint chết — KHÔNG gọi nữa (cần sửa code)

Ba endpoint dưới đây mobile đang gọi nhưng **không tồn tại trên server** (đối chiếu `server/app/blueprints/**/routes.py` — không có route nào khớp, kể cả alias). Bảng trên vẫn liệt kê chúng để dễ tìm, kèm dấu ☠️.

| Mobile đang gọi | Server thật | Hậu quả hiện tại | Cách sửa |
|---|---|---|---|
| `GET /notifications/unread-count` (`HomeApi.kt:157`) | Không có. Server chỉ có `GET /notifications` (trả `unreadCount` trong body), `PATCH /notifications/{id}/read`, `POST /notifications/read-all` | Mobile có fallback đúng sang `GET /notifications` lấy `unreadCount`; **web không có fallback nên chuông web luôn hiện 0** (`client/src/api/index.js:44`, `AppLayout.jsx:722-732` catch rỗng) | Web/mobile dùng `GET /notifications?limit=1` lấy `unreadCount`, hoặc thêm endpoint thật trên server — quyết định của dev (xem `docs/security.md` §11) |
| `GET /org/departments` (`DepartmentsApi.kt`) | `GET /departments` (blueprint `departments`, prefix `/api/v1`, role: mọi role đã đăng nhập) | Màn Phòng ban trên mobile gọi nhầm path → **404** (không có tiền tố `/org/` nào trên server) | Đổi annotation thành `@GET("departments")` |
| `POST /assets/assignments/{id}/return` (`AssetsApi.kt`) | `POST /assignments/{id}/return` (blueprint `assets`, prefix `/api/v1`, role: `admin,hr`) | Trả tài sản trên mobile gọi nhầm path → **404** (thừa đoạn `assets/`) | Đổi annotation thành `@POST("assignments/{id}/return")` |

## Những điểm hay gọi sai (không phải endpoint chết)

- `GET /leave/requests` dùng `scope=mine|team` — `scope=all` **không hợp lệ** (server chỉ hiểu `mine | team`; `scope` khác rơi về mặc định theo role). Tài khoản `admin` thuần hệ thống (không hồ sơ) vẫn xem được toàn công ty khi không kèm `scope=mine`.
- `GET /attendance/monthly` bắt buộc `mine=1` để lấy lịch của chính mình (kèm summary); không có `/attendance/my`.
- `GET /payroll/periods` chỉ `admin`/`hr` — mobile gọi chung cho cả 2 màn (`payroll.periods`, `payrolladmin.periods`): tài khoản employee/manager gọi sẽ nhận 403.
- `GET /jobs/{id}` là public (trang việc làm công khai), nhưng `GET /jobs` (danh sách) yêu cầu JWT.
- `OrgChartApi` không có endpoint riêng — kế thừa `EmployeesApi` + `DepartmentsApi`, dùng `GET /employees` và `GET /departments` để dựng cây ở client.

## Cách tái tạo bảng này

```bash
# 1. Quét Retrofit annotations + đối chiếu routes.py (script tạm, đã dùng cho bản này):
python3 /tmp/mobile_api_scan.py   # in bảng method/path/role/tham số/caller
# 2. Nhóm theo feature + ghi chú tham số bắt buộc:
python3 /tmp/gen_api_map.py       # in phần thân bảng theo mục
```

Hai script trên quét lại từ code nên bảng mới luôn khớp code tại thời điểm chạy; chỉ phần "Endpoint chết" và "Những điểm hay gọi sai" là viết tay từ kết quả đối chiếu. Sau khi sửa code (vd đổi annotation `org/departments` → `departments`), chạy lại script và cập nhật bảng này trong cùng commit.
