"""User model — tai khoan dang nhap he thong.

Theo docs/architecture.md A7: bang `users` quan he 1-1 voi `employees`
(mot nhan vien co toi da mot tai khoan dang nhap). Phan quyen theo `role`.
"""
from datetime import datetime, timezone

from app.extensions import db


def utcnow():
    """Thoi gian hien tai (UTC) — dung lam default cho created_at/updated_at."""
    return datetime.now(timezone.utc)


class TimestampMixin:
    """Mixin bo sung created_at / updated_at cho moi bang (quy uoc A7)."""

    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )


class User(TimestampMixin, db.Model):
    __tablename__ = "users"

    ROLE_ADMIN = "admin"
    ROLE_HR = "hr"
    ROLE_MANAGER = "manager"
    ROLE_EMPLOYEE = "employee"
    ROLES = (ROLE_ADMIN, ROLE_HR, ROLE_MANAGER, ROLE_EMPLOYEE)

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(20), nullable=False, default=ROLE_EMPLOYEE, index=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    # 1-1 voi employees; nullable vi tai khoan Admin/HR co the khong gan nhan vien.
    # use_alter: employees va users tham chieu lan nhau (FK vong) -> tao FK sau.
    employee_id = db.Column(
        db.Integer,
        db.ForeignKey("employees.id", name="fk_user_employee", use_alter=True),
        nullable=True,
        unique=True,
    )

    employee = db.relationship(
        "Employee", back_populates="user", foreign_keys=[employee_id], uselist=False
    )
    chat_logs = db.relationship(
        "ChatLog", back_populates="user", cascade="all, delete-orphan"
    )
    notifications = db.relationship(
        "Notification", back_populates="user", cascade="all, delete-orphan"
    )
    audit_logs = db.relationship("AuditLog", back_populates="user")

    def __repr__(self):
        return f"<User id={self.id} email={self.email!r} role={self.role!r}>"
