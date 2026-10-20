"""Blueprint ai — AI sàng lọc CV (chỉ HR/Admin).

Đăng ký tiền tố /api/v1/ai tại đây; app factory chỉ cần:
    from app.blueprints.ai import bp as ai_bp
    app.register_blueprint(ai_bp)
"""

from flask import Blueprint

bp = Blueprint("ai", __name__, url_prefix="/api/v1/ai")

from . import routes  # noqa: E402,F401 — import để đăng ký các route lên bp

__all__ = ["bp"]
