"""Blueprint Nghỉ phép (leave) — tiền tố /api/v1/leave."""

from flask import Blueprint

bp = Blueprint("leave", __name__, url_prefix="/api/v1/leave")

from app.blueprints.leave import routes  # noqa: E402,F401
