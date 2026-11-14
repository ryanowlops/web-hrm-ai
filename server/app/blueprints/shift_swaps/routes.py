"""Routes cho Đổi ca làm việc — tiền tố /api/v1/shift-swaps.

    POST   /shift-swaps                Tạo đơn đổi ca (mọi tài khoản đã
                                       đăng nhập có hồ sơ nhân viên).
    GET    /shift-swaps                Danh sách đơn theo phạm vi của user
                                       (?status=, ?mine=1).
    GET    /shift-swaps/<id>           Chi tiết một đơn (cùng phạm vi).
    POST   /shift-swaps/<id>/approve   Duyệt + hoán đổi ca gán
                                       (admin/hr/manager của phòng liên quan).
    POST   /shift-swaps/<id>/reject    Từ chối đơn (cùng quyền duyệt).
    POST   /shift-swaps/<id>/cancel    Hủy đơn (chỉ người tạo, đơn chờ duyệt).
"""
from flask import jsonify, request

from app.blueprints.auth.guards import load_current_user, require_roles
from app.blueprints.shift_swaps import bp, schemas, services
from app.errors import ApiError

DECIDE_ROLES = ("admin", "hr", "manager")


def _json_body():
    data = request.get_json(silent=True)
    if data is None:
        raise ApiError(400, "VALIDATION_ERROR", "Body phải là JSON hợp lệ.")
    return data


@bp.post("")
@require_roles()
def create_shift_swap():
    cleaned, errors = schemas.validate_create_payload(_json_body())
    if errors:
        raise ApiError(
            400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", details=errors
        )
    user = load_current_user()
    swap = services.create_swap(user, cleaned)
    return jsonify({"data": schemas.swap_to_dict(swap)}), 201


@bp.get("")
@require_roles()
def list_shift_swaps():
    user = load_current_user()
    rows, meta = services.list_swaps(request.args, user)
    return jsonify(
        {"data": [schemas.swap_to_dict(row) for row in rows], "meta": meta}
    )


@bp.get("/<int:swap_id>")
@require_roles()
def get_shift_swap(swap_id):
    user = load_current_user()
    swap = services.get_swap_for_user(swap_id, user)
    return jsonify({"data": schemas.swap_to_dict(swap)})


@bp.post("/<int:swap_id>/approve")
@require_roles(*DECIDE_ROLES)
def approve_shift_swap(swap_id):
    user = load_current_user()
    swap = services.get_swap_or_404(swap_id)
    swap = services.approve_swap(swap, user)
    return jsonify({"data": schemas.swap_to_dict(swap)})


@bp.post("/<int:swap_id>/reject")
@require_roles(*DECIDE_ROLES)
def reject_shift_swap(swap_id):
    cleaned, errors = schemas.validate_decision_payload(_json_body())
    if errors:
        raise ApiError(
            400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", details=errors
        )
    user = load_current_user()
    swap = services.get_swap_or_404(swap_id)
    swap = services.reject_swap(swap, user, note=cleaned.get("note"))
    return jsonify({"data": schemas.swap_to_dict(swap)})


@bp.post("/<int:swap_id>/cancel")
@require_roles()
def cancel_shift_swap(swap_id):
    user = load_current_user()
    swap = services.get_swap_or_404(swap_id)
    swap = services.cancel_swap(swap, user)
    return jsonify({"data": schemas.swap_to_dict(swap)})
