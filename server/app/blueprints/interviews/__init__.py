"""Blueprint Interviews — tiền tố /api/v1/interviews.

Phỏng vấn thử với AI (feature-expansion-v5 mục B): khách hoặc nhân viên
chọn 1 vị trí đang tuyển, trả lời 5 câu hỏi sinh từ JD (AI khi có key,
ngân hàng câu hỏi mẫu khi không), nhận báo cáo chấm điểm cuối buổi
(AI hoặc heuristic xác định — luôn ghi rõ nguồn trong summary.source).
"""

from flask import Blueprint

bp = Blueprint("interviews", __name__, url_prefix="/api/v1/interviews")

from app.blueprints.interviews import routes  # noqa: E402,F401
