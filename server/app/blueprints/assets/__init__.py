"""Blueprint Assets — tiền tố /api/v1.

Quản lý tài sản công ty (feature-expansion-v2 mục 1C): CRUD tài sản,
cấp phát / thu hồi cho nhân viên, tài sản của tôi, lịch sử theo tài sản.
"""

from flask import Blueprint

bp = Blueprint("assets", __name__, url_prefix="/api/v1")

from app.blueprints.assets import routes  # noqa: E402,F401
