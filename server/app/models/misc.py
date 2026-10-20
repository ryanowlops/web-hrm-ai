"""Mo hinh phu: Notification, Setting (cau hinh he thong), AuditLog.

Theo A7: settings la bang key -> value JSON (gio lam viec, ty le bao hiem,
ngay cong chuan, han muc AI...). AuditLog ghi vet thao tac nhay cam
(xem/xuat luong, duyet don, phan tich CV...) phuc vu bao mat B8 —
KHONG ghi mat khau/token/noi dung CV vao detail.
"""
from app.extensions import db
from app.models.users import TimestampMixin


class Notification(TimestampMixin, db.Model):
    __tablename__ = "notifications"
    __table_args__ = (
        db.Index("ix_notifications_user_read", "user_id", "is_read"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    type = db.Column(db.String(50), nullable=False)  # leave_approved, payroll_locked...
    title = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, nullable=True)
    is_read = db.Column(db.Boolean, nullable=False, default=False)
    related_type = db.Column(db.String(50), nullable=True)  # leave_request, payroll_period...
    related_id = db.Column(db.Integer, nullable=True)

    user = db.relationship("User", back_populates="notifications")

    def __repr__(self):
        return f"<Notification id={self.id} user_id={self.user_id} type={self.type!r}>"


class Setting(TimestampMixin, db.Model):
    __tablename__ = "settings"

    # key la khoa chinh (khong co id rieng) — dung Setting.get_value/set_value.
    key = db.Column(db.String(100), primary_key=True)
    value = db.Column(db.JSON, nullable=True)

    @classmethod
    def get_value(cls, key, default=None):
        row = db.session.get(cls, key)
        return row.value if row is not None else default

    @classmethod
    def set_value(cls, key, value):
        row = db.session.get(cls, key)
        if row is None:
            row = cls(key=key, value=value)
            db.session.add(row)
        else:
            row.value = value
        return row

    def __repr__(self):
        return f"<Setting key={self.key!r}>"


class AuditLog(TimestampMixin, db.Model):
    __tablename__ = "audit_logs"
    __table_args__ = (
        db.Index("ix_audit_logs_user_created", "user_id", "created_at"),
        db.Index("ix_audit_logs_entity", "entity_type", "entity_id"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True, index=True
    )
    action = db.Column(db.String(80), nullable=False)  # payroll.lock, leave.approve...
    entity_type = db.Column(db.String(50), nullable=True)  # payroll_period, leave_request...
    entity_id = db.Column(db.Integer, nullable=True)
    detail = db.Column(db.JSON, nullable=True)  # chi metadata, khong chua du lieu nhay cam
    ip_address = db.Column(db.String(45), nullable=True)

    user = db.relationship("User", back_populates="audit_logs")

    def __repr__(self):
        return f"<AuditLog id={self.id} action={self.action!r} user_id={self.user_id}>"
