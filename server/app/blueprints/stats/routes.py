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
import csv
import io
from datetime import date, datetime, timedelta

from flask import Response, jsonify, request

from app.blueprints.attendance.services import get_late_threshold
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
    PayrollItem,
    PayrollPeriod,
    ShiftAssignment,
)

STATS_ROLES = ("admin", "hr", "manager")
CONTRACT_EXPIRY_DAYS = 30


def _manager_department_ids(user) -> list[int]:
    """Các phòng ban trong phạm vi của Manager (rỗng nếu không có).

    Ưu tiên mọi phòng ban mà nhân viên làm trưởng phòng
    (departments.manager_id); nếu không làm trưởng phòng nào thì lùi về
    phòng ban nhân viên đang thuộc về.
    """
    employee = user.employee if user is not None else None
    if employee is None:
        return []
    managed = (Department.query.filter_by(manager_id=employee.id)
               .order_by(Department.id).all())
    if managed:
        return [dept.id for dept in managed]
    if employee.department_id is not None:
        return [employee.department_id]
    return []


def _today():
    """Ngay hien tai theo mui gio nghiep vu Asia/Ho_Chi_Minh."""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    return datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date()


def _scope_department_ids(user) -> list[int] | None:
    """Phạm vi dữ liệu: None = toàn công ty (admin/hr); list = các phòng ban."""
    if user.role in ("admin", "hr"):
        return None
    department_ids = _manager_department_ids(user)
    if not department_ids:
        raise ApiError(403, "FORBIDDEN",
                       "Tài khoản Manager chưa gắn với phòng ban nào để xem thống kê.")
    return department_ids


def _scoped_employees(department_ids: list[int] | None):
    query = Employee.query
    if department_ids is not None:
        query = query.filter(Employee.department_id.in_(department_ids))
    return query


def _employees_overview(department_ids: list[int] | None) -> dict:
    active = _scoped_employees(department_ids).filter(
        Employee.status != Employee.STATUS_RESIGNED)
    by_status_query = (db.session.query(Employee.status, db.func.count(Employee.id))
                       .filter(Employee.status != Employee.STATUS_RESIGNED))
    if department_ids is not None:
        by_status_query = by_status_query.filter(
            Employee.department_id.in_(department_ids))
    by_status_rows = by_status_query.group_by(Employee.status).all()
    dept_rows = (
        db.session.query(Department.id, Department.name, db.func.count(Employee.id))
        .outerjoin(Employee, (Employee.department_id == Department.id)
                   & (Employee.status != Employee.STATUS_RESIGNED))
        .group_by(Department.id, Department.name)
        .order_by(Department.name).all())
    if department_ids is not None:
        dept_rows = [row for row in dept_rows if row[0] in department_ids]
    return {
        "totalEmployees": active.count(),
        "totalDepartments": len(dept_rows),
        "byStatus": {status: count for status, count in by_status_rows},
        "byDepartment": [
            {"departmentId": dept_id, "departmentName": name, "employeeCount": count}
            for dept_id, name, count in dept_rows
        ],
    }


def _attendance_overview(department_ids: list[int] | None) -> dict:
    today = _today()
    month_start = today.replace(day=1)
    next_month = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
    query = (db.session.query(Attendance.status, db.func.count(Attendance.id))
             .join(Employee, Attendance.employee_id == Employee.id)
             .filter(Attendance.work_date >= month_start,
                     Attendance.work_date < next_month))
    if department_ids is not None:
        query = query.filter(Employee.department_id.in_(department_ids))
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


def _pending_leave_overview(department_ids: list[int] | None) -> dict:
    waiting = (LeaveRequest.STATUS_PENDING, LeaveRequest.STATUS_MANAGER_APPROVED)
    query = (db.session.query(LeaveRequest.status, db.func.count(LeaveRequest.id))
             .join(Employee, LeaveRequest.employee_id == Employee.id)
             .filter(LeaveRequest.status.in_(waiting)))
    if department_ids is not None:
        query = query.filter(Employee.department_id.in_(department_ids))
    counts = dict(query.group_by(LeaveRequest.status).all())
    items_query = (LeaveRequest.query
                   .join(Employee, LeaveRequest.employee_id == Employee.id)
                   .filter(LeaveRequest.status.in_(waiting)))
    if department_ids is not None:
        items_query = items_query.filter(Employee.department_id.in_(department_ids))
    items = items_query.order_by(LeaveRequest.id.desc()).limit(10).all()
    return {
        "pendingApproval": sum(counts.values()),
        "waitingManager": counts.get(LeaveRequest.STATUS_PENDING, 0),
        "waitingHr": counts.get(LeaveRequest.STATUS_MANAGER_APPROVED, 0),
        "items": [{
            "id": r.id,
            "employeeName": r.employee.full_name if r.employee else None,
            "leaveType": r.leave_type.name if r.leave_type else None,
            "fromDate": r.from_date.isoformat() if r.from_date else None,
            "toDate": r.to_date.isoformat() if r.to_date else None,
            "daysCount": r.days_count,
            "status": r.status,
        } for r in items],
    }


def _attendance_today_overview(department_ids: list[int] | None) -> dict:
    today = _today()
    query = (db.session.query(Attendance.status, db.func.count(Attendance.id))
             .join(Employee, Attendance.employee_id == Employee.id)
             .filter(Attendance.work_date == today))
    if department_ids is not None:
        query = query.filter(Employee.department_id.in_(department_ids))
    counts = dict(query.group_by(Attendance.status).all())
    return {
        "present": counts.get(Attendance.STATUS_PRESENT, 0),
        "late": counts.get(Attendance.STATUS_LATE, 0),
        "absent": counts.get(Attendance.STATUS_ABSENT, 0),
        "onLeave": counts.get(Attendance.STATUS_ON_LEAVE, 0),
    }


def _expiring_contracts_overview(department_ids: list[int] | None) -> dict:
    today = _today()
    horizon = today + timedelta(days=CONTRACT_EXPIRY_DAYS)
    query = (Contract.query
             .join(Employee, Contract.employee_id == Employee.id)
             .filter(Contract.status == Contract.STATUS_ACTIVE,
                     Contract.end_date.isnot(None),
                     Contract.end_date >= today,
                     Contract.end_date <= horizon)
             .order_by(Contract.end_date.asc()))
    if department_ids is not None:
        query = query.filter(Employee.department_id.in_(department_ids))
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


def _recruitment_overview(department_ids: list[int] | None) -> dict:
    query = JobPosting.query.filter_by(status=JobPosting.STATUS_OPEN)
    if department_ids is not None:
        query = query.filter(JobPosting.department_id.in_(department_ids))
    return {"openJobPostings": query.count()}


# ---------------------------------------------------------------------------
# Báo cáo tháng (Đợt mở rộng v2 — Đội F). Chỉ THÊM mới, không đổi /overview.
#   GET /stats/reports/summary?month=&year=
#   GET /stats/reports/export?type=attendance|payroll|leave&month=&year=
# Phạm vi dữ liệu dùng chung _scope_department_ids: admin/hr = toàn công ty,
# manager = chỉ phòng ban của mình.
# ---------------------------------------------------------------------------

ATTENDANCE_STATUS_LABELS = {
    Attendance.STATUS_PRESENT: "Đúng giờ",
    Attendance.STATUS_LATE: "Đi muộn",
    Attendance.STATUS_ABSENT: "Vắng",
    Attendance.STATUS_ON_LEAVE: "Nghỉ phép",
}

LEAVE_STATUS_LABELS = {
    LeaveRequest.STATUS_PENDING: "Chờ quản lý duyệt",
    LeaveRequest.STATUS_MANAGER_APPROVED: "Chờ HR duyệt",
    LeaveRequest.STATUS_APPROVED: "Đã duyệt",
    LeaveRequest.STATUS_REJECTED: "Đã từ chối",
    LeaveRequest.STATUS_CANCELLED: "Đã huỷ",
}


def _parse_month_year() -> tuple[int, int]:
    """Đọc ?month=&year= (mặc định tháng hiện tại); 400 nếu ngoài khoảng."""
    today = _today()
    raw_month = request.args.get("month", type=int)
    raw_year = request.args.get("year", type=int)
    month = raw_month if raw_month is not None else today.month
    year = raw_year if raw_year is not None else today.year
    if not (1 <= month <= 12) or not (2000 <= year <= 2100):
        raise ApiError(400, "INVALID_PARAMS",
                       "Tháng phải trong 1..12 và năm trong 2000..2100.")
    return month, year


def _month_range(month: int, year: int) -> tuple[date, date]:
    start = date(year, month, 1)
    end = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    return start, end


def _headcount_by_department(department_ids: list[int] | None) -> dict:
    rows = (
        db.session.query(Department.id, Department.name, db.func.count(Employee.id))
        .outerjoin(Employee, (Employee.department_id == Department.id)
                   & (Employee.status != Employee.STATUS_RESIGNED))
        .group_by(Department.id, Department.name)
        .order_by(Department.name).all())
    if department_ids is not None:
        rows = [row for row in rows if row[0] in department_ids]
    by_department = [
        {"departmentId": dept_id, "departmentName": name, "employeeCount": count}
        for dept_id, name, count in rows
    ]
    return {
        "total": sum(item["employeeCount"] for item in by_department),
        "byDepartment": by_department,
    }


def _attendance_month(month: int, year: int, department_ids: list[int] | None) -> dict:
    start, end = _month_range(month, year)
    query = (db.session.query(Attendance.status, db.func.count(Attendance.id))
             .join(Employee, Attendance.employee_id == Employee.id)
             .filter(Attendance.work_date >= start, Attendance.work_date < end))
    if department_ids is not None:
        query = query.filter(Employee.department_id.in_(department_ids))
    counts = dict(query.group_by(Attendance.status).all())
    total_records = sum(counts.values())
    attended = counts.get(Attendance.STATUS_PRESENT, 0) + counts.get(Attendance.STATUS_LATE, 0)
    return {
        "present": counts.get(Attendance.STATUS_PRESENT, 0),
        "late": counts.get(Attendance.STATUS_LATE, 0),
        "absent": counts.get(Attendance.STATUS_ABSENT, 0),
        "onLeave": counts.get(Attendance.STATUS_ON_LEAVE, 0),
        "totalRecords": total_records,
        "attendanceRate": round(attended * 100.0 / total_records, 1) if total_records else 0.0,
    }


def _approved_leave_in_month(month: int, year: int, department_ids: list[int] | None):
    """Query đơn nghỉ ĐÃ DUYỆT giao với tháng (from_date < cuối tháng, to_date >= đầu tháng)."""
    start, end = _month_range(month, year)
    query = (LeaveRequest.query
             .join(Employee, LeaveRequest.employee_id == Employee.id)
             .filter(LeaveRequest.status == LeaveRequest.STATUS_APPROVED,
                     LeaveRequest.from_date < end,
                     LeaveRequest.to_date >= start))
    if department_ids is not None:
        query = query.filter(Employee.department_id.in_(department_ids))
    return query


def _leave_month(month: int, year: int, department_ids: list[int] | None) -> dict:
    grouped: dict[str, dict] = {}
    for leave_request in _approved_leave_in_month(month, year, department_ids).all():
        name = leave_request.leave_type.name if leave_request.leave_type else "Không rõ loại"
        bucket = grouped.setdefault(name, {"leaveType": name, "requests": 0, "days": 0.0})
        bucket["requests"] += 1
        bucket["days"] += float(leave_request.days_count or 0)
    by_type = [grouped[name] for name in sorted(grouped)]
    return {
        "totalRequests": sum(item["requests"] for item in by_type),
        "totalDays": sum(item["days"] for item in by_type),
        "byType": by_type,
    }


def _payroll_period_for(month: int, year: int) -> PayrollPeriod | None:
    """Kỳ lương của đúng tháng; nếu chưa có, lùi về kỳ lương gần nhất trước đó."""
    period = PayrollPeriod.query.filter_by(month=month, year=year).first()
    if period is not None:
        return period
    return (PayrollPeriod.query
            .filter((PayrollPeriod.year < year)
                    | ((PayrollPeriod.year == year) & (PayrollPeriod.month < month)))
            .order_by(PayrollPeriod.year.desc(), PayrollPeriod.month.desc())
            .first())


def _payroll_month(month: int, year: int, department_ids: list[int] | None) -> dict:
    period = _payroll_period_for(month, year)
    if period is None:
        return {"period": None, "totalCost": 0, "employeeCount": 0, "byDepartment": []}
    query = (db.session.query(Employee.department_id, Department.name,
                              db.func.count(PayrollItem.id),
                              db.func.coalesce(db.func.sum(PayrollItem.total_salary), 0))
             .select_from(PayrollItem)
             .join(Employee, PayrollItem.employee_id == Employee.id)
             .outerjoin(Department, Employee.department_id == Department.id)
             .filter(PayrollItem.period_id == period.id))
    if department_ids is not None:
        query = query.filter(Employee.department_id.in_(department_ids))
    rows = query.group_by(Employee.department_id, Department.name).all()
    by_department = [{
        "departmentId": dept_id,
        "departmentName": dept_name or "Chưa thuộc phòng ban",
        "employeeCount": count,
        "totalCost": int(total),
    } for dept_id, dept_name, count, total in rows]
    by_department.sort(key=lambda item: item["departmentName"])
    return {
        "period": {"month": period.month, "year": period.year, "status": period.status},
        "totalCost": sum(item["totalCost"] for item in by_department),
        "employeeCount": sum(item["employeeCount"] for item in by_department),
        "byDepartment": by_department,
    }


@bp.get("/reports/summary")
@require_roles(*STATS_ROLES)
def reports_summary():
    user = load_current_user()
    department_ids = _scope_department_ids(user)
    month, year = _parse_month_year()
    return jsonify({
        "scope": ("company" if department_ids is None
                  else f"departments:{','.join(map(str, department_ids))}"),
        "month": month,
        "year": year,
        "headcount": _headcount_by_department(department_ids),
        "attendance": _attendance_month(month, year, department_ids),
        "leave": _leave_month(month, year, department_ids),
        "payroll": _payroll_month(month, year, department_ids),
    })


def _department_name(employee) -> str:
    if employee is not None and employee.department is not None:
        return employee.department.name
    return "Chưa thuộc phòng ban"


def _attendance_export_rows(month: int, year: int, department_ids: list[int] | None):
    start, end = _month_range(month, year)
    query = (Attendance.query
             .join(Employee, Attendance.employee_id == Employee.id)
             .filter(Attendance.work_date >= start, Attendance.work_date < end)
             .order_by(Attendance.work_date.asc(), Employee.full_name.asc()))
    if department_ids is not None:
        query = query.filter(Employee.department_id.in_(department_ids))
    header = ["Mã NV", "Họ tên", "Phòng ban", "Ngày", "Giờ vào", "Giờ ra",
              "Trạng thái", "Ghi chú"]
    rows = [header]
    for record in query.all():
        employee = record.employee
        rows.append([
            employee.code if employee else "",
            employee.full_name if employee else "",
            _department_name(employee),
            record.work_date.isoformat() if record.work_date else "",
            record.check_in_at.strftime("%H:%M") if record.check_in_at else "",
            record.check_out_at.strftime("%H:%M") if record.check_out_at else "",
            ATTENDANCE_STATUS_LABELS.get(record.status, record.status),
            record.note or "",
        ])
    return rows


def _payroll_export_rows(month: int, year: int, department_ids: list[int] | None):
    header = ["Mã NV", "Họ tên", "Phòng ban", "Kỳ lương", "Ngày công hưởng lương",
              "Lương cơ bản (VND)", "Phụ cấp (VND)", "Khấu trừ BHXH (VND)",
              "Khấu trừ khác (VND)", "Thực nhận (VND)"]
    rows = [header]
    period = _payroll_period_for(month, year)
    if period is None:
        return rows
    query = (PayrollItem.query
             .join(Employee, PayrollItem.employee_id == Employee.id)
             .filter(PayrollItem.period_id == period.id)
             .order_by(Employee.full_name.asc()))
    if department_ids is not None:
        query = query.filter(Employee.department_id.in_(department_ids))
    period_label = f"{period.month:02d}/{period.year}"
    for item in query.all():
        employee = item.employee
        rows.append([
            employee.code if employee else "",
            employee.full_name if employee else "",
            _department_name(employee),
            period_label,
            item.workdays_paid,
            item.base_salary,
            item.allowance,
            item.insurance_deduction,
            item.other_deduction,
            item.total_salary,
        ])
    return rows


def _leave_export_rows(month: int, year: int, department_ids: list[int] | None):
    start, end = _month_range(month, year)
    query = (LeaveRequest.query
             .join(Employee, LeaveRequest.employee_id == Employee.id)
             .filter(LeaveRequest.status == LeaveRequest.STATUS_APPROVED,
                     LeaveRequest.from_date < end, LeaveRequest.to_date >= start)
             .order_by(LeaveRequest.from_date.asc(), Employee.full_name.asc()))
    if department_ids is not None:
        query = query.filter(Employee.department_id.in_(department_ids))
    header = ["Mã NV", "Họ tên", "Phòng ban", "Loại nghỉ", "Từ ngày", "Đến ngày",
              "Số ngày", "Trạng thái", "Lý do"]
    rows = [header]
    for leave_request in query.all():
        employee = leave_request.employee
        rows.append([
            employee.code if employee else "",
            employee.full_name if employee else "",
            _department_name(employee),
            leave_request.leave_type.name if leave_request.leave_type else "",
            leave_request.from_date.isoformat() if leave_request.from_date else "",
            leave_request.to_date.isoformat() if leave_request.to_date else "",
            leave_request.days_count,
            LEAVE_STATUS_LABELS.get(leave_request.status, leave_request.status),
            leave_request.reason or "",
        ])
    return rows


@bp.get("/reports/export")
@require_roles(*STATS_ROLES)
def reports_export():
    user = load_current_user()
    department_ids = _scope_department_ids(user)
    month, year = _parse_month_year()
    export_type = (request.args.get("type") or "").strip().lower()
    builders = {
        "attendance": _attendance_export_rows,
        "payroll": _payroll_export_rows,
        "leave": _leave_export_rows,
    }
    builder = builders.get(export_type)
    if builder is None:
        raise ApiError(400, "INVALID_PARAMS",
                       "Tham số type phải là attendance, payroll hoặc leave.")
    rows = builder(month, year, department_ids)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerows(rows)
    # BOM UTF-8 để Excel mở đúng tiếng Việt.
    csv_text = "\ufeff" + buffer.getvalue()
    filename = f"baocao-{export_type}-{year}-{month:02d}.csv"
    return Response(
        csv_text,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@bp.get("/overview")
@require_roles(*STATS_ROLES)
def overview():
    user = load_current_user()
    department_ids = _scope_department_ids(user)
    result = {
        "scope": ("company" if department_ids is None
                  else f"departments:{','.join(map(str, department_ids))}"),
    }
    result.update(_employees_overview(department_ids))
    result["attendanceThisMonth"] = _attendance_overview(department_ids)
    result["attendanceToday"] = _attendance_today_overview(department_ids)
    result["leave"] = _pending_leave_overview(department_ids)
    result["contracts"] = _expiring_contracts_overview(department_ids)
    result.update(_recruitment_overview(department_ids))
    return jsonify(result)


# ---------------------------------------------------------------------------
# Thống kê realtime HÔM NAY — mọi role đã đăng nhập đều xem được (kể cả
# nhân viên), để ai cũng biết hôm nay ai muộn / ai chưa chấm / ai nghỉ.
#   GET /stats/today
# Phạm vi: admin/hr/employee = toàn công ty; manager = chỉ phòng ban của mình.
# Không thêm cột/bảng DB: earlyLeave tính lúc đọc từ giờ check-out so với
# giờ kết thúc ca; notCheckedIn suy ra từ "đang làm việc mà chưa có bản ghi
# hôm nay và không có đơn nghỉ đã duyệt bao hôm nay" (materialize chỉ lấp
# ngày vắng tới hôm qua nên hôm nay chưa có bản ghi absent).
# ---------------------------------------------------------------------------

_TODAY_LIST_LIMIT = 200


def _now_ict():
    """Thời điểm hiện tại theo múi giờ nghiệp vụ Asia/Ho_Chi_Minh."""
    from zoneinfo import ZoneInfo

    return datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))


def _iso(value):
    return value.isoformat() if value is not None else None


def _employee_card(employee) -> dict:
    return {
        "employeeId": employee.id,
        "employeeCode": employee.code,
        "name": employee.full_name,
        "department": _department_name(employee),
    }


def _approved_leave_employee_ids_today(department_ids: list[int] | None) -> set[int]:
    """Id nhân viên có đơn nghỉ ĐÃ DUYỆT bao phủ hôm nay."""
    today = _today()
    query = (db.session.query(LeaveRequest.employee_id)
             .join(Employee, LeaveRequest.employee_id == Employee.id)
             .filter(LeaveRequest.status == LeaveRequest.STATUS_APPROVED,
                     LeaveRequest.from_date <= today,
                     LeaveRequest.to_date >= today))
    if department_ids is not None:
        query = query.filter(Employee.department_id.in_(department_ids))
    return {row[0] for row in query.all()}


def _shift_end_time(employee_id: int, work_date: date):
    """Giờ kết thúc ca được phân cho (nhân viên, ngày); None nếu không có ca."""
    assignment = (db.session.query(ShiftAssignment)
                  .filter_by(employee_id=employee_id, work_date=work_date)
                  .first())
    if assignment is None or assignment.shift is None:
        return None
    return assignment.shift.end_time


@bp.get("/today")
@require_roles()
def today_stats():
    user = load_current_user()
    today = _today()

    # Phạm vi: admin/hr/employee = toàn công ty; manager = phòng của mình.
    if user.role == "manager":
        department_ids = _manager_department_ids(user)
        scope = [dept.name for dept in
                 Department.query.filter(Department.id.in_(department_ids))
                 .order_by(Department.name).all()] if department_ids else []
    else:
        department_ids = None
        scope = "company"

    # Bản ghi chấm công hôm nay trong phạm vi.
    records_query = (Attendance.query
                     .join(Employee, Attendance.employee_id == Employee.id)
                     .filter(Attendance.work_date == today))
    if department_ids is not None:
        records_query = records_query.filter(
            Employee.department_id.in_(department_ids))
    records = records_query.all()
    record_by_employee = {record.employee_id: record for record in records}

    approved_leave_ids = _approved_leave_employee_ids_today(department_ids)

    # Nhân viên đang làm việc trong phạm vi (loại người đã nghỉ việc).
    employees = (_scoped_employees(department_ids)
                 .filter(Employee.status.in_(
                     (Employee.STATUS_WORKING, Employee.STATUS_ON_LEAVE)))
                 .all())
    employee_by_id = {employee.id: employee for employee in employees}

    # Đi muộn: bản ghi status=late, kèm số phút vượt ngưỡng muộn
    # (ngưỡng = giờ bắt đầu ca + 15 phút ân hạn, xem attendance.services).
    late_list = []
    for record in sorted(
            (r for r in records if r.status == Attendance.STATUS_LATE),
            key=lambda r: r.check_in_at or datetime.min):
        card = _employee_card(record.employee)
        minutes_late = 0
        if record.check_in_at is not None:
            threshold = get_late_threshold(record.employee_id, today)
            threshold_dt = datetime.combine(today, threshold)
            minutes_late = max(
                0, int((record.check_in_at - threshold_dt).total_seconds() // 60))
        card["checkInAt"] = _iso(record.check_in_at)
        card["minutesLate"] = minutes_late
        late_list.append(card)

    # Nghỉ phép hôm nay: hợp nhất bản ghi on_leave + đơn nghỉ đã duyệt
    # bao hôm nay (người nghỉ phép có thể chưa có bản ghi chấm công).
    on_leave_ids = ({r.employee_id for r in records
                     if r.status == Attendance.STATUS_ON_LEAVE}
                    | (approved_leave_ids & set(employee_by_id)))
    on_leave_list = sorted(
        (_employee_card(employee_by_id[eid]) for eid in on_leave_ids
         if eid in employee_by_id),
        key=lambda item: item["name"])

    # Chưa chấm: đang làm việc, không có bản ghi hôm nay, không nghỉ phép.
    not_checked_in_list = sorted(
        (_employee_card(employee) for employee in employees
         if employee.id not in record_by_employee
         and employee.id not in approved_leave_ids),
        key=lambda item: item["name"])

    # Về sớm (tính lúc đọc): present/late đã check-out trước giờ kết thúc
    # ca; không có ca thì bỏ qua, không gắn cờ.
    early_leave_list = []
    for record in records:
        if record.status not in (Attendance.STATUS_PRESENT,
                                 Attendance.STATUS_LATE):
            continue
        if record.check_out_at is None:
            continue
        end_time = _shift_end_time(record.employee_id, today)
        if end_time is None:
            continue
        if record.check_out_at.time() < end_time:
            card = _employee_card(record.employee)
            card["checkOutAt"] = _iso(record.check_out_at)
            early_leave_list.append(card)
    early_leave_list.sort(key=lambda item: item["checkOutAt"])

    # Trạng thái của chính người đang hỏi.
    my_status = None
    employee = user.employee if user is not None else None
    if employee is not None:
        my_record = (Attendance.query
                     .filter_by(employee_id=employee.id, work_date=today)
                     .first())
        if my_record is not None:
            my_status = {
                "status": my_record.status,
                "checkInAt": _iso(my_record.check_in_at),
                "checkOutAt": _iso(my_record.check_out_at),
            }
        elif employee.id in approved_leave_ids:
            my_status = {"status": Attendance.STATUS_ON_LEAVE,
                         "checkInAt": None, "checkOutAt": None}

    return jsonify({
        "date": today.isoformat(),
        "isWeekend": today.weekday() >= 5,
        "generated_at": _now_ict().isoformat(),
        "scope": scope,
        "counts": {
            "present": sum(1 for r in records
                           if r.status == Attendance.STATUS_PRESENT),
            "late": len(late_list),
            "onLeave": len(on_leave_list),
            "notCheckedIn": len(not_checked_in_list),
            "earlyLeave": len(early_leave_list),
        },
        "late": late_list[:_TODAY_LIST_LIMIT],
        "notCheckedIn": not_checked_in_list[:_TODAY_LIST_LIMIT],
        "onLeave": on_leave_list[:_TODAY_LIST_LIMIT],
        "earlyLeave": early_leave_list[:_TODAY_LIST_LIMIT],
        "myStatus": my_status,
    })
