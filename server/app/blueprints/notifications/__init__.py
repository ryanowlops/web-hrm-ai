"""Blueprint Thông báo (notifications) — tiền tố /api/v1/notifications.

Thông báo trong hệ thống cho từng người dùng (docs FR-12): đơn nghỉ
được duyệt/từ chối, hợp đồng sắp hết hạn, bảng lương đã chốt... Mỗi
người chỉ xem/đánh dấu đã đọc thông báo của chính mình.
"""
from flask import Blueprint

bp = Blueprint("notifications", __name__, url_prefix="/api/v1/notifications")

from app.blueprints.notifications import routes  # noqa: E402,F401  (import để đăng ký route)
