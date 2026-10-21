"""Routes cho Thong bao cong ty — tien to /api/v1/announcements.

    GET    /announcements             Danh sach (ghim truoc, moi truoc,
                                      phan trang, loc ?category=)
    POST   /announcements             Tao moi (HR/Admin) — dong thoi phat
                                      Notification cho nhan vien working
    PATCH  /announcements/<id>        Sua (HR/Admin)
    DELETE /announcements/<id>        Xoa (HR/Admin)

Doc: moi vai tro da dang nhap. Ghi: chi admin, hr (require_roles).
"""
from flask import jsonify, request

from app.blueprints.announcements import bp, schemas, services
from app.blueprints.auth.guards import load_current_user, require_roles
from app.errors import ApiError

READ_ROLES = ("admin", "hr", "manager", "employee")
WRITE_ROLES = ("admin", "hr")


def _json_body():
    data = request.get_json(silent=True)
    if data is None:
        raise ApiError(400, "VALIDATION_ERROR", "Body phải là JSON hợp lệ.")
    return data


def _validated(data, *, partial):
    cleaned, errors = schemas.validate_announcement_payload(data, partial=partial)
    if errors:
        raise ApiError(
            422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", details=errors
        )
    return cleaned


@bp.get("")
@require_roles(*READ_ROLES)
def list_announcements():
    rows, meta = services.list_announcements(request.args)
    return jsonify(
        {"data": [schemas.announcement_to_dict(row) for row in rows], "meta": meta}
    )


@bp.post("")
@require_roles(*WRITE_ROLES)
def create_announcement():
    user = load_current_user()
    cleaned = _validated(_json_body(), partial=False)
    announcement = services.create_announcement(
        cleaned, author_employee_id=getattr(user, "employee_id", None)
    )
    return jsonify({"data": schemas.announcement_to_dict(announcement)}), 201


@bp.patch("/<int:announcement_id>")
@require_roles(*WRITE_ROLES)
def update_announcement(announcement_id: int):
    announcement = services.get_announcement_or_404(announcement_id)
    cleaned = _validated(_json_body(), partial=True)
    announcement = services.update_announcement(announcement, cleaned)
    return jsonify({"data": schemas.announcement_to_dict(announcement)})


@bp.delete("/<int:announcement_id>")
@require_roles(*WRITE_ROLES)
def delete_announcement(announcement_id: int):
    announcement = services.get_announcement_or_404(announcement_id)
    services.delete_announcement(announcement)
    return jsonify({"data": {"deleted": True, "id": announcement_id}})
