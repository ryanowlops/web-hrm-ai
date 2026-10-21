"""Thong bao cong ty (Announcement) — bang tin noi bo cho toan cong ty.

Thong bao do HR/Admin dang (the loai: general/policy/event), co the ghim
(is_pinned) de luon nam tren dau danh sach. author_id tro toi Employee
cua nguoi dang (nullable vi tai khoan Admin co the khong gan nhan vien).

Khi tao thong bao moi, service se phat Notification cho moi User co
employee dang o trang thai "working" (xem blueprints/announcements).
"""
from app.extensions import db
from app.models.users import TimestampMixin


class Announcement(TimestampMixin, db.Model):
    __tablename__ = "announcements"
    __table_args__ = (
        db.Index("ix_announcements_pinned_created", "is_pinned", "created_at"),
    )

    CATEGORY_GENERAL = "general"
    CATEGORY_POLICY = "policy"
    CATEGORY_EVENT = "event"
    CATEGORIES = (CATEGORY_GENERAL, CATEGORY_POLICY, CATEGORY_EVENT)

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, nullable=False)
    category = db.Column(
        db.String(20), nullable=False, default=CATEGORY_GENERAL, index=True
    )
    is_pinned = db.Column(db.Boolean, nullable=False, default=False, index=True)

    # Nguoi dang — tro toi Employee (khong phai User) theo hop dong doi E.
    author_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=True, index=True
    )
    author = db.relationship("Employee", foreign_keys=[author_id])

    def __repr__(self):
        return (
            f"<Announcement id={self.id} category={self.category!r} "
            f"pinned={self.is_pinned} title={self.title!r}>"
        )
