"""Routes chấm công — chỉ nhận request, validate, gọi service, trả JSON.

Quy ước (docs/architecture.md B3.3/B6):
- Lỗi chuẩn: { "error": { "code", "message", "details" } }
- Danh sách:  { "data": [...], "meta": { page, limit, totalItems, totalPages } }
- Phân quyền kiểm ở server: JWT + require_roles + phạm vi dữ liệu ở service.
"""
from flask import jsonify, request
from flask_jwt_extended import get_jwt, jwt_required
from marshmallow import ValidationError

from app.blueprints.auth.guards import require_roles

from . import bp, services
from .schemas import attendance_schema, attendance_update_schema
from .services import ApiError

HR_ROLES = ("hr", "admin")
# Employee được gọi monthly nhưng service ép phạm vi về đúng bản ghi của mình.
MONTHLY_ROLES = ("hr", "admin", "manager", "employee")


@bp.errorhandler(ApiError)
def handle_api_error(err):
    """Đảm bảo lỗi nghiệp vụ của module luôn theo định dạng chuẩn."""
    return jsonify(err.to_dict()), err.status_code


def _current_role():
    try:
        claims = get_jwt() or {}
    except Exception:  # noqa: BLE001
        return None
    return claims.get("role")


# ---------------------------------------------------------------------------
# Check-in / check-out
# ---------------------------------------------------------------------------
@bp.post("/attendance/check-in")
@jwt_required()
def check_in():
    """Check-in hôm nay (1 lần/ngày, giờ server, tự tính muộn/đúng giờ)."""
    record = services.check_in()
    return jsonify({"data": attendance_schema.dump(record)}), 201


@bp.post("/attendance/check-out")
@jwt_required()
def check_out():
    """Check-out hôm nay (phải đã check-in, chưa check-out)."""
    record = services.check_out()
    return jsonify({"data": attendance_schema.dump(record)}), 200


@bp.get("/attendance/today")
@jwt_required()
def today():
    """Trạng thái chấm công hôm nay của chính mình — cho FE hiển thị nút/trạng thái."""
    record = services.get_today()
    work_start = services.get_work_start_time()
    return jsonify(
        {
            "data": attendance_schema.dump(record) if record is not None else None,
            "has_checked_in": bool(record and record.check_in_at),
            "has_checked_out": bool(record and record.check_out_at),
            "work_start_time": work_start.strftime("%H:%M"),
        }
    ), 200


@bp.get("/attendance/me")
@jwt_required()
def my_attendance():
    """Bảng công của chính mình theo tháng (?month=YYYY-MM, mặc định tháng hiện tại)."""
    records, summary, first = services.get_my_month(request.args.get("month"))
    return jsonify(
        {
            "data": attendance_schema.dump(records, many=True),
            "month": first.strftime("%Y-%m"),
            "summary": summary,
        }
    ), 200


@bp.get("/attendance/my-year")
@jwt_required()
def my_year():
    """Chấm công cả năm của chính mình — cho trang "Hành trình của tôi".

    Query: ?year=YYYY (mặc định năm hiện tại).
    Trả { data: { year, days: [{date, status, check_in, check_out}],
    summary: {total_days, on_time_days, late_days, current_streak,
    best_streak} } } — luôn chỉ dữ liệu của người gọi.
    """
    return jsonify({"data": services.get_my_year(request.args.get("year"))}), 200


@bp.get("/attendance/monthly")
@jwt_required()
@require_roles(*MONTHLY_ROLES)
def monthly_attendance():
    """Bảng công tháng: HR/Admin xem tất cả, Manager chỉ xem phòng mình,
    Employee chỉ xem của chính mình.

    Query: ?month=YYYY-MM (hoặc month=&year= riêng), &mine=1,
    &department_id=&employee_id=&page=&limit=
    Với mine=1: trả { data: [bản ghi...], summary } của người gọi.
    """
    body, first = services.get_monthly(
        request.args.get("month"), request.args, _current_role()
    )
    body["month"] = first.strftime("%Y-%m")
    return jsonify(body), 200


@bp.patch("/attendance/<int:attendance_id>")
@jwt_required()
@require_roles(*HR_ROLES)
def update_attendance(attendance_id):
    """HR/Admin sửa bản ghi chấm công — bắt buộc note (lý do), ghi AuditLog nếu có."""
    payload = request.get_json(silent=True) or {}
    try:
        data = attendance_update_schema.load(payload)
    except ValidationError as err:
        details = [
            {"field": field, "message": "; ".join(messages)}
            for field, messages in err.messages.items()
        ]
        raise ApiError(
            400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", details=details
        )
    if not (data.get("note") or "").strip():
        raise ApiError(
            400,
            "VALIDATION_ERROR",
            "Bắt buộc nhập lý do sửa (note).",
            details=[{"field": "note", "message": "Không được để trống"}],
        )
    record = services.update_attendance(attendance_id, data)
    return jsonify({"data": attendance_schema.dump(record)}), 200
