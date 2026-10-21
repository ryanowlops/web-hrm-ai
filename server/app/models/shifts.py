"""Ca lam viec (feature-expansion-v3 muc 1 — doi SHIFTS).

- ShiftDefinition: dinh nghia ca (vd "Ca hanh chinh" 08:00-17:00).
- ShiftAssignment: gan ca cho nhan vien theo tung ngay lam viec,
  UNIQUE(employee_id, work_date) — moi ngay toi da 1 ca.
- OvertimeRequest: don tang ca, duyet 2 cap theo mau leave
  (pending -> manager_approved -> approved, rejected o bat ky cap nao).
- AttendanceCorrection: don giai trinh cham cong, cung may trang thai;
  khi HR duyet thi cap nhat ban ghi Attendance tuong ung.
"""
from app.extensions import db
from app.models.users import TimestampMixin


class TwoLevelApprovalMixin:
    """Truong duyet 2 cap dung chung cho don tang ca / giai trinh.

    Giam sat theo mau LeaveRequest (manager_decision / hr_decision) nhung
    ghi ro nguoi duyet + thoi diem duyet o tung cap.
    """

    STATUS_PENDING = "pending"
    STATUS_MANAGER_APPROVED = "manager_approved"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUSES = (
        STATUS_PENDING,
        STATUS_MANAGER_APPROVED,
        STATUS_APPROVED,
        STATUS_REJECTED,
    )

    status = db.Column(
        db.String(20), nullable=False, default=STATUS_PENDING, index=True
    )
    manager_decision = db.Column(db.String(20), nullable=True)  # approved/rejected
    manager_decided_by = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True
    )
    manager_decided_at = db.Column(db.DateTime, nullable=True)
    manager_note = db.Column(db.String(255), nullable=True)
    hr_decision = db.Column(db.String(20), nullable=True)  # approved/rejected
    hr_decided_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    hr_decided_at = db.Column(db.DateTime, nullable=True)
    hr_note = db.Column(db.String(255), nullable=True)


class ShiftDefinition(TimestampMixin, db.Model):
    __tablename__ = "shift_definitions"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, unique=True)
    start_time = db.Column(db.Time, nullable=False)
    end_time = db.Column(db.Time, nullable=False)
    break_minutes = db.Column(db.Integer, nullable=False, default=60)
    is_overnight = db.Column(db.Boolean, nullable=False, default=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True, index=True)

    assignments = db.relationship(
        "ShiftAssignment", back_populates="shift", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return (
            f"<ShiftDefinition id={self.id} name={self.name!r} "
            f"{self.start_time}-{self.end_time}>"
        )


class ShiftAssignment(TimestampMixin, db.Model):
    __tablename__ = "shift_assignments"
    __table_args__ = (
        db.UniqueConstraint(
            "employee_id", "work_date", name="uq_shift_assignment_emp_date"
        ),
        db.Index("ix_shift_assignment_date", "work_date"),
    )

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    shift_id = db.Column(
        db.Integer, db.ForeignKey("shift_definitions.id"), nullable=False, index=True
    )
    work_date = db.Column(db.Date, nullable=False, index=True)
    note = db.Column(db.String(255), nullable=True)

    employee = db.relationship("Employee")
    shift = db.relationship("ShiftDefinition", back_populates="assignments")

    def __repr__(self):
        return (
            f"<ShiftAssignment id={self.id} employee_id={self.employee_id} "
            f"date={self.work_date} shift_id={self.shift_id}>"
        )


class OvertimeRequest(TwoLevelApprovalMixin, TimestampMixin, db.Model):
    __tablename__ = "overtime_requests"
    __table_args__ = (
        db.Index("ix_overtime_requests_emp_status", "employee_id", "status"),
    )

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    work_date = db.Column(db.Date, nullable=False, index=True)
    hours = db.Column(db.Float, nullable=False)
    reason = db.Column(db.Text, nullable=True)

    employee = db.relationship("Employee")

    def __repr__(self):
        return (
            f"<OvertimeRequest id={self.id} employee_id={self.employee_id} "
            f"status={self.status!r}>"
        )


class AttendanceCorrection(TwoLevelApprovalMixin, TimestampMixin, db.Model):
    __tablename__ = "attendance_corrections"
    __table_args__ = (
        db.Index("ix_attendance_corrections_emp_status", "employee_id", "status"),
    )

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    attendance_id = db.Column(
        db.Integer, db.ForeignKey("attendance.id"), nullable=True, index=True
    )
    work_date = db.Column(db.Date, nullable=False, index=True)
    requested_check_in = db.Column(db.DateTime, nullable=True)
    requested_check_out = db.Column(db.DateTime, nullable=True)
    reason = db.Column(db.Text, nullable=True)

    employee = db.relationship("Employee")
    attendance = db.relationship("Attendance")

    def __repr__(self):
        return (
            f"<AttendanceCorrection id={self.id} employee_id={self.employee_id} "
            f"status={self.status!r}>"
        )
