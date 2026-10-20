"""Routes cho Payroll — kỳ lương, tính lương, chốt kỳ, phiếu lương.

Phân quyền theo kiến trúc A2/B8:
- Tạo kỳ / tính lương / chốt kỳ / xem dòng lương: chỉ admin, hr.
- Phiếu lương cá nhân (/payroll/my-payslip): mọi vai trò đã đăng nhập,
  nhưng service chỉ trả dòng lương của chính nhân viên gắn với tài khoản
  và chỉ khi kỳ đã chốt (chưa chốt -> 404).
Mọi phản hồi lỗi dùng định dạng chuẩn
    {"error": {"code", "message", "details"}}.
"""

from flask import jsonify, request

from app.blueprints.auth.guards import load_current_user, require_roles
from app.blueprints.payroll import bp, schemas, services
from app.blueprints.payroll.services import ApiError

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


# ---------------------------------------------------------------------------
# Kỳ lương
# ---------------------------------------------------------------------------


@bp.route("/payroll/periods", methods=["POST"], strict_slashes=False)
@require_roles(*WRITE_ROLES)
def create_period():
    try:
        data = _json_body()
        errors = schemas.validate_create_period(data)
        if errors:
            return _validation_error(errors)
        period = services.create_period(data, load_current_user())
        return jsonify({"data": schemas.period_to_dict(period)}), 201
    except ApiError as err:
        return _error(err)


@bp.route("/payroll/periods", methods=["GET"], strict_slashes=False)
@require_roles(*WRITE_ROLES)
def list_periods():
    try:
        items, meta = services.list_periods(request.args)
        data = [schemas.period_to_dict(p) for p in items]
        return jsonify({"data": data, "meta": meta}), 200
    except ApiError as err:
        return _error(err)


@bp.route("/payroll/periods/<int:period_id>/calculate", methods=["POST"],
          strict_slashes=False)
@require_roles(*WRITE_ROLES)
def calculate_period(period_id):
    try:
        summary = services.calculate_period(period_id, load_current_user())
        period = services.get_period(period_id)
        summary["period"] = schemas.period_to_dict(period)
        return jsonify({"data": summary}), 200
    except ApiError as err:
        return _error(err)


@bp.route("/payroll/periods/<int:period_id>/lock", methods=["POST"],
          strict_slashes=False)
@require_roles(*WRITE_ROLES)
def lock_period(period_id):
    try:
        period = services.lock_period(period_id, load_current_user())
        return jsonify({"data": schemas.period_to_dict(period)}), 200
    except ApiError as err:
        return _error(err)


# ---------------------------------------------------------------------------
# Dòng lương & phiếu lương
# ---------------------------------------------------------------------------


@bp.route("/payroll/periods/<int:period_id>/items", methods=["GET"],
          strict_slashes=False)
@require_roles(*WRITE_ROLES)
def list_period_items(period_id):
    try:
        items, meta = services.list_items(period_id, request.args)
        data = [schemas.item_to_dict(i) for i in items]
        return jsonify({"data": data, "meta": meta}), 200
    except ApiError as err:
        return _error(err)


@bp.route("/payroll/my-payslip", methods=["GET"], strict_slashes=False)
@require_roles()
def my_payslip():
    try:
        period_id = request.args.get("period_id", type=int)
        item = services.get_my_payslip(load_current_user(), period_id)
        return jsonify({"data": schemas.item_to_dict(item)}), 200
    except ApiError as err:
        return _error(err)
