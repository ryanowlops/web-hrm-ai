"""Guards phân quyền dùng chung cho toàn bộ backend.

Module khác import từ đây:

    from app.blueprints.auth.guards import require_roles, load_current_user

    @bp.get("")
    @require_roles("admin", "hr")      # chỉ các role này mới qua được
    def list_something():
        ...

    @bp.get("/me")
    @require_roles()                   # không truyền role = mọi user đã đăng nhập
    def me():
        user = load_current_user()     # hoặc g.current_user do guard đã gán
        ...

Nguyên tắc (theo docs/architecture.md B1.3, B8):
- Guard chạy ở server trên từng request, gồm @jwt_required() + kiểm tra role.
- Role lấy từ DB (bản ghi user hiện tại), KHÔNG tin claim trong token —
  Admin đổi role/khóa tài khoản là có hiệu lực ngay, không phải chờ token hết hạn.
- Tài khoản bị khóa (is_active = False) bị chặn ở mọi endpoint có guard,
  kể cả khi token còn hạn.
"""
from functools import wraps

from flask import g
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.errors import ApiError
from app.extensions import db
from app.models import User

#: Toàn bộ role hợp lệ của hệ thống (docs A2).
ROLES = ("admin", "hr", "manager", "employee")


def load_current_user() -> User:
    """Nạp user hiện tại từ JWT identity, kiểm tra tồn tại + đang hoạt động.

    Phải được gọi bên trong request đã qua @jwt_required() (trực tiếp hoặc
    qua require_roles). Gán user vào flask.g để dùng lại trong cùng request.
    """
    if getattr(g, "current_user", None) is not None:
        return g.current_user

    identity = get_jwt_identity()
    try:
        user_id = int(identity)
    except (TypeError, ValueError):
        raise ApiError(
            "INVALID_TOKEN",
            "Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại.",
            status_code=401,
        )
    user = db.session.get(User, user_id)
    if user is None:
        raise ApiError(
            "USER_NOT_FOUND",
            "Tài khoản không còn tồn tại, vui lòng đăng nhập lại.",
            status_code=401,
        )
    if not user.is_active:
        raise ApiError(
            "ACCOUNT_DISABLED",
            "Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên.",
            status_code=403,
        )
    g.current_user = user
    return user


def require_roles(*roles: str):
    """Decorator: yêu cầu đăng nhập và (nếu có truyền) thuộc một trong các role.

    Cách dùng: đặt NGAY DƯỚI decorator route của Flask, vd:

        @bp.patch("/<int:user_id>")
        @require_roles("admin")
        def update_user(user_id): ...

    Không truyền role nào -> chỉ yêu cầu đã đăng nhập + tài khoản còn hoạt động.
    """

    def decorator(view_func):
        @wraps(view_func)
        @jwt_required()
        def wrapper(*args, **kwargs):
            user = load_current_user()
            if roles and user.role not in roles:
                raise ApiError(
                    "FORBIDDEN",
                    "Bạn không có quyền thực hiện thao tác này.",
                    status_code=403,
                )
            return view_func(*args, **kwargs)

        return wrapper

    return decorator
