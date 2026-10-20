"""Blueprint Employees & Contracts — tiền tố /api/v1/employees.

Hồ sơ nhân viên (FR-03) và hợp đồng lao động (FR-04), gồm import JSON
hàng loạt và cảnh báo hợp đồng sắp hết hạn qua query ?expiring=<số ngày>.
"""

from flask import Blueprint

bp = Blueprint("employees", __name__, url_prefix="/api/v1/employees")

from app.blueprints.employees import routes  # noqa: E402,F401
