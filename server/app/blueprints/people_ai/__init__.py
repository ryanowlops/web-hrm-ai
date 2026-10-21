"""Blueprint People AI — tiền tố /api/v1/people-ai.

Phân tích nhân sự minh bạch theo luật (feature-expansion-v3 mục 5.3):
điểm nguy cơ nghỉ việc được chấm TẠI CHỖ từ dữ liệu chấm công, nghỉ
phép, hiệu suất và thâm niên — không bảng lưu trữ, không hộp đen; mỗi
điểm đều kèm danh sách yếu tố giải thích để HR đối chiếu và chăm sóc
nhân viên kịp thời.
"""
from flask import Blueprint

bp = Blueprint("people_ai", __name__, url_prefix="/api/v1/people-ai")

from app.blueprints.people_ai import routes  # noqa: E402,F401  (import để đăng ký route)
