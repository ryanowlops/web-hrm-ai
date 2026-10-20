"""Blueprint Knowledge Base (kb) — tiền tố /api/v1/kb.

Quản lý tài liệu quy chế nội bộ phục vụ chatbot RAG (docs A5.5, A6.2):
HR/Admin upload tài liệu (PDF/TXT) -> hệ thống trích text, chia chunk
500-1000 ký tự (overlap 100), tạo embedding nếu ai_service hỗ trợ,
lưu vào kb_chunks để blueprint `chat` truy vấn khi trả lời câu hỏi.
"""
from flask import Blueprint

bp = Blueprint("kb", __name__, url_prefix="/api/v1/kb")

from app.blueprints.kb import routes  # noqa: E402,F401  (import để đăng ký route)
