"""Service layer cho auth — toàn bộ logic nghiệp vụ xác thực nằm ở đây.

routes.py chỉ: validate input (schema) -> gọi service -> trả JSON.
"""
import threading

from flask_jwt_extended import create_access_token, create_refresh_token
from werkzeug.security import check_password_hash, generate_password_hash

from app.errors import ApiError
from app.extensions import db
from app.models import User

# ---------------------------------------------------------------------------
# Token blocklist đơn giản trong bộ nhớ (in-memory).
# Đủ cho đồ án chạy 1 instance: logout -> đưa jti của access token vào set này.
# Khi triển khai nhiều instance, thay 2 hàm revoke/is_token_revoked bằng Redis/DB.
# App factory cần gọi register_jwt_blocklist(jwt) một lần lúc khởi tạo để
# Flask-JWT-Extended kiểm tra blocklist trên mọi request.
# ---------------------------------------------------------------------------
_revoked_jtis: set = set()
_revoked_lock = threading.Lock()


def revoke_token(jti: str) -> None:
    if jti:
        with _revoked_lock:
            _revoked_jtis.add(jti)


def is_token_revoked(jti: str) -> bool:
    with _revoked_lock:
        return jti in _revoked_jtis


# Hash giả dùng để cân bằng thời gian phản hồi khi email không tồn tại
# (xem authenticate) — sinh một lần lúc import, không phải mật khẩu thật.
_DUMMY_PASSWORD_HASH = generate_password_hash("dummy-password-for-timing-equalization")


def register_jwt_blocklist(jwt_manager) -> None:
    """Đăng ký callback blocklist cho Flask-JWT-Extended (gọi từ app factory)."""

    @jwt_manager.token_in_blocklist_loader
    def _check_blocklist(_jwt_header, jwt_payload):
        return is_token_revoked(jwt_payload.get("jti"))


# ---------------------------------------------------------------------------
# Nghiệp vụ
# ---------------------------------------------------------------------------

def _claims_for(user: User) -> dict:
    """Claim tối thiểu theo docs B8: role (+ email tiện cho frontend/log)."""
    return {"role": user.role, "email": user.email}


def issue_tokens(user: User) -> dict:
    """Cấp cặp access + refresh token cho user."""
    claims = _claims_for(user)
    return {
        "access_token": create_access_token(
            identity=str(user.id), additional_claims=claims
        ),
        "refresh_token": create_refresh_token(
            identity=str(user.id), additional_claims=claims
        ),
        "token_type": "Bearer",
    }


def refresh_access_token(user: User) -> str:
    """Cấp access token mới từ một refresh token còn hợp lệ."""
    return create_access_token(
        identity=str(user.id), additional_claims=_claims_for(user)
    )


def authenticate(email: str, password: str) -> User:
    """Kiểm tra thông tin đăng nhập, trả về User nếu hợp lệ.

    - Không phân biệt lỗi "email không tồn tại" với "sai mật khẩu"
      để tránh lộ thông tin tài khoản (docs B8).
    - Tài khoản bị khóa (is_active = False) -> 403 ACCOUNT_DISABLED.
    """
    normalized_email = (email or "").strip().lower()
    user = db.session.query(User).filter(User.email == normalized_email).first()
    if user is None:
        # Vẫn chạy kiểm tra hash trên một hash giả để thời gian phản hồi của
        # "email không tồn tại" không khác "sai mật khẩu" (chống dò tài khoản
        # qua timing — kiểm toán bảo mật 23/10).
        check_password_hash(_DUMMY_PASSWORD_HASH, password or "")
    if user is None or not check_password_hash(user.password_hash, password):
        raise ApiError(
            "INVALID_CREDENTIALS",
            "Email hoặc mật khẩu không đúng.",
            status_code=401,
        )
    if not user.is_active:
        raise ApiError(
            "ACCOUNT_DISABLED",
            "Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên.",
            status_code=403,
        )
    return user


def change_password(user: User, current_password: str, new_password: str) -> None:
    """Đổi mật khẩu cho chính user đang đăng nhập."""
    if not check_password_hash(user.password_hash, current_password):
        raise ApiError(
            "INVALID_CURRENT_PASSWORD",
            "Mật khẩu hiện tại không đúng.",
            status_code=400,
        )
    if check_password_hash(user.password_hash, new_password):
        raise ApiError(
            "PASSWORD_UNCHANGED",
            "Mật khẩu mới phải khác mật khẩu hiện tại.",
            status_code=400,
        )
    user.password_hash = generate_password_hash(new_password)
    db.session.commit()
