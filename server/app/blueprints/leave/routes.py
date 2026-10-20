"""Routes — module Nghỉ phép (leave), tiền tố /api/v1/leave.

Routes chỉ làm 3 việc: kiểm tra JWT/role, validate dữ liệu vào (Marshmallow),
gọi service và trả JSON. Mọi lỗi trả theo định dạng chuẩn của hệ thống:
{"error": {"code", "message", "details"}}
"""

import importlib

from flask import jsonify, request
from flask_jwt_extended import jwt_required

from app.blueprints.leave import bp
from app.blueprints.leave import schemas, services
from app.errors import ApiError


def _load_require_roles():
    """Decorator phân quyền dùng chung của foundation (app.security ...).

    Nếu chưa import được từ foundation thì dùng bản dự phòng tại chỗ:
    yêu cầu JWT hợp lệ và role của user (lấy từ DB) nằm trong danh sách cho phép.
    """
    for module_name in (
        "app.blueprints.auth.guards",
        "app.security",
        "app.utils.security",
        "app.auth",
    ):
        try:
            module = importlib.import_module(module_name)
        except ImportError:
            continue
        decorator = getattr(module, "require_roles", None)
        if decorator is not None:
            return decorator

    from functools import wraps

    def require_roles(*roles):
        def wrapper(fn):
            @wraps(fn)
            @jwt_required()
            def decorated(*args, **kwargs):
                user = services.get_current_user()
                if user.role not in roles:
                    raise ApiError(
                        403,
                        "FORBIDDEN",
                        "Bạn không có quyền thực hiện thao tác này.",
                    )
                return fn(*args, **kwargs)

            return decorated

        return wrapper

    return require_roles


require_roles = _load_require_roles()


# Lỗi ApiError / ValidationError được xử lý tập trung ở app.errors
# (register_error_handlers trong app factory) — routes không tự format lỗi.


def _pagination_args():
    try:
        page = max(int(request.args.get("page", 1)), 1)
        limit = int(request.args.get("limit", 20))
    except ValueError:
        raise ApiError(400, "VALIDATION_ERROR", "page/limit phải là số nguyên.")
    return page, min(max(limit, 1), 100)


def _list_response(items, total, page, limit):
    return jsonify(
        data=items,
        meta={
            "page": page,
            "limit": limit,
            "totalItems": total,
            "totalPages": (total + limit - 1) // limit if limit else 0,
        },
    )


# ---------------------------------------------------------------------------
# Loại nghỉ & số dư phép
# ---------------------------------------------------------------------------

@bp.get("/types")
@jwt_required()
def list_types():
    types = services.list_leave_types()
    return jsonify(data=[schemas.leave_type_to_dict(t) for t in types])


@bp.get("/balance/me")
@jwt_required()
def my_balance():
    _, employee = services.get_current_employee()
    year = request.args.get("year", type=int)
    balances = services.get_my_balances(employee, year=year)
    return jsonify(
        data=[schemas.balance_to_dict(lt, b) for lt, b in balances]
    )


# ---------------------------------------------------------------------------
# Đơn xin nghỉ
# ---------------------------------------------------------------------------

@bp.post("/requests")
@jwt_required()
def create_request():
    _, employee = services.get_current_employee()
    data = schemas.CreateLeaveRequestSchema().load(request.get_json(force=True))
    created = services.create_leave_request(employee, data)
    return jsonify(schemas.leave_request_to_dict(created)), 201


@bp.get("/requests")
@jwt_required()
def list_requests():
    user, employee = services.get_current_employee()
    page, limit = _pagination_args()
    items, total = services.list_leave_requests(
        user,
        employee,
        status=request.args.get("status"),
        scope=request.args.get("scope"),
        page=page,
        limit=limit,
    )
    return _list_response(
        [schemas.leave_request_to_dict(r) for r in items], total, page, limit
    )


@bp.post("/requests/<int:request_id>/manager-decision")
@require_roles("manager", "admin")
def manager_decision(request_id):
    _, manager = services.get_current_employee()
    data = schemas.DecisionSchema().load(request.get_json(force=True))
    updated = services.manager_decision(manager, request_id, data)
    return jsonify(schemas.leave_request_to_dict(updated))


@bp.post("/requests/<int:request_id>/hr-decision")
@require_roles("hr", "admin")
def hr_decision(request_id):
    data = schemas.DecisionSchema().load(request.get_json(force=True))
    updated = services.hr_decision(request_id, data)
    return jsonify(schemas.leave_request_to_dict(updated))


@bp.post("/requests/<int:request_id>/cancel")
@jwt_required()
def cancel_request(request_id):
    _, employee = services.get_current_employee()
    updated = services.cancel_request(employee, request_id)
    return jsonify(schemas.leave_request_to_dict(updated))


# ---------------------------------------------------------------------------
# Lịch nghỉ đã duyệt
# ---------------------------------------------------------------------------

@bp.get("/calendar")
@jwt_required()
def calendar():
    user, employee = services.get_current_employee()
    from datetime import date

    month = request.args.get("month") or date.today().strftime("%Y-%m")
    items = services.get_calendar(user, employee, month)
    return jsonify(
        data=[schemas.calendar_entry_to_dict(r) for r in items]
    )
