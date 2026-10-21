"""Blueprint Gamification — tiền tố /api/v1/gamification.

Game hoá & phúc lợi (feature-expansion-v4 mục 2): điểm thưởng tích luỹ
(đồng bộ lười từ kudo / khoá học hoàn thành / ngày đi làm đúng giờ),
cửa hàng quà đổi bằng điểm (HR duyệt mới trừ điểm), huy hiệu thành tích
tính tại chỗ và bảng xếp hạng toàn công ty.
"""

from flask import Blueprint

bp = Blueprint("gamification", __name__, url_prefix="/api/v1/gamification")

from app.blueprints.gamification import routes  # noqa: E402,F401
