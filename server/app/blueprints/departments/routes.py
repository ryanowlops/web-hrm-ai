"""Routes cho Departments & Positions.

Phân quyền theo kiến trúc A2/B3.2:
- Đọc (GET): mọi vai trò đã đăng nhập (admin, hr, manager, employee).
- Ghi (POST/PATCH/DELETE): chỉ admin, hr — qua require_roles của auth guards.
Mọi phản hồi lỗi dùng định dạng chuẩn
    {"error": {"code", "message", "details"}}.
"""

from flask import jsonify, request

from app.blueprints.auth.guards import require_roles
from app.blueprints.departments import bp
from app.blueprints.departments import schemas, services
from app.blueprints.departments.services import ApiError

READ_ROLES = ("admin", "hr", "manager", "employee")
WRITE_ROLES = ("admin", "hr")


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


def _json_body():
    data = request.get_json(silent=True)
    if data is None:
        raise ApiError(400, "VALIDATION_ERROR", "Body phải là JSON hợp lệ.",
                       [{"field": "body", "message": "Body phải là JSON."}])
    return data


# ---------------------------------------------------------------------------
# Departments
# ---------------------------------------------------------------------------

@bp.route("/departments", methods=["GET"], strict_slashes=False)
@require_roles(*READ_ROLES)
def list_departments():
    try:
        items, meta = services.list_departments(request.args)
        counts = services.employee_counts()
        data = [
            schemas.department_to_dict(
                d, employee_total=counts.get(d.id, 0)
            )
            for d in items
        ]
        return jsonify({"data": data, "meta": meta}), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/departments/<int:department_id>", methods=["GET"])
@require_roles(*READ_ROLES)
def get_department(department_id):
    try:
        department = services.get_department(department_id)
        return jsonify({
            "data": schemas.department_to_dict(
                department,
                employee_total=services.employee_count(department.id),
            )
        }), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/departments", methods=["POST"], strict_slashes=False)
@require_roles(*WRITE_ROLES)
def create_department():
    try:
        cleaned, errors = schemas.validate_department_payload(_json_body())
        if errors:
            return _validation_error(errors)
        department = services.create_department(cleaned)
        return jsonify({
            "data": schemas.department_to_dict(department, employee_total=0)
        }), 201
    except ApiError as exc:
        return _error(exc)


@bp.route("/departments/<int:department_id>", methods=["PATCH"])
@require_roles(*WRITE_ROLES)
def update_department(department_id):
    try:
        cleaned, errors = schemas.validate_department_payload(
            _json_body(), partial=True
        )
        if errors:
            return _validation_error(errors)
        department = services.update_department(department_id, cleaned)
        return jsonify({
            "data": schemas.department_to_dict(
                department,
                employee_total=services.employee_count(department.id),
            )
        }), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/departments/<int:department_id>", methods=["DELETE"])
@require_roles(*WRITE_ROLES)
def delete_department(department_id):
    try:
        services.delete_department(department_id)
        return jsonify({"data": {"id": department_id, "deleted": True}}), 200
    except ApiError as exc:
        return _error(exc)


# ---------------------------------------------------------------------------
# Positions
# ---------------------------------------------------------------------------

@bp.route("/positions", methods=["GET"], strict_slashes=False)
@require_roles(*READ_ROLES)
def list_positions():
    try:
        items, meta = services.list_positions(request.args)
        return jsonify({
            "data": [schemas.position_to_dict(p) for p in items],
            "meta": meta,
        }), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/positions/<int:position_id>", methods=["GET"])
@require_roles(*READ_ROLES)
def get_position(position_id):
    try:
        position = services.get_position(position_id)
        return jsonify({"data": schemas.position_to_dict(position)}), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/positions", methods=["POST"], strict_slashes=False)
@require_roles(*WRITE_ROLES)
def create_position():
    try:
        cleaned, errors = schemas.validate_position_payload(_json_body())
        if errors:
            return _validation_error(errors)
        position = services.create_position(cleaned)
        return jsonify({"data": schemas.position_to_dict(position)}), 201
    except ApiError as exc:
        return _error(exc)


@bp.route("/positions/<int:position_id>", methods=["PATCH"])
@require_roles(*WRITE_ROLES)
def update_position(position_id):
    try:
        cleaned, errors = schemas.validate_position_payload(
            _json_body(), partial=True
        )
        if errors:
            return _validation_error(errors)
        position = services.update_position(position_id, cleaned)
        return jsonify({"data": schemas.position_to_dict(position)}), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/positions/<int:position_id>", methods=["DELETE"])
@require_roles(*WRITE_ROLES)
def delete_position(position_id):
    try:
        services.delete_position(position_id)
        return jsonify({"data": {"id": position_id, "deleted": True}}), 200
    except ApiError as exc:
        return _error(exc)
