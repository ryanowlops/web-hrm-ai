"""Service layer cho module Announcements.

Logic nghiep vu + transaction. Routes chi validate input, goi service
va tra JSON. Loi nghiep vu nem ra bang app.errors.ApiError (co che loi
tap trung tra ve dinh dang chuan).

Diem nhan: khi tao thong bao moi, phat Notification cho moi User gan
voi Employee dang o trang thai "working" de chuong thong bao tren FE
sang cho toan cong ty.
"""
from app.errors import ApiError
from app.extensions import db
from app.models import Employee, Notification
from app.models.announcements import Announcement


def get_announcement_or_404(announcement_id: int) -> Announcement:
    announcement = db.session.get(Announcement, announcement_id)
    if announcement is None:
        raise ApiError(404, "NOT_FOUND", "Không tìm thấy thông báo.")
    return announcement


def list_announcements(args):
    """Danh sach thong bao: ghim truoc, moi truoc. Ho tro ?category= loc."""
    try:
        page = int(args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    page = max(1, page)
    try:
        limit = int(args.get("limit", 20))
    except (TypeError, ValueError):
        limit = 20
    limit = min(max(1, limit), 100)

    query = Announcement.query
    category = args.get("category")
    if category:
        query = query.filter_by(category=category)
    query = query.order_by(
        Announcement.is_pinned.desc(),
        Announcement.created_at.desc(),
        Announcement.id.desc(),
    )
    total = query.count()
    rows = query.offset((page - 1) * limit).limit(limit).all()
    meta = {
        "page": page,
        "limit": limit,
        "totalItems": total,
        "totalPages": (total + limit - 1) // limit if total else 0,
    }
    return rows, meta


def _broadcast_notification(announcement: Announcement) -> int:
    """Tao Notification cho moi nhan vien dang working. Tra ve so da gui."""
    employees = Employee.query.filter_by(status=Employee.STATUS_WORKING).all()
    sent = 0
    content = (announcement.content or "").strip()
    if len(content) > 200:
        content = content[:197] + "..."
    for employee in employees:
        user = getattr(employee, "user", None)
        if user is None or not getattr(user, "is_active", True):
            continue
        db.session.add(
            Notification(
                user_id=user.id,
                type="announcement",
                title=f"Thông báo mới: {announcement.title}",
                content=content or None,
                related_type="announcement",
                related_id=announcement.id,
            )
        )
        sent += 1
    return sent


def create_announcement(cleaned: dict, author_employee_id) -> Announcement:
    announcement = Announcement(
        title=cleaned["title"],
        content=cleaned["content"],
        category=cleaned.get("category") or Announcement.CATEGORY_GENERAL,
        is_pinned=bool(cleaned.get("is_pinned", False)),
        author_id=author_employee_id,
    )
    db.session.add(announcement)
    db.session.flush()  # lay id truoc khi phat Notification
    _broadcast_notification(announcement)
    db.session.commit()
    return announcement


def update_announcement(announcement: Announcement, cleaned: dict) -> Announcement:
    for field in ("title", "content", "category", "is_pinned"):
        if field in cleaned:
            setattr(announcement, field, cleaned[field])
    db.session.commit()
    return announcement


def delete_announcement(announcement: Announcement) -> None:
    db.session.delete(announcement)
    db.session.commit()
