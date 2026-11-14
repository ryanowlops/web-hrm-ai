"""Nghi phep: LeaveType, LeaveRequest (duyet 2 cap), LeaveBalance (so du).

Theo A7: leave_balances unique (employee_id, year, leave_type_id);
leave_requests co index (employee_id, status); quyet dinh cua Manager va HR
luu rieng (manager_decision / hr_decision), kem decided_at.
So ngay dung Float vi co nghi nua ngay (0.5).
"""
from app.extensions import db
from app.models.users import TimestampMixin


class LeaveType(TimestampMixin, db.Model):
    __tablename__ = "leave_types"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False, unique=True)  # Phep nam, Om, Khong luong...
    paid = db.Column(db.Boolean, nullable=False, default=True)
    annual_quota_days = db.Column(db.Float, nullable=False, default=12.0)

    requests = db.relationship("LeaveRequest", back_populates="leave_type")
    balances = db.relationship("LeaveBalance", back_populates="leave_type")

    def __repr__(self):
        return f"<LeaveType id={self.id} name={self.name!r} paid={self.paid}>"


class LeaveRequest(TimestampMixin, db.Model):
    __tablename__ = "leave_requests"
    __table_args__ = (
        db.Index("ix_leave_requests_emp_status", "employee_id", "status"),
    )

    STATUS_PENDING = "pending"
    STATUS_MANAGER_APPROVED = "manager_approved"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_CANCELLED = "cancelled"
    STATUSES = (
        STATUS_PENDING,
        STATUS_MANAGER_APPROVED,
        STATUS_APPROVED,
        STATUS_REJECTED,
        STATUS_CANCELLED,
    )

    DECISION_APPROVED = "approved"
    DECISION_REJECTED = "rejected"

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    leave_type_id = db.Column(
        db.Integer, db.ForeignKey("leave_types.id"), nullable=False, index=True
    )
    from_date = db.Column(db.Date, nullable=False)
    to_date = db.Column(db.Date, nullable=False)
    days_count = db.Column(db.Float, nullable=False)
    reason = db.Column(db.Text, nullable=True)
    status = db.Column(
        db.String(20), nullable=False, default=STATUS_PENDING, index=True
    )
    manager_decision = db.Column(db.String(20), nullable=True)  # approved / rejected
    hr_decision = db.Column(db.String(20), nullable=True)  # approved / rejected
    manager_note = db.Column(db.String(255), nullable=True)
    hr_note = db.Column(db.String(255), nullable=True)
    decided_at = db.Column(db.DateTime, nullable=True)

    employee = db.relationship("Employee", back_populates="leave_requests")
    leave_type = db.relationship("LeaveType", back_populates="requests")

    def __repr__(self):
        return (
            f"<LeaveRequest id={self.id} employee_id={self.employee_id} "
            f"status={self.status!r}>"
        )


class LeaveBalance(TimestampMixin, db.Model):
    __tablename__ = "leave_balances"
    __table_args__ = (
        db.UniqueConstraint(
            "employee_id", "year", "leave_type_id", name="uq_leave_balance_emp_year_type"
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    leave_type_id = db.Column(
        db.Integer, db.ForeignKey("leave_types.id"), nullable=False, index=True
    )
    year = db.Column(db.Integer, nullable=False, index=True)
    total_days = db.Column(db.Float, nullable=False, default=0.0)
    used_days = db.Column(db.Float, nullable=False, default=0.0)

    employee = db.relationship("Employee", back_populates="leave_balances")
    leave_type = db.relationship("LeaveType", back_populates="balances")

    @property
    def remaining_days(self):
        return self.total_days - self.used_days

    def __repr__(self):
        return (
            f"<LeaveBalance id={self.id} employee_id={self.employee_id} "
            f"year={self.year} used={self.used_days}/{self.total_days}>"
        )


class LeaveCarryover(TimestampMixin, db.Model):
    """Phep nam thua duoc cong don sang nam sau (1 row / nhan vien / loai phep /
    nam goc). Phep cong don song rieng o bang nay — KHONG cong vao
    LeaveBalance.total_days cua nam sau; han dung qua expires_on thi het
    gia tri (khong tinh vao available, khong bi tru, khong duoc hoan).

    Unique (employee_id, leave_type_id, from_year) lam chot chan cuoi cho
    tinh idempotent cua rollover (chay 2 lan cung nam khong tao trung).
    """

    __tablename__ = "leave_carryovers"
    __table_args__ = (
        db.UniqueConstraint(
            "employee_id",
            "leave_type_id",
            "from_year",
            name="uq_leave_carryover_emp_type_year",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    leave_type_id = db.Column(
        db.Integer, db.ForeignKey("leave_types.id"), nullable=False, index=True
    )
    # Nam phep thua duoc cong don (VD phep thua 2025 cong sang 2026).
    from_year = db.Column(db.Integer, nullable=False, index=True)
    # So ngay cong don luc tao (sau khi ap dung gioi han policy).
    initial_days = db.Column(db.Float, nullable=False, default=0.0)
    # So ngay cong don con lai (giam khi dung, tang khi hoan, khong vuot initial).
    days_remaining = db.Column(db.Float, nullable=False, default=0.0)
    # Han dung (VD 31/03 nam sau theo policy mac dinh).
    expires_on = db.Column(db.Date, nullable=False, index=True)

    def __repr__(self):
        return (
            f"<LeaveCarryover id={self.id} employee_id={self.employee_id} "
            f"from_year={self.from_year} remaining={self.days_remaining}/"
            f"{self.initial_days} expires={self.expires_on}>"
        )
