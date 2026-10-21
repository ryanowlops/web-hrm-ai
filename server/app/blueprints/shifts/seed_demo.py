"""Seed demo cho module Shifts (feature-expansion-v3 muc 1.4).

- 3 ca: "Ca hanh chinh" 08:00-17:00 (nghi 60'), "Ca sang" 06:00-14:00,
  "Ca chieu" 14:00-22:00.
- Gan "Ca hanh chinh" cho NV0001-NV0004 vao Thu 2 - Thu 6 cua tuan hien tai.
- Tang ca: 1 don NV0003 dang pending (ngay mai, 2 gio,
  "Hoan thien bao cao thang"); 1 don NV0002 o trang thai manager_approved.
- Giai trinh: 1 don NV0003 pending (hom qua, quen check-in, de xuat 08:02).

IDEMPOTENT: kiem tra ton tai truoc khi insert. Khong commit — transaction
do seed.py cua parent quan ly; chi flush khi can id.
"""

from datetime import date, datetime, time, timedelta

from app.extensions import db
from app.models import Employee, User
from app.models.shifts import (
    AttendanceCorrection,
    OvertimeRequest,
    ShiftAssignment,
    ShiftDefinition,
)

_DEMO_SHIFTS = [
    # (name, start, end, break_minutes)
    ("Ca hành chính", time(8, 0), time(17, 0), 60),
    ("Ca sáng", time(6, 0), time(14, 0), 30),
    ("Ca chiều", time(14, 0), time(22, 0), 30),
]

_DEMO_CODES = ("NV0001", "NV0002", "NV0003", "NV0004")


def _get_or_create_shift(name, start, end, break_minutes):
    shift = ShiftDefinition.query.filter_by(name=name).first()
    if shift is None:
        shift = ShiftDefinition(
            name=name,
            start_time=start,
            end_time=end,
            break_minutes=break_minutes,
            is_overnight=False,
            is_active=True,
        )
        db.session.add(shift)
        db.session.flush()
    return shift


def _week_monday(any_date):
    return any_date - timedelta(days=any_date.weekday())


def seed_demo():
    shifts = {
        name: _get_or_create_shift(name, start, end, break_minutes)
        for name, start, end, break_minutes in _DEMO_SHIFTS
    }
    office_shift = shifts["Ca hành chính"]

    employees = {}
    for code in _DEMO_CODES:
        employee = Employee.query.filter_by(code=code).first()
        if employee is not None:
            employees[code] = employee
    if not employees:
        return  # seed chinh chua chay — khong co du lieu demo de gan

    today = date.today()

    # Gan ca hanh chinh Thu 2 - Thu 6 tuan hien tai cho NV0001-NV0004.
    monday = _week_monday(today)
    for employee in employees.values():
        for offset in range(5):  # Thu 2 .. Thu 6
            work_date = monday + timedelta(days=offset)
            existing = ShiftAssignment.query.filter_by(
                employee_id=employee.id, work_date=work_date
            ).first()
            if existing is None:
                db.session.add(
                    ShiftAssignment(
                        employee_id=employee.id,
                        shift_id=office_shift.id,
                        work_date=work_date,
                    )
                )
    db.session.flush()

    staff = employees.get("NV0003")
    hr_employee = employees.get("NV0002")
    manager_user = User.query.filter_by(email="manager@hrm.local").first()

    # --- Tang ca demo ---
    if staff is not None:
        tomorrow = today + timedelta(days=1)
        existing = OvertimeRequest.query.filter_by(
            employee_id=staff.id, work_date=tomorrow
        ).first()
        if existing is None:
            db.session.add(
                OvertimeRequest(
                    employee_id=staff.id,
                    work_date=tomorrow,
                    hours=2.0,
                    reason="Hoàn thiện báo cáo tháng",
                    status=OvertimeRequest.STATUS_PENDING,
                )
            )
    if hr_employee is not None:
        ot_date = today + timedelta(days=2)
        existing = OvertimeRequest.query.filter_by(
            employee_id=hr_employee.id, work_date=ot_date
        ).first()
        if existing is None:
            db.session.add(
                OvertimeRequest(
                    employee_id=hr_employee.id,
                    work_date=ot_date,
                    hours=3.0,
                    reason="Chuẩn bị dữ liệu cho đợt tuyển dụng mới",
                    status=OvertimeRequest.STATUS_MANAGER_APPROVED,
                    manager_decision="approved",
                    manager_decided_by=manager_user.id if manager_user else None,
                    manager_decided_at=datetime.now(),
                    manager_note="Đã duyệt (dữ liệu demo).",
                )
            )

    # --- Giai trinh demo ---
    if staff is not None:
        yesterday = today - timedelta(days=1)
        existing = AttendanceCorrection.query.filter_by(
            employee_id=staff.id, work_date=yesterday
        ).first()
        if existing is None:
            db.session.add(
                AttendanceCorrection(
                    employee_id=staff.id,
                    work_date=yesterday,
                    requested_check_in=datetime.combine(yesterday, time(8, 2)),
                    requested_check_out=None,
                    reason="Quên check-in buổi sáng, xin bổ sung giờ vào 08:02.",
                    status=AttendanceCorrection.STATUS_PENDING,
                )
            )
    db.session.flush()
