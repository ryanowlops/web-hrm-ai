"""Service layer cho module Employees & Contracts.

Toàn bộ logic nghiệp vụ + transaction + kiểm tra PHẠM VI DỮ LIỆU
(data scope) nằm ở đây (kiến trúc B3.3/B8):

- admin / hr : toàn bộ nhân viên.
- manager    : nhân viên thuộc phòng ban mình quản lý (departments.manager_id
               = hồ sơ của mình, hoặc cùng department_id với mình) và nhân
               viên có manager_id = mình, cộng chính mình.
- employee   : chỉ hồ sơ của chính mình (users.employee_id).

Tài nguyên ngoài phạm vi trả 404 (không lộ sự tồn tại) theo quy ước B3.4.
"""

from datetime import date, timedelta

from flask_jwt_extended import get_jwt_identity

from app.extensions import db
from app.models import Contract, Department, Employee, Position, User

try:  # Ưu tiên helper chính thức của module auth (guards.load_current_user).
    from app.blueprints.auth.guards import load_current_user as get_current_user
except Exception:  # pragma: no cover - fallback khi guards chưa sẵn sàng
    try:
        from app.blueprints.auth.guards import get_current_user
    except Exception:
        get_current_user = None


class ApiError(Exception):
    """Lỗi nghiệp vụ có mã HTTP + code chuẩn để routes trả về."""

    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or []


EMPLOYEE_STATUSES = ("working", "on_leave", "resigned")
CONTRACT_STATUSES = ("active", "expired", "terminated")


# ---------------------------------------------------------------------------
# Người dùng hiện tại & phạm vi dữ liệu
# ---------------------------------------------------------------------------

def resolve_current_user():
    """Trả về User đang đăng nhập (theo JWT), None nếu không xác định được."""
    if get_current_user is not None:
        try:
            user = get_current_user()
            if user is not None:
                return user
        except Exception:
            pass
    try:
        identity = get_jwt_identity()
    except Exception:
        identity = None
    if identity is None:
        return None
    try:
        pk = int(identity)
    except (TypeError, ValueError):
        return None
    user = None
    try:
        user = db.session.get(User, pk)
    except Exception:
        user = None
    if user is None:
        try:
            user = User.query.get(pk)
        except Exception:
            user = None
    return user


def current_employee(user):
    """Hồ sơ Employee gắn với tài khoản (users.employee_id), nếu có."""
    employee_id = getattr(user, "employee_id", None) if user else None
    if not employee_id:
        return None
    try:
        return db.session.get(Employee, employee_id)
    except Exception:
        return Employee.query.get(employee_id)


def user_role(user):
    return (getattr(user, "role", "") or "").lower()


def managed_department_ids(me):
    """Các phòng ban mà nhân viên `me` quản lý (trưởng phòng)."""
    ids = set()
    if me is None:
        return ids
    for dept in Department.query.filter_by(manager_id=me.id).all():
        ids.add(dept.id)
    if getattr(me, "department_id", None):
        ids.add(me.department_id)
    return ids


def scope_query(user):
    """Query Employee đã áp phạm vi dữ liệu theo vai trò của user."""
    query = Employee.query
    role = user_role(user)
    if role in ("admin", "hr"):
        return query
    me = current_employee(user)
    if me is None:
        # Tài khoản không gắn hồ sơ nhân viên thì không thấy ai cả.
        return query.filter(Employee.id == -1)
    if role == "manager":
        dept_ids = managed_department_ids(me)
        conditions = [Employee.manager_id == me.id, Employee.id == me.id]
        if dept_ids:
            conditions.append(Employee.department_id.in_(list(dept_ids)))
        return query.filter(db.or_(*conditions))
    # employee và các vai trò khác: chỉ chính mình
    return query.filter(Employee.id == me.id)


def can_read_employee(user, employee):
    role = user_role(user)
    if role in ("admin", "hr"):
        return True
    me = current_employee(user)
    if me is None or employee is None:
        return False
    if employee.id == me.id:
        return True
    if role == "manager":
        if getattr(employee, "manager_id", None) == me.id:
            return True
        dept_id = getattr(employee, "department_id", None)
        return dept_id in managed_department_ids(me)
    return False


def get_employee_in_scope(user, employee_id):
    """Lấy nhân viên trong phạm vi; ngoài phạm vi trả 404 (B3.4)."""
    employee = None
    try:
        employee = db.session.get(Employee, employee_id)
    except Exception:
        employee = None
    if employee is None:
        employee = Employee.query.get(employee_id)
    if employee is None or not can_read_employee(user, employee):
        raise ApiError(404, "EMPLOYEE_NOT_FOUND", "Không tìm thấy nhân viên.")
    return employee


# ---------------------------------------------------------------------------
# Helpers phân trang / sắp xếp (quy ước B6)
# ---------------------------------------------------------------------------

def parse_pagination(args):
    try:
        page = int(args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    try:
        limit = int(args.get("limit", 20))
    except (TypeError, ValueError):
        limit = 20
    return max(page, 1), min(max(limit, 1), 100)


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


def apply_sort(query, model, args, allowed_fields, default_field="id"):
    sort_by = args.get("sortBy") or args.get("sort_by") or default_field
    if sort_by not in allowed_fields:
        sort_by = default_field
    column = getattr(model, sort_by, None) or getattr(model, default_field)
    if (args.get("sortOrder") or args.get("sort_order") or "asc").lower() == "desc":
        column = column.desc()
    return query.order_by(column)


def model_columns(model):
    try:
        return {c.name for c in model.__table__.columns}
    except Exception:
        return set()


def set_fields(obj, data, allowed):
    columns = model_columns(type(obj))
    for field in allowed:
        if field in data and (not columns or field in columns):
            setattr(obj, field, data[field])


# ---------------------------------------------------------------------------
# Employees
# ---------------------------------------------------------------------------

EMPLOYEE_WRITABLE = (
    "code", "full_name", "email", "phone", "date_of_birth", "gender",
    "address", "department_id", "position_id", "manager_id", "start_date",
    "status", "avatar_url",
)


def _parse_expiring(args):
    """?expiring=30 -> chỉ lấy nhân viên có hợp đồng active sắp hết hạn."""
    raw = args.get("expiring")
    if raw is None or str(raw).strip() == "":
        return None
    try:
        days = int(raw)
    except (TypeError, ValueError):
        raise ApiError(400, "VALIDATION_ERROR", "Tham số expiring phải là số ngày.",
                       [{"field": "expiring", "message": "Phải là số nguyên."}])
    return max(days, 0)


def list_employees(user, args):
    query = scope_query(user)
    search = (args.get("search") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(db.or_(
            Employee.full_name.ilike(like),
            Employee.code.ilike(like),
            Employee.email.ilike(like),
            Employee.phone.ilike(like),
        ))
    for field in ("department_id", "position_id", "manager_id"):
        raw = args.get(field)
        if raw:
            try:
                query = query.filter(getattr(Employee, field) == int(raw))
            except (TypeError, ValueError):
                raise ApiError(400, "VALIDATION_ERROR",
                               f"{field} phải là số nguyên.",
                               [{"field": field, "message": "Phải là số nguyên."}])
    status = (args.get("status") or "").strip()
    if status:
        query = query.filter(Employee.status == status)
    expiring_days = _parse_expiring(args)
    if expiring_days is not None:
        today = date.today()
        deadline = today + timedelta(days=expiring_days)
        query = query.join(Contract, Contract.employee_id == Employee.id).filter(
            Contract.status == "active",
            Contract.end_date.isnot(None),
            Contract.end_date >= today,
            Contract.end_date <= deadline,
        ).distinct()
    query = apply_sort(
        query, Employee, args,
        {"id", "full_name", "code", "start_date", "created_at"},
    )
    page, limit = parse_pagination(args)
    return paginate(query, page, limit)


def _ensure_unique(field, value, exclude_id=None, code=None, message=None):
    if value is None:
        return
    query = Employee.query.filter(getattr(Employee, field) == value)
    if exclude_id is not None:
        query = query.filter(Employee.id != exclude_id)
    if query.first() is not None:
        raise ApiError(409, code, message)


def _ensure_references_exist(data):
    if data.get("department_id") is not None:
        if Department.query.get(data["department_id"]) is None:
            raise ApiError(400, "VALIDATION_ERROR", "Phòng ban không tồn tại.",
                           [{"field": "department_id",
                             "message": "Phòng ban không tồn tại."}])
    if data.get("position_id") is not None:
        if Position.query.get(data["position_id"]) is None:
            raise ApiError(400, "VALIDATION_ERROR", "Chức vụ không tồn tại.",
                           [{"field": "position_id",
                             "message": "Chức vụ không tồn tại."}])
    if data.get("manager_id") is not None:
        if Employee.query.get(data["manager_id"]) is None:
            raise ApiError(400, "VALIDATION_ERROR", "Quản lý trực tiếp không tồn tại.",
                           [{"field": "manager_id",
                             "message": "Nhân viên quản lý không tồn tại."}])


def generate_employee_code():
    """Sinh mã nhân viên NV0001, NV0002... chưa bị dùng."""
    base = Employee.query.count() + 1
    while True:
        code = f"NV{base:04d}"
        if Employee.query.filter_by(code=code).first() is None:
            return code
        base += 1


def create_employee(data):
    data = dict(data)
    if not data.get("code"):
        data["code"] = generate_employee_code()
    _ensure_unique("code", data["code"], code="EMPLOYEE_CODE_EXISTS",
                   message="Mã nhân viên đã tồn tại.")
    _ensure_unique("email", data.get("email"), code="EMPLOYEE_EMAIL_EXISTS",
                   message="Email nhân viên đã tồn tại.")
    _ensure_references_exist(data)
    employee = Employee()
    set_fields(employee, data, EMPLOYEE_WRITABLE)
    if getattr(employee, "status", None) is None:
        try:
            employee.status = "working"
        except Exception:
            pass
    db.session.add(employee)
    db.session.commit()
    return employee


def update_employee(employee_id, data):
    employee = None
    try:
        employee = db.session.get(Employee, employee_id)
    except Exception:
        employee = Employee.query.get(employee_id)
    if employee is None:
        raise ApiError(404, "EMPLOYEE_NOT_FOUND", "Không tìm thấy nhân viên.")
    if "code" in data:
        _ensure_unique("code", data["code"], exclude_id=employee.id,
                       code="EMPLOYEE_CODE_EXISTS",
                       message="Mã nhân viên đã tồn tại.")
    if "email" in data:
        _ensure_unique("email", data["email"], exclude_id=employee.id,
                       code="EMPLOYEE_EMAIL_EXISTS",
                       message="Email nhân viên đã tồn tại.")
    _ensure_references_exist(data)
    set_fields(employee, data, EMPLOYEE_WRITABLE)
    db.session.commit()
    return employee


def delete_employee(employee_id):
    """Xóa mềm: chuyển trạng thái sang resigned (giữ lịch sử công/lương)."""
    employee = None
    try:
        employee = db.session.get(Employee, employee_id)
    except Exception:
        employee = Employee.query.get(employee_id)
    if employee is None:
        raise ApiError(404, "EMPLOYEE_NOT_FOUND", "Không tìm thấy nhân viên.")
    if Department.query.filter_by(manager_id=employee.id).count() > 0:
        raise ApiError(
            409, "EMPLOYEE_IS_DEPARTMENT_MANAGER",
            "Nhân viên đang là trưởng phòng, không thể xóa. "
            "Vui lòng gán trưởng phòng khác trước.",
        )
    employee.status = "resigned"
    db.session.commit()
    return employee


def import_employees(indexed_rows):
    """Import hàng loạt từ JSON list (mẫu thay cho Excel — FR-03).

    indexed_rows: list các dict {"index": int, "data": cleaned} cho dòng
    đã qua validate ở routes, hoặc {"index": int, "error": message} cho
    dòng lỗi validate. Dòng trùng mã/email bị bỏ qua, ghi vào errors.
    """
    created, errors = [], []
    for item in indexed_rows:
        index = item.get("index")
        if item.get("error"):
            errors.append({"index": index, "message": item["error"]})
            continue
        try:
            employee = create_employee(item.get("data") or {})
            created.append(employee)
        except ApiError as exc:
            db.session.rollback()
            errors.append({"index": index, "message": exc.message})
        except Exception as exc:  # lỗi bất ngờ cho 1 dòng không làm hỏng cả đợt
            db.session.rollback()
            errors.append({"index": index, "message": f"Lỗi không xác định: {exc}"})
    return created, errors


# ---------------------------------------------------------------------------
# Contracts
# ---------------------------------------------------------------------------

CONTRACT_WRITABLE = (
    "contract_type", "start_date", "end_date", "base_salary", "allowance",
    "status",
)


def contract_expiry_info(contract, today=None):
    """(days_until_expiry, is_expiring_soon) cho cảnh báo hết hạn 30 ngày."""
    end_date = getattr(contract, "end_date", None)
    if end_date is None:
        return None, False
    if hasattr(end_date, "date") and not isinstance(end_date, date):
        end_date = end_date.date()
    today = today or date.today()
    days = (end_date - today).days
    return days, 0 <= days <= 30


def list_contracts(user, employee_id, args):
    employee = get_employee_in_scope(user, employee_id)
    query = Contract.query.filter_by(employee_id=employee.id)
    expiring_days = _parse_expiring(args)
    if expiring_days is not None:
        today = date.today()
        deadline = today + timedelta(days=expiring_days)
        query = query.filter(
            Contract.end_date.isnot(None),
            Contract.end_date >= today,
            Contract.end_date <= deadline,
        )
    status = (args.get("status") or "").strip()
    if status:
        query = query.filter(Contract.status == status)
    query = apply_sort(
        query, Contract, args,
        {"id", "start_date", "end_date", "created_at"},
        default_field="start_date",
    )
    page, limit = parse_pagination(args)
    return paginate(query, page, limit)


def create_contract(user, employee_id, data):
    employee = get_employee_in_scope(user, employee_id)
    data = dict(data)
    data.setdefault("status", "active")
    contract = Contract()
    contract.employee_id = employee.id
    set_fields(contract, data, CONTRACT_WRITABLE)
    if data["status"] == "active":
        # Một nhân viên chỉ có 1 hợp đồng hiệu lực: hợp đồng active cũ
        # được chuyển sang expired trong cùng transaction.
        Contract.query.filter_by(
            employee_id=employee.id, status="active"
        ).update({"status": "expired"})
    db.session.add(contract)
    db.session.commit()
    return contract
