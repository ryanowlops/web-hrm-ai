"""Seed dữ liệu mẫu cho Web HRM AI (chỉ dùng cho dev/demo local).

Chạy:  python seed.py
Tạo: bảng DB (create_all), loại nghỉ mặc định, 2 phòng ban, nhân viên mẫu,
hợp đồng, và 4 tài khoản demo theo 4 vai trò:

    admin@hrm.local    / Admin@123     (Admin)
    hr@hrm.local       / Hr@12345      (HR)
    manager@hrm.local  / Manager@123   (Trưởng phòng Kinh doanh)
    employee@hrm.local / Employee@123  (Nhân viên)

Thêm phòng Nhân sự với 5 nhân viên HR (NV0006–NV0010), mỗi người một tài
khoản role "hr", mật khẩu chung Hr@12345: hang.pt@ (Trưởng phòng nhân sự),
tuan.vm@ (tuyển dụng), linh.dn@ (nhân sự), bao.bq@ (C&B), tam.ht@ (đào tạo)
— hậu tố đầy đủ @hrm.local.

Đây là mật khẩu MẪU cho môi trường demo — tuyệt đối không dùng ở production.
Script chạy lại nhiều lần an toàn: đã có dữ liệu thì không tạo trùng.
"""
from datetime import date, datetime, time, timedelta

from werkzeug.security import generate_password_hash

from app import create_app
from app.extensions import db
from app.models import (
    Announcement,
    Asset,
    AssetAssignment,
    Contract,
    Course,
    CourseEnrollment,
    Department,
    Employee,
    GoalCheckin,
    KeyResult,
    LeaveBalance,
    LeaveType,
    Objective,
    OnboardingPlan,
    OnboardingTask,
    OnboardingTemplate,
    OnboardingTemplateTask,
    PerformanceCycle,
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
        pos_dev = get_position("Kỹ sư phần mềm", kt)

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

        # Nhân viên mới nhất (đi làm gần đây) — chủ kế hoạch onboarding mẫu.
        new_hire = Employee.query.filter_by(code="NV0004").first()
        if new_hire is None:
            new_hire = Employee(
                code="NV0004",
                full_name="Lê Văn Đức",
                email="duc.lv@hrm.local",
                phone="0900000004",
                department_id=kt.id,
                position_id=pos_dev.id,
                start_date=date.today() - timedelta(days=5),
                status="working",
            )
            db.session.add(new_hire)
            db.session.flush()
        new_hire.manager_id = employees["NV0002"].id
        employees["NV0004"] = new_hire

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

        # ------------------------------------------------------------------
        # Dữ liệu mẫu đợt mở rộng v2 (Performance / Onboarding / Assets /
        # Training / Announcements) — cùng nguyên tắc: có rồi thì không tạo lại.
        # ------------------------------------------------------------------
        emp_manager = employees["NV0001"]
        emp_hr = employees["NV0002"]
        emp_staff = employees["NV0003"]

        def as_dt(d):
            """date -> datetime 09:00 cho các cột DateTime (assigned_at/completed_at)."""
            return datetime.combine(d, time(9, 0))

        # --- Performance: 1 chu kỳ đang active của quý hiện tại ---
        today = date.today()
        quarter = (today.month - 1) // 3 + 1
        cycle_start = date(today.year, 3 * (quarter - 1) + 1, 1)
        if quarter == 4:
            cycle_end = date(today.year, 12, 31)
        else:
            cycle_end = date(today.year, 3 * quarter + 1, 1) - timedelta(days=1)
        cycle_name = f"Q{quarter}/{today.year}"
        cycle = PerformanceCycle.query.filter_by(name=cycle_name).first()
        if cycle is None:
            cycle = PerformanceCycle(
                name=cycle_name,
                start_date=cycle_start,
                end_date=cycle_end,
                status="active",
            )
            db.session.add(cycle)
            db.session.flush()

        # 2 Objective cho nhân viên mẫu NV0003, mỗi Objective 2-3 KR.
        objective_samples = [
            (
                "Tăng doanh số bán hàng quý",
                "Đạt và vượt chỉ tiêu doanh số cá nhân trong quý.",
                [
                    ("Doanh thu cá nhân (triệu VND)", "triệu VND", 500, 320, 50),
                    ("Số khách hàng mới", "khách hàng", 20, 13, 30),
                    ("Tỉ lệ chốt đơn (%)", "%", 30, 24, 20),
                ],
            ),
            (
                "Nâng cao chất lượng chăm sóc khách hàng",
                "Giữ chân khách hàng cũ và giảm phản hồi tiêu cực.",
                [
                    ("Điểm hài lòng khách hàng (CSAT)", "điểm", 90, 84, 60),
                    ("Tỉ lệ khách quay lại (%)", "%", 40, 31, 40),
                ],
            ),
        ]
        for obj_title, obj_desc, krs in objective_samples:
            obj = Objective.query.filter_by(
                cycle_id=cycle.id, employee_id=emp_staff.id, title=obj_title
            ).first()
            if obj is None:
                obj = Objective(
                    cycle_id=cycle.id,
                    employee_id=emp_staff.id,
                    department_id=kd.id,
                    title=obj_title,
                    description=obj_desc,
                    weight=1,
                    status="active",
                    created_by=emp_manager.id,
                )
                db.session.add(obj)
                db.session.flush()
            for kr_title, unit, target, current, weight in krs:
                kr = KeyResult.query.filter_by(
                    objective_id=obj.id, title=kr_title
                ).first()
                if kr is None:
                    kr = KeyResult(
                        objective_id=obj.id,
                        title=kr_title,
                        unit=unit,
                        target_value=target,
                        current_value=current,
                        weight=weight,
                        direction="increase",
                    )
                    db.session.add(kr)
                    db.session.flush()
                # Vài check-in mẫu dẫn tới giá trị hiện tại của KR.
                if GoalCheckin.query.filter_by(key_result_id=kr.id).count() == 0:
                    step1 = round(current * 0.4)
                    step2 = round(current * 0.75)
                    for old, new in [(0, step1), (step1, step2), (step2, current)]:
                        db.session.add(
                            GoalCheckin(
                                key_result_id=kr.id,
                                author_id=emp_staff.id,
                                old_value=old,
                                new_value=new,
                                note="Cập nhật tiến độ mẫu (seed).",
                            )
                        )
            db.session.flush()

        # --- Onboarding: template chung + template phòng Kỹ thuật ---
        general_tasks = [
            ("Tạo tài khoản hệ thống + email công ty", "hr", -1, "task", 1),
            ("Chuẩn bị máy tính & chỗ ngồi", "it", -1, "task", 2),
            ("Nộp CCCD, bằng cấp, ảnh thẻ", "employee", 0, "document", 3),
            ("Ký hợp đồng thử việc", "hr", 0, "document", 4),
            ("Đọc quy chế nội bộ & hỏi chatbot KB", "employee", 0, "task", 5),
            ("Gặp Manager: nhận mục tiêu thử việc", "manager", 3, "meeting", 6),
            ("Buddy hướng dẫn công việc & team", "buddy", 5, "task", 7),
            ("Hoàn thành đào tạo hội nhập", "employee", 7, "training", 8),
            ("Đánh giá kết thúc thử việc", "manager", 60, "meeting", 9),
        ]

        def get_template(name, dept, tasks):
            tpl = OnboardingTemplate.query.filter_by(name=name).first()
            if tpl is None:
                tpl = OnboardingTemplate(
                    name=name,
                    department_id=dept.id if dept else None,
                    position_id=None,
                    is_active=True,
                )
                db.session.add(tpl)
                db.session.flush()
            for title, role, offset, task_type, order in tasks:
                exists = OnboardingTemplateTask.query.filter_by(
                    template_id=tpl.id, title=title
                ).first()
                if exists is None:
                    db.session.add(
                        OnboardingTemplateTask(
                            template_id=tpl.id,
                            title=title,
                            description=None,
                            assignee_role=role,
                            due_offset_days=offset,
                            task_type=task_type,
                            sort_order=order,
                        )
                    )
            db.session.flush()
            return tpl

        tpl_general = get_template("Hội nhập tiêu chuẩn", None, general_tasks)
        tpl_tech = get_template(
            "Hội nhập phòng Kỹ thuật",
            kt,
            general_tasks
            + [
                ("Cài đặt môi trường phát triển & cấp quyền repo", "it", 1, "task", 10),
                ("Review quy trình Git & CI/CD của team", "buddy", 4, "training", 11),
            ],
        )

        # 1 plan cho nhân viên mới nhất (NV0004): ~40% xong, 1 task quá hạn.
        plan = OnboardingPlan.query.filter_by(employee_id=new_hire.id).first()
        if plan is None:
            plan = OnboardingPlan(
                employee_id=new_hire.id,
                template_id=tpl_tech.id,
                start_date=new_hire.start_date or (today - timedelta(days=5)),
                status="in_progress",
            )
            db.session.add(plan)
            db.session.flush()
            role_owner = {
                "hr": emp_hr,
                "manager": emp_hr,  # NV0002 là quản lý trực tiếp của NV0004
                "it": emp_hr,
                "buddy": emp_staff,
                "employee": new_hire,
            }
            plan_task_status = {
                "Tạo tài khoản hệ thống + email công ty": "done",
                "Chuẩn bị máy tính & chỗ ngồi": "done",
                "Nộp CCCD, bằng cấp, ảnh thẻ": "verified",
                "Ký hợp đồng thử việc": "verified",
                "Đọc quy chế nội bộ & hỏi chatbot KB": "overdue",
                "Gặp Manager: nhận mục tiêu thử việc": "in_progress",
            }
            tech_template_tasks = (
                OnboardingTemplateTask.query.filter_by(template_id=tpl_tech.id)
                .order_by(OnboardingTemplateTask.sort_order)
                .all()
            )
            for tpl_task in tech_template_tasks:
                title = tpl_task.title
                role = tpl_task.assignee_role
                offset = tpl_task.due_offset_days
                task_type = tpl_task.task_type
                owner = role_owner.get(role)
                status = plan_task_status.get(title, "pending")
                due = plan.start_date + timedelta(days=offset)
                db.session.add(
                    OnboardingTask(
                        plan_id=plan.id,
                        title=title,
                        description=None,
                        assignee_id=owner.id if owner else None,
                        assignee_role=role,
                        due_date=due,
                        task_type=task_type,
                        status=status,
                        completed_at=(
                            as_dt(plan.start_date + timedelta(days=max(offset, 0)))
                            if status in ("done", "verified")
                            else None
                        ),
                        completed_by=owner.id if owner and status in ("done", "verified") else None,
                        note=None,
                    )
                )
            db.session.flush()

        # --- Assets: 6 tài sản, 3 đã cấp phát (assignment đang active) ---
        asset_samples = [
            ("TS0001", "Laptop Dell Latitude 5440", "laptop", "DL5440-0001", "assigned", emp_manager),
            ("TS0002", "Laptop MacBook Pro 14 M3", "laptop", "MBP14-0002", "assigned", emp_staff),
            ("TS0003", "Màn hình Dell P2422H 24 inch", "monitor", "DLP24-0003", "assigned", emp_hr),
            ("TS0004", "Chuột Logitech MX Master 3S", "accessory", "LG-MX3S-0004", "available", None),
            ("TS0005", "Bàn phím cơ Keychron K8", "accessory", "KC-K8-0005", "available", None),
            ("TS0006", "Laptop HP ProBook 440 G10", "laptop", "HP440-0006", "maintenance", None),
        ]
        for code, name, category, serial, status, holder in asset_samples:
            asset = Asset.query.filter_by(code=code).first()
            if asset is None:
                asset = Asset(
                    code=code,
                    name=name,
                    category=category,
                    serial=serial,
                    status=status,
                    purchase_date=date(2024, 6, 1),
                    notes=None,
                )
                db.session.add(asset)
                db.session.flush()
            if holder is not None:
                assignment = AssetAssignment.query.filter_by(
                    asset_id=asset.id, employee_id=holder.id, status="active"
                ).first()
                if assignment is None:
                    db.session.add(
                        AssetAssignment(
                            asset_id=asset.id,
                            employee_id=holder.id,
                            assigned_at=as_dt(today - timedelta(days=30)),
                            returned_at=None,
                            status="active",
                            note="Cấp phát mẫu (seed).",
                        )
                    )
        db.session.flush()

        # --- Training: 3 khoá học + vài enrollment ---
        course_samples = [
            ("An toàn thông tin cơ bản", "Bắt buộc cho toàn bộ nhân viên.", "Tuân thủ", 2, True),
            ("Kỹ năng giao tiếp & làm việc nhóm", "Khoá mềm cho nhân viên mới.", "Kỹ năng mềm", 4, False),
            ("Quy trình bán hàng B2B", "Quy trình chuẩn của phòng Kinh doanh.", "Nghiệp vụ", 6, False),
        ]
        courses = {}
        for title, desc, category, hours, mandatory in course_samples:
            course = Course.query.filter_by(title=title).first()
            if course is None:
                course = Course(
                    title=title,
                    description=desc,
                    category=category,
                    duration_hours=hours,
                    is_mandatory=mandatory,
                    is_active=True,
                )
                db.session.add(course)
                db.session.flush()
            courses[title] = course

        enrollment_samples = [
            ("An toàn thông tin cơ bản", emp_staff, "completed", 100),
            ("An toàn thông tin cơ bản", emp_manager, "completed", 100),
            ("Kỹ năng giao tiếp & làm việc nhóm", emp_staff, "in_progress", 40),
            ("Quy trình bán hàng B2B", emp_staff, "in_progress", 65),
            ("An toàn thông tin cơ bản", new_hire, "assigned", 0),
        ]
        for course_title, emp, status, progress in enrollment_samples:
            course = courses[course_title]
            exists = CourseEnrollment.query.filter_by(
                course_id=course.id, employee_id=emp.id
            ).first()
            if exists is None:
                db.session.add(
                    CourseEnrollment(
                        course_id=course.id,
                        employee_id=emp.id,
                        status=status,
                        progress=progress,
                        enrolled_by=emp_hr.id,
                        completed_at=as_dt(today - timedelta(days=2)) if status == "completed" else None,
                    )
                )
        db.session.flush()

        # --- Announcements: 3 thông báo, 1 ghim ---
        announcement_samples = [
            (
                "Chính sách làm việc linh hoạt từ tháng này",
                "Công ty áp dụng chính sách làm việc linh hoạt: mỗi tuần được chọn 1 ngày làm việc từ xa, đăng ký trước với quản lý trực tiếp.",
                "policy",
                True,
            ),
            (
                "Lịch nghỉ lễ sắp tới",
                "Phòng Nhân sự thông báo lịch nghỉ lễ chính thức và hướng dẫn đăng ký nghỉ phép bù trên hệ thống.",
                "general",
                False,
            ),
            (
                "Team building quý này",
                "Chương trình team building quý này sẽ tổ chức vào cuối tháng; chi tiết địa điểm và đăng ký sẽ được cập nhật sớm.",
                "event",
                False,
            ),
        ]
        for title, content, category, pinned in announcement_samples:
            exists = Announcement.query.filter_by(title=title).first()
            if exists is None:
                db.session.add(
                    Announcement(
                        title=title,
                        content=content,
                        category=category,
                        is_pinned=pinned,
                        author_id=emp_hr.id,
                    )
                )
        db.session.flush()

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

        db.session.flush()

        # --- Đội ngũ HR mở rộng: phòng Nhân sự + 5 nhân viên HR, mỗi người
        # một tài khoản đăng nhập role "hr" (mật khẩu chung Hr@12345 như tài
        # khoản HR mẫu). Idempotent theo email trước, mã NV sau — an toàn kể
        # cả khi DB đã có nhân viên trùng mã do tạo qua giao diện.
        hr_dept = Department.query.filter_by(name="Nhân sự").first()
        if hr_dept is None:
            hr_dept = Department(name="Nhân sự", description="Phòng Nhân sự")
            db.session.add(hr_dept)
            db.session.flush()

        hr_team = [
            # mã, họ tên, email, chức vụ, lương cơ bản, phụ cấp, ngày vào, quản lý (email)
            ("NV0006", "Phạm Thu Hằng", "hang.pt@hrm.local", "Trưởng phòng nhân sự", 24_000_000, 2_000_000, date(2023, 3, 1), None),
            ("NV0007", "Vũ Minh Tuấn", "tuan.vm@hrm.local", "Chuyên viên tuyển dụng", 14_000_000, 1_000_000, date(2023, 7, 17), "hang.pt@hrm.local"),
            ("NV0008", "Đặng Ngọc Linh", "linh.dn@hrm.local", "Chuyên viên nhân sự", 13_500_000, 1_000_000, date(2024, 2, 19), "hang.pt@hrm.local"),
            ("NV0009", "Bùi Quốc Bảo", "bao.bq@hrm.local", "Chuyên viên C&B", 14_500_000, 1_000_000, date(2023, 11, 6), "hang.pt@hrm.local"),
            ("NV0010", "Hồ Thanh Tâm", "tam.ht@hrm.local", "Chuyên viên đào tạo", 13_000_000, 1_000_000, date(2024, 5, 13), "hang.pt@hrm.local"),
        ]
        hr_employees = {}
        for code, name, email, title, salary, allowance, start, _mgr in hr_team:
            emp = (
                Employee.query.filter_by(email=email).first()
                or Employee.query.filter_by(code=code).first()
            )
            if emp is None:
                emp = Employee(
                    code=code,
                    full_name=name,
                    email=email,
                    phone="09000000" + code[-2:],
                    department_id=hr_dept.id,
                    position_id=get_position(title, hr_dept).id,
                    start_date=start,
                    status="working",
                )
                db.session.add(emp)
                db.session.flush()
            hr_employees[email] = emp
            if (
                Contract.query.filter_by(employee_id=emp.id, status="active").first()
                is None
            ):
                db.session.add(
                    Contract(
                        employee_id=emp.id,
                        contract_type="Không xác định thời hạn",
                        start_date=start,
                        end_date=date.today() + timedelta(days=400),
                        base_salary=salary,
                        allowance=allowance,
                        status="active",
                    )
                )
            if (
                LeaveBalance.query.filter_by(
                    employee_id=emp.id, year=year, leave_type_id=annual.id
                ).first()
                is None
            ):
                db.session.add(
                    LeaveBalance(
                        employee_id=emp.id,
                        year=year,
                        leave_type_id=annual.id,
                        total_days=annual.annual_quota_days,
                        used_days=0,
                    )
                )
            if User.query.filter_by(email=email).first() is None:
                db.session.add(
                    User(
                        email=email,
                        password_hash=generate_password_hash("Hr@12345"),
                        full_name=name,
                        role="hr",
                        is_active=True,
                        employee_id=emp.id,
                    )
                )
        db.session.flush()
        for _code, _name, email, _title, _sal, _allow, _start, mgr_email in hr_team:
            if mgr_email and hr_employees.get(mgr_email):
                hr_employees[email].manager_id = hr_employees[mgr_email].id
        if hr_employees.get("hang.pt@hrm.local"):
            hr_dept.manager_id = hr_employees["hang.pt@hrm.local"].id
        db.session.flush()

        # Dữ liệu demo mở rộng v3 — mỗi module tự seed idempotent (không tự
        # commit; chạy sau khi đã có nhân viên + tài khoản demo ở trên).
        from app.blueprints.documents.seed_demo import seed_demo as seed_documents
        from app.blueprints.engagement.seed_demo import seed_demo as seed_engagement
        from app.blueprints.offboarding.seed_demo import seed_demo as seed_offboarding
        from app.blueprints.shifts.seed_demo import seed_demo as seed_shifts

        seed_shifts()
        seed_documents()
        seed_engagement()
        seed_offboarding()

        # Dữ liệu demo mở rộng v4 — bảng tin chạy sau engagement (dùng user
        # demo sẵn có, tự bổ sung tài khoản cho NV0004); game hoá chạy cuối
        # vì đồng bộ điểm đọc kudo + đào tạo đã seed ở trên.
        from app.blueprints.feed.seed_demo import seed_demo as seed_feed
        from app.blueprints.gamification.seed_demo import seed_demo as seed_gamification

        seed_feed()
        seed_gamification()

        # Dữ liệu demo mở rộng v5 — bản đồ năng lực (chạy sau offboarding
        # để NV0005 cũng có mức kỹ năng; seed tự bỏ qua mã NV chưa có).
        from app.blueprints.skills.seed_demo import seed_demo as seed_skills

        seed_skills()

        # Tin tuyển demo công khai — trang /jobs, AI kiểm tra CV và phỏng
        # vấn thử cần ít nhất 1 vị trí đang mở trên mọi bản cài mới
        # (idempotent theo tiêu đề).
        from datetime import date as _date

        from app.models.recruitment import JobPosting as _JobPosting

        _demo_job_title = "Lập trình viên Python (Flask + React)"
        if (
            _JobPosting.query.filter_by(title=_demo_job_title).first()
            is None
        ):
            _tech_dept = Department.query.filter_by(name="Kỹ thuật").first()
            db.session.add(
                _JobPosting(
                    title=_demo_job_title,
                    department_id=_tech_dept.id if _tech_dept else None,
                    description=(
                        "Phát triển API Flask cho hệ thống HRM, làm việc với "
                        "PostgreSQL, viết unit test, phối hợp frontend React "
                        "JS. Tham gia thiết kế kiến trúc hệ thống, tối ưu "
                        "hiệu năng truy vấn, xây dựng quy trình CI/CD và "
                        "review code cùng nhóm."
                    ),
                    requirements=(
                        "Kinh nghiệm lập trình Python từ 1 năm, thành thạo "
                        "Flask hoặc Django, hiểu REST API, PostgreSQL, Git. "
                        "Biết React/JavaScript là lợi thế. Có kinh nghiệm "
                        "viết kiểm thử tự động (pytest), Docker và CI/CD. "
                        "Kỹ năng làm việc nhóm, giao tiếp tốt."
                    ),
                    quantity=1,
                    deadline=_date(2026, 11, 30),
                    status=_JobPosting.STATUS_OPEN,
                )
            )

        db.session.commit()
        print("Seed xong: 4 tài khoản demo, 2 phòng ban, 4 nhân viên mẫu + dữ liệu mở rộng v2 + v3.")
        print("Đăng nhập mẫu: admin@hrm.local / Admin@123")


if __name__ == "__main__":
    main()
