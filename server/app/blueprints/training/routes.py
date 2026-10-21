"""Routes cho Training (đào tạo nội bộ) — prefix /api/v1/training.

Phân quyền (hợp đồng feature-expansion-v2 mục 1D):
- Đọc danh sách/chi tiết khoá: mọi vai trò đã đăng nhập; employee chỉ thấy
  khoá đang active (lọc ở service).
- Ghi (tạo/sửa/xoá khoá, gán học viên): admin, hr.
- GET /training/my: khoá của chính nhân viên đang đăng nhập.
- PATCH /training/enrollments/<id>: chủ enrollment hoặc HR/Admin (check ở service).
Mọi lỗi trả định dạng chuẩn {"error": {"code", "message", "details"}}.
"""

from flask import jsonify, request

from app.blueprints.auth.guards import require_roles
from app.blueprints.training import bp
from app.blueprints.training import schemas, services
from app.blueprints.training.services import ApiError

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


def _course_dict(course):
    total, completed = services.enrollment_counts(course.id)
    return schemas.course_to_dict(
        course, enrollment_total=total, enrollment_completed=completed
    )


# ---------------------------------------------------------------------------
# Khoá học
# ---------------------------------------------------------------------------

@bp.route("/courses", methods=["GET"], strict_slashes=False)
@require_roles(*READ_ROLES)
def list_courses():
    try:
        user = services.current_user()
        items, meta = services.list_courses(request.args, user)
        return jsonify({"data": [_course_dict(c) for c in items], "meta": meta}), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/courses/<int:course_id>", methods=["GET"])
@require_roles(*READ_ROLES)
def get_course(course_id):
    try:
        user = services.current_user()
        course = services.get_course(course_id, user)
        return jsonify({"data": _course_dict(course)}), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/courses", methods=["POST"], strict_slashes=False)
@require_roles(*WRITE_ROLES)
def create_course():
    try:
        cleaned, errors = schemas.validate_course_payload(_json_body())
        if errors:
            return _validation_error(errors)
        course = services.create_course(cleaned)
        return jsonify({"data": _course_dict(course)}), 201
    except ApiError as exc:
        return _error(exc)


@bp.route("/courses/<int:course_id>", methods=["PATCH"])
@require_roles(*WRITE_ROLES)
def update_course(course_id):
    try:
        cleaned, errors = schemas.validate_course_payload(
            _json_body(), partial=True
        )
        if errors:
            return _validation_error(errors)
        course = services.update_course(course_id, cleaned)
        return jsonify({"data": _course_dict(course)}), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/courses/<int:course_id>", methods=["DELETE"])
@require_roles(*WRITE_ROLES)
def delete_course(course_id):
    try:
        services.delete_course(course_id)
        return jsonify({"data": {"id": course_id, "deleted": True}}), 200
    except ApiError as exc:
        return _error(exc)


# ---------------------------------------------------------------------------
# Ghi danh
# ---------------------------------------------------------------------------

@bp.route("/courses/<int:course_id>/enrollments", methods=["GET"])
@require_roles("admin", "hr", "manager")
def list_course_enrollments(course_id):
    try:
        items = services.list_course_enrollments(course_id)
        return jsonify({
            "data": [schemas.enrollment_to_dict(e) for e in items],
            "meta": {"totalItems": len(items)},
        }), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/courses/<int:course_id>/enroll", methods=["POST"])
@require_roles(*WRITE_ROLES)
def enroll_course(course_id):
    try:
        cleaned, errors = schemas.validate_enroll_payload(_json_body())
        if errors:
            return _validation_error(errors)
        actor = services.current_user()
        created, skipped = services.enroll_employees(
            course_id, cleaned["employee_ids"], actor
        )
        return jsonify({
            "data": [schemas.enrollment_to_dict(e) for e in created],
            "meta": {
                "created": len(created),
                "skipped_employee_ids": skipped,
            },
        }), 201
    except ApiError as exc:
        return _error(exc)


@bp.route("/my", methods=["GET"], strict_slashes=False)
@require_roles(*READ_ROLES)
def my_courses():
    try:
        user = services.current_user()
        items = services.my_courses(user)
        return jsonify({
            "data": [
                schemas.enrollment_to_dict(e, include_course=True) for e in items
            ],
            "meta": {"totalItems": len(items)},
        }), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/enrollments/<int:enrollment_id>", methods=["PATCH"])
@require_roles(*READ_ROLES)
def update_enrollment(enrollment_id):
    try:
        cleaned, errors = schemas.validate_enrollment_patch(_json_body())
        if errors:
            return _validation_error(errors)
        user = services.current_user()
        enrollment = services.update_enrollment(enrollment_id, cleaned, user)
        return jsonify({
            "data": schemas.enrollment_to_dict(enrollment, include_course=True)
        }), 200
    except ApiError as exc:
        return _error(exc)
