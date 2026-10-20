"""Blueprint Departments & Positions — tiền tố /api/v1.

Quản lý phòng ban (departments) và chức vụ (positions) theo FR-02.
"""

from flask import Blueprint

bp = Blueprint("departments", __name__, url_prefix="/api/v1")

from app.blueprints.departments import routes  # noqa: E402,F401
