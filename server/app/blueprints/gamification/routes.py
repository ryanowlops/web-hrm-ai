"""Routes cho Gamification — prefix /api/v1/gamification.

Phân quyền (hợp đồng feature-expansion-v4 mục 2.3):
- Điểm của tôi / huy hiệu / đổi quà: mọi vai trò đã đăng nhập (dữ liệu luôn
  là của CHÍNH người gọi, employee lấy từ tài khoản — không nhận từ client).
- Bảng xếp hạng + catalog quà: mọi vai trò đã đăng nhập.
- Tạo/sửa quà + duyệt yêu cầu đổi quà: admin, hr.
- Danh sách yêu cầu scope=all: admin, hr (chặn ở service theo role thật).
Mọi lỗi trả định dạng chuẩn {"error": {"code", "message", "details"}}.
"""

from flask import jsonify, request

from app.blueprints.auth.guards import require_roles
from app.blueprints.gamification import bp
from app.blueprints.gamification import schemas, services
from app.blueprints.gamification.services import ApiError

ALL_ROLES = ("admin", "hr", "manager", "employee")
HR_ROLES = ("admin", "hr")


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
# Điểm + xếp hạng + huy hiệu
# ---------------------------------------------------------------------------

@bp.route("/my-points", methods=["GET"], strict_slashes=False)
@require_roles(*ALL_ROLES)
def my_points():
    try:
        user = services.current_user()
        return jsonify({"data": services.my_points(user)})
    except ApiError as exc:
        return _error(exc)


@bp.route("/leaderboard", methods=["GET"], strict_slashes=False)
@require_roles(*ALL_ROLES)
def leaderboard():
    try:
        limit = services.parse_int_arg(request.args, "limit", 10, 1, 50)
        return jsonify({"data": services.leaderboard(limit)})
    except ApiError as exc:
        return _error(exc)


@bp.route("/my-badges", methods=["GET"], strict_slashes=False)
@require_roles(*ALL_ROLES)
def my_badges():
    try:
        user = services.current_user()
        return jsonify({"data": services.my_badges(user)})
    except ApiError as exc:
        return _error(exc)


# ---------------------------------------------------------------------------
# Cửa hàng quà
# ---------------------------------------------------------------------------

@bp.route("/rewards", methods=["GET"], strict_slashes=False)
@require_roles(*ALL_ROLES)
def list_rewards():
    try:
        user = services.current_user()
        include_all = (request.args.get("all") or "").lower() in ("1", "true")
        if include_all and user.role in HR_ROLES:
            return jsonify({"data": services.list_all_rewards()})
        return jsonify({"data": services.list_rewards(user)})
    except ApiError as exc:
        return _error(exc)


@bp.route("/rewards", methods=["POST"], strict_slashes=False)
@require_roles(*HR_ROLES)
def create_reward():
    try:
        cleaned, errors = schemas.validate_reward_payload(_json_body())
        if errors:
            return _validation_error(errors)
        reward = services.create_reward(cleaned)
        return jsonify({"data": schemas.reward_to_dict(reward)}), 201
    except ApiError as exc:
        return _error(exc)


@bp.route("/rewards/<int:reward_id>", methods=["PATCH"], strict_slashes=False)
@require_roles(*HR_ROLES)
def update_reward(reward_id):
    try:
        cleaned, errors = schemas.validate_reward_payload(
            _json_body(), partial=True
        )
        if errors:
            return _validation_error(errors)
        reward = services.update_reward(reward_id, cleaned)
        return jsonify({"data": schemas.reward_to_dict(reward)})
    except ApiError as exc:
        return _error(exc)


# ---------------------------------------------------------------------------
# Đổi quà
# ---------------------------------------------------------------------------

@bp.route("/redemptions", methods=["POST"], strict_slashes=False)
@require_roles(*ALL_ROLES)
def create_redemption():
    try:
        cleaned, errors = schemas.validate_redemption_payload(_json_body())
        if errors:
            return _validation_error(errors)
        user = services.current_user()
        redemption = services.create_redemption(user, cleaned["reward_id"])
        return jsonify({"data": schemas.redemption_to_dict(redemption)}), 201
    except ApiError as exc:
        return _error(exc)


@bp.route("/redemptions", methods=["GET"], strict_slashes=False)
@require_roles(*ALL_ROLES)
def list_redemptions():
    try:
        user = services.current_user()
        items, meta = services.list_redemptions(user, request.args)
        return jsonify({
            "data": [schemas.redemption_to_dict(item) for item in items],
            "meta": meta,
        })
    except ApiError as exc:
        return _error(exc)


@bp.route(
    "/redemptions/<int:redemption_id>/decision",
    methods=["POST"],
    strict_slashes=False,
)
@require_roles(*HR_ROLES)
def decide_redemption(redemption_id):
    try:
        cleaned, errors = schemas.validate_decision_payload(_json_body())
        if errors:
            return _validation_error(errors)
        user = services.current_user()
        redemption = services.decide_redemption(
            user, redemption_id, cleaned["decision"], cleaned["note"]
        )
        return jsonify({"data": schemas.redemption_to_dict(redemption)})
    except ApiError as exc:
        return _error(exc)
