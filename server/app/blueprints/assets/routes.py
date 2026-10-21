"""Routes cho module Assets (tài sản công ty).

Phân quyền:
- Danh mục (GET /assets, lịch sử): admin, hr, manager (Employee xem qua
  /assets/my; lịch sử có thêm kiểm tra scope trong service).
- Ghi (POST tạo, PATCH, cấp phát, thu hồi): chỉ admin, hr.
- GET /assets/my: mọi vai trò đã đăng nhập.
Mọi phản hồi lỗi dùng định dạng chuẩn
    {"error": {"code", "message", "details"}}.
"""

from flask import g, jsonify, request

from app.blueprints.assets import bp
from app.blueprints.assets import schemas, services
from app.blueprints.assets.services import ApiError
from app.blueprints.auth.guards import load_current_user, require_roles

LIST_ROLES = ("admin", "hr", "manager")
WRITE_ROLES = ("admin", "hr")
ALL_ROLES = ("admin", "hr", "manager", "employee")


def _error(api_error):
    return jsonify({
        "error": {
            "code": api_error.code,
            "message": api_error.message,
            "details": api_error.details,
        }
    }), api_error.status


def _validation_error(errors):
    return _error(
        ApiError(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", errors)
    )


def _json_body(required=True):
    data = request.get_json(silent=True)
    if data is None:
        if not required:
            return {}
        raise ApiError(400, "VALIDATION_ERROR", "Body phải là JSON hợp lệ.",
                       [{"field": "body", "message": "Body phải là JSON."}])
    return data


def _current_user():
    user = getattr(g, "current_user", None)
    if user is not None:
        return user
    return load_current_user()


# ---------------------------------------------------------------------------
# Tài sản của tôi — đặt trước các route /assets/<id> để không bị nuốt route
# ---------------------------------------------------------------------------

@bp.route("/assets/my", methods=["GET"], strict_slashes=False)
@require_roles(*ALL_ROLES)
def my_assets():
    try:
        assignments, meta = services.my_assets(_current_user())
        data = [schemas.my_asset_to_dict(a) for a in assignments]
        return jsonify({"data": data, "meta": meta}), 200
    except ApiError as exc:
        return _error(exc)


# ---------------------------------------------------------------------------
# Danh mục tài sản
# ---------------------------------------------------------------------------

@bp.route("/assets", methods=["GET"], strict_slashes=False)
@require_roles(*LIST_ROLES)
def list_assets():
    try:
        items, meta, holders = services.list_assets(request.args)
        data = [
            schemas.asset_to_dict(a, active_assignment=holders.get(a.id))
            for a in items
        ]
        return jsonify({"data": data, "meta": meta}), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/assets", methods=["POST"], strict_slashes=False)
@require_roles(*WRITE_ROLES)
def create_asset():
    try:
        cleaned, errors = schemas.validate_asset_payload(_json_body())
        if errors:
            return _validation_error(errors)
        asset = services.create_asset(cleaned)
        return jsonify({"data": schemas.asset_to_dict(asset)}), 201
    except ApiError as exc:
        return _error(exc)


@bp.route("/assets/<int:asset_id>", methods=["PATCH"])
@require_roles(*WRITE_ROLES)
def update_asset(asset_id):
    try:
        cleaned, errors = schemas.validate_asset_payload(
            _json_body(), partial=True
        )
        if errors:
            return _validation_error(errors)
        asset = services.update_asset(asset_id, cleaned)
        active = services.active_assignment_for(asset.id)
        return jsonify({
            "data": schemas.asset_to_dict(asset, active_assignment=active)
        }), 200
    except ApiError as exc:
        return _error(exc)


# ---------------------------------------------------------------------------
# Cấp phát / thu hồi / lịch sử
# ---------------------------------------------------------------------------

@bp.route("/assets/<int:asset_id>/assign", methods=["POST"])
@require_roles(*WRITE_ROLES)
def assign_asset(asset_id):
    try:
        cleaned, errors = schemas.validate_assign_payload(_json_body())
        if errors:
            return _validation_error(errors)
        assignment = services.assign_asset(asset_id, cleaned)
        return jsonify({
            "data": schemas.assignment_to_dict(assignment)
        }), 201
    except ApiError as exc:
        return _error(exc)


@bp.route("/assignments/<int:assignment_id>/return", methods=["POST"])
@require_roles(*WRITE_ROLES)
def return_assignment(assignment_id):
    try:
        cleaned, errors = schemas.validate_return_payload(
            _json_body(required=False)
        )
        if errors:
            return _validation_error(errors)
        assignment = services.return_assignment(assignment_id, cleaned)
        return jsonify({
            "data": schemas.assignment_to_dict(assignment)
        }), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/assets/<int:asset_id>/history", methods=["GET"])
@require_roles(*ALL_ROLES)
def asset_history(asset_id):
    try:
        _asset, assignments = services.asset_history(
            asset_id, _current_user()
        )
        data = [schemas.assignment_to_dict(a) for a in assignments]
        return jsonify({"data": data}), 200
    except ApiError as exc:
        return _error(exc)
