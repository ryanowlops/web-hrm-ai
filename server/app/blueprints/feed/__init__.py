"""Blueprint Bảng tin nội bộ (feed) — tiền tố /api/v1/feed.

Bảng tin kiểu mạng xã hội nội bộ (feature-expansion-v4 mục 1): mọi người
đã đăng nhập đọc/đăng bài, thả tim, bình luận; HR/Admin ghim bài và dọn
dẹp nội dung. Kèm dòng "Hoạt động mới nhất" tổng hợp từ kudos, thông
báo, nhân viên mới, chấm công hôm nay và bài viết mới.
"""

from flask import Blueprint

bp = Blueprint("feed", __name__, url_prefix="/api/v1/feed")

from app.blueprints.feed import routes  # noqa: E402,F401
