"""Blueprint Briefing — tiền tố /api/v1/briefing.

Báo cáo điều hành AI theo tuần/tháng (feature-expansion-v6 mục 4):
gói số liệu gom từ services/model của các module sở hữu số liệu, văn xuôi
do AI viết quanh đúng các số đó (hoặc template dự phòng), nhãn nguồn trung
thực. Chỉ admin/hr.
"""

from flask import Blueprint

bp = Blueprint("briefing", __name__, url_prefix="/api/v1/briefing")

from app.blueprints.briefing import routes  # noqa: E402,F401
