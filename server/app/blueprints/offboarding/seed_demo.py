"""Seed demo cho module Offboarding (docs/feature-expansion-v3.md muc 3.4).

- Tao nhan vien NV0005 "Do Van Hung" (phong Ky thuat, chuc vu nhu NV0003,
  quan ly nhu NV0003; KHONG tao tai khoan dang nhap — Employee khong bat
  buoc co User).
- 1 tai san laptop dang cap phat active cho NV0005 (chi o muc du lieu
  qua models Asset/AssetAssignment).
- 1 process nghi viec in_progress: ngay lam viec cuoi = cuoi thang hien
  tai; checklist sinh bang DUNG ham services.build_checklist() nen co ca
  task tai san theo tai san tren; 2 task danh dau xong: 'it' + 'knowledge'.

IDEMPOTENT: chay lai khong tao trung (NV0005 / asset code / assignment
active / process in_progress duoc tra cuu truoc). Khong tu commit —
parent seed.py quan ly transaction; chi flush khi can id.
"""

import calendar
from datetime import date, datetime, time, timedelta, timezone

from app.extensions import db
from app.models import Department, Employee, User
from app.models.assets import Asset, AssetAssignment
from app.models.offboarding import OffboardingProcess
from app.blueprints.offboarding import services


def _employee_by_user_email(email):
    user = User.query.filter_by(email=email).first()
    if user is not None and user.employee_id:
        return db.session.get(Employee, user.employee_id)
    return None


def _employee_by_code(code):
    return Employee.query.filter_by(code=code).first()


def seed_demo():
    today = date.today()

    # --- Tai khoan demo lam moc (parent seed.py da tao truoc) -------------
    hr_user = User.query.filter_by(email="hr@hrm.local").first()
    nv0003 = _employee_by_user_email("employee@hrm.local") or _employee_by_code("NV0003")
    nv0001 = _employee_by_user_email("manager@hrm.local") or _employee_by_code("NV0001")

    # --- Phong Ky thuat + chuc vu (theo NV0003) ---------------------------
    department = (
        Department.query.filter(Department.name.ilike("%Kỹ thuật%")).first()
    )
    if department is None and nv0003 is not None:
        department = (
            db.session.get(Department, nv0003.department_id)
            if nv0003.department_id else None
        )
    position_id = nv0003.position_id if nv0003 is not None else None
    manager_id = None
    if nv0003 is not None and nv0003.manager_id:
        manager_id = nv0003.manager_id
    elif nv0001 is not None:
        manager_id = nv0001.id

    # --- NV0005 -----------------------------------------------------------
    hung = _employee_by_code("NV0005")
    if hung is None:
        hung = Employee(
            code="NV0005",
            full_name="Đỗ Văn Hùng",
            email="hung.do@hrm.local",
            phone="0905000005",
            date_of_birth=date(1995, 6, 15),
            gender="male",
            start_date=today - timedelta(days=2 * 365 + 30),
            status=Employee.STATUS_WORKING,
            department_id=department.id if department else None,
            position_id=position_id,
            manager_id=manager_id,
        )
        db.session.add(hung)
        db.session.flush()

    # --- Tai san laptop dang gan cho NV0005 --------------------------------
    asset = Asset.query.filter_by(code="LT-DEMO-NV0005").first()
    if asset is None:
        asset = Asset(
            code="LT-DEMO-NV0005",
            name="Laptop Dell Latitude 5440",
            category="Laptop",
            serial="DEMO-SN-NV0005",
            status=Asset.STATUS_ASSIGNED,
            purchase_date=today - timedelta(days=365),
            notes="Tài sản demo cho quy trình nghỉ việc của NV0005.",
        )
        db.session.add(asset)
        db.session.flush()
    elif asset.status != Asset.STATUS_ASSIGNED:
        asset.status = Asset.STATUS_ASSIGNED

    assignment = (
        AssetAssignment.query
        .filter_by(
            asset_id=asset.id,
            employee_id=hung.id,
            status=AssetAssignment.STATUS_ACTIVE,
        )
        .first()
    )
    if assignment is None:
        assignment = AssetAssignment(
            asset_id=asset.id,
            employee_id=hung.id,
            assigned_at=datetime.combine(
                today - timedelta(days=180), time(9, 0),
                tzinfo=timezone.utc,
            ),
            status=AssetAssignment.STATUS_ACTIVE,
            note="Cấp phát khi nhận việc (dữ liệu demo).",
        )
        db.session.add(assignment)
        db.session.flush()

    # --- Process nghi viec dang thuc hien ----------------------------------
    process = (
        OffboardingProcess.query
        .filter_by(
            employee_id=hung.id,
            status=OffboardingProcess.STATUS_IN_PROGRESS,
        )
        .first()
    )
    if process is not None:
        return process

    last_day = date(
        today.year, today.month, calendar.monthrange(today.year, today.month)[1]
    )
    process = OffboardingProcess(
        employee_id=hung.id,
        last_working_day=last_day,
        reason="Chuyển công tác theo nguyện vọng cá nhân",
        status=OffboardingProcess.STATUS_IN_PROGRESS,
        initiated_by=hr_user.id if hr_user else None,
    )
    db.session.add(process)
    db.session.flush()

    tasks = services.build_checklist(process)

    # 2 task danh dau xong: it + knowledge (con lai de mo cho demo tick).
    done_by = hr_user.id if hr_user else None
    for task in tasks:
        if task.category in ("it", "knowledge"):
            task.is_done = True
            task.done_by = done_by
            task.done_at = datetime.now(timezone.utc)
    db.session.flush()
    return process
