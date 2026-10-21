"""Service layer cho module Assets (tài sản công ty).

Logic nghiệp vụ + transaction nằm ở đây, routes chỉ validate và trả JSON:
- CRUD tài sản: HR/Admin (guard ở routes); mã tài sản (code) là duy nhất.
- Cấp phát: chỉ khi tài sản đang 'available' -> tạo AssetAssignment 'active',
  đổi status tài sản sang 'assigned' và tạo Notification cho nhân viên,
  tất cả trong cùng một transaction.
- Thu hồi: đóng assignment đang 'active' (returned_at + status 'returned'),
  tài sản về 'available', Notification cho nhân viên.
- Phạm vi dữ liệu (data-scope): Employee chỉ xem tài sản của mình
  (GET /assets/my) và lịch sử của tài sản từng được cấp cho mình;
  Manager/HR/Admin xem toàn bộ danh mục.
"""

from app.extensions import db
from app.models import Employee, Notification, User
from app.models.assets import Asset, AssetAssignment
from app.models.users import utcnow


class ApiError(Exception):
    """Lỗi nghiệp vụ có mã HTTP + code chuẩn để routes trả về."""

    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or []


# ---------------------------------------------------------------------------
# Helpers dùng chung (cùng pattern với departments/services)
# ---------------------------------------------------------------------------

def get_or_404(model, pk, code, message):
    obj = None
    try:
        obj = db.session.get(model, pk)
    except Exception:
        obj = None
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


def apply_sort(query, model, args, allowed_fields, default_field="id"):
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


# ---------------------------------------------------------------------------
# Helpers nội bộ module
# ---------------------------------------------------------------------------

ASSET_WRITABLE = ("code", "name", "category", "serial", "status",
                  "purchase_date", "notes")


def get_asset(asset_id):
    return get_or_404(Asset, asset_id, "ASSET_NOT_FOUND",
                      "Không tìm thấy tài sản.")


def active_assignment_for(asset_id):
    """Lượt cấp phát đang 'active' của một tài sản (tối đa một)."""
    return (
        AssetAssignment.query
        .filter_by(asset_id=asset_id, status=AssetAssignment.STATUS_ACTIVE)
        .order_by(AssetAssignment.assigned_at.desc())
        .first()
    )


def active_assignments_by_asset(asset_ids):
    """Map asset_id -> assignment 'active' cho một loạt tài sản (tránh N+1)."""
    if not asset_ids:
        return {}
    rows = (
        AssetAssignment.query
        .filter(
            AssetAssignment.asset_id.in_(asset_ids),
            AssetAssignment.status == AssetAssignment.STATUS_ACTIVE,
        )
        .all()
    )
    result = {}
    for row in rows:
        result.setdefault(row.asset_id, row)
    return result


def _find_user_id_for_employee(employee_id):
    user = User.query.filter_by(employee_id=employee_id).first()
    return user.id if user else None


def _notify_employee(employee_id, type_, title, content, related_id):
    """Tạo Notification cho tài khoản gắn với nhân viên (nếu có).

    Nhân viên chưa có tài khoản thì bỏ qua — cấp phát vẫn thành công.
    Notification được add vào session, commit cùng transaction của thao tác.
    """
    user_id = _find_user_id_for_employee(employee_id)
    if user_id is None:
        return
    db.session.add(
        Notification(
            user_id=user_id,
            type=type_,
            title=title,
            content=content,
            is_read=False,
            related_type="asset",
            related_id=related_id,
        )
    )


def _ensure_code_unique(code, exclude_id=None):
    query = Asset.query.filter(Asset.code == code)
    if exclude_id is not None:
        query = query.filter(Asset.id != exclude_id)
    if query.first() is not None:
        raise ApiError(409, "ASSET_CODE_EXISTS", "Mã tài sản đã tồn tại.", [])


# ---------------------------------------------------------------------------
# Danh mục tài sản (HR / Admin / Manager)
# ---------------------------------------------------------------------------

def list_assets(args):
    query = Asset.query
    status = (args.get("status") or "").strip()
    if status:
        if status not in Asset.STATUSES:
            raise ApiError(
                400, "VALIDATION_ERROR", "Trạng thái tài sản không hợp lệ.",
                [{"field": "status", "message": "Trạng thái không hợp lệ."}],
            )
        query = query.filter(Asset.status == status)
    category = (args.get("category") or "").strip()
    if category:
        query = query.filter(Asset.category == category)
    q = (args.get("q") or args.get("search") or "").strip()
    if q:
        like = f"%{q}%"
        query = query.filter(
            db.or_(
                Asset.code.ilike(like),
                Asset.name.ilike(like),
                Asset.serial.ilike(like),
            )
        )
    query = apply_sort(
        query, Asset, args, {"id", "code", "name", "created_at", "purchase_date"}
    )
    page, limit = parse_pagination(args)
    items, meta = paginate(query, page, limit)
    holders = active_assignments_by_asset([a.id for a in items])
    return items, meta, holders


def create_asset(data):
    _ensure_code_unique(data["code"])
    if data.get("status") == Asset.STATUS_ASSIGNED:
        raise ApiError(
            400, "VALIDATION_ERROR",
            "Không tạo tài sản ở trạng thái 'assigned'. "
            "Hãy tạo ở trạng thái 'available' rồi dùng chức năng cấp phát.",
            [{"field": "status", "message": "Dùng luồng cấp phát để gán tài sản."}],
        )
    asset = Asset()
    for field in ASSET_WRITABLE:
        if field in data:
            setattr(asset, field, data[field])
    if not asset.status:
        asset.status = Asset.STATUS_AVAILABLE
    db.session.add(asset)
    db.session.commit()
    return asset


def update_asset(asset_id, data):
    asset = get_asset(asset_id)
    if "code" in data:
        _ensure_code_unique(data["code"], exclude_id=asset.id)
    if "status" in data and data["status"] != asset.status:
        active = active_assignment_for(asset.id)
        if active is not None:
            raise ApiError(
                409, "ASSET_CURRENTLY_ASSIGNED",
                "Tài sản đang được cấp phát. "
                "Hãy thu hồi trước khi đổi trạng thái.",
            )
        if data["status"] == Asset.STATUS_ASSIGNED:
            raise ApiError(
                400, "VALIDATION_ERROR",
                "Không gán trạng thái 'assigned' trực tiếp — "
                "dùng chức năng cấp phát.",
                [{"field": "status",
                  "message": "Dùng luồng cấp phát để gán tài sản."}],
            )
    for field in ASSET_WRITABLE:
        if field in data:
            setattr(asset, field, data[field])
    db.session.commit()
    return asset


# ---------------------------------------------------------------------------
# Cấp phát / thu hồi
# ---------------------------------------------------------------------------

def assign_asset(asset_id, data):
    asset = get_asset(asset_id)
    employee = get_or_404(
        Employee, data["employee_id"], "EMPLOYEE_NOT_FOUND",
        "Không tìm thấy nhân viên.",
    )
    if asset.status != Asset.STATUS_AVAILABLE:
        raise ApiError(
            409, "ASSET_NOT_AVAILABLE",
            "Tài sản không ở trạng thái sẵn sàng (available) để cấp phát.",
        )
    if active_assignment_for(asset.id) is not None:
        raise ApiError(
            409, "ASSET_ALREADY_ASSIGNED",
            "Tài sản đang có lượt cấp phát chưa thu hồi.",
        )
    assignment = AssetAssignment(
        asset_id=asset.id,
        employee_id=employee.id,
        assigned_at=utcnow(),
        status=AssetAssignment.STATUS_ACTIVE,
        note=data.get("note"),
    )
    asset.status = Asset.STATUS_ASSIGNED
    db.session.add(assignment)
    _notify_employee(
        employee.id,
        "asset_assigned",
        "Bạn được cấp phát tài sản",
        f"Tài sản {asset.code} — {asset.name} đã được cấp phát cho bạn.",
        asset.id,
    )
    db.session.commit()
    return assignment


def return_assignment(assignment_id, data):
    assignment = get_or_404(
        AssetAssignment, assignment_id, "ASSIGNMENT_NOT_FOUND",
        "Không tìm thấy lượt cấp phát.",
    )
    if assignment.status != AssetAssignment.STATUS_ACTIVE:
        raise ApiError(
            409, "ASSIGNMENT_ALREADY_RETURNED",
            "Lượt cấp phát này đã được thu hồi.",
        )
    asset = get_asset(assignment.asset_id)
    assignment.status = AssetAssignment.STATUS_RETURNED
    assignment.returned_at = utcnow()
    if data.get("note"):
        assignment.note = data["note"]
    if asset.status == Asset.STATUS_ASSIGNED:
        asset.status = Asset.STATUS_AVAILABLE
    _notify_employee(
        assignment.employee_id,
        "asset_returned",
        "Tài sản đã được thu hồi",
        f"Tài sản {asset.code} — {asset.name} đã được thu hồi.",
        asset.id,
    )
    db.session.commit()
    return assignment


# ---------------------------------------------------------------------------
# Phía nhân viên + lịch sử
# ---------------------------------------------------------------------------

def my_assets(user):
    """Tài sản đang giữ của user hiện tại (qua user.employee_id).

    Tài khoản chưa gắn hồ sơ nhân viên -> danh sách rỗng (không lỗi),
    để trang 'Tài sản của tôi' hiển thị trạng thái trống.
    """
    employee_id = getattr(user, "employee_id", None)
    if not employee_id:
        return [], {"page": 1, "limit": 0, "totalItems": 0, "totalPages": 0}
    assignments = (
        AssetAssignment.query
        .filter_by(
            employee_id=employee_id, status=AssetAssignment.STATUS_ACTIVE
        )
        .order_by(AssetAssignment.assigned_at.desc())
        .all()
    )
    meta = {
        "page": 1,
        "limit": len(assignments),
        "totalItems": len(assignments),
        "totalPages": 1 if assignments else 0,
    }
    return assignments, meta


def asset_history(asset_id, user):
    """Lịch sử cấp phát của một tài sản, mới nhất trước.

    Employee chỉ xem được lịch sử của tài sản từng/đang được cấp cho mình.
    """
    asset = get_asset(asset_id)
    if getattr(user, "role", None) == "employee":
        employee_id = getattr(user, "employee_id", None)
        has_any = (
            AssetAssignment.query
            .filter_by(asset_id=asset.id, employee_id=employee_id)
            .first()
        )
        if has_any is None:
            raise ApiError(
                403, "FORBIDDEN",
                "Bạn chỉ xem được lịch sử của tài sản đã được cấp cho mình.",
            )
    assignments = (
        AssetAssignment.query
        .filter_by(asset_id=asset.id)
        .order_by(AssetAssignment.assigned_at.desc())
        .all()
    )
    return asset, assignments
