"""Seed dữ liệu mẫu cho Web HRM AI (chỉ dùng cho dev/demo local).

Chạy:  python seed.py
Tạo: bảng DB (create_all), loại nghỉ mặc định, 2 phòng ban, nhân viên mẫu,
hợp đồng, và 4 tài khoản demo theo 4 vai trò:

    admin@hrm.local    / Admin@123     (Admin)
    hr@hrm.local       / Hr@12345      (HR)
    manager@hrm.local  / Manager@123   (Trưởng phòng Kinh doanh)
    employee@hrm.local / Employee@123  (Nhân viên)

Đây là mật khẩu MẪU cho môi trường demo — tuyệt đối không dùng ở production.
Script chạy lại nhiều lần an toàn: đã có dữ liệu thì không tạo trùng.
"""
from datetime import date, timedelta

from werkzeug.security import generate_password_hash

from app import create_app
from app.extensions import db
from app.models import (
    Contract,
    Department,
    Employee,
    LeaveBalance,
    LeaveType,
    Position,
    User,
)

app = create_app()

DEMO_USERS = [
    ("admin@hrm.local", "Admin@123", "Quản trị viên", "admin", None),
    ("hr@hrm.local", "Hr@12345", "Nguyễn Thu Hà", "hr", "NV0002"),
    ("manager@hrm.local", "Manager@123", "Trần Văn Minh", "manager", "NV0001"),
    ("employee@hrm.local", "Employee@123", "Phạm Thị Lan", "employee", "NV0003"),
]


def main() -> None:
    with app.app_context():
        db.create_all()

        # Loại nghỉ mặc định
        leave_types = {}
        for name, paid, quota in [
            ("Phép năm", True, 12),
            ("Nghỉ ốm", True, 5),
            ("Nghỉ không lương", False, 0),
        ]:
            lt = LeaveType.query.filter_by(name=name).first()
            if lt is None:
                lt = LeaveType(name=name, paid=paid, annual_quota_days=quota)
                db.session.add(lt)
            leave_types[name] = lt
        db.session.flush()

        # Phòng ban + chức vụ
        kd = Department.query.filter_by(name="Kinh doanh").first()
        if kd is None:
            kd = Department(name="Kinh doanh", description="Phòng Kinh doanh")
            db.session.add(kd)
        kt = Department.query.filter_by(name="Kỹ thuật").first()
        if kt is None:
            kt = Department(name="Kỹ thuật", description="Phòng Kỹ thuật")
            db.session.add(kt)
        db.session.flush()

        def get_position(title, dept):
            pos = Position.query.filter_by(title=title, department_id=dept.id).first()
            if pos is None:
                pos = Position(title=title, department_id=dept.id)
                db.session.add(pos)
                db.session.flush()
            return pos

        pos_manager = get_position("Trưởng phòng", kd)
        pos_hr = get_position("Chuyên viên nhân sự", kt)
        pos_staff = get_position("Nhân viên kinh doanh", kd)

        # Nhân viên mẫu
        employees = {}
        samples = [
            ("NV0001", "Trần Văn Minh", "manager@hrm.local", kd, pos_manager, None),
            ("NV0002", "Nguyễn Thu Hà", "hr@hrm.local", kt, pos_hr, None),
            ("NV0003", "Phạm Thị Lan", "employee@hrm.local", kd, pos_staff, "NV0001"),
        ]
        for code, name, email, dept, pos, mgr_code in samples:
            emp = Employee.query.filter_by(code=code).first()
            if emp is None:
                emp = Employee(
                    code=code,
                    full_name=name,
                    email=email,
                    phone="090000000" + code[-1],
                    department_id=dept.id,
                    position_id=pos.id,
                    start_date=date(2024, 1, 15),
                    status="working",
                )
                db.session.add(emp)
            employees[code] = emp
        db.session.flush()
        for code, name, email, dept, pos, mgr_code in samples:
            if mgr_code and employees.get(mgr_code):
                employees[code].manager_id = employees[mgr_code].id
        kd.manager_id = employees["NV0001"].id

        # Hợp đồng mẫu (lương cơ bản + phụ cấp) nếu chưa có
        for code, salary, allowance in [
            ("NV0001", 25_000_000, 2_000_000),
            ("NV0002", 15_000_000, 1_000_000),
            ("NV0003", 12_000_000, 1_000_000),
        ]:
            emp = employees[code]
            exists = Contract.query.filter_by(employee_id=emp.id, status="active").first()
            if exists is None:
                db.session.add(
                    Contract(
                        employee_id=emp.id,
                        contract_type="Không xác định thời hạn",
                        start_date=date(2024, 1, 15),
                        end_date=date.today() + timedelta(days=400),
                        base_salary=salary,
                        allowance=allowance,
                        status="active",
                    )
                )

        # Số dư phép năm nay
        year = date.today().year
        annual = leave_types["Phép năm"]
        for emp in employees.values():
            bal = LeaveBalance.query.filter_by(
                employee_id=emp.id, year=year, leave_type_id=annual.id
            ).first()
            if bal is None:
                db.session.add(
                    LeaveBalance(
                        employee_id=emp.id,
                        year=year,
                        leave_type_id=annual.id,
                        total_days=annual.annual_quota_days,
                        used_days=0,
                    )
                )

        # Tài khoản demo
        for email, password, full_name, role, emp_code in DEMO_USERS:
            if User.query.filter_by(email=email).first() is not None:
                continue
            db.session.add(
                User(
                    email=email,
                    password_hash=generate_password_hash(password),
                    full_name=full_name,
                    role=role,
                    is_active=True,
                    employee_id=employees[emp_code].id if emp_code else None,
                )
            )

        db.session.commit()
        print("Seed xong: 4 tài khoản demo, 2 phòng ban, 3 nhân viên mẫu.")
        print("Đăng nhập mẫu: admin@hrm.local / Admin@123")


if __name__ == "__main__":
    main()
