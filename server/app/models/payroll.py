"""Bang luong: PayrollPeriod (ky luong thang) va PayrollItem (dong luong).

Theo A7: payroll_items unique (period_id, employee_id); ky luong co trang
thai draft/locked — khi locked thi khong sua item nua (chan o service).
Toan bo so tien la Integer (VND). workdays_paid dung Float (co nua ngay cong).
`breakdown` JSON luu chi tiet thanh phan de doi chieu lai khi can.
"""
from app.extensions import db
from app.models.users import TimestampMixin


class PayrollPeriod(TimestampMixin, db.Model):
    __tablename__ = "payroll_periods"
    __table_args__ = (
        db.UniqueConstraint("month", "year", name="uq_payroll_period_month_year"),
    )

    STATUS_DRAFT = "draft"
    STATUS_LOCKED = "locked"
    STATUSES = (STATUS_DRAFT, STATUS_LOCKED)

    id = db.Column(db.Integer, primary_key=True)
    month = db.Column(db.Integer, nullable=False)
    year = db.Column(db.Integer, nullable=False)
    standard_workdays = db.Column(db.Float, nullable=False)  # ngay cong chuan cua thang
    status = db.Column(db.String(20), nullable=False, default=STATUS_DRAFT, index=True)
    locked_at = db.Column(db.DateTime, nullable=True)
    locked_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    items = db.relationship(
        "PayrollItem", back_populates="period", cascade="all, delete-orphan"
    )
    locker = db.relationship("User", foreign_keys=[locked_by])

    def __repr__(self):
        return f"<PayrollPeriod id={self.id} {self.month}/{self.year} status={self.status!r}>"


class PayrollItem(TimestampMixin, db.Model):
    __tablename__ = "payroll_items"
    __table_args__ = (
        db.UniqueConstraint("period_id", "employee_id", name="uq_payroll_item_period_emp"),
        db.Index("ix_payroll_items_period_emp", "period_id", "employee_id"),
    )

    id = db.Column(db.Integer, primary_key=True)
    period_id = db.Column(
        db.Integer, db.ForeignKey("payroll_periods.id"), nullable=False, index=True
    )
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    workdays_paid = db.Column(db.Float, nullable=False, default=0.0)  # ngay cong huong luong
    base_salary = db.Column(db.Integer, nullable=False, default=0)  # VND
    allowance = db.Column(db.Integer, nullable=False, default=0)  # VND
    insurance_deduction = db.Column(db.Integer, nullable=False, default=0)  # VND
    other_deduction = db.Column(db.Integer, nullable=False, default=0)  # VND
    total_salary = db.Column(db.Integer, nullable=False, default=0)  # VND, thuc linh
    breakdown = db.Column(db.JSON, nullable=True)  # chi tiet cong thuc/thanh phan

    period = db.relationship("PayrollPeriod", back_populates="items")
    employee = db.relationship("Employee", back_populates="payroll_items")

    def __repr__(self):
        return (
            f"<PayrollItem id={self.id} period_id={self.period_id} "
            f"employee_id={self.employee_id} total={self.total_salary}>"
        )
