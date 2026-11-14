"""Routes cho Lịch nghỉ lễ — tiền tố /api/v1/holidays.

    GET    /holidays?year=     Danh sách ngày lễ (mọi role đã đăng nhập),
                               lọc theo năm, sắp xếp theo ngày tăng dần.
    POST   /holidays           Thêm ngày lễ (admin, hr).
    DELETE /holidays/<id>      Xóa ngày lễ (admin, hr).

Bảng holidays là bảng MỚI, được db.create_all() tạo tự động (không cần
migration). Chưa nối vào tính nghỉ phép / lương — bước nối riêng sau.
"""
from flask import jsonify, request

from app.blueprints.auth.guards import load_current_user, require_roles
from app.blueprints.holidays import bp, schemas, services
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
def list_holidays():
    rows, meta = services.list_holidays(request.args)
    return jsonify(
        {"data": [schemas.holiday_to_dict(row) for row in rows], "meta": meta}
    )


@bp.post("")
@require_roles(*WRITE_ROLES)
def create_holiday():
    cleaned, errors = schemas.validate_holiday_payload(_json_body())
    if errors:
        raise ApiError(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.",
                       details=errors)
    user = load_current_user()
    holiday = services.create_holiday(
        cleaned, created_by=getattr(user, "id", None)
    )
    return jsonify({"data": schemas.holiday_to_dict(holiday)}), 201


@bp.delete("/<int:holiday_id>")
@require_roles(*WRITE_ROLES)
def delete_holiday(holiday_id):
    services.delete_holiday(holiday_id)
    return jsonify({"data": {"id": holiday_id, "deleted": True}}), 200
