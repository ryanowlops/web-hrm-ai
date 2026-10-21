"""Service layer cho module Bảng tin nội bộ (feed).

Logic nghiệp vụ + transaction. Routes chỉ validate input, gọi service và
trả JSON. Lỗi nghiệp vụ ném ra bằng app.errors.ApiError (cơ chế lỗi tập
trung trả về định dạng chuẩn).

Điểm nhấn: GET /feed/activity tổng hợp dòng sự kiện từ các bảng đã có
(Kudo, Announcement, Employee mới, Attendance hôm nay, FeedPost) — chỉ
đọc, không lưu bảng sự kiện riêng.
"""
from datetime import timedelta
from zoneinfo import ZoneInfo

from app.errors import ApiError
from app.extensions import db
from app.models import Announcement, Attendance, Employee, User
from app.models.engagement import Kudo
from app.models.feed import FeedComment, FeedLike, FeedPost
from app.models.users import utcnow
from app.blueprints.feed import schemas

LOCAL_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
PRIVILEGED_ROLES = ("admin", "hr")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_pagination(args, default_limit=20, max_limit=100):
    try:
        page = int(args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    page = max(1, page)
    try:
        limit = int(args.get("limit", default_limit))
    except (TypeError, ValueError):
        limit = default_limit
    limit = min(max(1, limit), max_limit)
    return page, limit


def _meta(page, limit, total):
    return {
        "page": page,
        "limit": limit,
        "totalItems": total,
        "totalPages": (total + limit - 1) // limit if total else 0,
    }


def get_post_or_404(post_id: int) -> FeedPost:
    post = db.session.get(FeedPost, post_id)
    if post is None:
        raise ApiError(404, "POST_NOT_FOUND", "Không tìm thấy bài viết.")
    return post


def get_comment_or_404(comment_id: int) -> FeedComment:
    comment = db.session.get(FeedComment, comment_id)
    if comment is None:
        raise ApiError(404, "COMMENT_NOT_FOUND", "Không tìm thấy bình luận.")
    return comment


def _serialize_post(post: FeedPost, current_user: User):
    like_count = FeedLike.query.filter_by(post_id=post.id).count()
    comment_count = FeedComment.query.filter_by(post_id=post.id).count()
    liked_by_me = (
        FeedLike.query.filter_by(post_id=post.id, user_id=current_user.id).first()
        is not None
    )
    preview_rows = (
        FeedComment.query.filter_by(post_id=post.id)
        .order_by(FeedComment.created_at.desc(), FeedComment.id.desc())
        .limit(3)
        .all()
    )
    preview = [
        schemas.comment_to_dict(c, current_user_id=current_user.id)
        for c in preview_rows
    ]
    return schemas.post_to_dict(
        post,
        like_count=like_count,
        comment_count=comment_count,
        liked_by_me=liked_by_me,
        comments_preview=preview,
        current_user=current_user,
    )


# ---------------------------------------------------------------------------
# Bài viết
# ---------------------------------------------------------------------------

def list_posts(args, current_user: User):
    """Danh sách bài: ghim trước, mới nhất sau, phân trang."""
    page, limit = _parse_pagination(args, default_limit=20)
    query = FeedPost.query.order_by(
        FeedPost.is_pinned.desc(),
        FeedPost.created_at.desc(),
        FeedPost.id.desc(),
    )
    total = query.count()
    rows = query.offset((page - 1) * limit).limit(limit).all()
    return [_serialize_post(post, current_user) for post in rows], _meta(page, limit, total)


def create_post(cleaned: dict, current_user: User) -> dict:
    post = FeedPost(author_id=current_user.id, content=cleaned["content"])
    db.session.add(post)
    db.session.commit()
    return _serialize_post(post, current_user)


def delete_post(post: FeedPost, current_user: User) -> None:
    if post.author_id != current_user.id and current_user.role not in PRIVILEGED_ROLES:
        raise ApiError(403, "FORBIDDEN", "Bạn không có quyền xoá bài viết này.")
    db.session.delete(post)  # likes + comments xoá theo cascade ORM
    db.session.commit()


def set_pinned(post: FeedPost, is_pinned: bool, current_user: User) -> dict:
    post.is_pinned = is_pinned
    db.session.commit()
    return _serialize_post(post, current_user)


def toggle_like(post: FeedPost, current_user: User) -> dict:
    existing = FeedLike.query.filter_by(
        post_id=post.id, user_id=current_user.id
    ).first()
    if existing is not None:
        db.session.delete(existing)
        liked = False
    else:
        db.session.add(FeedLike(post_id=post.id, user_id=current_user.id))
        liked = True
    db.session.commit()
    like_count = FeedLike.query.filter_by(post_id=post.id).count()
    return {"post_id": post.id, "liked": liked, "like_count": like_count}


# ---------------------------------------------------------------------------
# Bình luận
# ---------------------------------------------------------------------------

def list_comments(post: FeedPost, args, current_user: User):
    """Bình luận của 1 bài: mới nhất trước, phân trang nhẹ."""
    page, limit = _parse_pagination(args, default_limit=20)
    query = FeedComment.query.filter_by(post_id=post.id).order_by(
        FeedComment.created_at.desc(), FeedComment.id.desc()
    )
    total = query.count()
    rows = query.offset((page - 1) * limit).limit(limit).all()
    items = [
        schemas.comment_to_dict(c, current_user_id=current_user.id) for c in rows
    ]
    # can_delete cần biết role (hr/admin xoá được bình luận của người khác).
    if current_user.role in PRIVILEGED_ROLES:
        for item in items:
            item["can_delete"] = True
    return items, _meta(page, limit, total)


def create_comment(post: FeedPost, cleaned: dict, current_user: User) -> dict:
    comment = FeedComment(
        post_id=post.id, author_id=current_user.id, content=cleaned["content"]
    )
    db.session.add(comment)
    db.session.commit()
    data = schemas.comment_to_dict(comment, current_user_id=current_user.id)
    return data


def delete_comment(comment: FeedComment, current_user: User) -> None:
    if comment.author_id != current_user.id and current_user.role not in PRIVILEGED_ROLES:
        raise ApiError(403, "FORBIDDEN", "Bạn không có quyền xoá bình luận này.")
    db.session.delete(comment)
    db.session.commit()


# ---------------------------------------------------------------------------
# Dòng hoạt động tổng hợp (chỉ đọc)
# ---------------------------------------------------------------------------

def _excerpt(text: str, max_len: int = 90) -> str:
    text = " ".join((text or "").split())
    if len(text) > max_len:
        return text[: max_len - 1].rstrip() + "…"
    return text


def get_activity(limit: int = 10):
    """Tổng hợp sự kiện mới nhất từ 5 nguồn có sẵn, mới nhất trước."""
    limit = min(max(1, limit), 30)
    pool = max(limit, 10)
    items = []

    # Kudo mới — người tặng là User, người nhận là Employee.
    kudos = (
        Kudo.query.order_by(Kudo.created_at.desc(), Kudo.id.desc())
        .limit(pool)
        .all()
    )
    for kudo in kudos:
        from_name = kudo.from_user.full_name if kudo.from_user else "Đồng nghiệp"
        to_name = kudo.to_employee.full_name if kudo.to_employee else "đồng nghiệp"
        items.append({
            "type": "kudo",
            "actor_name": from_name,
            "text": f"{from_name} đã tặng kudos cho {to_name}: “{_excerpt(kudo.message, 70)}”",
            "at": kudo.created_at.isoformat() if kudo.created_at else None,
            "link": "/kudos",
        })

    # Thông báo mới.
    announcements = (
        Announcement.query.order_by(
            Announcement.created_at.desc(), Announcement.id.desc()
        )
        .limit(pool)
        .all()
    )
    for ann in announcements:
        author_name = ann.author.full_name if ann.author else "Phòng Nhân sự"
        items.append({
            "type": "announcement",
            "actor_name": author_name,
            "text": f"Thông báo mới: {_excerpt(ann.title, 80)}",
            "at": ann.created_at.isoformat() if ann.created_at else None,
            "link": "/announcements",
        })

    # Nhân viên mới gia nhập (tạo hồ sơ trong 30 ngày gần nhất).
    since = utcnow() - timedelta(days=30)
    new_employees = (
        Employee.query.filter(Employee.created_at >= since)
        .order_by(Employee.created_at.desc(), Employee.id.desc())
        .limit(pool)
        .all()
    )
    for emp in new_employees:
        dept = emp.department.name if emp.department else None
        suffix = f" ({dept})" if dept else ""
        items.append({
            "type": "new_employee",
            "actor_name": emp.full_name,
            "text": f"{emp.full_name} vừa gia nhập công ty{suffix}",
            "at": emp.created_at.isoformat() if emp.created_at else None,
            "link": "/employees",
        })

    # Chấm công hôm nay (giờ Việt Nam, cùng quy ước attendance services).
    from datetime import datetime

    today_local = datetime.now(LOCAL_TZ).date()
    attendances = (
        Attendance.query.filter(
            Attendance.work_date == today_local,
            Attendance.check_in_at.isnot(None),
        )
        .order_by(Attendance.check_in_at.desc())
        .limit(pool)
        .all()
    )
    for att in attendances:
        name = att.employee.full_name if att.employee else "Nhân viên"
        hhmm = att.check_in_at.strftime("%H:%M") if att.check_in_at else ""
        items.append({
            "type": "attendance",
            "actor_name": name,
            "text": f"{name} đã chấm công lúc {hhmm}",
            "at": att.check_in_at.isoformat() if att.check_in_at else None,
            "link": "/attendance",
        })

    # Bài viết mới trên bảng tin.
    posts = (
        FeedPost.query.order_by(FeedPost.created_at.desc(), FeedPost.id.desc())
        .limit(pool)
        .all()
    )
    for post in posts:
        author_name = post.author.full_name if post.author else "Đồng nghiệp"
        items.append({
            "type": "post",
            "actor_name": author_name,
            "text": f"{author_name} đã đăng bài mới: “{_excerpt(post.content, 70)}”",
            "at": post.created_at.isoformat() if post.created_at else None,
            "link": "/feed",
        })

    items.sort(key=lambda x: x["at"] or "", reverse=True)
    return items[:limit]
