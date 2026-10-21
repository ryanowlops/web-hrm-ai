"""Routes — module Hieu suat / KPI-OKR (performance), tien to /api/v1/performance.

Routes chi lam 3 viec: kiem tra JWT/role, validate du lieu vao (Marshmallow),
goi service va tra JSON. Loi theo dinh dang chuan cua he thong
{"error": {"code", "message", "details"}} (xu ly tap trung o app.errors).
"""

from flask import jsonify, request
from flask_jwt_extended import jwt_required

from app.blueprints.auth.guards import require_roles
from app.blueprints.performance import bp
from app.blueprints.performance import schemas, services
from app.errors import ApiError


def _int_arg(name):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return None
    try:
        return int(raw)
    except ValueError:
        raise ApiError(400, "VALIDATION_ERROR", f"Tham số {name} phải là số nguyên.")


def _objective_payload(obj):
    return schemas.objective_to_dict(
        obj,
        score=services.objective_score(obj),
        key_result_progresses=services.objective_progress_map(obj),
    )


# ---------------------------------------------------------------------------
# Chu ky danh gia
# ---------------------------------------------------------------------------

@bp.get("/cycles")
@jwt_required()
def list_cycles():
    cycles = services.list_cycles()
    return jsonify(data=[schemas.cycle_to_dict(c) for c in cycles])


@bp.post("/cycles")
@require_roles("hr", "admin")
def create_cycle():
    data = schemas.CreateCycleSchema().load(request.get_json(force=True))
    cycle = services.create_cycle(data)
    return jsonify(schemas.cycle_to_dict(cycle)), 201


@bp.patch("/cycles/<int:cycle_id>/status")
@require_roles("hr", "admin")
def update_cycle_status(cycle_id):
    data = schemas.CycleStatusSchema().load(request.get_json(force=True))
    cycle = services.update_cycle_status(cycle_id, data["status"])
    return jsonify(schemas.cycle_to_dict(cycle))


# ---------------------------------------------------------------------------
# Goi y mau muc tieu (catalog tinh)
# ---------------------------------------------------------------------------

@bp.get("/suggestions")
@jwt_required()
def suggestions():
    _, employee = services.get_current_actor()
    result = services.get_suggestions(
        employee,
        position_title=request.args.get("position"),
        department_name=request.args.get("department"),
    )
    return jsonify(data=result)


# ---------------------------------------------------------------------------
# Muc tieu (Objectives) + Key Results
# ---------------------------------------------------------------------------

@bp.get("/objectives")
@jwt_required()
def list_objectives():
    user, employee = services.get_current_actor()
    items = services.list_objectives(
        user,
        employee,
        cycle_id=_int_arg("cycle_id"),
        employee_id=request.args.get("employee_id"),
        department_id=_int_arg("department_id"),
        status=request.args.get("status"),
    )
    return jsonify(data=[_objective_payload(o) for o in items])


@bp.post("/objectives")
@jwt_required()
def create_objective():
    user, employee = services.get_current_actor()
    data = schemas.CreateObjectiveSchema().load(request.get_json(force=True))
    created = services.create_objective(user, employee, data)
    return jsonify(_objective_payload(created)), 201


@bp.get("/objectives/<int:objective_id>")
@jwt_required()
def get_objective(objective_id):
    user, employee = services.get_current_actor()
    obj = services.get_objective_or_404(objective_id)
    if not services.can_view_objective(user, employee, obj):
        raise ApiError(403, "FORBIDDEN", "Bạn không có quyền xem mục tiêu này.")
    return jsonify(_objective_payload(obj))


@bp.patch("/objectives/<int:objective_id>")
@jwt_required()
def update_objective(objective_id):
    user, employee = services.get_current_actor()
    data = schemas.UpdateObjectiveSchema().load(request.get_json(force=True))
    updated = services.update_objective(user, employee, objective_id, data)
    return jsonify(_objective_payload(updated))


@bp.delete("/objectives/<int:objective_id>")
@jwt_required()
def delete_objective(objective_id):
    """Huy muc tieu (xoa mem -> status cancelled, chi khi dang draft)."""
    user, employee = services.get_current_actor()
    updated = services.cancel_objective(user, employee, objective_id)
    return jsonify(_objective_payload(updated))


@bp.post("/objectives/<int:objective_id>/submit")
@jwt_required()
def submit_objective(objective_id):
    user, employee = services.get_current_actor()
    updated = services.submit_objective(user, employee, objective_id)
    return jsonify(_objective_payload(updated))


@bp.post("/objectives/<int:objective_id>/approve")
@require_roles("manager", "hr", "admin")
def approve_objective(objective_id):
    user, employee = services.get_current_actor()
    updated = services.approve_objective(user, employee, objective_id)
    return jsonify(_objective_payload(updated))


@bp.post("/objectives/<int:objective_id>/return")
@require_roles("manager", "hr", "admin")
def return_objective(objective_id):
    user, employee = services.get_current_actor()
    payload = request.get_json(silent=True) or {}
    data = schemas.ReturnObjectiveSchema().load(payload)
    note = data.get("note") or data.get("reason")
    updated = services.return_objective(user, employee, objective_id, note=note)
    return jsonify(_objective_payload(updated))


# ---------------------------------------------------------------------------
# Check-in Key Result
# ---------------------------------------------------------------------------

@bp.post("/key-results/<int:key_result_id>/check-in")
@jwt_required()
def check_in(key_result_id):
    user, employee = services.get_current_actor()
    data = schemas.CheckinSchema().load(request.get_json(force=True))
    checkin, obj = services.check_in_key_result(user, employee, key_result_id, data)
    result = schemas.checkin_to_dict(checkin)
    result["objective_score"] = round(services.objective_score(obj), 2)
    result["key_result"] = schemas.key_result_to_dict(
        checkin.key_result, progress=services.key_result_progress(checkin.key_result)
    )
    return jsonify(result), 201


@bp.get("/key-results/<int:key_result_id>/check-ins")
@jwt_required()
def list_checkins(key_result_id):
    user, employee = services.get_current_actor()
    items = services.list_checkins(user, employee, key_result_id)
    return jsonify(data=[schemas.checkin_to_dict(c) for c in items])


# ---------------------------------------------------------------------------
# Danh gia (reviews)
# ---------------------------------------------------------------------------

@bp.post("/reviews")
@jwt_required()
def create_review():
    user, employee = services.get_current_actor()
    data = schemas.CreateReviewSchema().load(request.get_json(force=True))
    review = services.create_review(user, employee, data)
    return jsonify(schemas.review_to_dict(review)), 201


@bp.get("/reviews")
@jwt_required()
def list_reviews():
    user, employee = services.get_current_actor()
    items = services.list_reviews(
        user,
        employee,
        cycle_id=_int_arg("cycle_id"),
        employee_id=request.args.get("employee_id"),
    )
    return jsonify(data=[schemas.review_to_dict(r) for r in items])


# ---------------------------------------------------------------------------
# Dashboard tong hop
# ---------------------------------------------------------------------------

@bp.get("/dashboard")
@jwt_required()
def dashboard():
    user, employee = services.get_current_actor()
    result = services.get_dashboard(
        user, employee, cycle_id=_int_arg("cycle_id")
    )
    cycle = result["cycle"]
    return jsonify(
        data={
            "cycle": schemas.cycle_to_dict(cycle) if cycle is not None else None,
            "summary": result["summary"],
            "employees": result["employees"],
            "by_department": result["by_department"],
            "rating_distribution": result["rating_distribution"],
        }
    )
