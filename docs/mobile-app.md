# Ứng dụng mobile HRM AI — Android (Kotlin)

> Cập nhật 2026-11-05 (đợt kiểm kê docs, commit `5850581`): viết lại gần như toàn bộ. Bản cũ đóng băng ở 2026-10-22 (ngày build APK đầu tiên) và đã sai ở mức kiến trúc — cấu trúc `data/`/`domain/` không tồn tại, bảng route chỉ có 10/41, thiếu toàn bộ v5/v6 và role-UI. Mọi khẳng định dưới đây đối chiếu với code mobile + server tại commit trên.
>
> API chi tiết xem [mobile-api-map.md](./mobile-api-map.md) — đó là nguồn sự thật duy nhất về endpoint mobile (tái tạo từ Retrofit annotations + đối chiếu `server/app/blueprints/**/routes.py`).

## 1. Nguyên tắc nền tảng
- **Một backend duy nhất**: app gọi đúng API `/api/v1` của server Flask hiện tại (production: `https://hrm-ai-api.onrender.com`). Không có dữ liệu riêng — chấm công/duyệt phép/thao tác trên điện thoại hiển thị ngay trên web và ngược lại.
- **Cùng tài khoản**: đăng nhập bằng chính các tài khoản của hệ thống (JWT access 30 phút + refresh 7 ngày như web). Phân quyền theo role của server; app chỉ hiển thị những gì role được phép (xem mục 5).
- **APK cài trực tiếp**: bản build là APK debug, cài qua file APK trên điện thoại Android (không cần CH Play cho bản đồ án). Địa chỉ server mặc định trỏ production (`BuildConfig.DEFAULT_BASE_URL` = `https://hrm-ai-api.onrender.com/api/v1/`); có ô đổi địa chỉ server trong màn đăng nhập (để test với server chạy ở máy nhà khi cần). Địa chỉ nhập vào được chuẩn hoá về dạng `<gốc>/api/v1/` (`SessionStore.kt`).

## 2. Công nghệ
- Kotlin 2.0, Jetpack Compose + Material 3. `minSdk 26`, `targetSdk 34`, `versionName 1.0` (`versionCode 1`).
- Kiến trúc **MVVM, một lớp feature**: không có `data/` (repository) hay `domain/` (use case) — mỗi tính năng là một package `feature/<tên>/` chứa `*Api` (Retrofit interface) + `*Screen` + `*ViewModel` (+ DTO trong cùng package). Xem mục 3.
- Điều hướng: Navigation Compose; thanh dưới 5 mục (Trang chủ, Chấm công, Chatbot ở giữa, Bảng tin, Thêm) + các màn con qua `navigation/HrmNavHost.kt` (41 route, xem mục 4).
- DI thủ công bằng `AppContainer` (`core/di`) — khai báo tập trung, ViewModel qua factory.
- Mạng: Retrofit + OkHttp (logging chỉ ở debug), Moshi; interceptor gắn JWT + tự refresh khi 401 (một lần, có khoá đồng bộ, qua `RefreshApi` riêng trong `SessionStore`); lỗi chuẩn hoá về một kiểu `ApiError` hiển thị tiếng Việt.
- Lưu trữ: DataStore (`core/datastore/SessionStore.kt`) — token + địa chỉ server + thông tin user tóm tắt. **Token lưu không mã hoá** (residual đã chấp nhận — xem `docs/security.md` §9). Trạng thái màn hình: StateFlow; danh sách có pull-to-refresh.
- Hiệu ứng/chuyển động: chuyển cảnh trượt+mờ giữa các màn, nút bấm có ripple + scale, skeleton nhấp nháy khi tải, vòng tròn thành công nảy (spring) khi chấm công, haptic nhẹ khi chấm công xong, số liệu trang chủ đếm tăng (animated) — tất cả bằng API Compose gốc, không thư viện ngoài.

## 3. Cấu trúc thư mục (mobile/ trong repo chính)

```
mobile/
  settings.gradle.kts, build.gradle.kts, gradle.properties
  gradle/libs.versions.toml         (version catalog tập trung)
  debug.p12                         # keystore debug CỐ ĐỊNH đã commit (chỉ ký bản debug — xem docs/security.md)
  app/
    build.gradle.kts
    src/main/
      AndroidManifest.xml           # usesCleartextTraffic=true (cho phép http:// tới server local khi test)
      java/com/hrmai/app/           # package gốc là com.hrmai.app (không phải com.hrm.mobile)
        MainActivity.kt, HrmApplication.kt
        core/
          datastore/   (SessionStore: phiên, token, base URL, refresh)
          di/          (AppContainer)
          network/     (ApiClient, AuthInterceptor, ApiError)
          ui/          (theme + Components dùng chung)
          util/        (Format ngày giờ...)
        feature/       # 38 thư mục, mỗi thư mục = 1 tính năng (xem dưới)
        navigation/    (HrmNavHost.kt — Routes + NavHost + màn "Thêm")
      res/               (drawable, mipmap-anydpi-v26, values — KHÔNG có res/font/)
```

38 thư mục trong `feature/` (kiểm chứng bằng `ls`):

| Nhóm | Thư mục |
|---|---|
| Nền tảng | `auth`, `home`, `profile`, `notifications` |
| Nghiệp vụ lõi | `attendance`, `leave`, `payroll`, `payrolladmin`, `employees`, `departments`, `orgchart`, `shifts` |
| Nhân sự mở rộng | `onboarding`, `offboarding`, `performance`, `training`, `skills`, `documents`, `assets`, `attrition` |
| Tương tác | `feed`, `kudos`, `announcements`, `surveys`, `rewards`, `journey`, `teamcalendar` |
| AI / tuyển dụng | `chatbot`, `recruitment`, `jobs`, `jd`, `cvcheck`, `mockinterview`, `briefing` |
| QR check-in | `checkin` (quét), `checkinadmin` (cấp mã QR + cấu hình) |
| Quản trị | `admin`, `reports` |

Quy ước đặt tên trong mỗi feature: `<Tên>Api.kt` (Retrofit interface), `<Tên>Screen.kt`, `<Tên>ViewModel.kt`. Ngoại lệ: `orgchart` không có endpoint riêng — `OrgChartApi` chỉ kế thừa `EmployeesApi` + `DepartmentsApi` (server không có endpoint sơ đồ tổ chức riêng; cây dựng ở client từ `manager_id`/`department_id`).

## 4. Điều hướng — 41 route

Mọi route khai báo tập trung trong `object Routes` (`navigation/HrmNavHost.kt:143-186`). Màn đăng nhập là điểm bắt đầu riêng, không nằm trong `Routes`.

| Route | Màn hình | Ghi chú |
|---|---|---|
| `home` | Trang chủ | chào theo giờ, chấm công hôm nay, số phép còn, điểm, thông báo mới |
| `attendance` | Chấm công | nút Vào/Ra, trạng thái hôm nay, lịch tháng |
| `chatbot` | Chatbot HR | hỏi đáp + thẻ hành động chờ xác nhận (như web) |
| `feed` | Bảng tin | bài viết, thả tim, bình luận, đăng bài |
| `more` | Thêm (menu) | menu nhóm theo role (mục 5) |
| `leave` | Nghỉ phép | số dư, đơn của tôi, tạo đơn, tab duyệt 2 cấp |
| `payroll` | Lương của tôi | phiếu lương kỳ gần nhất + lịch sử |
| `kudos` | Vinh danh & điểm thưởng | tường kudos, tặng kudos, bảng xếp hạng |
| `announcements` | Thông báo công ty | |
| `notifications` | Thông báo cá nhân | |
| `profile` | Hồ sơ cá nhân | thông tin cá nhân, kỹ năng của tôi, đăng xuất |
| `rewards` | Cửa hàng đổi thưởng | đổi điểm lấy quà |
| `journey` | Hành trình của tôi | chuyên cần năm, điểm, huy hiệu |
| `performance` | KPI & OKR | chu kỳ, mục tiêu, đánh giá |
| `training` | Đào tạo | khoá học, khoá của tôi, ghi danh |
| `shifts` | Ca làm việc | lịch ca, tăng ca, giải trình chấm công |
| `assets` | Tài sản của tôi | tài sản được cấp + trả tài sản |
| `documents` | Tài liệu & giấy xác nhận | danh sách + xin giấy xác nhận |
| `onboarding` | Hội nhập | plan + task của tôi (employee), board theo dõi (HR) |
| `skills` | Bản đồ kỹ năng | matrix kỹ năng + gợi ý khoá học |
| `surveys` | Khảo sát gắn kết | trả lời khảo sát, xem kết quả (HR) |
| `team-calendar` | Lịch nhóm | lịch nghỉ của nhóm theo tháng |
| `employees` | Nhân viên | danh sách (manager trở lên) |
| `employee/{employeeId}` | Chi tiết nhân viên | |
| `departments` | Phòng ban | |
| `org-chart` | Sơ đồ tổ chức | dựng ở client (mục 3) |
| `recruitment` | Tuyển dụng | tin tuyển dụng + ứng viên (HR) |
| `recruitment-job/{jobId}` | Chi tiết tin tuyển dụng | |
| `reports` | Báo cáo | tóm tắt số liệu (manager trở lên) |
| `attrition` | Rủi ro nghỉ việc | (manager trở lên) |
| `offboarding` | Quy trình nghỉ việc | (HR) |
| `payroll-admin` | Quản lý lương | kỳ lương, tính lương, chốt lương (HR) |
| `admin` | Quản trị tài khoản | chỉ admin |
| `jobs` | Việc làm đang mở | trang công khai (không cần đăng nhập) |
| `job/{jobId}` | Chi tiết việc làm | trang công khai |
| `cv-check` | Kiểm tra CV bằng AI | public, không cần đăng nhập |
| `mock-interview` | Phỏng vấn thử AI | 5 câu, chấm AI hoặc heuristic |
| `checkin-scan` | Chấm công QR + GPS | quét QR / nhập mã 6 số |
| `checkin-admin` | Mã QR chấm công | xem mã QR hôm nay, cấu hình, logs (HR) |
| `jd-generator` | Soạn JD bằng AI | (HR) |
| `briefing` | Báo cáo điều hành | (HR) |

## 5. Role-UI (menu ẩn theo role)

Màn "Thêm" (`MoreRoute`, `HrmNavHost.kt:440+`) dựng menu theo role đang đăng nhập, nhóm liên quan nhất lên đầu:

- **Mọi role:** Nghỉ phép, Chấm công QR + GPS, Lương của tôi, Vinh danh, Cửa hàng đổi thưởng, Hành trình, Thông báo, Hồ sơ + nhóm "Công việc & phát triển" (KPI, Đào tạo, Ca làm, Tài sản, Tài liệu, Onboarding, Kỹ năng, Khảo sát, Lịch nhóm) + nhóm "Trải nghiệm ứng viên" (Việc làm, Kiểm tra CV, Phỏng vấn thử).
- **Manager trở lên** (`manager`/`hr`/`admin`): thêm nhóm "Quản lý" (Nhân viên, Phòng ban, Sơ đồ tổ chức, Tuyển dụng, Báo cáo, Rủi ro nghỉ việc, Nghỉ việc).
- **HR trở lên** (`hr`/`admin`): thêm nhóm "HR & hệ thống" (Mã QR chấm công, Báo cáo điều hành, Quản lý lương).
- **Chỉ admin:** Quản trị tài khoản.

Lưu ý: menu ẩn theo role đã có, nhưng **không có chặn `needsEmployee` ở mobile** — mục "Cửa hàng đổi thưởng" và "Hành trình của tôi" hiện cho mọi tài khoản kể cả tài khoản thuần hệ thống (không hồ sơ), khác với web (web ẩn 2 mục này khi `employeeId == null`). Hành vi của 2 màn này khi `employeeId` null **chưa xác minh**.

## 6. API — xem mobile-api-map.md

Chi tiết từng endpoint (method, path, role server, tham số bắt buộc) xem **[mobile-api-map.md](./mobile-api-map.md)** — file đó tái tạo từ 130 Retrofit annotations trong 39 file `*Api.kt` (113 endpoint duy nhất) và đối chiếu từng cái với `server/app/blueprints/**/routes.py`. Những điểm cần nhớ khi gọi API từ mobile:

- **Tham số bắt buộc hay gọi sai:** `GET /attendance/monthly` phải kèm `mine=1` (server mới trả danh sách phẳng của chính mình kèm summary); `GET /leave/requests` dùng `scope=mine|team` — `scope=all` **không hợp lệ**; `GET /payroll/periods` chỉ `admin`/`hr` (employee gọi sẽ 403).
- **Endpoint chết (đã ghi trong mobile-api-map.md, cần sửa code — không gọi nữa):** `GET /notifications/unread-count` (không tồn tại trên server — chuông mobile có fallback sang `GET /notifications` lấy `unreadCount`; web không có fallback nên chuông web luôn hiện 0), `GET /org/departments` (server chỉ có `GET /departments`), `POST /assets/assignments/{id}/return` (server chỉ có `POST /assignments/{id}/return`).
- **Đường dẫn chấm công:** không có `/attendance/my` — lịch tháng là `/attendance/monthly?mine=1`, chuyên cần năm là `/attendance/my-year?year=`.
- **Refresh token:** `AuthInterceptor` gặp 401 thì refresh một lần qua `POST /auth/refresh` (body `{refresh_token}`) rồi thử lại request. **Đăng xuất trên mobile chỉ xoá phiên ở máy** (`ProfileViewModel.logout()` → `sessionStore.clear()`), không gọi `POST /auth/logout` — refresh token vẫn sống đủ 7 ngày sau khi "đăng xuất" (cùng bug với web, xem `docs/security.md` §1).

## 7. Tính năng v5/v6 trên mobile

- **v5 — Mock interview** (`mockinterview`): `POST /interviews/start|{id}/answer|{id}/finish`, 5 câu hỏi, guest qua `access_token` + header `X-Session-Token`, token hết hạn 48h, finish idempotent (trả lại báo cáo cũ, 200). **CV check** (`cvcheck`): `POST /public/cv-check` công khai, không cần đăng nhập, giới hạn 10/phút + 30/giờ, `cv_text` tối đa 12.000 ký tự, không lưu DB. **Skills** (`skills`): matrix kỹ năng, gợi ý khoá học. Trang TV `/display` của web không có bản mobile.
- **v6 — QR+GPS check-in** (`checkin`/`checkinadmin`): quét mã QR chứa URL `${origin}/checkin?d=<ngày>&t=<token>` (token 12 hex đầu HMAC-SHA256 theo ngày ICT) hoặc nhập mã dự phòng 6 số. Luồng QR gửi kèm `lat`/`lon` hiện tại (bắt buộc); luồng mã 6 số không gửi GPS nên không kiểm khoảng cách. Ngoài phạm vi (mặc định 150m) → log `rejected` + 403 kèm `distance_m` thật; token sai → 403 `INVALID_QR_CODE`; trùng → 409. **Production hiện chưa có toạ độ văn phòng** (office config để trống) nên luồng GPS ở production trả lỗi `OFFICE_NOT_CONFIGURED`; mã 6 số vẫn chạy.
- **v6 — AI JD** (`jd`): `POST /recruitment/jd/generate` trả `{summary, responsibilities[], requirements[], benefits[]}` + `source: "ai" | "template"`; không tạo JobPosting. **InterviewKit** (`recruitment`): `GET/POST/PUT /jobs/{id}/interview-kit`, tỉ trọng vòng 40/40/20. **Briefing** (`briefing`): `POST /briefing/generate`, `GET /briefing/latest|history`; số liệu trong văn bản được kiểm chứng bằng regex trước khi trả.

## 8. Thiết kế hình ảnh
- Nhận diện khớp web v4: nền trắng/xám rất nhạt, thẻ viền mảnh, màu chủ đạo `#274FEA`, bo góc 12–16.
- **Font: dùng font hệ thống — không có `res/font/`** (Inter không được nhúng vào app; bản cũ ghi "nhúng font trong res/font" là sai).
- **Logo: màn đăng nhập vẽ logo bằng Compose** — khối xanh bo góc + chữ "H" (`LoginScreen.kt:66`, "khớp logo web"), không phải convert từ `logo.svg`. Trong cây `res/drawable/` chỉ có `ic_launcher_foreground.xml` (adaptive icon); **không có file `ic_logo.xml`** như bản cũ ghi.
- Chế độ sáng là mặc định (khớp web); không làm dark mode ở bản này.

## 9. Build & bàn giao
- **Build chỉ chạy qua GitHub Actions** (`.github/workflows/mobile.yml`): push lên `main` chạm `mobile/**` (hoặc chạy tay `workflow_dispatch`) → `gradle assembleDebug` → file `app-debug.apk` được đổi tên thành `hrm-ai.apk` (**21,2 MB**) + kèm `mobile-build.log`, publish lên GitHub Release tag **`mobile-latest`**. Repo công khai nên tải về không cần đăng nhập.
- **Không có `app-debug.apk` local** — Gradle local không chạy được trên VM này (môi trường chặn kết nối mà Gradle cần), nên không build tay được; mọi bản APK đều đi qua CI như trên. Build lỗi vẫn publish `mobile-build.log` (APK khi đó giữ nguyên bản cũ — luôn kiểm tra timestamp/size của asset).
- Màn đăng nhập hiển thị sẵn gợi ý tài khoản demo (chạm để điền nhanh); server mặc định là production nên mở app là dùng được ngay với dữ liệu thật.
- APK là bản **debug**, ký bằng keystore debug cố định đã commit trong repo (`mobile/debug.p12`) — chỉ dùng cho bản demo/đồ án, không dùng cho phát hành chính thức.

## 10. Kiểm chứng & giới hạn đã biết
1. `assembleDebug` PASS trên CI là điều kiện bắt buộc để giao (workflow tự kiểm chứng).
2. Rà soát tĩnh: mọi lời gọi API khớp path/method/envelope của server — xem bảng đối chiếu trong [mobile-api-map.md](./mobile-api-map.md) (113 endpoint duy nhất, 3 endpoint chết đã ghi rõ ở mục 6).
3. **Employee GPS scan in/out-of-range chưa test trên emulator — chưa xác minh.** Luồng quét gửi `lat`/`lon` thật (`CheckinViewModel.kt`) và server có logic Haversine + `OFFICE_NOT_CONFIGURED`, nhưng chưa có lần chạy emulator nào chứng minh được cả hai nhánh trong/ngoài phạm vi.
4. Nếu môi trường có emulator chạy được thì cài APK + chụp các màn chính; nếu không, ghi rõ giới hạn này khi bàn giao (người dùng test trực tiếp trên điện thoại của anh — đúng yêu cầu ban đầu).
