"""Blueprint Lịch nghỉ lễ — tiền tố /api/v1/holidays.

Quản lý ngày lễ (CRUD) theo FR mới: admin/HR thêm/xóa; mọi role xem.
Chưa nối vào tính nghỉ phép / lương — bước nối riêng sau.
"""

from flask import Blueprint

bp = Blueprint("holidays", __name__, url_prefix="/api/v1/holidays")

from app.blueprints.holidays import routes  # noqa: E402,F401
