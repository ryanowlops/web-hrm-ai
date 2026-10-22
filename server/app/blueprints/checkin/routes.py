"""Routes chấm công QR + GPS — chỉ nhận request, validate, gọi service.

Quy ước chung của app: lỗi { "error": { "code", "message", "details" } },
thành công bọc trong { "data": ... }.
"""
from datetime import datetime

from flask import jsonify, request
from flask_jwt_extended import jwt_required
from marshmallow import ValidationError

from app.blueprints.attendance.schemas import attendance_schema
from app.blueprints.auth.guards import require_roles
from app.errors import ApiError

from . import bp, services
from .schemas import checkin_log_list_schema, config_schema, scan_schema

HR_ROLES = ("hr", "admin")


@bp.errorhandler(ApiError)
def handle_api_error(err):
    """Đảm bảo lỗi nghiệp vụ của module luôn theo định dạng chuẩn."""
    return jsonify(err.to_dict()), err.status_code


def _load(schema):
    """Load + validate JSON body; lỗi validate -> ApiError 400 chuẩn."""
    try:
        return schema.load(request.get_json(silent=True) or {})
    except ValidationError as err:
        details = [
            {"field": field, "message": "; ".join(str(m) for m in messages)}
            for field, messages in (err.messages or {}).items()
        ]
        raise ApiError(
            400, "VALIDATION_ERROR", "Dữ liệu gửi lên không hợp lệ.", details=details
        )


@bp.get("/checkin/today-qr")
@jwt_required()
@require_roles(*HR_ROLES)
def today_qr():
    """Mã QR của hôm nay cho màn hình HR: {date, token, code6, expires_in_s}.

    FE tự dựng URL nhúng vào QR từ window.location.origin — backend không
    hardcode domain nên chạy được cả local lẫn production.
    """
    return jsonify({"data": services.get_today_qr()}), 200


@bp.post("/checkin/scan")
@jwt_required()
def scan():
    """Nhân viên quét QR (kèm GPS) hoặc nhập mã 6 số để check-in.

    Thành công: 201 {data: {attendance, distance_m, method, message}}.
    Ngoài phạm vi: 403 OUT_OF_RANGE kèm distance_m thật trong details.
    Đã check-in rồi: 409 truyền nguyên từ attendance service.
    """
    payload = _load(scan_schema)
    result = services.scan(payload)
    return jsonify(
        {
            "data": {
                "attendance": attendance_schema.dump(result["attendance"]),
                "distance_m": result["distance_m"],
                "method": result["method"],
                "message": result["message"],
            }
        }
    ), 201


@bp.get("/checkin/config")
@jwt_required()
@require_roles(*HR_ROLES)
def get_config():
    """Toạ độ văn phòng hiện tại ({lat, lon, radius_m, configured})."""
    return jsonify({"data": services.get_office_config()}), 200


@bp.put("/checkin/config")
@jwt_required()
@require_roles(*HR_ROLES)
def put_config():
    """HR cài/cập nhật toạ độ văn phòng + bán kính cho phép."""
    payload = _load(config_schema)
    return jsonify({"data": services.update_office_config(payload)}), 200


@bp.get("/checkin/logs")
@jwt_required()
@require_roles(*HR_ROLES)
def logs():
    """Nhật ký chấm công QR trong ngày (?date=YYYY-MM-DD, mặc định hôm nay ICT)."""
    raw = (request.args.get("date") or "").strip()
    if raw:
        try:
            day = datetime.strptime(raw, "%Y-%m-%d").date()
        except ValueError:
            raise ApiError(
                400,
                "VALIDATION_ERROR",
                "Tham số date phải có định dạng YYYY-MM-DD.",
                details=[{"field": "date", "message": "Định dạng YYYY-MM-DD"}],
            )
    else:
        day = services.today_ict()
    rows = services.list_logs(day)
    return jsonify(
        {"data": checkin_log_list_schema.dump(rows), "date": day.isoformat()}
    ), 200
