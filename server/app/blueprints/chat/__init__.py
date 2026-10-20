"""Blueprint Chatbot HR (chat) — tiền tố /api/v1/chat.

Hỏi đáp quy chế nội bộ theo kỹ thuật RAG trên dữ liệu của blueprint kb
(docs A5.5, A6.2): tìm các chunk tài liệu liên quan nhất (embedding nếu
ai_service hỗ trợ, không thì chấm điểm từ khóa), trả lời kèm trích dẫn
nguồn và TUYỆT ĐỐI không bịa chính sách ngoài tài liệu.
"""
from flask import Blueprint

bp = Blueprint("chat", __name__, url_prefix="/api/v1/chat")

from app.blueprints.chat import routes  # noqa: E402,F401  (import để đăng ký route)
