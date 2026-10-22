# Ứng dụng mobile HRM AI — Android (Kotlin)

Ngày: 2026-10-22. Theo yêu cầu của người dùng: bản mobile đồng bộ dữ
liệu với bản web, tech Kotlin, chạy trực tiếp trên điện thoại của anh
để test; cấu trúc chuẩn doanh nghiệp, tối ưu mượt, có hiệu ứng.

## 1. Nguyên tắc nền tảng
- **Một backend duy nhất**: app gọi đúng API `/api/v1` của server
  Flask hiện tại (production: https://hrm-ai-api.onrender.com).
  Không có dữ liệu riêng — chấm công/duyệt phép/thao tác trên điện
  thoại hiển thị ngay trên web và ngược lại.
- **Cùng tài khoản**: đăng nhập bằng chính các tài khoản của hệ thống
  (JWT access + refresh như web). Phân quyền theo role của server;
  app chỉ hiển thị những gì role được phép.
- **APK cài trực tiếp**: bản build debug ký sẵn khoá debug, cài qua
  file APK trên điện thoại Android (không cần CH Play cho bản đồ án).
  Địa chỉ server mặc định trỏ production; có ô đổi địa chỉ server
  trong màn đăng nhập (để test với server chạy ở máy nhà khi cần).

## 2. Công nghệ
- Kotlin 2.0, Jetpack Compose + Material 3 (minSdk 26, target 34).
- Kiến trúc **MVVM + phân lớp**: `data` (Retrofit/OkHttp, DTO,
  repository) / `domain` (model + use case mỏng) / `presentation`
  (Screen + ViewModel + UiState). Mỗi tính năng một package theo
  đúng tên feature của web.
- Điều hướng: Navigation Compose; thanh dưới 5 mục (Trang chủ,
  Chấm công, Chatbot ở giữa, Bảng tin, Thêm) + các màn con.
- DI thủ công bằng `AppContainer` (khai báo tập trung, ViewModel
  qua factory) — gọn, tránh sinh code, hành vi xác định khi build.
- Mạng: Retrofit + OkHttp (logging chỉ ở debug), Moshi reflection;
  interceptor gắn JWT + tự refresh khi 401 (một lần, có khoá đồng
  bộ); lỗi chuẩn hoá về một kiểu `ApiError` hiển thị tiếng Việt.
- Lưu trữ: DataStore (token + địa chỉ server + thông tin user tóm
  tắt). Trạng thái màn hình: StateFlow; danh sách có pull-to-refresh.
- Hiệu ứng/chuyển động: chuyển cảnh trượt+mờ giữa các màn, nút bấm
  có ripple + scale, skeleton nhấp nháy khi tải, vòng tròn thành
  công nảy (spring) khi chấm công, haptic nhẹ khi chấm công xong,
  số liệu trang chủ đếm tăng (animated) — tất cả bằng API Compose
  gốc, không thư viện ngoài.

## 3. Cấu trúc thư mục (mobile/ trong repo chính)
```
mobile/
  settings.gradle.kts, build.gradle.kts, gradle.properties
  gradle/libs.versions.toml         (version catalog tập trung)
  app/
    build.gradle.kts
    src/main/
      AndroidManifest.xml
      java/com/hrmai/app/
        HrmApplication.kt, MainActivity.kt
        core/            (di/AppContainer, network, datastore, ui theme,
                          components dùng chung, util ngày giờ/liên lạc)
        data/            (api interfaces, dto, repositories dùng chung)
        feature/
          auth/          home/        attendance/   leave/
          payroll/       feed/        kudos/        announcements/
          notifications/ chatbot/     profile/
      res/               (icon launcher, font, strings, themes)
```

## 4. Màn hình & API tương ứng (bản đầy đủ đã duyệt)
| Màn hình | API chính |
|---|---|
| Đăng nhập (+ đổi địa chỉ server) | POST /auth/login, /auth/refresh |
| Trang chủ: chào theo giờ, thẻ chấm công hôm nay, số phép còn, điểm thưởng, lối tắt, thông báo mới | GET /stats/overview (theo scope), /attendance/today hoặc tương đương, /leave/balance, /gamification/me, /announcements?latest |
| Chấm công: nút Vào/Ra lớn, trạng thái hôm nay, lịch sử tháng + lịch chấm công dạng lưới tháng | POST /attendance/check-in|check-out, GET /attendance/my, /attendance/my-year |
| Nghỉ phép: số dư, danh sách đơn của tôi, tạo đơn (loại phép, ngày, lý do), tab Duyệt đơn cho manager/hr (duyệt/từ chối theo đúng 2 cấp của server) | GET/POST /leave/* theo services web |
| Lương của tôi: kỳ lương gần nhất, chi tiết khoản, lịch sử phiếu | GET /payroll/my-payslips tương đương services web |
| Bảng tin: bài viết, thả tim, bình luận, đăng bài | /feed/* |
| Vinh danh: tường kudos, tặng kudos, bảng xếp hạng | /engagement/kudos, /gamification/leaderboard |
| Thông báo công ty + trung tâm thông báo cá nhân | /announcements, /notifications |
| Chatbot HR: hỏi đáp (nguồn trích dẫn), THẺ HÀNH ĐỘNG chờ xác nhận giống web (soạn đơn/duyệt → xác nhận mới thực thi) | /chat/ask, /chat/actions/execute |
| Hồ sơ: thông tin cá nhân, kỹ năng của tôi (xem), đăng xuất | /employees/me tương đương, /skills/employees/<id> |

Mọi endpoint cụ thể lấy theo services của bản web (client/src/
features/*/services.js + routes của server) — không tự chế đường dẫn.

## 5. Thiết kế hình ảnh
- Nhận diện khớp web v4: nền trắng/xám rất nhạt, thẻ viền mảnh, màu
  chủ đạo #274FEA, chữ Inter (nhúng font trong res/font), bo góc 12–16.
- Logo app = logo.svg hiện có chuyển sang adaptive icon.
- Chế độ sáng là mặc định (khớp web); không làm dark mode ở bản này.

## 6. Build & bàn giao
- `gradle assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk`.
- File APK giao cho người dùng kèm hướng dẫn cài (Android: mở file,
  cho phép "Cài ứng dụng không rõ nguồn gốc" cho trình duyệt/file).
- Màn đăng nhập hiển thị sẵn gợi ý tài khoản demo; server mặc định
  là production nên mở app là dùng được ngay với dữ liệu thật.

## 7. Kiểm chứng
1. assembleDebug PASS (điều kiện bắt buộc để giao).
2. Rà soát tĩnh: mọi lời gọi API khớp path/method/envelope của server
   (đối chiếu services web), luồng refresh token, đăng xuất.
3. Nếu môi trường có emulator chạy được thì cài APK + chụp các màn
   chính; nếu không, ghi rõ giới hạn này khi bàn giao (người dùng
   test trực tiếp trên điện thoại của anh — đúng yêu cầu ban đầu).
