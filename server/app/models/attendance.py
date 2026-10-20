"""Cham cong (Attendance) — mot ban ghi cho moi nhan vien / ngay lam viec.

Theo A7: unique (employee_id, work_date); status gom
present / late / absent / on_leave.
"""
from app.extensions import db
from app.models.users import TimestampMixin


class Attendance(TimestampMixin, db.Model):
    __tablename__ = "attendance"
    __table_args__ = (
        db.UniqueConstraint("employee_id", "work_date", name="uq_attendance_emp_date"),
        db.Index("ix_attendance_emp_date", "employee_id", "work_date"),
    )

    STATUS_PRESENT = "present"
    STATUS_LATE = "late"
    STATUS_ABSENT = "absent"
    STATUS_ON_LEAVE = "on_leave"
    STATUSES = (STATUS_PRESENT, STATUS_LATE, STATUS_ABSENT, STATUS_ON_LEAVE)

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    work_date = db.Column(db.Date, nullable=False, index=True)
    check_in_at = db.Column(db.DateTime, nullable=True)
    check_out_at = db.Column(db.DateTime, nullable=True)
    status = db.Column(db.String(20), nullable=False, default=STATUS_PRESENT)
    note = db.Column(db.String(255), nullable=True)
    # Nguoi sua tay ban ghi (HR) — phuc vu truy vet, theo A7.
    edited_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    employee = db.relationship("Employee", back_populates="attendance_records")
    editor = db.relationship("User", foreign_keys=[edited_by])

    def __repr__(self):
        return (
            f"<Attendance id={self.id} employee_id={self.employee_id} "
            f"date={self.work_date} status={self.status!r}>"
        )
