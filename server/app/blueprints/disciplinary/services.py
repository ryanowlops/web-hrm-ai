"""Service layer cho module Kỷ luật nhân viên.

Chứa toàn bộ logic nghiệp vụ + transaction. Routes chỉ validate input,
gọi service và trả JSON. Lỗi nghiệp vụ ném ra dưới dạng ApiError
(app.errors) để error handler toàn cục chuyển thành định dạng lỗi chuẩn:
    {"error": {"code": ..., "message": ..., "details": [...]}}.

Phạm vi xem (cùng quy ước với probation / stats):
- admin/hr: toàn công ty.
- manager: nhân viên thuộc phòng mình quản lý.
- employee: chỉ biên bản của chính mình.
"""

from app.errors import ApiError
from app.extensions import db
from app.models import Department, Employee
from app.models.disciplinary import DisciplinaryRecord

HR_ADMIN_ROLES = ("admin", "hr")


def _manager_department_ids(user) -> list[int]:
    """Các phòng ban trong phạm vi của Manager (rỗng nếu không có).

    Ưu tiên mọi phòng ban mà nhân viên làm trưởng phòng
    (departments.manager_id); nếu không làm trưởng phòng nào thì lùi về
    phòng ban nhân viên đang thuộc về. Cùng quy ước với probation.
    """
    employee = user.employee if user is not None else None
    if employee is None:
        return []
    managed = (
        Department.query.filter_by(manager_id=employee.id)
        .order_by(Department.id)
        .all()
    )
    if managed:
        return [dept.id for dept in managed]
    if employee.department_id is not None:
        return [employee.department_id]
    return []


def parse_pagination(args):
    """Đọc page/limit từ query string, kẹp trong giới hạn cho phép."""
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
    """Phân trang một query SQLAlchemy, trả (items, meta) đúng quy ước."""
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


def _scoped_query(user):
    """Query biên bản kỷ luật trong phạm vi của user hiện tại."""
    query = (
        DisciplinaryRecord.query.join(
            Employee, DisciplinaryRecord.employee_id == Employee.id
        )
    )
    role = getattr(user, "role", None)
    if role == "manager":
        dept_ids = _manager_department_ids(user)
        if not dept_ids:
            raise ApiError(
                403,
                "FORBIDDEN",
                "Tài khoản Manager chưa gắn với phòng ban nào.",
            )
        query = query.filter(Employee.department_id.in_(dept_ids))
    elif role == "employee":
        employee_id = getattr(user, "employee_id", None)
        # Nhân viên chưa gắn hồ sơ: không thấy biên bản nào.
        query = query.filter(DisciplinaryRecord.employee_id == employee_id)
    return query


def _check_scope(user, record) -> None:
    """Chặn xem một biên bản ngoài phạm vi (manager: 403, employee: 404)."""
    role = getattr(user, "role", None)
    if role == "manager":
        dept_ids = _manager_department_ids(user)
        if record.employee.department_id not in dept_ids:
            raise ApiError(
                403,
                "FORBIDDEN",
                "Biên bản này không thuộc phòng ban bạn quản lý.",
            )
    elif role == "employee":
        if record.employee_id != getattr(user, "employee_id", None):
            raise ApiError(
                404,
                "RECORD_NOT_FOUND",
                "Không tìm thấy biên bản kỷ luật.",
            )


def list_records(args, user):
    """Danh sách biên bản kỷ luật trong phạm vi, có lọc + phân trang.

    Lọc: ?employee_id= (số nguyên), ?status= (active/resolved),
    ?severity= (low/medium/high). Giá trị lọc sai -> 400.
    Sắp xếp: ngày lập mới nhất trước.
    """
    query = _scoped_query(user)

    employee_id = args.get("employee_id")
    if employee_id:
        try:
            employee_id_int = int(employee_id)
        except (TypeError, ValueError):
            raise ApiError(
                400,
                "VALIDATION_ERROR",
                "employee_id phải là số nguyên.",
                details=[
                    {"field": "employee_id", "message": "Phải là số nguyên."}
                ],
            )
        query = query.filter(
            DisciplinaryRecord.employee_id == employee_id_int
        )

    status = args.get("status")
    if status:
        if status not in DisciplinaryRecord.STATUSES:
            raise ApiError(
                400,
                "VALIDATION_ERROR",
                "status phải là active hoặc resolved.",
                details=[
                    {
                        "field": "status",
                        "message": "Phải là active hoặc resolved.",
                    }
                ],
            )
        query = query.filter(DisciplinaryRecord.status == status)

    severity = args.get("severity")
    if severity:
        if severity not in DisciplinaryRecord.SEVERITIES:
            raise ApiError(
                400,
                "VALIDATION_ERROR",
                "severity phải là low, medium hoặc high.",
                details=[
                    {
                        "field": "severity",
                        "message": "Phải là low, medium hoặc high.",
                    }
                ],
            )
        query = query.filter(DisciplinaryRecord.severity == severity)

    query = query.order_by(
        DisciplinaryRecord.issued_date.desc(), DisciplinaryRecord.id.desc()
    )
    page, limit = parse_pagination(args)
    return paginate(query, page, limit)


def get_record(record_id, user=None):
    """Lấy một biên bản theo id; kèm kiểm tra phạm vi nếu có user."""
    record = db.session.get(DisciplinaryRecord, record_id)
    if record is None:
        raise ApiError(
            404, "RECORD_NOT_FOUND", "Không tìm thấy biên bản kỷ luật."
        )
    if user is not None:
        _check_scope(user, record)
    return record


def create_record(data, issued_by=None):
    """Tạo biên bản kỷ luật cho một nhân viên đang làm việc.

    Nhân viên không tồn tại -> 404; nhân viên đã nghỉ việc -> 400.
    """
    employee = db.session.get(Employee, data["employee_id"])
    if employee is None:
        raise ApiError(
            404, "EMPLOYEE_NOT_FOUND", "Không tìm thấy nhân viên."
        )
    if employee.status not in (
        Employee.STATUS_WORKING,
        Employee.STATUS_ON_LEAVE,
    ):
        raise ApiError(
            400,
            "EMPLOYEE_NOT_ACTIVE",
            "Chỉ lập biên bản kỷ luật cho nhân viên đang làm việc.",
        )
    record = DisciplinaryRecord(
        employee_id=employee.id,
        type=data["type"],
        severity=data["severity"],
        title=data["title"],
        description=data.get("description"),
        action_taken=data.get("action_taken"),
        issued_by=issued_by,
        status=DisciplinaryRecord.STATUS_ACTIVE,
    )
    # issued_date có default=date.today ở model — chỉ gán khi client gửi
    # ngày cụ thể, gán None sẽ đè mất default và lưu NULL.
    if data.get("issued_date") is not None:
        record.issued_date = data["issued_date"]
    db.session.add(record)
    db.session.commit()
    return record


def resolve_record(record, resolved_note=None):
    """Giải quyết biên bản: active -> resolved (đã giải quyết -> 409)."""
    if record.status != DisciplinaryRecord.STATUS_ACTIVE:
        raise ApiError(
            409,
            "RECORD_ALREADY_RESOLVED",
            "Biên bản này đã được giải quyết rồi.",
        )
    record.status = DisciplinaryRecord.STATUS_RESOLVED
    record.resolved_note = resolved_note
    db.session.commit()
    return record
