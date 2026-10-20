"""Blueprint quản lý tài khoản (users) — tiền tố /api/v1/users.

Chỉ Admin dùng (quản lý tài khoản & phân quyền, docs A2/FR-01).
"""
from flask import Blueprint

bp = Blueprint("users", __name__, url_prefix="/api/v1/users")

from app.blueprints.users import routes  # noqa: E402,F401  (import để đăng ký route)
