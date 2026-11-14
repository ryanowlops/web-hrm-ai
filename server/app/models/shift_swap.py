"""Đơn đổi ca làm việc (ShiftSwapRequest) — BẢNG MỚI, db.create_all() tạo
tự động, không cần migration.

Một nhân viên (requester) xin đổi ca ngày work_date với một đồng nghiệp
(target). Khi quản lý/HR duyệt, hai ca gán (ShiftAssignment) của hai người
ngày hôm đó được hoán đổi (hoặc chuyển ca nếu chỉ một người có ca gán).
"""
from app.extensions import db
from app.models.users import TimestampMixin


class ShiftSwapRequest(TimestampMixin, db.Model):
    __tablename__ = "shift_swap_requests"
    __table_args__ = (
        db.Index("ix_shift_swap_requester_date", "requester_id", "work_date"),
        db.Index("ix_shift_swap_target_date", "target_id", "work_date"),
        db.Index("ix_shift_swap_status", "status"),
    )

    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_CANCELLED = "cancelled"
    STATUSES = (
        STATUS_PENDING,
        STATUS_APPROVED,
        STATUS_REJECTED,
        STATUS_CANCELLED,
    )

    id = db.Column(db.Integer, primary_key=True)
    requester_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    target_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    work_date = db.Column(db.Date, nullable=False, index=True)
    status = db.Column(
        db.String(20), nullable=False, default=STATUS_PENDING, index=True
    )
    note = db.Column(db.Text, nullable=True)
    decided_by = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True, index=True
    )

    requester = db.relationship(
        "Employee", foreign_keys=[requester_id]
    )
    target = db.relationship("Employee", foreign_keys=[target_id])
    decider = db.relationship("User", foreign_keys=[decided_by])

    def __repr__(self):
        return (
            f"<ShiftSwapRequest id={self.id} "
            f"requester_id={self.requester_id} target_id={self.target_id} "
            f"date={self.work_date} status={self.status!r}>"
        )
