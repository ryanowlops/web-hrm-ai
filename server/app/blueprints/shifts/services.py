"""Service layer cho module Shifts (ca lam, tang ca, giai trinh cham cong).

Logic nghiep vu + transaction; routes chi validate input, goi service va
tra JSON. Loi nghiep vu nem ra duoi dang ApiError (dinh dang chuan
{"error": {"code", "message", "details"}}) — theo mau training.

Quy tac chinh (hop dong feature-expansion-v3 muc 1):
- Dinh nghia ca: doc moi role; ghi (tao/sua/xoa) chi admin/hr.
- Lich ca tuan: admin/hr thay toan cong ty (loc department_id duoc);
  manager thay doi cua minh (mau leave: bao cao truc tiep + phong ban
  minh quan ly); employee thay minh + dong nghiep cung phong.
- Gan ca: admin/hr gan cho bat ky ai; manager chi trong doi cua minh.
  POST assignment la upsert theo UNIQUE(employee_id, work_date) — gan lai
  cung ngay = doi ca.
- Don tang ca / giai trinh: may trang thai duyet 2 cap nhu leave
  (pending -> manager_approved -> approved; rejected o bat ky cap nao).
  Giai trinh duoc HR duyet (approved) thi cap nhat ban ghi Attendance
  tuong ung (tao moi neu chua co) bang gio da duyet.
"""

from datetime import date, datetime, time, timedelta

from app.blueprints.auth.guards import load_current_user
from app.extensions import db
from app.models import Attendance, Department, Employee, Notification, User
from app.models.shifts import (
    AttendanceCorrection,
    OvertimeRequest,
    ShiftAssignment,
    ShiftDefinition,
)
from app.models.users import utcnow

WRITE_ROLES = ("admin", "hr")

STATUS_PENDING = "pending"
STATUS_MANAGER_APPROVED = "manager_approved"
STATUS_APPROVED = "approved"
STATUS_REJECTED = "rejected"


class ApiError(Exception):
    """Loi nghiep vu co ma HTTP + code chuan de routes tra ve."""

    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or []


# ---------------------------------------------------------------------------
# Helpers dung chung
# ---------------------------------------------------------------------------

def current_user():
    return load_current_user()


def get_or_404(model, pk, code, message):
    obj = db.session.get(model, pk)
    if obj is None:
        raise ApiError(404, code, message)
    return obj


def parse_pagination(args):
    try:
        page = int(args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    try:
        limit = int(args.get("limit", 20))
    except (TypeError, ValueError):
        limit = 20
    page = max(page, 1)
    limit = min(max(limit, 1), 100)
    return page, limit


def paginate(query, page, limit):
    total = query.count()
    total_pages = (total + limit - 1) // limit if total else 0
    items = query.offset((page - 1) * limit).limit(limit).all()
    meta = {
        "page": page,
        "limit": limit,
        "totalItems": total,
        "totalPages": total_pages,
    }
    return items, meta


def _current_employee(user):
    if getattr(user, "employee_id", None):
        return db.session.get(Employee, user.employee_id)
    return None


def _require_current_employee(user):
    employee = _current_employee(user)
    if employee is None:
        raise ApiError(
            400,
            "NO_EMPLOYEE_PROFILE",
            "Tài khoản chưa được gắn với hồ sơ nhân viên.",
        )
    return employee


def _notify_employee(employee_id, title, content, related_type, related_id):
    """Tao Notification cho nhan vien (neu co tai khoan dang nhap)."""
    user = User.query.filter_by(employee_id=employee_id).first()
    if user is None:
        return
    db.session.add(
        Notification(
            user_id=user.id,
            type="shifts",
            title=title,
            content=content,
            is_read=False,
            related_type=related_type,
            related_id=related_id,
        )
    )


# --- Manager scope (bam leave/services.py) --------------------------------

def _is_manager_of(manager_employee, employee):
    """Manager quan ly truc tiep (manager_id) hoac la truong phong cua NV."""
    if employee is None or manager_employee is None:
        return False
    if getattr(employee, "manager_id", None) == manager_employee.id:
        return True
    department = None
    if getattr(employee, "department_id", None):
        department = db.session.get(Department, employee.department_id)
    return department is not None and department.manager_id == manager_employee.id


def _team_employee_ids(manager_employee):
    """ID nhan vien thuoc pham vi quan ly cua Manager (khong gom chinh manager)."""
    ids = {
        e.id for e in Employee.query.filter_by(manager_id=manager_employee.id).all()
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


def visible_employee_ids(user, employee):
    """Tap employee_id nguoi dung duoc thay trong lich ca / danh sach don."""
    if user.role in WRITE_ROLES:
        return None  # None = toan cong ty
    if user.role == "manager":
        if employee is None:
            return set()
        return _team_employee_ids(employee) | {employee.id}
    # employee: minh + dong nghiep cung phong ban
    if employee is None:
        return set()
    ids = {employee.id}
    if getattr(employee, "department_id", None):
        ids.update(
            e.id
            for e in Employee.query.filter_by(
                department_id=employee.department_id
            ).all()
        )
    return ids


# ---------------------------------------------------------------------------
# Dinh nghia ca (ShiftDefinition)
# ---------------------------------------------------------------------------

def list_definitions(user, args=None):
    query = ShiftDefinition.query
    if user.role == "employee":
        query = query.filter(ShiftDefinition.is_active.is_(True))
    elif args is not None:
        is_active = args.get("is_active")
        if is_active is not None and str(is_active).lower() in ("true", "false", "1", "0"):
            query = query.filter(
                ShiftDefinition.is_active.is_(str(is_active).lower() in ("true", "1"))
            )
    return query.order_by(ShiftDefinition.start_time.asc(), ShiftDefinition.id.asc()).all()


def create_definition(cleaned):
    existing = ShiftDefinition.query.filter_by(name=cleaned["name"]).first()
    if existing is not None:
        raise ApiError(
            409, "SHIFT_NAME_TAKEN", f"Đã có ca tên '{cleaned['name']}'."
        )
    definition = ShiftDefinition(
        name=cleaned["name"],
        start_time=cleaned["start_time"],
        end_time=cleaned["end_time"],
        break_minutes=cleaned.get("break_minutes", 60),
        is_overnight=cleaned.get("is_overnight", False),
        is_active=cleaned.get("is_active", True),
    )
    db.session.add(definition)
    db.session.commit()
    return definition


def update_definition(definition_id, cleaned):
    definition = get_or_404(
        ShiftDefinition, definition_id, "SHIFT_NOT_FOUND", "Không tìm thấy ca làm việc."
    )
    if "name" in cleaned and cleaned["name"] != definition.name:
        clash = ShiftDefinition.query.filter_by(name=cleaned["name"]).first()
        if clash is not None:
            raise ApiError(
                409, "SHIFT_NAME_TAKEN", f"Đã có ca tên '{cleaned['name']}'."
            )
    for field, value in cleaned.items():
        setattr(definition, field, value)
    db.session.commit()
    return definition


def delete_definition(definition_id):
    """Xoa ca; neu da co gan ca thi chi tat (is_active=False) de giu lich su."""
    definition = get_or_404(
        ShiftDefinition, definition_id, "SHIFT_NOT_FOUND", "Không tìm thấy ca làm việc."
    )
    in_use = ShiftAssignment.query.filter_by(shift_id=definition.id).count() > 0
    if in_use:
        definition.is_active = False
        db.session.commit()
        return definition, False
    db.session.delete(definition)
    db.session.commit()
    return definition, True


# ---------------------------------------------------------------------------
# Lich ca tuan + gan ca (ShiftAssignment)
# ---------------------------------------------------------------------------

def week_bounds(any_date):
    """(Thu 2, Chu nhat) cua tuan chua any_date."""
    monday = any_date - timedelta(days=any_date.weekday())
    return monday, monday + timedelta(days=6)


def get_week(user, any_date, department_id=None):
    monday, sunday = week_bounds(any_date)
    days = [monday + timedelta(days=i) for i in range(7)]

    visible = visible_employee_ids(user, _current_employee(user))
    query = Employee.query
    if visible is not None:
        query = query.filter(Employee.id.in_(visible or [-1]))
    if department_id is not None and user.role in WRITE_ROLES:
        query = query.filter(Employee.department_id == department_id)
    employees = query.order_by(Employee.code.asc(), Employee.id.asc()).all()

    emp_ids = [e.id for e in employees]
    assignments = []
    if emp_ids:
        assignments = (
            ShiftAssignment.query.filter(
                ShiftAssignment.employee_id.in_(emp_ids),
                ShiftAssignment.work_date >= monday,
                ShiftAssignment.work_date <= sunday,
            ).all()
        )
    by_key = {(a.employee_id, a.work_date): a for a in assignments}

    from app.blueprints.shifts import schemas

    rows = []
    for employee in employees:
        cells = []
        for day in days:
            assignment = by_key.get((employee.id, day))
            cells.append(
                {
                    "date": day.isoformat(),
                    "assignment": (
                        schemas.assignment_to_dict(assignment) if assignment else None
                    ),
                }
            )
        rows.append(
            {
                "employee": {
                    "id": employee.id,
                    "code": employee.code,
                    "full_name": employee.full_name,
                    "department_id": employee.department_id,
                    "department_name": (
                        employee.department.name if employee.department else None
                    ),
                },
                "cells": cells,
            }
        )
    return {
        "start_date": monday.isoformat(),
        "end_date": sunday.isoformat(),
        "days": [d.isoformat() for d in days],
        "rows": rows,
    }


def upsert_assignment(user, cleaned):
    """Gan ca (tao moi hoac doi ca neu ngay do da co gan)."""
    employee = get_or_404(
        Employee, cleaned["employee_id"], "EMPLOYEE_NOT_FOUND", "Không tìm thấy nhân viên."
    )
    shift = get_or_404(
        ShiftDefinition, cleaned["shift_id"], "SHIFT_NOT_FOUND", "Không tìm thấy ca làm việc."
    )
    if not shift.is_active:
        raise ApiError(400, "SHIFT_INACTIVE", "Ca này đã tắt, không thể gán.")
    if user.role == "manager":
        actor = _require_current_employee(user)
        if employee.id != actor.id and not _is_manager_of(actor, employee):
            raise ApiError(
                403, "FORBIDDEN", "Manager chỉ được gán ca cho nhân viên trong phòng mình."
            )
    assignment = ShiftAssignment.query.filter_by(
        employee_id=employee.id, work_date=cleaned["work_date"]
    ).first()
    if assignment is None:
        assignment = ShiftAssignment(
            employee_id=employee.id,
            shift_id=shift.id,
            work_date=cleaned["work_date"],
            note=cleaned.get("note"),
        )
        db.session.add(assignment)
        created = True
    else:
        assignment.shift_id = shift.id
        assignment.note = cleaned.get("note")
        created = False
    db.session.commit()
    return assignment, created


def delete_assignment(user, assignment_id):
    assignment = get_or_404(
        ShiftAssignment, assignment_id, "ASSIGNMENT_NOT_FOUND", "Không tìm thấy bản ghi gán ca."
    )
    if user.role == "manager":
        actor = _require_current_employee(user)
        owner = db.session.get(Employee, assignment.employee_id)
        if assignment.employee_id != actor.id and not _is_manager_of(actor, owner):
            raise ApiError(
                403, "FORBIDDEN", "Manager chỉ được xoá gán ca trong phòng mình."
            )
    db.session.delete(assignment)
    db.session.commit()
    return assignment


def my_schedule(user, month_str):
    """Lich ca cua chinh nhan vien trong thang YYYY-MM."""
    employee = _require_current_employee(user)
    try:
        year_str, mon_str = month_str.split("-")
        first = date(int(year_str), int(mon_str), 1)
    except (ValueError, AttributeError):
        raise ApiError(
            400, "VALIDATION_ERROR", "Tham số month phải có định dạng YYYY-MM."
        )
    if first.month == 12:
        last = date(first.year, 12, 31)
    else:
        last = date(first.year, first.month + 1, 1) - timedelta(days=1)
    items = (
        ShiftAssignment.query.filter(
            ShiftAssignment.employee_id == employee.id,
            ShiftAssignment.work_date >= first,
            ShiftAssignment.work_date <= last,
        )
        .order_by(ShiftAssignment.work_date.asc())
        .all()
    )
    return items


# ---------------------------------------------------------------------------
# Don duyet 2 cap — logic dung chung cho tang ca & giai trinh
# ---------------------------------------------------------------------------

def _resolve_target_employee(user, cleaned):
    """Nhan vien chu don: mac dinh la chinh nguoi tao; chi HR/Admin tao ho."""
    actor_employee = _require_current_employee(user)
    target_id = cleaned.get("employee_id")
    if target_id is None or target_id == actor_employee.id:
        return actor_employee
    if user.role not in WRITE_ROLES:
        raise ApiError(
            403, "FORBIDDEN", "Chỉ HR/Admin mới được tạo đơn hộ nhân viên khác."
        )
    return get_or_404(
        Employee, target_id, "EMPLOYEE_NOT_FOUND", "Không tìm thấy nhân viên."
    )


def _scope_query(query, model, user, employee, scope, status):
    if status and status not in model.STATUSES:
        raise ApiError(400, "VALIDATION_ERROR", f"Trạng thái không hợp lệ: {status}.")
    if scope == "mine" or user.role == "employee":
        query = query.filter(model.employee_id == employee.id)
    elif user.role == "manager":
        team_ids = _team_employee_ids(employee)
        if scope == "team":
            query = query.filter(model.employee_id.in_(team_ids or [-1]))
        else:  # mac dinh + "all": cua toi + doi cua toi
            query = query.filter(
                model.employee_id.in_(list(team_ids) + [employee.id])
            )
    elif user.role in WRITE_ROLES:
        pass  # toan cong ty
    else:
        raise ApiError(403, "FORBIDDEN", "Vai trò không được phép xem danh sách đơn.")
    if status:
        query = query.filter(model.status == status)
    return query


def _manager_decide(actor_user, obj, decision, note, *, related_type, labels):
    if obj.status != STATUS_PENDING:
        raise ApiError(
            409,
            "INVALID_STATE",
            f"Đơn không ở trạng thái chờ Manager duyệt (có thể đã được xử lý).",
        )
    actor_employee = _require_current_employee(actor_user)
    owner = db.session.get(Employee, obj.employee_id)
    if obj.employee_id != actor_employee.id and not _is_manager_of(actor_employee, owner):
        raise ApiError(
            403, "FORBIDDEN", "Bạn không phải quản lý của nhân viên tạo đơn này."
        )
    obj.manager_decision = decision
    obj.manager_decided_by = actor_user.id
    obj.manager_decided_at = utcnow()
    obj.manager_note = note
    if decision == "approved":
        obj.status = STATUS_MANAGER_APPROVED
        title = labels["manager_approved_title"]
        content = labels["manager_approved_content"]
    else:
        obj.status = STATUS_REJECTED
        title = labels["rejected_title"]
        content = f"Quản lý trực tiếp từ chối {labels['noun']}. Lý do: {note}"
    _notify_employee(obj.employee_id, title, content, related_type, obj.id)
    db.session.commit()
    return obj


def _hr_decide(actor_user, obj, decision, note, *, related_type, labels, on_approved=None):
    if obj.status != STATUS_MANAGER_APPROVED:
        raise ApiError(
            409,
            "INVALID_STATE",
            "Đơn chưa qua duyệt của Manager hoặc đã được HR xử lý.",
        )
    obj.hr_decision = decision
    obj.hr_decided_by = actor_user.id
    obj.hr_decided_at = utcnow()
    obj.hr_note = note
    if decision == "approved":
        obj.status = STATUS_APPROVED
        if on_approved is not None:
            on_approved(obj, actor_user)
        title = labels["approved_title"]
        content = labels["approved_content"]
    else:
        obj.status = STATUS_REJECTED
        title = labels["rejected_title"]
        content = f"HR từ chối {labels['noun']}. Lý do: {note}"
    _notify_employee(obj.employee_id, title, content, related_type, obj.id)
    db.session.commit()
    return obj


# ---------------------------------------------------------------------------
# Tang ca (OvertimeRequest)
# ---------------------------------------------------------------------------

_OVERTIME_LABELS = {
    "noun": "đơn tăng ca",
    "manager_approved_title": "Đơn tăng ca đã qua vòng Manager",
    "manager_approved_content": "Quản lý trực tiếp đã duyệt đơn tăng ca của bạn, đang chờ HR duyệt cuối.",
    "approved_title": "Đơn tăng ca đã được duyệt",
    "approved_content": "Đơn tăng ca của bạn đã được HR duyệt.",
    "rejected_title": "Đơn tăng ca bị từ chối",
}


def create_overtime(user, cleaned):
    target = _resolve_target_employee(user, cleaned)
    request = OvertimeRequest(
        employee_id=target.id,
        work_date=cleaned["work_date"],
        hours=cleaned["hours"],
        reason=cleaned.get("reason"),
        status=STATUS_PENDING,
    )
    db.session.add(request)
    db.session.flush()
    manager_id = getattr(target, "manager_id", None)
    if manager_id and manager_id != target.id:
        _notify_employee(
            manager_id,
            "Có đơn tăng ca chờ duyệt",
            f"{target.full_name} xin tăng ca {cleaned['hours']} giờ "
            f"ngày {cleaned['work_date'].isoformat()}.",
            "overtime_request",
            request.id,
        )
    db.session.commit()
    return request


def list_overtime(user, args):
    # Staff (admin/hr) xem danh sách toàn công ty không cần hồ sơ nhân viên
    # cá nhân — hồ sơ chỉ bắt buộc cho scope "mine" và các role suy phạm vi
    # từ hồ sơ (employee/manager). Trước đây admin hệ thống (không gắn hồ sơ)
    # bị 400 NO_EMPLOYEE_PROFILE ngay ở danh sách dù _scope_query không hề
    # dùng employee cho nhánh WRITE_ROLES.
    if user.role in WRITE_ROLES and args.get("scope") != "mine":
        employee = _current_employee(user)
    else:
        employee = _require_current_employee(user)
    query = _scope_query(
        OvertimeRequest.query,
        OvertimeRequest,
        user,
        employee,
        args.get("scope"),
        args.get("status"),
    )
    query = query.order_by(OvertimeRequest.created_at.desc(), OvertimeRequest.id.desc())
    page, limit = parse_pagination(args)
    return paginate(query, page, limit)


def overtime_manager_decision(user, request_id, decision, note):
    obj = get_or_404(
        OvertimeRequest, request_id, "OVERTIME_NOT_FOUND", "Không tìm thấy đơn tăng ca."
    )
    return _manager_decide(
        user, obj, decision, note,
        related_type="overtime_request", labels=_OVERTIME_LABELS,
    )


def overtime_hr_decision(user, request_id, decision, note):
    obj = get_or_404(
        OvertimeRequest, request_id, "OVERTIME_NOT_FOUND", "Không tìm thấy đơn tăng ca."
    )
    return _hr_decide(
        user, obj, decision, note,
        related_type="overtime_request", labels=_OVERTIME_LABELS,
    )


# ---------------------------------------------------------------------------
# Giai trinh cham cong (AttendanceCorrection)
# ---------------------------------------------------------------------------

_CORRECTION_LABELS = {
    "noun": "đơn giải trình chấm công",
    "manager_approved_title": "Đơn giải trình đã qua vòng Manager",
    "manager_approved_content": "Quản lý trực tiếp đã duyệt đơn giải trình của bạn, đang chờ HR duyệt cuối.",
    "approved_title": "Đơn giải trình đã được duyệt",
    "approved_content": "Đơn giải trình của bạn đã được HR duyệt và chấm công đã được cập nhật.",
    "rejected_title": "Đơn giải trình bị từ chối",
}


def create_correction(user, cleaned):
    target = _resolve_target_employee(user, cleaned)
    attendance = None
    if cleaned.get("attendance_id") is not None:
        attendance = db.session.get(Attendance, cleaned["attendance_id"])
        if attendance is None:
            raise ApiError(
                404, "ATTENDANCE_NOT_FOUND", "Không tìm thấy bản ghi chấm công."
            )
        if attendance.employee_id != target.id:
            raise ApiError(
                400,
                "VALIDATION_ERROR",
                "Bản ghi chấm công không thuộc nhân viên của đơn giải trình.",
            )
    correction = AttendanceCorrection(
        employee_id=target.id,
        attendance_id=attendance.id if attendance else None,
        work_date=cleaned["work_date"],
        requested_check_in=cleaned.get("requested_check_in"),
        requested_check_out=cleaned.get("requested_check_out"),
        reason=cleaned.get("reason"),
        status=STATUS_PENDING,
    )
    db.session.add(correction)
    db.session.flush()
    manager_id = getattr(target, "manager_id", None)
    if manager_id and manager_id != target.id:
        _notify_employee(
            manager_id,
            "Có đơn giải trình chấm công chờ duyệt",
            f"{target.full_name} gửi giải trình chấm công "
            f"ngày {cleaned['work_date'].isoformat()}.",
            "attendance_correction",
            correction.id,
        )
    db.session.commit()
    return correction


def list_corrections(user, args):
    # Xem list_overtime: staff (admin/hr) không cần hồ sơ cá nhân để xem
    # danh sách toàn công ty; hồ sơ chỉ bắt buộc cho scope "mine"/employee/manager.
    if user.role in WRITE_ROLES and args.get("scope") != "mine":
        employee = _current_employee(user)
    else:
        employee = _require_current_employee(user)
    query = _scope_query(
        AttendanceCorrection.query,
        AttendanceCorrection,
        user,
        employee,
        args.get("scope"),
        args.get("status"),
    )
    query = query.order_by(
        AttendanceCorrection.created_at.desc(), AttendanceCorrection.id.desc()
    )
    page, limit = parse_pagination(args)
    return paginate(query, page, limit)


def _apply_correction_to_attendance(correction, actor_user):
    """Cap nhat/tao ban ghi Attendance theo gio giai trinh da duoc HR duyet."""
    attendance = None
    if correction.attendance_id is not None:
        attendance = db.session.get(Attendance, correction.attendance_id)
    if attendance is None:
        attendance = Attendance.query.filter_by(
            employee_id=correction.employee_id, work_date=correction.work_date
        ).first()
    if attendance is None:
        attendance = Attendance(
            employee_id=correction.employee_id,
            work_date=correction.work_date,
            status=Attendance.STATUS_PRESENT,
        )
        db.session.add(attendance)
    if correction.requested_check_in is not None:
        attendance.check_in_at = correction.requested_check_in
    if correction.requested_check_out is not None:
        attendance.check_out_at = correction.requested_check_out
    if attendance.status == Attendance.STATUS_ABSENT and attendance.check_in_at:
        attendance.status = Attendance.STATUS_PRESENT
    marker = f"Giải trình #{correction.id} đã duyệt"
    attendance.note = (
        f"{attendance.note} | {marker}" if attendance.note else marker
    )
    attendance.edited_by = actor_user.id
    correction.attendance_id = attendance.id if attendance.id else None
    db.session.flush()
    correction.attendance_id = attendance.id


def correction_manager_decision(user, correction_id, decision, note):
    obj = get_or_404(
        AttendanceCorrection, correction_id,
        "CORRECTION_NOT_FOUND", "Không tìm thấy đơn giải trình.",
    )
    return _manager_decide(
        user, obj, decision, note,
        related_type="attendance_correction", labels=_CORRECTION_LABELS,
    )


def correction_hr_decision(user, correction_id, decision, note):
    obj = get_or_404(
        AttendanceCorrection, correction_id,
        "CORRECTION_NOT_FOUND", "Không tìm thấy đơn giải trình.",
    )
    return _hr_decide(
        user, obj, decision, note,
        related_type="attendance_correction", labels=_CORRECTION_LABELS,
        on_approved=_apply_correction_to_attendance,
    )
