"""ai_service — điểm tích hợp AI duy nhất của backend (architecture A6.3).

Mọi lời gọi LLM/embedding đều đi qua package này. Tầng nghiệp vụ chỉ dùng:
    - get_provider()          factory tạo provider theo biến môi trường
    - analyze_cv(cv, jd)      phân tích 1 CV theo JD, trả dict đúng schema A6.1
    - embed_text(text)        tạo vector embedding cho 1 đoạn text (RAG)
    - embed_texts(texts)      tạo vector embedding theo batch (RAG)
    - AIUnavailableError      AI chưa cấu hình (HTTP 503) — KHÔNG có kết quả giả
"""

from .cv_analysis import AIValidationError, analyze_cv
from .provider import (
    AIError,
    AIProvider,
    AIResponseError,
    AIUnavailableError,
    get_ai_config,
    get_provider,
)

__all__ = [
    "AIError",
    "AIProvider",
    "AIResponseError",
    "AIUnavailableError",
    "AIValidationError",
    "analyze_cv",
    "embed_text",
    "embed_texts",
    "get_ai_config",
    "get_provider",
]


def embed_texts(texts) -> list[list[float]]:
    """Tạo embedding cho nhiều đoạn text trong 1 lần gọi provider (batch).

    Trả list vector theo đúng thứ tự đầu vào. Chưa cấu hình AI_API_KEY ->
    raise AIUnavailableError để tầng gọi (KB/chatbot) tự hạ cấp sang chế độ
    từ khóa, đúng thiết kế "không có embedding vẫn nạp/hỏi đáp được".
    """
    provider = get_provider()
    provider.ensure_available()
    return provider.create_embeddings(list(texts))


def embed_text(text: str) -> list[float]:
    """Tạo embedding cho 1 đoạn text; raise AIUnavailableError nếu chưa có key.

    Đây là hàm mà tầng KB (blueprints/kb/services.py) tự dò tìm trong
    ai_service để bật chế độ truy hồi theo vector cho chatbot RAG.
    """
    vectors = embed_texts([text])
    if not vectors:
        raise AIResponseError("AI provider không trả về embedding nào.")
    return vectors[0]
