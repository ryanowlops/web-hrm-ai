"""AI provider layer — điểm tích hợp AI DUY NHẤT của backend (architecture A6.3).

Toàn bộ lời gọi LLM đi qua module này. Cấu hình bằng biến môi trường
(khớp bảng biến môi trường ở architecture B7):

    AI_PROVIDER   Tên provider. Mặc định "openai". Mọi provider tương thích
                  giao thức OpenAI Chat Completions đều dùng được bằng cách
                  đặt thêm AI_BASE_URL (ví dụ DeepSeek, Qwen, vLLM local...).
    AI_API_KEY    Khóa API. CHỈ ở server, không commit, không log.
    AI_MODEL      Tên model chat. Mặc định "gpt-4o-mini".
    AI_BASE_URL   Base URL tùy chọn cho endpoint OpenAI-compatible.
    AI_TIMEOUT    Timeout mỗi lần gọi (giây), mặc định 60.

Nguyên tắc bắt buộc (architecture A6.1/A6.4):
- Nếu chưa cấu hình AI_API_KEY, provider ở chế độ "unavailable": mọi lời gọi
  đều raise AIUnavailableError với thông báo rõ ràng. Hệ thống KHÔNG bịa kết
  quả phân tích giả — thà báo lỗi còn hơn ghi dữ liệu rác vào hồ sơ ứng viên.
- Module này chỉ gọi HTTP JSON thuần bằng thư viện chuẩn (urllib), không phụ
  thuộc SDK của bất kỳ nhà cung cấp nào -> đổi provider chỉ sửa cấu hình.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from abc import ABC, abstractmethod

__all__ = [
    "AIError",
    "AIUnavailableError",
    "AIResponseError",
    "AIProvider",
    "OpenAICompatibleProvider",
    "UnavailableProvider",
    "get_provider",
    "get_ai_config",
]


class AIError(Exception):
    """Lỗi AI nền — routes map sang mã lỗi chuẩn của API."""


class AIUnavailableError(AIError):
    """AI chưa được cấu hình hoặc không khả dụng -> HTTP 503."""


class AIResponseError(AIError):
    """Provider trả về lỗi / định dạng không đọc được -> HTTP 502/422."""


def _config_value(key: str, default=None):
    """Đọc cấu hình: ưu tiên biến môi trường, sau đó Flask app config (nếu có)."""
    value = os.environ.get(key)
    if value not in (None, ""):
        return value
    try:
        from flask import current_app

        if current_app:
            return current_app.config.get(key, default)
    except (ImportError, RuntimeError):
        pass
    return default


def get_ai_config() -> dict:
    """Trả về cấu hình AI hiện tại (KHÔNG bao giờ gồm giá trị API key đầy đủ)."""
    return {
        "provider": (_config_value("AI_PROVIDER", "openai") or "openai").lower(),
        "model": _config_value("AI_MODEL", "gpt-4o-mini") or "gpt-4o-mini",
        "base_url": _config_value("AI_BASE_URL") or None,
        "timeout": int(_config_value("AI_TIMEOUT", 60) or 60),
        "has_api_key": bool(os.environ.get("AI_API_KEY") or _config_value("AI_API_KEY")),
    }


class AIProvider(ABC):
    """Interface chuẩn cho mọi nhà cung cấp AI.

    Tầng nghiệp vụ (cv_analysis, chatbot...) chỉ biết interface này.
    """

    name: str = "base"
    model: str = ""

    @property
    @abstractmethod
    def is_available(self) -> bool:
        """True nếu provider sẵn sàng nhận request (đã có API key...)."""

    def ensure_available(self) -> None:
        """Raise AIUnavailableError nếu provider chưa sẵn sàng."""
        if not self.is_available:
            raise AIUnavailableError(
                "AI chưa được cấu hình: thiếu biến môi trường AI_API_KEY ở server. "
                "Tính năng AI tạm thời không khả dụng, các chức năng HRM lõi vẫn hoạt động bình thường."
            )

    @abstractmethod
    def chat_completion(self, system_prompt: str, user_prompt: str) -> str:
        """Gửi 1 lượt chat, trả về nội dung text của câu trả lời."""
        raise NotImplementedError


class UnavailableProvider(AIProvider):
    """Provider dự phòng khi chưa có API key: mọi lời gọi đều raise rõ ràng."""

    name = "unavailable"

    def __init__(self, model: str = ""):
        self.model = model

    @property
    def is_available(self) -> bool:
        return False

    def chat_completion(self, system_prompt: str, user_prompt: str) -> str:
        self.ensure_available()
        raise AIUnavailableError("AI chưa được cấu hình.")  # không bao giờ tới đây


class OpenAICompatibleProvider(AIProvider):
    """Gọi Chat Completions API (chuẩn OpenAI) bằng HTTP JSON thuần."""

    DEFAULT_BASE_URL = "https://api.openai.com/v1"

    def __init__(self, api_key: str, model: str, base_url: str | None = None,
                 timeout: int = 60, provider_name: str = "openai"):
        self.name = provider_name
        self.model = model
        self._api_key = api_key
        self.base_url = (base_url or self.DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout

    @property
    def is_available(self) -> bool:
        return bool(self._api_key)

    def chat_completion(self, system_prompt: str, user_prompt: str) -> str:
        self.ensure_available()
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
            # Ép định dạng JSON ở mức API khi provider hỗ trợ; cv_analysis vẫn
            # validate lại toàn bộ ở phía server, không tin tưởng tuyệt đối.
            "response_format": {"type": "json_object"},
        }
        request = urllib.request.Request(
            url=f"{self.base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                # API key chỉ nằm trong header của request ra provider —
                # không log, không đưa xuống frontend (architecture B8).
                "Authorization": f"Bearer {self._api_key}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                body = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            # Không đưa nội dung lỗi thô (có thể chứa dữ liệu nhạy cảm) ra ngoài.
            raise AIResponseError(
                f"AI provider trả lỗi HTTP {exc.code}. Vui lòng thử lại sau."
            ) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise AIUnavailableError(
                "Không kết nối được tới AI provider. Vui lòng kiểm tra mạng/cấu hình server."
            ) from exc
        except (ValueError, UnicodeDecodeError) as exc:
            raise AIResponseError("AI provider trả về dữ liệu không đọc được.") from exc

        try:
            content = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise AIResponseError("AI provider trả về định dạng phản hồi không hợp lệ.") from exc
        if not isinstance(content, str) or not content.strip():
            raise AIResponseError("AI provider trả về nội dung rỗng.")
        return content


def get_provider() -> AIProvider:
    """Factory: tạo provider theo cấu hình hiện tại.

    Chưa có AI_API_KEY -> UnavailableProvider (raise lỗi rõ ràng khi dùng),
    KHÔNG trả kết quả giả trong bất kỳ trường hợp nào.
    """
    cfg = get_ai_config()
    api_key = os.environ.get("AI_API_KEY") or _config_value("AI_API_KEY")
    if not api_key:
        return UnavailableProvider(model=cfg["model"])
    return OpenAICompatibleProvider(
        api_key=api_key,
        model=cfg["model"],
        base_url=cfg["base_url"],
        timeout=cfg["timeout"],
        provider_name=cfg["provider"],
    )
