"""Service layer — module Nghỉ phép (leave).

Toàn bộ logic nghiệp vụ nằm ở đây (routes chỉ validate + gọi service):
- Tạo đơn: tính ngày làm việc, kiểm tra số dư phép (loại có phép), chống trùng đơn.
- Duyệt 2 cấp: Manager (cấp 1) -> HR (cấp cuối), đúng thứ tự trạng thái.
- Duyệt HR thành công: trừ LeaveBalance + tạo Notification TRONG CÙNG transaction.
- Phân quyền theo dữ liệu (ownership / phòng ban) kiểm tra tại đây, không tin frontend.
"""

import calendar
from datetime import date, timedelta

from flask_jwt_extended import get_jwt_identity
from sqlalchemy import func

from app.errors import ApiError
from app.extensions import db
from app.models import (
    Attendance,
    Department,
    Employee,
    Holiday,
    LeaveBalance,
    LeaveCarryover,
    LeaveRequest,
    LeaveType,
    Notification,
    Setting,
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


def get_current_employee_or_none():
    """User hiện tại + hồ sơ nhân viên nếu có (None với tài khoản thuần hệ thống).

    Dùng cho các endpoint theo phạm vi VAI TRÒ (hr/admin xem toàn công ty)
    — những endpoint này không cần hồ sơ để xác định phạm vi.
    """
    user = get_current_user()
    employee = None
    if getattr(user, "employee_id", None):
        employee = db.session.get(Employee, user.employee_id)
    return user, employee


def ensure_profile_if_needed(user, employee, scope=None):
    """Bắt lỗi NO_EMPLOYEE_PROFILE chỉ khi phạm vi gọi API bắt buộc có hồ sơ.

    Cần hồ sơ: scope=mine (mọi role), role employee, role manager (phạm vi
    team/phòng). Không cần: hr/admin xem toàn công ty (danh sách đơn chờ
    duyệt cấp cuối, lịch nghỉ toàn công ty) — tài khoản admin thuần hệ thống
    vẫn dùng được các chức năng theo vai trò này.
    """
    needs_profile = scope == "mine" or user.role in ("employee", "manager")
    if needs_profile and employee is None:
        raise ApiError(
            400,
            "NO_EMPLOYEE_PROFILE",
            "Tài khoản chưa được gắn với hồ sơ nhân viên.",
        )


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

def _holiday_dates(from_date, to_date):
    """Tập ngày lễ trong khoảng (để trừ khỏi ngày làm việc).

    Bảng holidays có thể chưa có dữ liệu — khi đó trả tập rỗng và mọi
    tính toán giữ nguyên như trước khi có lịch lễ. Khi gọi ngoài
    application context (VD test thuần của count_workdays) thì không
    có DB để tra — trả tập rỗng để hàm giữ tính thuần túy.
    """
    from flask import has_app_context

    if not has_app_context():
        return set()
    rows = (db.session.query(Holiday.date)
            .filter(Holiday.date >= from_date, Holiday.date <= to_date)
            .all())
    return {row[0] for row in rows}


def count_workdays(from_date, to_date):
    """Số ngày làm việc (Thứ 2 - Thứ 6, trừ ngày lễ) trong khoảng, gồm cả 2 đầu."""
    holidays = _holiday_dates(from_date, to_date)
    days = 0
    current = from_date
    while current <= to_date:
        if current.weekday() < 5 and current not in holidays:
            days += 1
        current += timedelta(days=1)
    return days


def _workdays(from_date, to_date):
    """Liệt kê từng ngày làm việc (Thứ 2 - Thứ 6, trừ ngày lễ) trong khoảng, gồm cả 2 đầu.

    Dùng khi cần đối soát từng ngày với bảng chấm công (không chỉ đếm số
    lượng như count_workdays).
    """
    holidays = _holiday_dates(from_date, to_date)
    current = from_date
    while current <= to_date:
        if current.weekday() < 5 and current not in holidays:
            yield current
        current += timedelta(days=1)


def _sync_attendance_for_approved_leave(request):
    """Đồng bộ bảng chấm công khi đơn nghỉ được HR duyệt.

    Với mỗi ngày làm việc trong khoảng nghỉ: chưa có bản ghi -> tạo
    on_leave; đã có bản ghi absent -> đổi thành on_leave; present/late
    giữ nguyên (nhân viên đã chấm công thật ngày đó). Chạy trong cùng
    transaction với việc duyệt đơn (commit ở hr_decision).
    """
    for day in _workdays(request.from_date, request.to_date):
        record = Attendance.query.filter_by(
            employee_id=request.employee_id, work_date=day
        ).first()
        if record is None:
            db.session.add(
                Attendance(
                    employee_id=request.employee_id,
                    work_date=day,
                    status=Attendance.STATUS_ON_LEAVE,
                )
            )
        elif record.status == Attendance.STATUS_ABSENT:
            record.status = Attendance.STATUS_ON_LEAVE


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


# ---------------------------------------------------------------------------
# Cộng dồn phép năm (carryover)
#
# Phép thừa cuối năm được cộng dồn sang năm sau, tối đa max_days ngày /
# người / loại phép, hạn dùng tới expires_on (mặc định 31/03 năm sau).
# Phép cộng dồn sống riêng ở bảng leave_carryovers — KHÔNG cộng vào
# LeaveBalance.total_days của năm sau. Dùng phép cộng dồn TRƯỚC (FIFO,
# hết hạn gần nhất trước), hoàn phép theo thứ tự ngược (quota trước,
# cộng dồn sau).
# ---------------------------------------------------------------------------

KEY_CARRY_MAX_DAYS = "leave.carry_max_days"
KEY_CARRY_EXPIRY_MMDD = "leave.carry_expiry_mmdd"
CARRY_MAX_DAYS_DEFAULT = 5
CARRY_EXPIRY_DEFAULT = "03-31"


def _parse_mmdd(value):
    """'MM-DD' -> (month, day) hoặc None nếu sai định dạng / ngày không tồn tại.

    Lấy năm nhuận 2000 làm chuẩn nên 29/02 được chấp nhận; khi đổi ra
    ngày thật của năm không nhuận thì _carry_expiry_date kẹp về 28/02.
    """
    if not isinstance(value, str):
        return None
    parts = value.split("-")
    if len(parts) != 2:
        return None
    try:
        month, day = int(parts[0]), int(parts[1])
        date(2000, month, day)
    except (ValueError, TypeError):
        return None
    return (month, day)


def _carry_expiry_date(year, mmdd):
    """Ngày hết hạn phép cộng dồn của năm `year` theo policy 'MM-DD'."""
    parsed = _parse_mmdd(mmdd) or _parse_mmdd(CARRY_EXPIRY_DEFAULT)
    month, day = parsed
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, last_day))


def get_carry_policy():
    """Chính sách cộng dồn hiện hành (đọc Setting, sai giá trị -> mặc định)."""
    try:
        max_days = float(Setting.get_value(KEY_CARRY_MAX_DAYS, CARRY_MAX_DAYS_DEFAULT))
    except (TypeError, ValueError):
        max_days = float(CARRY_MAX_DAYS_DEFAULT)
    if not 0 <= max_days <= 30:
        max_days = float(CARRY_MAX_DAYS_DEFAULT)
    raw_expiry = Setting.get_value(KEY_CARRY_EXPIRY_MMDD, CARRY_EXPIRY_DEFAULT)
    expiry = raw_expiry if _parse_mmdd(raw_expiry) else CARRY_EXPIRY_DEFAULT
    return {"max_days": max_days, "expiry_mmdd": expiry}


def update_carry_policy(data):
    """Đổi chính sách cộng dồn (chỉ admin/hr — route đã chặn role).

    Cho phép cập nhật từng phần. max_days phải là số trong 0..30;
    expiry_mmdd phải là 'MM-DD' hợp lệ. Giá trị sai -> 400.
    """
    policy = get_carry_policy()
    if "max_days" in data and data["max_days"] is not None:
        value = data["max_days"]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ApiError(
                400, "VALIDATION_ERROR",
                "max_days phải là số trong khoảng 0..30.",
            )
        if not 0 <= float(value) <= 30:
            raise ApiError(
                400, "VALIDATION_ERROR",
                "max_days phải trong khoảng 0..30.",
            )
        policy["max_days"] = float(value)
        Setting.set_value(KEY_CARRY_MAX_DAYS, float(value))
    if "expiry_mmdd" in data and data["expiry_mmdd"] is not None:
        if not _parse_mmdd(data["expiry_mmdd"]):
            raise ApiError(
                400, "VALIDATION_ERROR",
                "expiry_mmdd phải có dạng MM-DD và là ngày hợp lệ (VD '03-31').",
            )
        policy["expiry_mmdd"] = data["expiry_mmdd"]
        Setting.set_value(KEY_CARRY_EXPIRY_MMDD, data["expiry_mmdd"])
    db.session.commit()
    return policy


def _carried_rows(employee_id, leave_type_id, year, on_date):
    """Các row cộng dồn (from_year = year-1) còn hiệu lực tại on_date."""
    return (
        LeaveCarryover.query.filter_by(
            employee_id=employee_id,
            leave_type_id=leave_type_id,
            from_year=year - 1,
        )
        .filter(
            LeaveCarryover.expires_on >= on_date,
            LeaveCarryover.days_remaining > 0,
        )
        .all()
    )


def carried_days(employee_id, leave_type, year, on_date=None):
    """Tổng ngày phép cộng dồn còn lại, chưa hết hạn tại on_date."""
    on_date = on_date or date.today()
    rows = _carried_rows(employee_id, leave_type.id, year, on_date)
    return sum((row.days_remaining or 0) for row in rows)


def available_days(employee_id, leave_type, year, on_date=None):
    """Số ngày phép khả dụng = (quota năm year còn lại) + phép cộng dồn chưa hết hạn."""
    on_date = on_date or date.today()
    balance = get_or_create_balance(employee_id, leave_type, year)
    quota_remaining = (balance.total_days or 0) - (balance.used_days or 0)
    return quota_remaining + carried_days(employee_id, leave_type, year, on_date)


def _consume_days(employee_id, leave_type, year, days, on_date=None):
    """Trừ phép FIFO: dùng phép cộng dồn TRƯỚC (hết hạn gần nhất trước),
    phần còn lại mới cộng vào balance.used_days của năm `year`."""
    on_date = on_date or date.today()
    remaining = days or 0
    if remaining <= 0:
        return
    rows = sorted(
        _carried_rows(employee_id, leave_type.id, year, on_date),
        key=lambda row: (row.expires_on, row.id),
    )
    for row in rows:
        if remaining <= 0:
            break
        take = min(row.days_remaining or 0, remaining)
        row.days_remaining = (row.days_remaining or 0) - take
        remaining -= take
    if remaining > 0:
        balance = get_or_create_balance(employee_id, leave_type, year)
        balance.used_days = (balance.used_days or 0) + remaining


def _refund_days(employee_id, leave_type, year, days, on_date=None):
    """Hoàn phép theo thứ tự NGƯỢC với lúc trừ: giảm balance.used_days
    trước (phần quota — vì lúc trừ quota được dùng SAU CÙNG), phần còn lại
    cộng lại vào days_remaining của cộng dồn (không vượt initial_days,
    chỉ cộng cho row chưa hết hạn tại on_date; phần hoàn cho row đã hết
    hạn thì mất luôn — phép cộng dồn quá hạn không còn giá trị)."""
    on_date = on_date or date.today()
    remaining = days or 0
    if remaining <= 0:
        return
    balance = get_or_create_balance(employee_id, leave_type, year)
    used = balance.used_days or 0
    take_from_quota = min(used, remaining)
    balance.used_days = used - take_from_quota
    remaining -= take_from_quota
    if remaining > 0:
        # Hoàn vào cộng dồn theo thứ tự ngược lúc trừ (hết hạn muộn nhất
        # trước — vì lúc trừ lấy hết hạn gần nhất trước). KHÁC với lúc trừ:
        # row đã dùng hết (days_remaining = 0) vẫn được hoàn lại, miễn là
        # chưa hết hạn và còn chỗ (initial - remaining > 0).
        rows = sorted(
            LeaveCarryover.query.filter_by(
                employee_id=employee_id,
                leave_type_id=leave_type.id,
                from_year=year - 1,
            )
            .filter(LeaveCarryover.expires_on >= on_date)
            .all(),
            key=lambda row: (row.expires_on, row.id),
            reverse=True,
        )
        for row in rows:
            if remaining <= 0:
                break
            room = (row.initial_days or 0) - (row.days_remaining or 0)
            add = min(room, remaining)
            if add <= 0:
                continue
            row.days_remaining = (row.days_remaining or 0) + add
            remaining -= add
        # remaining > 0 ở đây nghĩa là phần hoàn thuộc về row đã hết hạn:
        # mất luôn, không cộng vào đâu (ghi chú để sau này khỏi thắc mắc).


def rollover_leave(year=None):
    """Cộng dồn phép thừa cuối năm `year` sang năm year+1 (chỉ admin/hr).

    Với mỗi nhân viên đang làm việc x mỗi loại phép có quota: unused =
    max(0, total - used) của balance năm `year`; carried =
    min(unused, max_days theo policy); carried > 0 và chưa có row
    (employee, type, from_year=year) thì tạo LeaveCarryover với hạn dùng
    theo policy, đồng thời đảm bảo balance năm year+1 tồn tại. Chạy lần 2
    cùng year là idempotent: không tạo trùng, totalCarriedDays = 0.
    """
    today = date.today()
    from_year = year if year is not None else today.year - 1
    if from_year >= today.year:
        raise ApiError(
            400, "VALIDATION_ERROR",
            "Chỉ cộng dồn phép của năm đã qua (year phải nhỏ hơn năm hiện tại).",
        )
    policy = get_carry_policy()
    max_days = policy["max_days"]
    expires_on = _carry_expiry_date(from_year + 1, policy["expiry_mmdd"])

    employees = Employee.query.filter(
        Employee.status.in_((Employee.STATUS_WORKING, Employee.STATUS_ON_LEAVE))
    ).all()
    leave_types = LeaveType.query.filter(
        LeaveType.paid.is_(True), LeaveType.annual_quota_days > 0
    ).all()

    employees_carried = set()
    total_carried = 0.0
    skipped_existing = 0
    for employee in employees:
        for leave_type in leave_types:
            balance = LeaveBalance.query.filter_by(
                employee_id=employee.id,
                leave_type_id=leave_type.id,
                year=from_year,
            ).first()
            if balance is None:
                continue
            unused = max(0, (balance.total_days or 0) - (balance.used_days or 0))
            carried = min(unused, max_days)
            if carried <= 0:
                continue
            existing = LeaveCarryover.query.filter_by(
                employee_id=employee.id,
                leave_type_id=leave_type.id,
                from_year=from_year,
            ).first()
            if existing is not None:
                skipped_existing += 1
                continue
            db.session.add(LeaveCarryover(
                employee_id=employee.id,
                leave_type_id=leave_type.id,
                from_year=from_year,
                initial_days=carried,
                days_remaining=carried,
                expires_on=expires_on,
            ))
            # Đảm bảo balance năm sau tồn tại (phép cộng dồn KHÔNG cộng vào
            # total_days — nó sống riêng ở bảng carryover).
            get_or_create_balance(employee.id, leave_type, from_year + 1)
            employees_carried.add(employee.id)
            total_carried += carried
    db.session.commit()
    return {
        "fromYear": from_year,
        "toYear": from_year + 1,
        "employeesProcessed": len(employees),
        "employeesCarried": len(employees_carried),
        "totalCarriedDays": total_carried,
        "skippedExisting": skipped_existing,
    }


def _check_balance(employee_id, leave_type, from_date, days_count):
    if not _has_quota(leave_type):
        return
    remaining = available_days(employee_id, leave_type, from_date.year)
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
    if scope == "mine":
        # Mọi vai trò đều xem được đúng đơn của chính mình khi scope=mine.
        query = query.filter(LeaveRequest.employee_id == employee.id)
    elif user.role == "employee":
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
    if request.employee_id == manager_employee.id:
        raise ApiError(
            403,
            "FORBIDDEN",
            "Bạn không được duyệt đơn nghỉ của chính mình.",
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


def hr_decision(request_id, data, actor_employee=None):
    """HR duyệt cuối. actor_employee (nếu có) là người đang bấm duyệt —
    không được duyệt đơn của chính mình; service gọi trực tiếp (chatbot,
    test) không truyền actor thì bỏ qua kiểm tra này."""
    request = _get_request_or_404(request_id)
    if request.status != STATUS_MANAGER_APPROVED:
        raise ApiError(
            409,
            "INVALID_STATE",
            "Đơn chưa qua duyệt của Manager hoặc đã được HR xử lý.",
        )
    if actor_employee is not None and request.employee_id == actor_employee.id:
        raise ApiError(
            403,
            "FORBIDDEN",
            "Bạn không được duyệt đơn nghỉ của chính mình.",
        )

    decision, note = _validate_decision(data)
    if decision == "approved":
        # Kiểm tra lại số dư TRƯỚC khi trừ: hai đơn có thể cùng được tạo
        # khi còn đủ phép nhưng duyệt cả hai sẽ làm số dư âm. Số dư khả
        # dụng = quota còn lại + phép cộng dồn chưa hết hạn.
        leave_type = db.session.get(LeaveType, request.leave_type_id)
        if leave_type is not None and _has_quota(leave_type):
            remaining = available_days(
                request.employee_id, leave_type, request.from_date.year
            )
            if (request.days_count or 0) > remaining:
                raise ApiError(
                    409,
                    "INSUFFICIENT_LEAVE_BALANCE",
                    f"Số dư phép không đủ: còn {remaining} ngày, "
                    f"đơn xin {request.days_count} ngày.",
                )

    request.hr_decision = decision
    request.hr_note = note or None
    request.decided_at = func.now()

    if decision == "approved":
        # Trừ số dư phép FIFO (cộng dồn trước, quota sau) + thông báo +
        # đổi trạng thái: tất cả trong 1 transaction (commit cuối).
        leave_type = db.session.get(LeaveType, request.leave_type_id)
        if leave_type is not None and _has_quota(leave_type):
            _consume_days(
                request.employee_id, leave_type, request.from_date.year,
                request.days_count or 0,
            )
        request.status = STATUS_APPROVED
        _sync_attendance_for_approved_leave(request)
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


def cancel_approved_leave(request_id, actor_user=None):
    """HR/Admin hủy đơn nghỉ ĐÃ ĐƯỢC DUYỆT.

    Chỉ hoàn số dư + xóa bản ghi chấm công on_leave cho các ngày làm việc
    trong TƯƠNG LAI (work_date >= hôm nay); các ngày đã qua giữ nguyên
    (vẫn trừ phép, vẫn on_leave). Ngày tương lai chưa có bản ghi thì không
    có gì để xóa — materialize sẽ tạo lại absent khi cần. Đơn chuyển
    thành CANCELLED. actor_user (nếu truyền) phải có role hr/admin —
    route đã chặn bằng require_roles, đây là lớp phòng thủ thứ hai.
    """
    if actor_user is not None and actor_user.role not in ("hr", "admin"):
        raise ApiError(
            403, "FORBIDDEN", "Chỉ HR hoặc Admin mới được hủy đơn đã duyệt."
        )
    request = _get_request_or_404(request_id)
    if request.status != STATUS_APPROVED:
        raise ApiError(
            409,
            "INVALID_STATE",
            "Chỉ hủy được đơn nghỉ đã được duyệt.",
        )

    today = date.today()
    future_days = 0
    for day in _workdays(request.from_date, request.to_date):
        if day < today:
            continue
        future_days += 1
        record = Attendance.query.filter_by(
            employee_id=request.employee_id, work_date=day
        ).first()
        if record is not None and record.status == Attendance.STATUS_ON_LEAVE:
            db.session.delete(record)

    if future_days:
        leave_type = db.session.get(LeaveType, request.leave_type_id)
        if leave_type is not None and _has_quota(leave_type):
            # Hoàn theo thứ tự ngược lúc trừ: giảm used_days (quota) trước,
            # phần còn lại cộng lại vào phép cộng dồn (không vượt initial,
            # row đã hết hạn thì phần hoàn đó mất luôn).
            _refund_days(
                request.employee_id, leave_type, request.from_date.year,
                future_days,
            )

    request.status = STATUS_CANCELLED
    _notify_employee(
        request.employee_id,
        "Đơn xin nghỉ đã duyệt đã bị hủy",
        f"Đơn nghỉ {request.days_count} ngày ({request.from_date} - "
        f"{request.to_date}) đã bị HR hủy. Số phép của các ngày chưa tới "
        f"được hoàn lại.",
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
