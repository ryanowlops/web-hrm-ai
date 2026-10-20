"""Blueprint Thống kê (stats) — tiền tố /api/v1/stats.

Dashboard tổng quan cho HR/Admin (toàn công ty) và Manager (chỉ phòng
ban mình quản lý) — docs B3.2, FR-11. Nhân viên thường không có quyền
xem thống kê tổng hợp (ma trận phân quyền A2).
"""
from flask import Blueprint

bp = Blueprint("stats", __name__, url_prefix="/api/v1/stats")

from app.blueprints.stats import routes  # noqa: E402,F401  (import để đăng ký route)
