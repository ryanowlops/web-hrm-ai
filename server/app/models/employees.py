"""Ho so nhan vien (Employee) va hop dong lao dong (Contract).

Theo A7: employees la bang trung tam — N-1 phong ban/chuc vu/quan ly truc
tiep (tu tham chieu), 1-N contracts/attendance/leave/payroll, 1-1 users.
Tien luong luu Integer (VND), khong dung float.
"""
from app.extensions import db
from app.models.users import TimestampMixin


class Employee(TimestampMixin, db.Model):
    __tablename__ = "employees"

    STATUS_WORKING = "working"
    STATUS_ON_LEAVE = "on_leave"
    STATUS_RESIGNED = "resigned"
    STATUSES = (STATUS_WORKING, STATUS_ON_LEAVE, STATUS_RESIGNED)

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(20), nullable=False, unique=True, index=True)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    phone = db.Column(db.String(20), nullable=True)
    date_of_birth = db.Column(db.Date, nullable=True)
    gender = db.Column(db.String(10), nullable=True)  # male / female / other
    address = db.Column(db.String(255), nullable=True)
    avatar_url = db.Column(db.String(500), nullable=True)
    start_date = db.Column(db.Date, nullable=True)
    status = db.Column(
        db.String(20), nullable=False, default=STATUS_WORKING, index=True
    )

    department_id = db.Column(
        db.Integer, db.ForeignKey("departments.id"), nullable=True, index=True
    )
    position_id = db.Column(
        db.Integer, db.ForeignKey("positions.id"), nullable=True, index=True
    )
    # Quan ly truc tiep (tu tham chieu).
    manager_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=True, index=True
    )

    department = db.relationship(
        "Department", back_populates="employees", foreign_keys=[department_id]
    )
    position = db.relationship(
        "Position", back_populates="employees", foreign_keys=[position_id]
    )
    manager = db.relationship(
        "Employee",
        remote_side=[id],
        back_populates="subordinates",
        foreign_keys=[manager_id],
    )
    subordinates = db.relationship(
        "Employee", back_populates="manager", foreign_keys=[manager_id]
    )
    managed_departments = db.relationship(
        "Department",
        back_populates="manager",
        foreign_keys="Department.manager_id",
    )
    user = db.relationship(
        "User",
        back_populates="employee",
        foreign_keys="User.employee_id",
        uselist=False,
    )
    contracts = db.relationship(
        "Contract", back_populates="employee", cascade="all, delete-orphan"
    )
    attendance_records = db.relationship(
        "Attendance", back_populates="employee", cascade="all, delete-orphan"
    )
    leave_requests = db.relationship(
        "LeaveRequest", back_populates="employee", cascade="all, delete-orphan"
    )
    leave_balances = db.relationship(
        "LeaveBalance", back_populates="employee", cascade="all, delete-orphan"
    )
    payroll_items = db.relationship("PayrollItem", back_populates="employee")

    def __repr__(self):
        return f"<Employee id={self.id} code={self.code!r} name={self.full_name!r}>"


class Contract(TimestampMixin, db.Model):
    __tablename__ = "contracts"

    STATUS_ACTIVE = "active"
    STATUS_EXPIRED = "expired"
    STATUS_TERMINATED = "terminated"
    STATUSES = (STATUS_ACTIVE, STATUS_EXPIRED, STATUS_TERMINATED)

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    contract_type = db.Column(db.String(50), nullable=False)  # thu viec / chinh thuc / thoi vu...
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=True)  # null = khong xac dinh thoi han
    base_salary = db.Column(db.Integer, nullable=False, default=0)  # VND/thang
    allowance = db.Column(db.Integer, nullable=False, default=0)  # phu cap VND/thang
    status = db.Column(db.String(20), nullable=False, default=STATUS_ACTIVE, index=True)

    employee = db.relationship("Employee", back_populates="contracts")

    def __repr__(self):
        return f"<Contract id={self.id} employee_id={self.employee_id} status={self.status!r}>"
