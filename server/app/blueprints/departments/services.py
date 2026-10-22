"""Service layer cho module Departments & Positions.

Chứa toàn bộ logic nghiệp vụ + transaction. Routes chỉ validate input,
gọi service và trả JSON. Lỗi nghiệp vụ được ném ra dưới dạng ApiError
để routes chuyển thành định dạng lỗi chuẩn:
    {"error": {"code": ..., "message": ..., "details": [...]}}
"""

from app.extensions import db
from app.models import Department, Employee, Position


class ApiError(Exception):
    """Lỗi nghiệp vụ có mã HTTP + code chuẩn để routes trả về."""

    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or []


# ---------------------------------------------------------------------------
# Helpers dùng chung
# ---------------------------------------------------------------------------

def get_or_404(model, pk, code, message):
    """Lấy bản ghi theo khóa chính, không có thì ném ApiError 404."""
    obj = None
    try:
        obj = db.session.get(model, pk)
    except Exception:
        obj = None
    if obj is None:
        try:
            obj = model.query.get(pk)
        except Exception:
            obj = None
    if obj is None:
        raise ApiError(404, code, message)
    return obj


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


def apply_sort(query, model, args, allowed_fields, default_field="id"):
    """Sắp xếp theo whitelist để tránh sort vào cột tùy ý (SQL injection)."""
    sort_by = args.get("sortBy") or args.get("sort_by") or default_field
    if sort_by not in allowed_fields:
        sort_by = default_field
    column = getattr(model, sort_by, None)
    if column is None:
        column = getattr(model, default_field)
    sort_order = (args.get("sortOrder") or args.get("sort_order") or "asc").lower()
    if sort_order == "desc":
        column = column.desc()
    return query.order_by(column)


def model_columns(model):
    """Tập tên cột thực tế của model (phòng khi schema DB thay đổi nhẹ)."""
    try:
        return {c.name for c in model.__table__.columns}
    except Exception:
        return set()


def set_fields(obj, data, allowed):
    """Gán các trường trong data vào obj, chỉ khi cột tồn tại trên model."""
    columns = model_columns(type(obj))
    for field in allowed:
        if field in data and (not columns or field in columns):
            setattr(obj, field, data[field])


def employee_count(department_id):
    return Employee.query.filter_by(department_id=department_id).count()


def employee_counts():
    """Số nhân viên của MỌI phòng ban trong MỘT truy vấn GROUP BY.

    Thay cho employee_count() gọi lặp theo từng phòng (N+1 — danh sách
    phòng ban từng tốn ~1,8s trên production vì mỗi count là một vòng
    khứ hồi tới Neon). Trả {department_id: count}; phòng chưa có nhân
    viên thì vắng mặt trong dict (coi như 0).
    """
    from app.extensions import db

    rows = (
        db.session.query(Employee.department_id, db.func.count(Employee.id))
        .group_by(Employee.department_id)
        .all()
    )
    return {dept_id: count for dept_id, count in rows if dept_id is not None}


# ---------------------------------------------------------------------------
# Departments
# ---------------------------------------------------------------------------

DEPARTMENT_WRITABLE = ("name", "manager_id", "description")


def list_departments(args):
    query = Department.query
    search = (args.get("search") or "").strip()
    if search:
        query = query.filter(Department.name.ilike(f"%{search}%"))
    query = apply_sort(query, Department, args, {"id", "name", "created_at"})
    page, limit = parse_pagination(args)
    return paginate(query, page, limit)


def get_department(department_id):
    return get_or_404(
        Department, department_id, "DEPARTMENT_NOT_FOUND", "Không tìm thấy phòng ban."
    )


def _ensure_department_name_unique(name, exclude_id=None):
    query = Department.query.filter(Department.name == name)
    if exclude_id is not None:
        query = query.filter(Department.id != exclude_id)
    if query.first() is not None:
        raise ApiError(
            409, "DEPARTMENT_NAME_EXISTS", "Tên phòng ban đã tồn tại.", []
        )


def _ensure_manager_exists(manager_id):
    if manager_id is not None:
        get_or_404(Employee, manager_id, "MANAGER_NOT_FOUND",
                   "Trưởng phòng (manager_id) không tồn tại.")


def create_department(data):
    _ensure_department_name_unique(data["name"])
    _ensure_manager_exists(data.get("manager_id"))
    department = Department()
    set_fields(department, data, DEPARTMENT_WRITABLE)
    db.session.add(department)
    db.session.commit()
    return department


def update_department(department_id, data):
    department = get_department(department_id)
    if "name" in data:
        _ensure_department_name_unique(data["name"], exclude_id=department.id)
    if "manager_id" in data:
        _ensure_manager_exists(data.get("manager_id"))
    set_fields(department, data, DEPARTMENT_WRITABLE)
    db.session.commit()
    return department


def delete_department(department_id):
    """Chặn xóa phòng ban còn nhân viên hoặc còn chức vụ (A7 — toàn vẹn)."""
    department = get_department(department_id)
    if employee_count(department.id) > 0:
        raise ApiError(
            409,
            "DEPARTMENT_HAS_EMPLOYEES",
            "Phòng ban còn nhân viên, không thể xóa. "
            "Vui lòng chuyển nhân viên sang phòng ban khác trước.",
        )
    if Position.query.filter_by(department_id=department.id).count() > 0:
        raise ApiError(
            409,
            "DEPARTMENT_HAS_POSITIONS",
            "Phòng ban còn chức vụ, không thể xóa. "
            "Vui lòng xóa hoặc chuyển chức vụ trước.",
        )
    db.session.delete(department)
    db.session.commit()
    return department


# ---------------------------------------------------------------------------
# Positions
# ---------------------------------------------------------------------------

POSITION_WRITABLE = ("title", "department_id")


def list_positions(args):
    query = Position.query
    search = (args.get("search") or "").strip()
    if search:
        query = query.filter(Position.title.ilike(f"%{search}%"))
    department_id = args.get("department_id")
    if department_id:
        try:
            query = query.filter(Position.department_id == int(department_id))
        except (TypeError, ValueError):
            raise ApiError(400, "VALIDATION_ERROR",
                           "department_id phải là số nguyên.",
                           [{"field": "department_id",
                             "message": "Phải là số nguyên."}])
    query = apply_sort(query, Position, args, {"id", "title", "created_at"})
    page, limit = parse_pagination(args)
    return paginate(query, page, limit)


def get_position(position_id):
    return get_or_404(
        Position, position_id, "POSITION_NOT_FOUND", "Không tìm thấy chức vụ."
    )


def _ensure_position_unique(title, department_id, exclude_id=None):
    query = Position.query.filter(
        Position.title == title, Position.department_id == department_id
    )
    if exclude_id is not None:
        query = query.filter(Position.id != exclude_id)
    if query.first() is not None:
        raise ApiError(
            409, "POSITION_EXISTS",
            "Chức vụ này đã tồn tại trong phòng ban.", []
        )


def create_position(data):
    get_or_404(Department, data["department_id"], "DEPARTMENT_NOT_FOUND",
               "Không tìm thấy phòng ban của chức vụ.")
    _ensure_position_unique(data["title"], data["department_id"])
    position = Position()
    set_fields(position, data, POSITION_WRITABLE)
    db.session.add(position)
    db.session.commit()
    return position


def update_position(position_id, data):
    position = get_position(position_id)
    if "department_id" in data:
        get_or_404(Department, data["department_id"], "DEPARTMENT_NOT_FOUND",
                   "Không tìm thấy phòng ban của chức vụ.")
    title = data.get("title", position.title)
    department_id = data.get("department_id", position.department_id)
    _ensure_position_unique(title, department_id, exclude_id=position.id)
    set_fields(position, data, POSITION_WRITABLE)
    db.session.commit()
    return position


def delete_position(position_id):
    position = get_position(position_id)
    if Employee.query.filter_by(position_id=position.id).count() > 0:
        raise ApiError(
            409,
            "POSITION_IN_USE",
            "Chức vụ đang được gán cho nhân viên, không thể xóa.",
        )
    db.session.delete(position)
    db.session.commit()
    return position
