"""Biên bản kỷ luật nhân viên (DisciplinaryRecord) — BẢNG MỚI.

Bảng được db.create_all() tạo tự động (không cần migration) vì model
được đăng ký trong app.models. Một nhân viên có thể có nhiều biên bản;
mỗi biên bản có loại (khiển trách bằng lời / bằng văn bản / cảnh cáo
cuối / đình chỉ), mức độ (nhẹ / trung bình / nghiêm trọng) và trạng thái
(đang hiệu lực / đã giải quyết). Không có xóa — chỉ giải quyết bằng
ghi chú (resolve).
"""
from datetime import date

from app.extensions import db
from app.models.users import TimestampMixin


class DisciplinaryRecord(TimestampMixin, db.Model):
    __tablename__ = "disciplinary_records"

    # Loại kỷ luật.
    TYPE_VERBAL = "verbal"          # Khiển trách bằng lời.
    TYPE_WRITTEN = "written"        # Khiển trách bằng văn bản.
    TYPE_FINAL = "final"            # Cảnh cáo cuối.
    TYPE_SUSPENSION = "suspension"  # Đình chỉ.
    TYPES = (TYPE_VERBAL, TYPE_WRITTEN, TYPE_FINAL, TYPE_SUSPENSION)

    # Mức độ.
    SEVERITY_LOW = "low"
    SEVERITY_MEDIUM = "medium"
    SEVERITY_HIGH = "high"
    SEVERITIES = (SEVERITY_LOW, SEVERITY_MEDIUM, SEVERITY_HIGH)

    # Trạng thái.
    STATUS_ACTIVE = "active"
    STATUS_RESOLVED = "resolved"
    STATUSES = (STATUS_ACTIVE, STATUS_RESOLVED)

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    type = db.Column(db.String(20), nullable=False, index=True)
    severity = db.Column(db.String(20), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    action_taken = db.Column(db.Text, nullable=True)
    # Người lập biên bản — trỏ tới User (nullable: có thể lập bằng seed).
    issued_by = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True, index=True
    )
    issued_date = db.Column(db.Date, nullable=False, default=date.today)
    status = db.Column(
        db.String(20), nullable=False, default=STATUS_ACTIVE, index=True
    )
    resolved_note = db.Column(db.Text, nullable=True)

    employee = db.relationship("Employee")
    issuer = db.relationship("User", foreign_keys=[issued_by])

    def __repr__(self):
        return (
            f"<DisciplinaryRecord id={self.id} employee_id={self.employee_id} "
            f"type={self.type!r} status={self.status!r}>"
        )
