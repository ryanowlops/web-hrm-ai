"""Blueprint Đổi ca làm việc — tiền tố /api/v1/shift-swaps."""
from flask import Blueprint

bp = Blueprint("shift_swaps", __name__, url_prefix="/api/v1/shift-swaps")

from app.blueprints.shift_swaps import routes  # noqa: E402,F401
