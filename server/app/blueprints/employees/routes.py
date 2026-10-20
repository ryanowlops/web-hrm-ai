"""Routes cho Employees & Contracts.

Phân quyền (A2/B8):
- Đọc: mọi vai trò đã đăng nhập; phạm vi dữ liệu do service quyết định
  (admin/hr: tất cả, manager: phòng mình, employee: chỉ mình) — ngoài
  phạm vi trả 404.
- Ghi (tạo/sửa/xóa/import/hợp đồng): chỉ admin, hr.
Lỗi trả theo định dạng chuẩn {"error": {"code", "message", "details"}}.
"""

from flask import jsonify, request

from app.blueprints.auth.guards import require_roles
from app.blueprints.employees import bp
from app.blueprints.employees import schemas, services
from app.blueprints.employees.services import ApiError

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


def _current_user():
    user = services.resolve_current_user()
    if user is None:
        raise ApiError(401, "UNAUTHORIZED", "Không xác định được người dùng.")
    return user


def _contract_dict(contract):
    days, soon = services.contract_expiry_info(contract)
    return schemas.contract_to_dict(
        contract, days_until_expiry=days, is_expiring_soon=soon
    )


# ---------------------------------------------------------------------------
# Employees
# ---------------------------------------------------------------------------

@bp.route("", methods=["GET"])
@bp.route("/", methods=["GET"])
@require_roles(*READ_ROLES)
def list_employees():
    try:
        user = _current_user()
        items, meta = services.list_employees(user, request.args)
        return jsonify({
            "data": [schemas.employee_to_dict(e) for e in items],
            "meta": meta,
        }), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/<int:employee_id>", methods=["GET"])
@require_roles(*READ_ROLES)
def get_employee(employee_id):
    try:
        user = _current_user()
        employee = services.get_employee_in_scope(user, employee_id)
        return jsonify({"data": schemas.employee_to_dict(employee)}), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("", methods=["POST"])
@bp.route("/", methods=["POST"])
@require_roles(*WRITE_ROLES)
def create_employee():
    try:
        cleaned, errors = schemas.validate_employee_payload(_json_body())
        if errors:
            return _validation_error(errors)
        employee = services.create_employee(cleaned)
        return jsonify({"data": schemas.employee_to_dict(employee)}), 201
    except ApiError as exc:
        return _error(exc)


@bp.route("/import", methods=["POST"])
@require_roles(*WRITE_ROLES)
def import_employees():
    """Import mẫu bằng JSON list: body là list hoặc {"employees": [...]}.

    Thay cho đọc Excel thật (FR-03): frontend/seed gửi danh sách nhân viên
    dạng JSON, server validate từng dòng và báo kết quả tổng hợp.
    """
    try:
        body = _json_body()
        rows = body.get("employees") if isinstance(body, dict) else body
        if not isinstance(rows, list):
            return _validation_error([{
                "field": "employees",
                "message": "Body phải là JSON list hoặc object có khóa 'employees'.",
            }])
        # Validate từng dòng bằng cùng schema với tạo đơn lẻ.
        indexed_rows = []
        for index, row in enumerate(rows):
            cleaned, errors = schemas.validate_employee_payload(row)
            if errors:
                indexed_rows.append({
                    "index": index,
                    "error": "; ".join(
                        f"{e['field']}: {e['message']}" for e in errors
                    ),
                })
            else:
                indexed_rows.append({"index": index, "data": cleaned})
        created, errors = services.import_employees(indexed_rows)
        status = 201 if not errors else 200
        return jsonify({
            "data": {
                "created": [schemas.employee_to_dict(e) for e in created],
                "created_count": len(created),
                "error_count": len(errors),
                "errors": errors,
            }
        }), status
    except ApiError as exc:
        return _error(exc)


@bp.route("/<int:employee_id>", methods=["PATCH"])
@require_roles(*WRITE_ROLES)
def update_employee(employee_id):
    try:
        cleaned, errors = schemas.validate_employee_payload(
            _json_body(), partial=True
        )
        if errors:
            return _validation_error(errors)
        employee = services.update_employee(employee_id, cleaned)
        return jsonify({"data": schemas.employee_to_dict(employee)}), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/<int:employee_id>", methods=["DELETE"])
@require_roles(*WRITE_ROLES)
def delete_employee(employee_id):
    try:
        employee = services.delete_employee(employee_id)
        return jsonify({"data": schemas.employee_to_dict(employee)}), 200
    except ApiError as exc:
        return _error(exc)


# ---------------------------------------------------------------------------
# Contracts của một nhân viên
# ---------------------------------------------------------------------------

@bp.route("/<int:employee_id>/contracts", methods=["GET"])
@require_roles(*READ_ROLES)
def list_contracts(employee_id):
    """Danh sách hợp đồng; hỗ trợ ?expiring=30 để lọc sắp hết hạn."""
    try:
        user = _current_user()
        items, meta = services.list_contracts(user, employee_id, request.args)
        return jsonify({
            "data": [_contract_dict(c) for c in items],
            "meta": meta,
        }), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/<int:employee_id>/contracts", methods=["POST"])
@require_roles(*WRITE_ROLES)
def create_contract(employee_id):
    try:
        user = _current_user()
        cleaned, errors = schemas.validate_contract_payload(_json_body())
        if errors:
            return _validation_error(errors)
        contract = services.create_contract(user, employee_id, cleaned)
        return jsonify({"data": _contract_dict(contract)}), 201
    except ApiError as exc:
        return _error(exc)
