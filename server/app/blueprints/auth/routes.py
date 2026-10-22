"""Routes cho blueprint auth — tiền tố /api/v1/auth.

    POST /auth/login            Đăng nhập -> access + refresh token + user rút gọn
    POST /auth/refresh          Refresh token -> access token mới
    POST /auth/logout           Thu hồi access token hiện tại (blocklist)
    POST /auth/change-password  Đổi mật khẩu của chính mình

Routes không chứa logic nghiệp vụ — chỉ validate input rồi gọi services.
"""
from flask import jsonify, request
from flask_jwt_extended import get_jwt, jwt_required
from marshmallow import ValidationError

from app.blueprints.auth import bp, services
from app.blueprints.auth.guards import load_current_user
from app.extensions import limiter
from app.blueprints.auth.schemas import (
    ChangePasswordSchema,
    LoginSchema,
    UserBriefSchema,
)
from app.errors import ApiError


def _load(schema, payload):
    """Validate payload bằng marshmallow, lỗi -> ApiError VALIDATION_ERROR."""
    try:
        return schema.load(payload or {})
    except ValidationError as exc:
        details = [
            {"field": field, "message": message}
            for field, messages in exc.messages.items()
            for message in (messages if isinstance(messages, list) else [messages])
        ]
        raise ApiError(
            "VALIDATION_ERROR",
            "Dữ liệu gửi lên không hợp lệ.",
            status_code=400,
            details=details,
        ) from exc


@bp.post("/login")
@limiter.limit("10 per minute; 100 per hour")
def login():
    data = _load(LoginSchema(), request.get_json(silent=True))
    user = services.authenticate(data["email"], data["password"])
    payload = services.issue_tokens(user)
    payload["user"] = UserBriefSchema().dump(user)
    return jsonify(payload), 200


@bp.post("/refresh")
@limiter.limit("30 per minute")
@jwt_required(refresh=True)
def refresh():
    # load_current_user kiểm tra tài khoản còn tồn tại + chưa bị khóa.
    user = load_current_user()
    return (
        jsonify(
            {
                "access_token": services.refresh_access_token(user),
                "token_type": "Bearer",
            }
        ),
        200,
    )


@bp.post("/logout")
@jwt_required()
def logout():
    services.revoke_token(get_jwt().get("jti"))
    # Thu hồi luôn refresh token mà client gửi kèm trong body: trước đây
    # logout chỉ cắt access token, refresh 7 ngày vẫn âm thầm cấp phiên mới
    # được sau khi "đăng xuất" (kiểm toán bảo mật 23/10).
    body = request.get_json(silent=True) or {}
    refresh_token = body.get("refresh_token")
    if refresh_token:
        try:
            from flask_jwt_extended import decode_token

            services.revoke_token(decode_token(refresh_token).get("jti"))
        except Exception:
            pass  # Token refresh không hợp lệ/hết hạn — không cần thu hồi.
    return jsonify({"message": "Đăng xuất thành công."}), 200


@bp.post("/change-password")
@jwt_required()
def change_password():
    user = load_current_user()
    data = _load(ChangePasswordSchema(), request.get_json(silent=True))
    services.change_password(user, data["current_password"], data["new_password"])
    return jsonify({"message": "Đổi mật khẩu thành công."}), 200
