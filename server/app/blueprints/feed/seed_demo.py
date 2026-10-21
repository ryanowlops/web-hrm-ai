"""Seed demo cho module Bảng tin nội bộ (feed) — IDEMPOTENT, không tự commit.

Parent (server/seed.py) gọi seed_demo() trong transaction chung:
- 3 bài viết, thời gian rải trong 3 ngày gần nhất (tương đối theo ngày
  chạy seed):
  (1) HR (NV0002) GHIM — chào mừng + nhắc khảo sát gắn kết Q4;
  (2) Manager (NV0001) — chúc mừng team đạt mục tiêu tháng;
  (3) NV0004 — cảm ơn đồng nghiệp hỗ trợ quá trình hội nhập.
  FeedPost.author_id là FK tới users; NV0004 chưa có tài khoản trong bộ
  demo gốc nên seed tạo user cho NV0004 (email lấy từ hồ sơ nhân viên,
  mật khẩu mẫu Employee@123) — chỉ tạo khi chưa tồn tại.
- Tim chéo nhau 6 lượt + 4 bình luận qua lại trên các bài.
Khóa chống trùng: bài viết theo (author_id, content); like theo cặp
(post_id, user_id) có sẵn UNIQUE; bình luận theo (post_id, author_id,
content).
"""

from datetime import timedelta

from werkzeug.security import generate_password_hash

from app.extensions import db
from app.models import Employee, User
from app.models.feed import FeedComment, FeedLike, FeedPost
from app.models.users import utcnow

POST_PINNED_CONTENT = (
    "Chào mừng mọi người đến với Bảng tin nội bộ của Web HRM AI! Đây sẽ là "
    "nơi cập nhật nhanh các hoạt động, thành tích và câu chuyện đẹp của "
    "công ty. HR cũng xin nhắc: Khảo sát mức độ gắn kết — Quý 4/2026 đang "
    "mở, mọi người dành ít phút tham gia giúp công ty lắng nghe tốt hơn nhé."
)

POST_MANAGER_CONTENT = (
    "Chúc mừng team Kinh doanh đã cán đích mục tiêu doanh số tháng này "
    "trước hạn 3 ngày! Cảm ơn cả đội đã nỗ lực không ngừng, đặc biệt là "
    "những buổi hỗ trợ khách hàng ngoài giờ. Tự hào về mọi người!"
)

POST_NEWBIE_CONTENT = (
    "Em là Đức, nhân viên mới của phòng Kỹ thuật. Em xin cảm ơn anh Minh "
    "và chị Hà đã tận tình hướng dẫn em trong những tuần hội nhập đầu "
    "tiên — từ cài đặt môi trường đến quy trình làm việc. Mong được học "
    "hỏi thêm từ mọi người trong thời gian tới ạ!"
)

# (email người bình luận, chỉ số bài 0/1/2, nội dung)
COMMENTS = [
    (
        "manager@hrm.local",
        0,
        "Cảm ơn HR đã mở kênh này, từ nay team mình cập nhật tin tức thuận tiện hơn nhiều.",
    ),
    (
        "employee@hrm.local",
        0,
        "Em vừa hoàn thành khảo sát rồi ạ, giao diện trả lời rất nhanh gọn!",
    ),
    (
        "hr@hrm.local",
        1,
        "Chúc mừng team Kinh doanh! Thành tích này sẽ được ghi nhận trong kỳ đánh giá quý.",
    ),
    (
        "hr@hrm.local",
        2,
        "Chào mừng Đức gia nhập phòng Kỹ thuật, chúc em sớm bắt nhịp và có nhiều đóng góp hay!",
    ),
]


def _user_by_email(email):
    return User.query.filter_by(email=email).first()


def _employee_by_code(code):
    return Employee.query.filter_by(code=code).first()


def _ensure_newbie_user():
    """User cho NV0004 (tác giả bài 3) — tạo nếu chưa có, trả None nếu thiếu NV."""
    employee = _employee_by_code("NV0004")
    if employee is None:
        return None
    user = User.query.filter_by(employee_id=employee.id).first()
    if user is not None:
        return user
    user = _user_by_email(employee.email)
    if user is not None:
        return user
    user = User(
        email=employee.email,
        password_hash=generate_password_hash("Employee@123"),
        full_name=employee.full_name,
        role=User.ROLE_EMPLOYEE,
        is_active=True,
        employee_id=employee.id,
    )
    db.session.add(user)
    db.session.flush()
    return user


def _get_or_create_post(author, content, *, is_pinned, created_at):
    post = (
        FeedPost.query.filter_by(author_id=author.id, content=content).first()
        if author is not None
        else None
    )
    if post is not None:
        return post
    post = FeedPost(
        author_id=author.id,
        content=content,
        is_pinned=is_pinned,
        created_at=created_at,
        updated_at=created_at,
    )
    db.session.add(post)
    db.session.flush()
    return post


def seed_demo():
    hr_user = _user_by_email("hr@hrm.local")
    manager_user = _user_by_email("manager@hrm.local")
    employee_user = _user_by_email("employee@hrm.local")
    newbie_user = _ensure_newbie_user()
    if hr_user is None or manager_user is None or employee_user is None \
            or newbie_user is None:
        return

    now = utcnow()
    posts = [
        _get_or_create_post(
            hr_user, POST_PINNED_CONTENT,
            is_pinned=True, created_at=now - timedelta(days=2, hours=3),
        ),
        _get_or_create_post(
            manager_user, POST_MANAGER_CONTENT,
            is_pinned=False, created_at=now - timedelta(days=1, hours=5),
        ),
        _get_or_create_post(
            newbie_user, POST_NEWBIE_CONTENT,
            is_pinned=False, created_at=now - timedelta(hours=4),
        ),
    ]
    db.session.flush()

    # Tim chéo nhau: mỗi bài 2 lượt từ người khác tác giả (6 lượt tổng).
    like_plan = [
        (posts[0], manager_user), (posts[0], employee_user),
        (posts[1], hr_user), (posts[1], employee_user),
        (posts[2], hr_user), (posts[2], manager_user),
    ]
    for idx, (post, user) in enumerate(like_plan):
        exists = (
            FeedLike.query.filter_by(post_id=post.id, user_id=user.id).first()
            is not None
        )
        if not exists:
            db.session.add(
                FeedLike(
                    post_id=post.id,
                    user_id=user.id,
                    created_at=post.created_at + timedelta(minutes=30 + idx * 17),
                )
            )
    db.session.flush()

    # 4 bình luận qua lại, thời gian sau bài viết tương ứng.
    users_by_email = {
        "hr@hrm.local": hr_user,
        "manager@hrm.local": manager_user,
        "employee@hrm.local": employee_user,
    }
    for idx, (email, post_idx, content) in enumerate(COMMENTS):
        author = users_by_email[email]
        post = posts[post_idx]
        exists = (
            FeedComment.query.filter_by(
                post_id=post.id, author_id=author.id, content=content
            ).first()
            is not None
        )
        if not exists:
            db.session.add(
                FeedComment(
                    post_id=post.id,
                    author_id=author.id,
                    content=content,
                    created_at=post.created_at + timedelta(hours=1, minutes=idx * 23),
                )
            )
    db.session.flush()
