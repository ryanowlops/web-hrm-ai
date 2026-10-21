"""Routes cho module Onboarding — tien to /api/v1/onboarding.

    GET    /templates                 Danh sach mau hoi nhap (kem task mau)
    POST   /templates                 Tao mau (HR/Admin)
    PATCH  /templates/<id>            Sua mau / thay danh sach task mau (HR/Admin)
    GET    /plans?status=&department_id=  Bang theo doi ke hoach (theo scope)
    POST   /plans                     Sinh plan thu cong cho 1 nhan vien (HR/Admin)
    GET    /plans/<id>                Chi tiet plan + tasks + % tien do
    GET    /my-plan                   Plan cua nhan vien dang dang nhap
    GET    /my-tasks                  Moi task duoc giao cho toi / cua plan cua toi
    PATCH  /tasks/<id>                Cap nhat trang thai / ghi chu / nguoi phu trach
    POST   /tasks/<id>/verify         HR xac nhan task loai document

Loi dung app.errors.ApiError — handler tap trung tra dinh dang chuan
{"error": {"code", "message", "details"}}.
"""

from flask import jsonify, request

from app.blueprints.auth.guards import load_current_user, require_roles
from app.blueprints.onboarding import bp, schemas, services
from app.errors import ApiError

HR_ADMIN = ("admin", "hr")


def _json_body():
    data = request.get_json(silent=True)
    if data is None:
        raise ApiError(
            400, "VALIDATION_ERROR", "Body phải là JSON hợp lệ.",
            [{"field": "body", "message": "Body phải là JSON."}],
        )
    return data


def _raise_validation(errors):
    raise ApiError(
        400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", errors
    )


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

@bp.get("/templates")
@require_roles(*HR_ADMIN)
def list_templates():
    items = services.list_templates()
    return jsonify({
        "data": [schemas.template_to_dict(t) for t in items],
    }), 200


@bp.post("/templates")
@require_roles(*HR_ADMIN)
def create_template():
    cleaned, errors = schemas.validate_template_payload(_json_body())
    if errors:
        _raise_validation(errors)
    template = services.create_template(cleaned)
    return jsonify({"data": schemas.template_to_dict(template)}), 201


@bp.patch("/templates/<int:template_id>")
@require_roles(*HR_ADMIN)
def update_template(template_id):
    cleaned, errors = schemas.validate_template_payload(
        _json_body(), partial=True
    )
    if errors:
        _raise_validation(errors)
    template = services.update_template(template_id, cleaned)
    return jsonify({"data": schemas.template_to_dict(template)}), 200


# ---------------------------------------------------------------------------
# Plans
# ---------------------------------------------------------------------------

@bp.get("/plans")
@require_roles()
def list_plans():
    user = load_current_user()
    items, meta = services.list_plans(user, request.args)
    return jsonify({
        "data": [schemas.plan_to_dict(p) for p in items],
        "meta": meta,
    }), 200


@bp.post("/plans")
@require_roles(*HR_ADMIN)
def create_plan():
    cleaned, errors = schemas.validate_plan_payload(_json_body())
    if errors:
        _raise_validation(errors)
    plan = services.create_plan_manual(cleaned)
    return jsonify({"data": schemas.plan_to_dict(plan, include_tasks=True)}), 201


@bp.get("/plans/<int:plan_id>")
@require_roles()
def get_plan(plan_id):
    user = load_current_user()
    plan = services.get_plan_or_404(plan_id, user)
    return jsonify({"data": schemas.plan_to_dict(plan, include_tasks=True)}), 200


@bp.get("/my-plan")
@require_roles()
def get_my_plan():
    user = load_current_user()
    plan = services.get_my_plan(user)
    if plan is None:
        return jsonify({"data": None}), 200
    return jsonify({"data": schemas.plan_to_dict(plan, include_tasks=True)}), 200


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------

@bp.get("/my-tasks")
@require_roles()
def list_my_tasks():
    user = load_current_user()
    tasks = services.list_my_tasks(user)
    return jsonify({
        "data": [schemas.task_to_dict(t) for t in tasks],
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


@bp.post("/tasks/<int:task_id>/verify")
@require_roles(*HR_ADMIN)
def verify_task(task_id):
    user = load_current_user()
    task = services.verify_task(user, task_id)
    return jsonify({"data": schemas.task_to_dict(task)}), 200
