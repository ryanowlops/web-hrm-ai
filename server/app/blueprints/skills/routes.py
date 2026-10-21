"""Routes cho Skills (bản đồ năng lực) — prefix /api/v1/skills.

Phân quyền (hợp đồng feature-expansion-v5 mục D.2):
- GET /skills, GET /skills/matrix, GET /skills/matrix/cell: mọi vai trò.
- POST/PATCH/DELETE /skills: hr/admin (require_roles ở route).
- GET /skills/employees/<id>: scope xem nhân viên như module employees
  (kiểm ở service — ngoài scope 404).
- PUT /skills/employees/<id>: chính mình / hr-admin / manager trong
  scope (kiểm ở service — ngoài quyền 403).
- POST /skills/employees/<id>/suggest: gợi ý khoá học (scope như GET).
Mọi lỗi trả định dạng chuẩn {"error": {"code", "message", "details"}}.
"""

from flask import jsonify, request

from app.blueprints.auth.guards import require_roles
from app.blueprints.skills import bp
from app.blueprints.skills import schemas, services
from app.blueprints.skills.services import ApiError

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
    return _error(ApiError(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", errors))


def _json_body():
    data = request.get_json(silent=True)
    if data is None:
        raise ApiError(400, "VALIDATION_ERROR", "Body phải là JSON hợp lệ.",
                       [{"field": "body", "message": "Body phải là JSON."}])
    return data


def _int_arg(name):
    raw = request.args.get(name)
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise ApiError(400, "VALIDATION_ERROR", f"Tham số {name} phải là số nguyên.",
                       [{"field": name, "message": "Phải là số nguyên."}])


# ---------------------------------------------------------------------------
# Danh mục kỹ năng
# ---------------------------------------------------------------------------

@bp.route("", methods=["GET"], strict_slashes=False)
@require_roles(*READ_ROLES)
def list_skills():
    try:
        skills, counts = services.list_skills()
        return jsonify({
            "data": [
                schemas.skill_to_dict(s, holder_count=counts.get(s.id, 0))
                for s in skills
            ],
            "meta": {"totalItems": len(skills)},
        }), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("", methods=["POST"], strict_slashes=False)
@require_roles(*WRITE_ROLES)
def create_skill():
    try:
        cleaned, errors = schemas.validate_skill_payload(_json_body())
        if errors:
            return _validation_error(errors)
        skill = services.create_skill(cleaned)
        return jsonify({"data": schemas.skill_to_dict(skill)}), 201
    except ApiError as exc:
        return _error(exc)


@bp.route("/<int:skill_id>", methods=["PATCH"])
@require_roles(*WRITE_ROLES)
def update_skill(skill_id):
    try:
        cleaned, errors = schemas.validate_skill_payload(
            _json_body(), partial=True
        )
        if errors:
            return _validation_error(errors)
        skill = services.update_skill(skill_id, cleaned)
        return jsonify({"data": schemas.skill_to_dict(skill)}), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/<int:skill_id>", methods=["DELETE"])
@require_roles(*WRITE_ROLES)
def delete_skill(skill_id):
    try:
        services.delete_skill(skill_id)
        return jsonify({"data": {"id": skill_id, "deleted": True}}), 200
    except ApiError as exc:
        return _error(exc)


# ---------------------------------------------------------------------------
# Ma trận kỹ năng × phòng ban
# ---------------------------------------------------------------------------

@bp.route("/matrix", methods=["GET"])
@require_roles(*READ_ROLES)
def skills_matrix():
    try:
        matrix = services.skills_matrix()
        return jsonify({
            "data": {
                "departments": matrix["departments"],
                "rows": [
                    {
                        "skill": schemas.skill_to_dict(row["skill"]),
                        "cells": row["cells"],
                    }
                    for row in matrix["rows"]
                ],
            }
        }), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/matrix/cell", methods=["GET"])
@require_roles(*READ_ROLES)
def matrix_cell():
    try:
        skill_id = _int_arg("skill_id")
        department_id = _int_arg("department_id")
        skill, department, rows = services.matrix_cell(skill_id, department_id)
        return jsonify({
            "data": {
                "skill": schemas.skill_to_dict(skill),
                "department": {"id": department.id, "name": department.name},
                "employees": [
                    {
                        "employee_id": row.employee_id,
                        "employee_code": row.employee.code,
                        "employee_name": row.employee.full_name,
                        "level": row.level,
                    }
                    for row in rows
                ],
            }
        }), 200
    except ApiError as exc:
        return _error(exc)


# ---------------------------------------------------------------------------
# Hồ sơ kỹ năng theo nhân viên
# ---------------------------------------------------------------------------

@bp.route("/employees/<int:employee_id>", methods=["GET"])
@require_roles(*READ_ROLES)
def get_employee_skills(employee_id):
    try:
        user = services.current_user()
        employee, rows = services.get_employee_skills(user, employee_id)
        return jsonify({
            "data": {
                "employee": schemas.employee_brief(employee),
                "items": [
                    schemas.employee_skill_to_dict(row) for row in rows
                ],
            }
        }), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/employees/<int:employee_id>", methods=["PUT"])
@require_roles(*READ_ROLES)
def update_employee_skills(employee_id):
    try:
        cleaned, errors = schemas.validate_levels_payload(_json_body())
        if errors:
            return _validation_error(errors)
        user = services.current_user()
        employee, rows = services.update_employee_skills(
            user, employee_id, cleaned["items"]
        )
        return jsonify({
            "data": {
                "employee": schemas.employee_brief(employee),
                "items": [
                    schemas.employee_skill_to_dict(row) for row in rows
                ],
            }
        }), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/employees/<int:employee_id>/suggest", methods=["POST"])
@require_roles(*READ_ROLES)
def suggest_courses(employee_id):
    try:
        user = services.current_user()
        suggestions, source = services.suggest_courses(user, employee_id)
        return jsonify({
            "data": suggestions,
            "meta": {"source": source, "totalItems": len(suggestions)},
        }), 200
    except ApiError as exc:
        return _error(exc)
