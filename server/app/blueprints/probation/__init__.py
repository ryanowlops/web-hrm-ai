"""Blueprint Quản lý thử việc — tiền tố /api/v1/probation.

Liệt kê hợp đồng thử việc đang hiệu lực + đánh giá (đạt / không đạt /
gia hạn) và nối lương thử việc 85% ở payroll (xem payroll/services).
"""
from flask import Blueprint

bp = Blueprint("probation", __name__, url_prefix="/api/v1/probation")

from app.blueprints.probation import routes  # noqa: E402,F401
