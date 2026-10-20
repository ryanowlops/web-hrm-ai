"""Blueprint Payroll — tiền tố /api/v1.

Quản lý kỳ lương, tính lương theo công thức A5.3, chốt kỳ và phiếu lương
cá nhân theo FR-07. Toàn bộ số tiền là số nguyên VND.
"""

from flask import Blueprint

bp = Blueprint("payroll", __name__, url_prefix="/api/v1")

from app.blueprints.payroll import routes  # noqa: E402,F401
