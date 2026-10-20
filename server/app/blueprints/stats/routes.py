"""Routes cho Thống kê — tiền tố /api/v1/stats (docs FR-11, A2).

    GET /stats/overview   Tổng quan dashboard, tự phân phạm vi theo role:
        - admin / hr : toàn công ty
        - manager    : chỉ phòng ban mình quản lý (hoặc phòng mình thuộc về)
        - employee   : không có quyền (403 qua require_roles)

Mọi số liệu được tính trực tiếp từ DB tại thời điểm gọi (không cache)
để luôn khớp dữ liệu nghiệp vụ: tổng nhân viên, cơ cấu theo phòng ban,
chuyên cần tháng hiện tại, đơn nghỉ đang chờ duyệt, hợp đồng sắp hết
hạn trong 30 ngày, tin tuyển dụng đang mở.
"""
from datetime import date, timedelta

from flask import jsonify

from app.blueprints.auth.guards import load_current_user, require_roles
from app.blueprints.stats import bp
from app.errors import ApiError
from app.extensions import db
from app.models import (
    Attendance,
    Contract,
    Department,
    Employee,
    JobPosting,
    LeaveRequest,
)

STATS_ROLES = ("admin", "hr", "manager")
CONTRACT_EXPIRY_DAYS = 30


def _manager_department_id(user) -> int | None:
    """Phòng ban trong phạm vi của Manager; None nếu không xác định được.

    Ưu tiên phòng ban mà nhân viên làm trưởng phòng (departments.manager_id),
    lùi về phòng ban nhân viên đang thuộc về.
    """
    employee = user.employee if user is not None else None
    if employee is None:
        return None
    managed = (Department.query.filter_by(manager_id=employee.id)
               .order_by(Department.id).first())
    if managed is not None:
        return managed.id
    return employee.department_id


def _scope_department_id(user) -> int | None:
    """Phạm vi dữ liệu: None = toàn công ty (admin/hr); số = 1 phòng ban."""
    if user.role in ("admin", "hr"):
        return None
    department_id = _manager_department_id(user)
    if department_id is None:
        raise ApiError(403, "FORBIDDEN",
                       "Tài khoản Manager chưa gắn với phòng ban nào để xem thống kê.")
    return department_id


def _scoped_employees(department_id: int | None):
    query = Employee.query
    if department_id is not None:
        query = query.filter(Employee.department_id == department_id)
    return query


def _employees_overview(department_id: int | None) -> dict:
    active = _scoped_employees(department_id).filter(
        Employee.status != Employee.STATUS_RESIGNED)
    by_status_query = db.session.query(Employee.status, db.func.count(Employee.id))
    if department_id is not None:
        by_status_query = by_status_query.filter(
            Employee.department_id == department_id)
    by_status_rows = by_status_query.group_by(Employee.status).all()
    dept_rows = (
        db.session.query(Department.id, Department.name, db.func.count(Employee.id))
        .outerjoin(Employee, (Employee.department_id == Department.id)
                   & (Employee.status != Employee.STATUS_RESIGNED))
        .group_by(Department.id, Department.name)
        .order_by(Department.name).all())
    if department_id is not None:
        dept_rows = [row for row in dept_rows if row[0] == department_id]
    return {
        "totalEmployees": active.count(),
        "byStatus": {status: count for status, count in by_status_rows},
        "byDepartment": [
            {"departmentId": dept_id, "departmentName": name, "employeeCount": count}
            for dept_id, name, count in dept_rows
        ],
    }


def _attendance_overview(department_id: int | None) -> dict:
    today = date.today()
    month_start = today.replace(day=1)
    next_month = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
    query = (db.session.query(Attendance.status, db.func.count(Attendance.id))
             .join(Employee, Attendance.employee_id == Employee.id)
             .filter(Attendance.work_date >= month_start,
                     Attendance.work_date < next_month))
    if department_id is not None:
        query = query.filter(Employee.department_id == department_id)
    counts = dict(query.group_by(Attendance.status).all())
    total_records = sum(counts.values())
    attended = counts.get(Attendance.STATUS_PRESENT, 0) + counts.get(Attendance.STATUS_LATE, 0)
    return {
        "month": month_start.strftime("%Y-%m"),
        "present": counts.get(Attendance.STATUS_PRESENT, 0),
        "late": counts.get(Attendance.STATUS_LATE, 0),
        "absent": counts.get(Attendance.STATUS_ABSENT, 0),
        "onLeave": counts.get(Attendance.STATUS_ON_LEAVE, 0),
        "totalRecords": total_records,
        "attendanceRate": round(attended * 100.0 / total_records, 1) if total_records else 0.0,
    }


def _pending_leave_overview(department_id: int | None) -> dict:
    waiting = (LeaveRequest.STATUS_PENDING, LeaveRequest.STATUS_MANAGER_APPROVED)
    query = (db.session.query(LeaveRequest.status, db.func.count(LeaveRequest.id))
             .join(Employee, LeaveRequest.employee_id == Employee.id)
             .filter(LeaveRequest.status.in_(waiting)))
    if department_id is not None:
        query = query.filter(Employee.department_id == department_id)
    counts = dict(query.group_by(LeaveRequest.status).all())
    return {
        "pendingApproval": sum(counts.values()),
        "waitingManager": counts.get(LeaveRequest.STATUS_PENDING, 0),
        "waitingHr": counts.get(LeaveRequest.STATUS_MANAGER_APPROVED, 0),
    }


def _expiring_contracts_overview(department_id: int | None) -> dict:
    today = date.today()
    horizon = today + timedelta(days=CONTRACT_EXPIRY_DAYS)
    query = (Contract.query
             .join(Employee, Contract.employee_id == Employee.id)
             .filter(Contract.status == Contract.STATUS_ACTIVE,
                     Contract.end_date.isnot(None),
                     Contract.end_date >= today,
                     Contract.end_date <= horizon)
             .order_by(Contract.end_date.asc()))
    if department_id is not None:
        query = query.filter(Employee.department_id == department_id)
    contracts = query.all()
    return {
        "expiringInDays": CONTRACT_EXPIRY_DAYS,
        "count": len(contracts),
        "items": [{
            "contractId": c.id,
            "employeeId": c.employee_id,
            "employeeName": c.employee.full_name if c.employee else None,
            "endDate": c.end_date.isoformat() if c.end_date else None,
            "daysRemaining": (c.end_date - today).days if c.end_date else None,
        } for c in contracts[:10]],
    }


def _recruitment_overview(department_id: int | None) -> dict:
    query = JobPosting.query.filter_by(status=JobPosting.STATUS_OPEN)
    if department_id is not None:
        query = query.filter(JobPosting.department_id == department_id)
    return {"openJobPostings": query.count()}


@bp.get("/overview")
@require_roles(*STATS_ROLES)
def overview():
    user = load_current_user()
    department_id = _scope_department_id(user)
    result = {
        "scope": ("company" if department_id is None
                  else f"department:{department_id}"),
    }
    result.update(_employees_overview(department_id))
    result["attendanceThisMonth"] = _attendance_overview(department_id)
    result["leave"] = _pending_leave_overview(department_id)
    result["contracts"] = _expiring_contracts_overview(department_id)
    result.update(_recruitment_overview(department_id))
    return jsonify(result)
