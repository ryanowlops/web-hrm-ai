"""Blueprint Skills — tiền tố /api/v1/skills.

Bản đồ năng lực (feature-expansion-v5 mục D): danh mục kỹ năng, ma trận
kỹ năng × phòng ban, hồ sơ năng lực theo nhân viên và gợi ý khoá học
lấp khoảng trống kỹ năng (AI khi có key, dự phòng khớp từ khoá).
"""

from flask import Blueprint

bp = Blueprint("skills", __name__, url_prefix="/api/v1/skills")

from app.blueprints.skills import routes  # noqa: E402,F401
