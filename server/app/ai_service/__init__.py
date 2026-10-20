"""ai_service — điểm tích hợp AI duy nhất của backend (architecture A6.3).

Mọi lời gọi LLM/embedding đều đi qua package này. Tầng nghiệp vụ chỉ dùng:
    - get_provider()          factory tạo provider theo biến môi trường
    - analyze_cv(cv, jd)      phân tích 1 CV theo JD, trả dict đúng schema A6.1
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
    "get_ai_config",
    "get_provider",
]
