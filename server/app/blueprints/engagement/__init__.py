"""Blueprint Engagement — tiền tố /api/v1/engagement.

Gắn kết nhân viên (feature-expansion-v3 mục 4): kudos (tường vinh danh +
bảng xếp hạng), cột mốc (sinh nhật + kỷ niệm ngày vào làm), khảo sát xung
+ eNPS với đáp án ẩn danh thật (responses không lưu user_id).
"""

from flask import Blueprint

bp = Blueprint("engagement", __name__, url_prefix="/api/v1/engagement")

from app.blueprints.engagement import routes  # noqa: E402,F401
