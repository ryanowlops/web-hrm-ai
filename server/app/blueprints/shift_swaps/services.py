"""Service layer cho module Đổi ca làm việc.

Chứa toàn bộ logic nghiệp vụ + transaction. Routes chỉ validate input,
gọi service và trả JSON. Lỗi nghiệp vụ ném ra dưới dạng ApiError
(app.errors) để error handler toàn cục chuyển thành định dạng lỗi chuẩn:
    {"error": {"code": ..., "message": ..., "details": [...]}}.

Quy tắc phân quyền (xem probation/services cho cùng quy ước):
- Tạo đơn: tài khoản phải gắn với một hồ sơ nhân viên (403 nếu không).
- Xem: admin/hr thấy toàn công ty; manager thấy đơn liên quan tới phòng
  mình quản lý (người tạo hoặc người được chọn đổi ca thuộc phòng đó);
  employee thấy đơn mình tạo + đơn chọn mình làm người đổi ca.
- Duyệt/từ chối: admin/hr, hoặc manager của phòng người tạo / phòng
  người được chọn đổi ca.
- Hủy: chỉ người tạo đơn, và chỉ khi đơn còn chờ duyệt.
"""

from datetime import date

from sqlalchemy import or_

from app.errors import ApiError
from app.extensions import db
from app.models import Department, Employee
from app.models.shift_swap import ShiftSwapRequest
from app.models.shifts import ShiftAssignment

HR_ADMIN_ROLES = ("admin", "hr")


def _manager_department_ids(user) -> list[int]:
    """Các phòng ban trong phạm vi của Manager (rỗng nếu không có).

    Ưu tiên mọi phòng ban mà nhân viên làm trưởng phòng
    (departments.manager_id); nếu không làm trưởng phòng nào thì lùi về
    phòng ban nhân viên đang thuộc về. Cùng quy ước với
    stats/routes._manager_department_ids và probation.
    """
    employee = None
    if user is not None and getattr(user, "employee_id", None):
        employee = db.session.get(Employee, user.employee_id)
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


def _current_employee(user):
    """Hồ sơ nhân viên của user hiện tại, None nếu tài khoản không gắn hồ sơ."""
    if user is None or not getattr(user, "employee_id", None):
        return None
    return db.session.get(Employee, user.employee_id)


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


def get_swap_or_404(swap_id: int) -> ShiftSwapRequest:
    swap = db.session.get(ShiftSwapRequest, swap_id)
    if swap is None:
        raise ApiError(404, "SWAP_NOT_FOUND", "Không tìm thấy đơn đổi ca.")
    return swap


def _scope_filter(user):
    """Điều kiện WHERE theo phạm vi xem của user (None = toàn công ty).

    Employee không có hồ sơ thì không thấy gì (xử lý 403 riêng ở
    list_swaps/get_swap_for_user).
    """
    if user is None or user.role in HR_ADMIN_ROLES:
        return None
    if user.role == "manager":
        dept_ids = _manager_department_ids(user)
        if not dept_ids:
            raise ApiError(
                403,
                "FORBIDDEN",
                "Tài khoản Manager chưa gắn với phòng ban nào.",
            )
        requester = db.aliased(Employee)
        target = db.aliased(Employee)
        return or_(
            requester.department_id.in_(dept_ids),
            target.department_id.in_(dept_ids),
        ), requester, target
    # role employee: đơn mình tạo + đơn chọn mình làm người đổi ca.
    employee = _current_employee(user)
    if employee is None:
        raise ApiError(
            403,
            "NO_EMPLOYEE_PROFILE",
            "Tài khoản chưa được gắn với hồ sơ nhân viên.",
        )
    return or_(
        ShiftSwapRequest.requester_id == employee.id,
        ShiftSwapRequest.target_id == employee.id,
    ), None, None


def _scoped_query(user):
    """Query đơn đổi ca đã áp phạm vi xem của user."""
    query = ShiftSwapRequest.query
    scope = _scope_filter(user)
    if scope is None:
        return query
    condition, requester, target = scope
    if requester is not None:
        query = query.join(
            requester,
            ShiftSwapRequest.requester_id == requester.id,
        ).join(target, ShiftSwapRequest.target_id == target.id)
    return query.filter(condition)


def _is_visible(user, swap: ShiftSwapRequest) -> bool:
    """True khi user được xem một đơn cụ thể (cùng luật với danh sách)."""
    if user is None or user.role in HR_ADMIN_ROLES:
        return True
    if user.role == "manager":
        dept_ids = _manager_department_ids(user)
        if not dept_ids:
            return False
        requester = db.session.get(Employee, swap.requester_id)
        target = db.session.get(Employee, swap.target_id)
        return (
            requester is not None
            and requester.department_id in dept_ids
        ) or (target is not None and target.department_id in dept_ids)
    employee = _current_employee(user)
    if employee is None:
        return False
    return swap.requester_id == employee.id or swap.target_id == employee.id


def list_swaps(args, user):
    """Danh sách đơn đổi ca theo phạm vi của user, phân trang.

    Lọc ?status=<pending|approved|rejected|cancelled>; ?mine=1 chỉ lấy
    đơn mình tạo (cần hồ sơ nhân viên). Sắp xếp: ngày đổi ca tăng dần
    (đơn sắp tới trước), rồi mới nhất trước.
    """
    from app.blueprints.shift_swaps import schemas

    status = args.get("status")
    if not schemas.validate_status_filter(status):
        raise ApiError(
            400,
            "VALIDATION_ERROR",
            "status phải là pending, approved, rejected hoặc cancelled.",
            details=[
                {
                    "field": "status",
                    "message": "Trạng thái không hợp lệ.",
                }
            ],
        )

    query = _scoped_query(user)
    if status:
        query = query.filter(ShiftSwapRequest.status == status)

    if args.get("mine") == "1":
        employee = _current_employee(user)
        if employee is None:
            raise ApiError(
                403,
                "NO_EMPLOYEE_PROFILE",
                "Tài khoản chưa được gắn với hồ sơ nhân viên.",
            )
        query = query.filter(ShiftSwapRequest.requester_id == employee.id)

    query = query.order_by(
        ShiftSwapRequest.work_date.asc(),
        ShiftSwapRequest.created_at.desc(),
        ShiftSwapRequest.id.desc(),
    )
    page, limit = parse_pagination(args)
    return paginate(query, page, limit)


def get_swap_for_user(swap_id: int, user) -> ShiftSwapRequest:
    """Một đơn đổi ca — 404 khi không tồn tại hoặc ngoài phạm vi xem."""
    swap = get_swap_or_404(swap_id)
    if not _is_visible(user, swap):
        raise ApiError(404, "SWAP_NOT_FOUND", "Không tìm thấy đơn đổi ca.")
    return swap


def create_swap(user, data: dict) -> ShiftSwapRequest:
    """Tạo đơn đổi ca.

    - Tài khoản phải gắn hồ sơ nhân viên (403 nếu không).
    - Người được chọn đổi ca phải tồn tại (404) và khác người tạo (400).
    - Ngày đổi ca phải từ hôm nay trở đi (400 nếu là ngày quá khứ).
    - Một người chỉ có tối đa một đơn đang chờ duyệt cho cùng một ngày
      (409 khi trùng).
    """
    employee = _current_employee(user)
    if employee is None:
        raise ApiError(
            403,
            "NO_EMPLOYEE_PROFILE",
            "Tài khoản chưa được gắn với hồ sơ nhân viên.",
        )

    target = db.session.get(Employee, data["target_id"])
    if target is None:
        raise ApiError(
            404,
            "EMPLOYEE_NOT_FOUND",
            "Không tìm thấy nhân viên được chọn đổi ca.",
        )
    if target.id == employee.id:
        raise ApiError(
            400,
            "VALIDATION_ERROR",
            "Không thể đổi ca với chính mình.",
            details=[
                {
                    "field": "target_id",
                    "message": "Người đổi ca phải khác người tạo đơn.",
                }
            ],
        )

    work_date = data["work_date"]
    if work_date < date.today():
        raise ApiError(
            400,
            "VALIDATION_ERROR",
            "Ngày đổi ca phải từ hôm nay trở đi.",
            details=[
                {
                    "field": "work_date",
                    "message": "Không tạo được đơn đổi ca cho ngày đã qua.",
                }
            ],
        )

    duplicate = (
        ShiftSwapRequest.query.filter_by(
            requester_id=employee.id,
            work_date=work_date,
            status=ShiftSwapRequest.STATUS_PENDING,
        ).first()
    )
    if duplicate is not None:
        raise ApiError(
            409,
            "SWAP_ALREADY_PENDING",
            "Bạn đã có một đơn đổi ca đang chờ duyệt cho ngày này.",
            details=[
                {
                    "field": "work_date",
                    "message": "Đã tồn tại đơn đổi ca đang chờ duyệt.",
                }
            ],
        )

    swap = ShiftSwapRequest(
        requester_id=employee.id,
        target_id=target.id,
        work_date=work_date,
        status=ShiftSwapRequest.STATUS_PENDING,
        note=data.get("note"),
    )
    db.session.add(swap)
    db.session.commit()
    return swap


def _check_can_decide(user, swap: ShiftSwapRequest) -> None:
    """Admin/HR, hoặc manager của phòng người tạo / phòng người đổi ca."""
    if user is None or user.role in HR_ADMIN_ROLES:
        return
    if user.role != "manager":
        raise ApiError(
            403,
            "FORBIDDEN",
            "Bạn không có quyền duyệt đơn đổi ca này.",
        )
    dept_ids = _manager_department_ids(user)
    requester = db.session.get(Employee, swap.requester_id)
    target = db.session.get(Employee, swap.target_id)
    if (
        requester is not None and requester.department_id in dept_ids
    ) or (target is not None and target.department_id in dept_ids):
        return
    raise ApiError(
        403,
        "FORBIDDEN",
        "Đơn đổi ca này không thuộc phòng ban bạn quản lý.",
    )


def _require_pending(swap: ShiftSwapRequest) -> None:
    if swap.status != ShiftSwapRequest.STATUS_PENDING:
        raise ApiError(
            409,
            "SWAP_NOT_PENDING",
            "Đơn đổi ca này không còn ở trạng thái chờ duyệt.",
        )


def _swap_assignments(swap: ShiftSwapRequest) -> None:
    """Hoán đổi ca gán ngày work_date giữa người tạo và người đổi ca.

    - Cả hai đều có ca gán: đổi shift_id cho nhau (không vi phạm unique
      (employee_id, work_date) vì employee_id của mỗi dòng không đổi).
    - Chỉ một người có ca gán: chuyển ca gán đó sang người còn lại
      (người kia chưa có ca ngày đó nên không trùng unique).
    - Không ai có ca gán: chỉ ghi nhận đơn đã duyệt, không đổi gì thêm.
    """
    requester_asg = ShiftAssignment.query.filter_by(
        employee_id=swap.requester_id, work_date=swap.work_date
    ).first()
    target_asg = ShiftAssignment.query.filter_by(
        employee_id=swap.target_id, work_date=swap.work_date
    ).first()
    if requester_asg is not None and target_asg is not None:
        requester_asg.shift_id, target_asg.shift_id = (
            target_asg.shift_id,
            requester_asg.shift_id,
        )
    elif requester_asg is not None:
        requester_asg.employee_id = swap.target_id
    elif target_asg is not None:
        target_asg.employee_id = swap.requester_id


def approve_swap(swap: ShiftSwapRequest, decider) -> ShiftSwapRequest:
    """Duyệt đơn đổi ca: hoán đổi ca gán rồi chốt đơn đã duyệt."""
    _check_can_decide(decider, swap)
    _require_pending(swap)
    _swap_assignments(swap)
    swap.status = ShiftSwapRequest.STATUS_APPROVED
    swap.decided_by = getattr(decider, "id", None)
    db.session.commit()
    return swap


def reject_swap(
    swap: ShiftSwapRequest, decider, note=None
) -> ShiftSwapRequest:
    """Từ chối đơn đổi ca (không đổi ca gán).

    Ghi chú khi từ chối không ghi đè ghi chú của người tạo đơn (model chỉ
    có một cột note) nên chỉ nhận ở payload để client hiển thị xác nhận.
    """
    _check_can_decide(decider, swap)
    _require_pending(swap)
    swap.status = ShiftSwapRequest.STATUS_REJECTED
    swap.decided_by = getattr(decider, "id", None)
    db.session.commit()
    return swap


def cancel_swap(swap: ShiftSwapRequest, user) -> ShiftSwapRequest:
    """Hủy đơn đổi ca — chỉ người tạo đơn, chỉ khi còn chờ duyệt."""
    employee = _current_employee(user)
    if employee is None:
        raise ApiError(
            403,
            "NO_EMPLOYEE_PROFILE",
            "Tài khoản chưa được gắn với hồ sơ nhân viên.",
        )
    if swap.requester_id != employee.id:
        raise ApiError(
            403,
            "FORBIDDEN",
            "Chỉ người tạo đơn mới được hủy đơn đổi ca này.",
        )
    _require_pending(swap)
    swap.status = ShiftSwapRequest.STATUS_CANCELLED
    db.session.commit()
    return swap
