"""Routes cho Shifts (ca lam, tang ca, giai trinh) — prefix /api/v1/shifts.

Phan quyen (hop dong feature-expansion-v3 muc 1):
- Dinh nghia ca: doc moi role; ghi chi admin/hr.
- Lich ca tuan: scope theo role xu ly o service (admin/hr toan cong ty,
  manager doi cua minh, employee phong cua minh, chi doc).
- Gan ca: admin/hr (manager trong phong minh — check o service).
- Tang ca / giai trinh: tao cho minh (hr/admin tao ho), duyet 2 cap
  manager-decision (manager) / hr-decision (hr/admin) nhu mau leave.
Moi loi tra dinh dang chuan {"error": {"code", "message", "details"}}.
"""

from datetime import date

from flask import jsonify, request

from app.blueprints.auth.guards import require_roles
from app.blueprints.shifts import bp
from app.blueprints.shifts import schemas, services
from app.blueprints.shifts.services import ApiError

READ_ROLES = ("admin", "hr", "manager", "employee")
WRITE_ROLES = ("admin", "hr")
ASSIGN_ROLES = ("admin", "hr", "manager")


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


def _decision():
    decision, note, errors = schemas.validate_decision_payload(_json_body())
    if errors:
        return None, None, _validation_error(errors)
    return decision, note, None


# ---------------------------------------------------------------------------
# Dinh nghia ca
# ---------------------------------------------------------------------------

@bp.route("/definitions", methods=["GET"], strict_slashes=False)
@require_roles(*READ_ROLES)
def list_definitions():
    try:
        user = services.current_user()
        items = services.list_definitions(user, request.args)
        return jsonify({
            "data": [schemas.definition_to_dict(d) for d in items],
            "meta": {"totalItems": len(items)},
        }), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/definitions", methods=["POST"], strict_slashes=False)
@require_roles(*WRITE_ROLES)
def create_definition():
    try:
        cleaned, errors = schemas.validate_definition_payload(_json_body())
        if errors:
            return _validation_error(errors)
        definition = services.create_definition(cleaned)
        return jsonify({"data": schemas.definition_to_dict(definition)}), 201
    except ApiError as exc:
        return _error(exc)


@bp.route("/definitions/<int:definition_id>", methods=["PATCH"])
@require_roles(*WRITE_ROLES)
def update_definition(definition_id):
    try:
        cleaned, errors = schemas.validate_definition_payload(
            _json_body(), partial=True
        )
        if errors:
            return _validation_error(errors)
        definition = services.update_definition(definition_id, cleaned)
        return jsonify({"data": schemas.definition_to_dict(definition)}), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/definitions/<int:definition_id>", methods=["DELETE"])
@require_roles(*WRITE_ROLES)
def delete_definition(definition_id):
    try:
        definition, hard_deleted = services.delete_definition(definition_id)
        body = schemas.definition_to_dict(definition)
        body["deleted"] = hard_deleted
        return jsonify({"data": body}), 200
    except ApiError as exc:
        return _error(exc)


# ---------------------------------------------------------------------------
# Lich ca tuan + gan ca
# ---------------------------------------------------------------------------

@bp.route("/week", methods=["GET"], strict_slashes=False)
@require_roles(*READ_ROLES)
def get_week():
    try:
        user = services.current_user()
        raw_date = request.args.get("date")
        any_date = schemas.parse_date_value(raw_date) if raw_date else date.today()
        if raw_date and any_date is None:
            return _validation_error(
                [{"field": "date", "message": "Ngày không hợp lệ (YYYY-MM-DD)."}]
            )
        department_id = request.args.get("department_id", type=int)
        data = services.get_week(user, any_date, department_id=department_id)
        data["definitions"] = [
            schemas.definition_to_dict(d)
            for d in services.list_definitions(user, request.args)
        ]
        return jsonify({"data": data}), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/assignments", methods=["POST"], strict_slashes=False)
@require_roles(*ASSIGN_ROLES)
def create_assignment():
    try:
        cleaned, errors = schemas.validate_assignment_payload(_json_body())
        if errors:
            return _validation_error(errors)
        user = services.current_user()
        assignment, created = services.upsert_assignment(user, cleaned)
        status = 201 if created else 200
        return jsonify({"data": schemas.assignment_to_dict(assignment)}), status
    except ApiError as exc:
        return _error(exc)


@bp.route("/assignments/<int:assignment_id>", methods=["DELETE"])
@require_roles(*ASSIGN_ROLES)
def delete_assignment(assignment_id):
    try:
        user = services.current_user()
        services.delete_assignment(user, assignment_id)
        return jsonify({"data": {"id": assignment_id, "deleted": True}}), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/my-schedule", methods=["GET"], strict_slashes=False)
@require_roles(*READ_ROLES)
def my_schedule():
    try:
        user = services.current_user()
        month = request.args.get("month") or date.today().strftime("%Y-%m")
        items = services.my_schedule(user, month)
        return jsonify({
            "data": [schemas.assignment_to_dict(a) for a in items],
            "meta": {"totalItems": len(items)},
        }), 200
    except ApiError as exc:
        return _error(exc)


# ---------------------------------------------------------------------------
# Tang ca
# ---------------------------------------------------------------------------

@bp.route("/overtime", methods=["GET"], strict_slashes=False)
@require_roles(*READ_ROLES)
def list_overtime():
    try:
        user = services.current_user()
        items, meta = services.list_overtime(user, request.args)
        return jsonify({
            "data": [schemas.overtime_to_dict(o) for o in items],
            "meta": meta,
        }), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/overtime", methods=["POST"], strict_slashes=False)
@require_roles(*READ_ROLES)
def create_overtime():
    try:
        cleaned, errors = schemas.validate_overtime_payload(_json_body())
        if errors:
            return _validation_error(errors)
        user = services.current_user()
        obj = services.create_overtime(user, cleaned)
        return jsonify({"data": schemas.overtime_to_dict(obj)}), 201
    except ApiError as exc:
        return _error(exc)


@bp.route("/overtime/<int:request_id>/manager-decision", methods=["POST"])
@require_roles("manager", "admin")
def overtime_manager_decision(request_id):
    try:
        decision, note, err_response = _decision()
        if err_response is not None:
            return err_response
        user = services.current_user()
        obj = services.overtime_manager_decision(user, request_id, decision, note)
        return jsonify({"data": schemas.overtime_to_dict(obj)}), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/overtime/<int:request_id>/hr-decision", methods=["POST"])
@require_roles("hr", "admin")
def overtime_hr_decision(request_id):
    try:
        decision, note, err_response = _decision()
        if err_response is not None:
            return err_response
        user = services.current_user()
        obj = services.overtime_hr_decision(user, request_id, decision, note)
        return jsonify({"data": schemas.overtime_to_dict(obj)}), 200
    except ApiError as exc:
        return _error(exc)


# ---------------------------------------------------------------------------
# Giai trinh cham cong
# ---------------------------------------------------------------------------

@bp.route("/corrections", methods=["GET"], strict_slashes=False)
@require_roles(*READ_ROLES)
def list_corrections():
    try:
        user = services.current_user()
        items, meta = services.list_corrections(user, request.args)
        return jsonify({
            "data": [schemas.correction_to_dict(c) for c in items],
            "meta": meta,
        }), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/corrections", methods=["POST"], strict_slashes=False)
@require_roles(*READ_ROLES)
def create_correction():
    try:
        cleaned, errors = schemas.validate_correction_payload(_json_body())
        if errors:
            return _validation_error(errors)
        user = services.current_user()
        obj = services.create_correction(user, cleaned)
        return jsonify({"data": schemas.correction_to_dict(obj)}), 201
    except ApiError as exc:
        return _error(exc)


@bp.route("/corrections/<int:correction_id>/manager-decision", methods=["POST"])
@require_roles("manager", "admin")
def correction_manager_decision(correction_id):
    try:
        decision, note, err_response = _decision()
        if err_response is not None:
            return err_response
        user = services.current_user()
        obj = services.correction_manager_decision(user, correction_id, decision, note)
        return jsonify({"data": schemas.correction_to_dict(obj)}), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/corrections/<int:correction_id>/hr-decision", methods=["POST"])
@require_roles("hr", "admin")
def correction_hr_decision(correction_id):
    try:
        decision, note, err_response = _decision()
        if err_response is not None:
            return err_response
        user = services.current_user()
        obj = services.correction_hr_decision(user, correction_id, decision, note)
        return jsonify({"data": schemas.correction_to_dict(obj)}), 200
    except ApiError as exc:
        return _error(exc)
