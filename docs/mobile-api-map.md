# Bản đồ API cho app mobile (Kotlin)

Ngày trích: 2026-10-22. Nguồn DUY NHẤT: `client/src/features/*/services.js`
và `client/src/api/index.js` của bản web (đã đối chiếu trực tiếp, không tự
chế đường dẫn). Mọi path dưới đây đã bao gồm tiền tố `/api/v1` — app cộng
vào sau base URL (mặc định production `https://hrm-ai-api.onrender.com`,
xem `BuildConfig.DEFAULT_BASE_URL`, đổi được trong màn đăng nhập).

## Quy ước chung
- Auth: header `Authorization: Bearer <access_token>`; khi gặp 401 thì gọi
  `POST /api/v1/auth/refresh` một lần rồi thử lại (đã có interceptor mẫu
  trong `core/network` của skeleton).
- Envelope lỗi chuẩn của server: `{ error: { code, message, details } }`.
- List có thể trả mảng thuần HOẶC `{ data, meta, ... }` — DTO phải chịu
  được cả hai dạng (bản web chuẩn hoá ở tầng services).

## Auth
| Method | Path | Ghi chú |
|---|---|---|
| POST | `/api/v1/auth/login` | body `{ email, password }` → `{ access_token, refresh_token, user }` |
| POST | `/api/v1/auth/refresh` | body `{ refresh_token }` |
| POST | `/api/v1/auth/logout` | |

## Trang chủ (Home)
| Method | Path | Ghi chú |
|---|---|---|
| GET | `/api/v1/stats/overview` | số liệu tổng quan theo scope role |
| GET | `/api/v1/attendance/today` | trạng thái chấm công hôm nay |
| GET | `/api/v1/leave/balance/me` | số phép còn (query `?year=` tuỳ chọn) |
| GET | `/api/v1/gamification/my-points` | điểm thưởng của tôi |
| GET | `/api/v1/announcements` | thông báo mới nhất |
| GET | `/api/v1/feed/activity` | hoạt động mới gộp (kudos, milestone, bài viết…) |

## Chấm công (Attendance)
| Method | Path | Ghi chú |
|---|---|---|
| POST | `/api/v1/attendance/check-in` | |
| POST | `/api/v1/attendance/check-out` | |
| GET | `/api/v1/attendance/today` | trạng thái hôm nay |
| GET | `/api/v1/attendance/monthly` | lịch sử tháng (`?month=YYYY-MM`) |

## Nghỉ phép (Leave) — duyệt 2 cấp
| Method | Path | Ghi chú |
|---|---|---|
| GET | `/api/v1/leave/balance/me` | số dư các loại phép |
| GET | `/api/v1/leave/types` | danh mục loại phép |
| GET | `/api/v1/leave/requests` | đơn của tôi (`?scope=mine&page=&limit=&status=`) |
| POST | `/api/v1/leave/requests` | tạo đơn |
| POST | `/api/v1/leave/requests/{id}/cancel` | huỷ đơn của mình |
| GET | `/api/v1/leave/calendar` | lịch nghỉ (`?month=YYYY-MM`) |
| POST | `/api/v1/leave/requests/{id}/manager-decision` | **cấp 1 (Manager)**: body `{ decision: 'approved'|'rejected', note }` |
| POST | `/api/v1/leave/requests/{id}/hr-decision` | **cấp 2 (HR)**: chỉ duyệt đơn đã `manager_approved` |
| GET | `/api/v1/leave/requests?scope=team\|all&status=pending` | tab Duyệt đơn của Manager/HR (bản web: Manager xem đơn `pending`, HR xem đơn `manager_approved`) |

## Lương của tôi (Payroll)
| Method | Path | Ghi chú |
|---|---|---|
| GET | `/api/v1/payroll/my-payslip` | phiếu lương kỳ gần nhất (`?period_id=` tuỳ chọn) |
| GET | `/api/v1/payroll/periods` | danh sách kỳ lương |

## Bảng tin (Feed)
| Method | Path | Ghi chú |
|---|---|---|
| GET | `/api/v1/feed/posts` | danh sách bài viết |
| POST | `/api/v1/feed/posts` | đăng bài |
| DELETE | `/api/v1/feed/posts/{id}` | xoá (tác giả hoặc HR) |
| POST | `/api/v1/feed/posts/{id}/like` | toggle thả tim |
| GET | `/api/v1/feed/posts/{postId}/comments` | bình luận của bài |
| POST | `/api/v1/feed/posts/{postId}/comments` | bình luận |
| DELETE | `/api/v1/feed/comments/{id}` | xoá bình luận |

## Vinh danh (Kudos) + Điểm thưởng
| Method | Path | Ghi chú |
|---|---|---|
| GET | `/api/v1/engagement/kudos` | tường kudos |
| POST | `/api/v1/engagement/kudos` | tặng kudos |
| GET | `/api/v1/engagement/kudos/mine` | kudos của tôi |
| GET | `/api/v1/engagement/kudos/leaderboard` | bảng xếp hạng kudos |
| GET | `/api/v1/engagement/milestones` | sinh nhật / kỷ niệm làm việc |
| GET | `/api/v1/gamification/my-points` | điểm của tôi |
| GET | `/api/v1/gamification/my-badges` | huy hiệu của tôi |
| GET | `/api/v1/gamification/leaderboard` | bảng xếp hạng điểm |

## Thông báo (Announcements + Notification center)
| Method | Path | Ghi chú |
|---|---|---|
| GET | `/api/v1/announcements` | thông báo công ty |
| GET | `/api/v1/notifications` | thông báo cá nhân (`?limit=100`) |
| GET | `/api/v1/notifications/unread-count` | số chưa đọc (badge) |
| PATCH | `/api/v1/notifications/{id}/read` | đánh dấu đã đọc |
| POST | `/api/v1/notifications/read-all` | đọc tất cả |

## Chatbot HR
| Method | Path | Ghi chú |
|---|---|---|
| POST | `/api/v1/chat/ask` | hỏi đáp; trả `mode` (`live_data`\|`rag`), `retrieval_mode`, nguồn trích dẫn |
| GET | `/api/v1/chat/history` | lịch sử hội thoại |
| POST | `/api/v1/chat/actions/execute` | **THỰC THI hành động đã xác nhận** (soạn đơn/duyệt…): chỉ gọi sau khi user bấm xác nhận trên thẻ hành động; server kiểm tra lại quyền |

## Hồ sơ (Profile)
| Method | Path | Ghi chú |
|---|---|---|
| GET | `/api/v1/employees/{id}` | thông tin cá nhân (id lấy từ user lúc login) |
| GET | `/api/v1/skills/employees/{employeeId}` | kỹ năng của tôi (xem) |
