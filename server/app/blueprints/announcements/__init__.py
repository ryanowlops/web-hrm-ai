"""Blueprint Thong bao cong ty (announcements) — tien to /api/v1/announcements.

Bang tin noi bo: moi nguoi da dang nhap doc duoc; HR/Admin dang, sua,
xoa. Dang thong bao moi se phat Notification cho toan bo nhan vien
dang lam viec.
"""
from flask import Blueprint

bp = Blueprint("announcements", __name__, url_prefix="/api/v1/announcements")

from app.blueprints.announcements import routes  # noqa: E402,F401  (import de dang ky route)
