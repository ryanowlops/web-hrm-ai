"""Routes cho Kỷ luật nhân viên — tiền tố /api/v1/disciplinary.

    POST   /disciplinary              Tạo biên bản kỷ luật (admin, hr).
    GET    /disciplinary              Danh sách (admin/hr: tất cả;
                                      manager: phòng mình; employee:
                                      chỉ của mình), lọc ?employee_id=
                                      ?status= ?severity=.
    GET    /disciplinary/<id>         Chi tiết (cùng phạm vi).
    POST   /disciplinary/<id>/resolve Giải quyết biên bản (admin, hr).

Bảng disciplinary_records là bảng MỚI, được db.create_all() tạo tự động
(không cần migration). Không có xóa — chỉ giải quyết bằng ghi chú.
"""
from flask import jsonify, request

from app.blueprints.auth.guards import load_current_user, require_roles
from app.blueprints.disciplinary import bp, schemas, services
from app.errors import ApiError

READ_ROLES = ("admin", "hr", "manager", "employee")
WRITE_ROLES = ("admin", "hr")


def _json_body():
    data = request.get_json(silent=True)
    if data is None:
        raise ApiError(400, "VALIDATION_ERROR", "Body phải là JSON hợp lệ.")
    return data


@bp.get("")
@require_roles(*READ_ROLES)
def list_records():
    user = load_current_user()
    rows, meta = services.list_records(request.args, user)
    return jsonify(
        {"data": [schemas.record_to_dict(row) for row in rows], "meta": meta}
    )


@bp.post("")
@require_roles(*WRITE_ROLES)
def create_record():
    cleaned, errors = schemas.validate_create_payload(_json_body())
    if errors:
        raise ApiError(
            400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", details=errors
        )
    user = load_current_user()
    record = services.create_record(
        cleaned, issued_by=getattr(user, "id", None)
    )
    return jsonify({"data": schemas.record_to_dict(record)}), 201


@bp.get("/<int:record_id>")
@require_roles(*READ_ROLES)
def get_record(record_id):
    user = load_current_user()
    record = services.get_record(record_id, user)
    return jsonify({"data": schemas.record_to_dict(record)})


@bp.post("/<int:record_id>/resolve")
@require_roles(*WRITE_ROLES)
def resolve_record(record_id):
    cleaned, errors = schemas.validate_resolve_payload(_json_body())
    if errors:
        raise ApiError(
            400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", details=errors
        )
    record = services.get_record(record_id)
    record = services.resolve_record(record, cleaned.get("resolved_note"))
    return jsonify({"data": schemas.record_to_dict(record)}), 200
