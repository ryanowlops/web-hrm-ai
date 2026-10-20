"""Blueprint xác thực (auth) — tiền tố /api/v1/auth.

Trách nhiệm: đăng nhập, làm mới access token, đăng xuất (thu hồi token),
đổi mật khẩu. Phân quyền dùng chung nằm ở guards.py của package này.
"""
from flask import Blueprint

bp = Blueprint("auth", __name__, url_prefix="/api/v1/auth")

from app.blueprints.auth import routes  # noqa: E402,F401  (import để đăng ký route)
