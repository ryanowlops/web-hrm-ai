"""Service layer — module Nghỉ phép (leave).

Toàn bộ logic nghiệp vụ nằm ở đây (routes chỉ validate + gọi service):
- Tạo đơn: tính ngày làm việc, kiểm tra số dư phép (loại có phép), chống trùng đơn.
- Duyệt 2 cấp: Manager (cấp 1) -> HR (cấp cuối), đúng thứ tự trạng thái.
- Duyệt HR thành công: trừ LeaveBalance + tạo Notification TRONG CÙNG transaction.
- Phân quyền theo dữ liệu (ownership / phòng ban) kiểm tra tại đây, không tin frontend.
"""

from datetime import date, timedelta

from flask_jwt_extended import get_jwt_identity
from sqlalchemy import func

from app.errors import ApiError
from app.extensions import db
from app.models import (
    Department,
    Employee,
    LeaveBalance,
    LeaveRequest,
    LeaveType,
    Notification,
    User,
)

# Trạng thái đơn nghỉ — máy trạng thái:
# pending --(Manager duyệt)--> manager_approved --(HR duyệt)--> approved
# pending --(Manager từ chối)--> rejected
# manager_approved --(HR từ chối)--> rejected
# pending --(chủ đơn hủy)--> cancelled
STATUS_PENDING = "pending"
STATUS_MANAGER_APPROVED = "manager_approved"
STATUS_APPROVED = "approved"
STATUS_REJECTED = "rejected"
STATUS_CANCELLED = "cancelled"
ALL_STATUSES = {
    STATUS_PENDING,
    STATUS_MANAGER_APPROVED,
    STATUS_APPROVED,
    STATUS_REJECTED,
    STATUS_CANCELLED,
}
# Đơn ở các trạng thái này vẫn "chiếm" khoảng ngày -> chống tạo đơn trùng.
BLOCKING_STATUSES = (STATUS_PENDING, STATUS_MANAGER_APPROVED, STATUS_APPROVED)


# ---------------------------------------------------------------------------
# Người dùng hiện tại
# ---------------------------------------------------------------------------

def get_current_user():
    identity = get_jwt_identity()
    try:
        identity = int(identity)
    except (TypeError, ValueError):
        pass
    user = db.session.get(User, identity)
    if user is None:
        raise ApiError(401, "UNAUTHORIZED", "Phiên đăng nhập không hợp lệ.")
    return user


def get_current_employee():
    """Tài khoản phải gắn với một hồ sơ nhân viên mới dùng được module nghỉ phép."""
    user = get_current_user()
    employee = None
    if getattr(user, "employee_id", None):
        employee = db.session.get(Employee, user.employee_id)
    if employee is None:
        raise ApiError(
            400,
            "NO_EMPLOYEE_PROFILE",
            "Tài khoản chưa được gắn với hồ sơ nhân viên.",
        )
    return user, employee


def _find_user_id_for_employee(employee_id):
    user = User.query.filter_by(employee_id=employee_id).first()
    return user.id if user else None


def _notify(user_id, title, content, related_id):
    if user_id is None:
        return
    db.session.add(
        Notification(
            user_id=user_id,
            type="leave",
            title=title,
            content=content,
            is_read=False,
            related_type="leave_request",
            related_id=related_id,
        )
    )


def _notify_employee(employee_id, title, content, related_id):
    _notify(_find_user_id_for_employee(employee_id), title, content, related_id)


# ---------------------------------------------------------------------------
# Helpers nghiệp vụ
# ---------------------------------------------------------------------------

def count_workdays(from_date, to_date):
    """Số ngày làm việc (Thứ 2 - Thứ 6) trong khoảng, gồm cả 2 đầu."""
    days = 0
    current = from_date
    while current <= to_date:
        if current.weekday() < 5:
            days += 1
        current += timedelta(days=1)
    return days


def get_or_create_balance(employee_id, leave_type, year):
    balance = LeaveBalance.query.filter_by(
        employee_id=employee_id, leave_type_id=leave_type.id, year=year
    ).first()
    if balance is None:
        balance = LeaveBalance(
            employee_id=employee_id,
            leave_type_id=leave_type.id,
            year=year,
            total_days=leave_type.annual_quota_days or 0,
            used_days=0,
        )
        db.session.add(balance)
        db.session.flush()
    return balance


def _has_quota(leave_type):
    return bool(leave_type.paid) and (leave_type.annual_quota_days or 0) > 0


def _check_balance(employee_id, leave_type, from_date, days_count):
    if not _has_quota(leave_type):
        return
    balance = get_or_create_balance(employee_id, leave_type, from_date.year)
    remaining = (balance.total_days or 0) - (balance.used_days or 0)
    if days_count > remaining:
        raise ApiError(
            400,
            "INSUFFICIENT_LEAVE_BALANCE",
            f"Số dư phép không đủ: còn {remaining} ngày, đơn xin {days_count} ngày.",
        )


def _check_overlap(employee_id, from_date, to_date):
    overlap = (
        LeaveRequest.query.filter(
            LeaveRequest.employee_id == employee_id,
            LeaveRequest.status.in_(BLOCKING_STATUSES),
            LeaveRequest.from_date <= to_date,
            LeaveRequest.to_date >= from_date,
        ).first()
    )
    if overlap is not None:
        raise ApiError(
            409,
            "LEAVE_OVERLAP",
            "Khoảng ngày xin nghỉ trùng với một đơn đang chờ duyệt hoặc đã được duyệt.",
        )


def _is_manager_of(manager_employee, employee):
    """Manager quản lý trực tiếp (employees.manager_id) hoặc là trưởng phòng của nhân viên."""
    if employee is None or manager_employee is None:
        return False
    if getattr(employee, "manager_id", None) == manager_employee.id:
        return True
    department = None
    if getattr(employee, "department_id", None):
        department = db.session.get(Department, employee.department_id)
    return department is not None and department.manager_id == manager_employee.id


def _team_employee_ids(manager_employee):
    """ID nhân viên thuộc phạm vi quản lý của Manager (trực tiếp + cùng phòng mình quản lý)."""
    ids = {
        e.id
        for e in Employee.query.filter_by(manager_id=manager_employee.id).all()
    }
    managed_departments = Department.query.filter_by(
        manager_id=manager_employee.id
    ).all()
    for dept in managed_departments:
        ids.update(
            e.id for e in Employee.query.filter_by(department_id=dept.id).all()
        )
    ids.discard(manager_employee.id)
    return ids


# ---------------------------------------------------------------------------
# Use cases
# ---------------------------------------------------------------------------

def list_leave_types():
    return LeaveType.query.order_by(LeaveType.id.asc()).all()


def get_my_balances(employee, year=None):
    year = year or date.today().year
    result = []
    for leave_type in list_leave_types():
        if not _has_quota(leave_type):
            continue
        balance = get_or_create_balance(employee.id, leave_type, year)
        result.append((leave_type, balance))
    db.session.commit()
    return result


def create_leave_request(employee, data):
    leave_type = db.session.get(LeaveType, data["leave_type_id"])
    if leave_type is None:
        raise ApiError(404, "NOT_FOUND", "Loại nghỉ không tồn tại.")

    from_date = data["from_date"]
    to_date = data["to_date"]
    if to_date < from_date:
        raise ApiError(
            400, "VALIDATION_ERROR", "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu."
        )

    days_count = count_workdays(from_date, to_date)
    if days_count <= 0:
        raise ApiError(
            400,
            "VALIDATION_ERROR",
            "Khoảng ngày xin nghỉ không có ngày làm việc nào (toàn cuối tuần).",
        )

    _check_overlap(employee.id, from_date, to_date)
    _check_balance(employee.id, leave_type, from_date, days_count)

    request = LeaveRequest(
        employee_id=employee.id,
        leave_type_id=leave_type.id,
        from_date=from_date,
        to_date=to_date,
        days_count=days_count,
        reason=data.get("reason") or "",
        status=STATUS_PENDING,
    )
    db.session.add(request)
    db.session.flush()

    # Thông báo cho Manager của nhân viên (nếu xác định được) biết có đơn chờ duyệt.
    manager_id = getattr(employee, "manager_id", None)
    if manager_id and manager_id != employee.id:
        _notify_employee(
            manager_id,
            "Có đơn xin nghỉ chờ duyệt",
            f"{employee.full_name} xin nghỉ {days_count} ngày "
            f"({from_date.isoformat()} - {to_date.isoformat()}).",
            request.id,
        )
    db.session.commit()
    return request


def list_leave_requests(user, employee, status=None, scope=None, page=1, limit=20):
    if status and status not in ALL_STATUSES:
        raise ApiError(400, "VALIDATION_ERROR", f"Trạng thái không hợp lệ: {status}.")

    query = LeaveRequest.query
    if user.role == "employee":
        query = query.filter(LeaveRequest.employee_id == employee.id)
    elif user.role == "manager":
        team_ids = _team_employee_ids(employee)
        if scope == "mine":
            query = query.filter(LeaveRequest.employee_id == employee.id)
        elif scope == "team":
            query = query.filter(LeaveRequest.employee_id.in_(team_ids or [-1]))
        else:  # mặc định: của tôi + phòng tôi
            query = query.filter(
                LeaveRequest.employee_id.in_(list(team_ids) + [employee.id])
            )
    elif user.role in ("hr", "admin"):
        pass  # xem tất cả
    else:
        raise ApiError(403, "FORBIDDEN", "Vai trò không được phép xem đơn nghỉ.")

    if status:
        query = query.filter(LeaveRequest.status == status)

    total = query.count()
    items = (
        query.order_by(LeaveRequest.created_at.desc(), LeaveRequest.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return items, total


def _get_request_or_404(request_id):
    request = db.session.get(LeaveRequest, request_id)
    if request is None:
        raise ApiError(404, "NOT_FOUND", "Đơn xin nghỉ không tồn tại.")
    return request


def _validate_decision(data):
    decision = data.get("decision")
    note = (data.get("note") or "").strip()
    if decision not in ("approved", "rejected"):
        raise ApiError(
            400, "VALIDATION_ERROR", "Quyết định phải là 'approved' hoặc 'rejected'."
        )
    if decision == "rejected" and not note:
        raise ApiError(
            400, "VALIDATION_ERROR", "Từ chối đơn bắt buộc phải nhập lý do."
        )
    return decision, note


def manager_decision(manager_employee, request_id, data):
    request = _get_request_or_404(request_id)
    if request.status != STATUS_PENDING:
        raise ApiError(
            409,
            "INVALID_STATE",
            "Đơn không ở trạng thái chờ Manager duyệt (có thể đã được xử lý).",
        )
    requester = db.session.get(Employee, request.employee_id)
    if request.employee_id != manager_employee.id and not _is_manager_of(
        manager_employee, requester
    ):
        raise ApiError(
            403, "FORBIDDEN", "Bạn không phải quản lý của nhân viên tạo đơn này."
        )

    decision, note = _validate_decision(data)
    request.manager_decision = decision
    request.manager_note = note or None
    if decision == "approved":
        request.status = STATUS_MANAGER_APPROVED
        title = "Đơn xin nghỉ đã qua vòng Manager"
        content = "Quản lý trực tiếp đã duyệt đơn của bạn, đang chờ HR duyệt cuối."
    else:
        request.status = STATUS_REJECTED
        request.decided_at = func.now()
        title = "Đơn xin nghỉ bị từ chối"
        content = f"Quản lý trực tiếp từ chối đơn xin nghỉ. Lý do: {note}"
    _notify_employee(request.employee_id, title, content, request.id)
    db.session.commit()
    return request


def hr_decision(request_id, data):
    request = _get_request_or_404(request_id)
    if request.status != STATUS_MANAGER_APPROVED:
        raise ApiError(
            409,
            "INVALID_STATE",
            "Đơn chưa qua duyệt của Manager hoặc đã được HR xử lý.",
        )

    decision, note = _validate_decision(data)
    request.hr_decision = decision
    request.hr_note = note or None
    request.decided_at = func.now()

    if decision == "approved":
        # Trừ số dư phép + thông báo + đổi trạng thái: tất cả trong 1 transaction (commit cuối).
        leave_type = db.session.get(LeaveType, request.leave_type_id)
        if leave_type is not None and _has_quota(leave_type):
            balance = get_or_create_balance(
                request.employee_id, leave_type, request.from_date.year
            )
            balance.used_days = (balance.used_days or 0) + (request.days_count or 0)
        request.status = STATUS_APPROVED
        _notify_employee(
            request.employee_id,
            "Đơn xin nghỉ đã được duyệt",
            f"Đơn nghỉ {request.days_count} ngày ({request.from_date} - "
            f"{request.to_date}) đã được HR duyệt.",
            request.id,
        )
    else:
        request.status = STATUS_REJECTED
        _notify_employee(
            request.employee_id,
            "Đơn xin nghỉ bị từ chối",
            f"HR từ chối đơn xin nghỉ của bạn. Lý do: {note}",
            request.id,
        )
    db.session.commit()
    return request


def cancel_request(employee, request_id):
    request = _get_request_or_404(request_id)
    if request.employee_id != employee.id:
        raise ApiError(403, "FORBIDDEN", "Chỉ chủ đơn mới được hủy đơn xin nghỉ.")
    if request.status != STATUS_PENDING:
        raise ApiError(
            409,
            "INVALID_STATE",
            "Chỉ hủy được đơn đang chờ duyệt (chưa qua vòng Manager).",
        )
    request.status = STATUS_CANCELLED
    manager_id = getattr(employee, "manager_id", None)
    if manager_id and manager_id != employee.id:
        _notify_employee(
            manager_id,
            "Đơn xin nghỉ đã được hủy",
            f"{employee.full_name} đã hủy đơn xin nghỉ "
            f"({request.from_date} - {request.to_date}).",
            request.id,
        )
    db.session.commit()
    return request


def get_calendar(user, employee, month):
    """Đơn ĐÃ DUYỆT giao với tháng (định dạng YYYY-MM), theo phạm vi vai trò."""
    try:
        year_str, month_str = month.split("-")
        first = date(int(year_str), int(month_str), 1)
    except (ValueError, AttributeError):
        raise ApiError(
            400, "VALIDATION_ERROR", "Tham số month phải có định dạng YYYY-MM."
        )
    if first.month == 12:
        last = date(first.year, 12, 31)
    else:
        last = date(first.year, first.month + 1, 1) - timedelta(days=1)

    query = LeaveRequest.query.filter(
        LeaveRequest.status == STATUS_APPROVED,
        LeaveRequest.from_date <= last,
        LeaveRequest.to_date >= first,
    )

    if user.role in ("hr", "admin"):
        pass  # toàn công ty
    elif user.role == "manager":
        allowed = _team_employee_ids(employee) | {employee.id}
        query = query.filter(LeaveRequest.employee_id.in_(allowed))
    else:  # employee: lịch nghỉ của phòng mình
        if getattr(employee, "department_id", None):
            dept_ids = [
                e.id
                for e in Employee.query.filter_by(
                    department_id=employee.department_id
                ).all()
            ]
            query = query.filter(
                LeaveRequest.employee_id.in_(dept_ids or [employee.id])
            )
        else:
            query = query.filter(LeaveRequest.employee_id == employee.id)

    return query.order_by(LeaveRequest.from_date.asc()).all()
