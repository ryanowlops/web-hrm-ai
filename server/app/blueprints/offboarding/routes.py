"""Routes cho module Offboarding — tien to /api/v1/offboarding.

    POST   /offboarding                 Tao quy trinh nghi viec (HR/Admin)
    GET    /offboarding?status=         Danh sach process (theo scope) + % tien do
    GET    /offboarding/<id>            Chi tiet process + checklist
    PATCH  /offboarding/tasks/<id>      Tick task { is_done, note } theo quyen
    POST   /offboarding/<id>/complete   Hoan tat (HR/Admin, chi khi 100% task xong)
    POST   /offboarding/<id>/cancel     Huy quy trinh (HR/Admin)

Loi dung app.errors.ApiError — handler tap trung tra dinh dang chuan
{"error": {"code", "message", "details"}}.
"""

from flask import jsonify, request

from app.blueprints.auth.guards import load_current_user, require_roles
from app.blueprints.offboarding import bp, schemas, services
from app.errors import ApiError

HR_ADMIN = ("admin", "hr")


def _json_body():
    data = request.get_json(silent=True)
    if data is None:
        raise ApiError(
            400, "VALIDATION_ERROR", "Body phải là JSON hợp lệ.",
            details=[{"field": "body", "message": "Body phải là JSON."}],
        )
    return data


def _raise_validation(errors):
    raise ApiError(
        400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", details=errors
    )


@bp.post("")
@require_roles(*HR_ADMIN)
def create_process():
    cleaned, errors = schemas.validate_create_payload(_json_body())
    if errors:
        _raise_validation(errors)
    user = load_current_user()
    process = services.create_process(user, cleaned)
    return jsonify({
        "data": schemas.process_to_dict(process, include_tasks=True),
    }), 201


@bp.get("")
@require_roles()
def list_processes():
    user = load_current_user()
    items, meta = services.list_processes(user, request.args)
    return jsonify({
        "data": [schemas.process_to_dict(p) for p in items],
        "meta": meta,
    }), 200


@bp.get("/<int:process_id>")
@require_roles()
def get_process(process_id):
    user = load_current_user()
    process = services.get_process_or_404(process_id, user)
    return jsonify({
        "data": schemas.process_to_dict(process, include_tasks=True),
    }), 200


@bp.patch("/tasks/<int:task_id>")
@require_roles()
def update_task(task_id):
    user = load_current_user()
    cleaned, errors = schemas.validate_task_update_payload(_json_body())
    if errors:
        _raise_validation(errors)
    task = services.update_task(user, task_id, cleaned)
    return jsonify({"data": schemas.task_to_dict(task)}), 200


@bp.post("/<int:process_id>/complete")
@require_roles(*HR_ADMIN)
def complete_process(process_id):
    process = services.complete_process(process_id)
    return jsonify({
        "data": schemas.process_to_dict(process, include_tasks=True),
    }), 200


@bp.post("/<int:process_id>/cancel")
@require_roles(*HR_ADMIN)
def cancel_process(process_id):
    process = services.cancel_process(process_id)
    return jsonify({"data": schemas.process_to_dict(process)}), 200
