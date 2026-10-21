"""AI provider layer — điểm tích hợp AI DUY NHẤT của backend (architecture A6.3).

Toàn bộ lời gọi LLM đi qua module này. Cấu hình bằng biến môi trường
(khớp bảng biến môi trường ở architecture B7):

    AI_PROVIDER   Tên provider. Mặc định "openai". Mọi provider tương thích
                  giao thức OpenAI Chat Completions đều dùng được bằng cách
                  đặt thêm AI_BASE_URL (ví dụ DeepSeek, Qwen, vLLM local...).
    AI_API_KEY    Khóa API. CHỈ ở server, không commit, không log.
    AI_MODEL      Tên model chat. Mặc định "gpt-4o-mini".
    AI_EMBEDDING_MODEL  Tên model embedding cho RAG (KB/chatbot). Mặc định
                  "text-embedding-3-small". Provider phải hỗ trợ endpoint
                  Embeddings tương thích OpenAI (POST {base}/embeddings).
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
        "embedding_model": (_config_value("AI_EMBEDDING_MODEL", "text-embedding-3-small")
                            or "text-embedding-3-small"),
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

    @abstractmethod
    def create_embeddings(self, inputs) -> list[list[float]]:
        """Tạo vector embedding cho 1 chuỗi hoặc 1 danh sách chuỗi (batch).

        Trả về danh sách vector theo ĐÚNG thứ tự đầu vào (kể cả khi đầu vào
        là 1 chuỗi duy nhất — luôn trả list có ít nhất 1 phần tử).
        """
        raise NotImplementedError


class UnavailableProvider(AIProvider):
    """Provider dự phòng khi chưa có API key: mọi lời gọi đều raise rõ ràng."""

    name = "unavailable"

    def __init__(self, model: str = "", embedding_model: str = ""):
        self.model = model
        self.embedding_model = embedding_model

    @property
    def is_available(self) -> bool:
        return False

    def chat_completion(self, system_prompt: str, user_prompt: str) -> str:
        self.ensure_available()
        raise AIUnavailableError("AI chưa được cấu hình.")  # không bao giờ tới đây

    def create_embeddings(self, inputs) -> list[list[float]]:
        self.ensure_available()
        raise AIUnavailableError("AI chưa được cấu hình.")  # không bao giờ tới đây


class OpenAICompatibleProvider(AIProvider):
    """Gọi Chat Completions API (chuẩn OpenAI) bằng HTTP JSON thuần."""

    DEFAULT_BASE_URL = "https://api.openai.com/v1"

    def __init__(self, api_key: str, model: str, base_url: str | None = None,
                 timeout: int = 60, provider_name: str = "openai",
                 embedding_model: str = "text-embedding-3-small"):
        self.name = provider_name
        self.model = model
        self.embedding_model = embedding_model
        self._api_key = api_key
        self.base_url = (base_url or self.DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout

    @property
    def is_available(self) -> bool:
        return bool(self._api_key)

    def _post_json(self, path: str, payload: dict) -> dict:
        """POST JSON tới provider, trả body đã parse — dùng chung cơ chế
        HTTP + xử lý lỗi cho cả chat completions và embeddings."""
        request = urllib.request.Request(
            url=f"{self.base_url}{path}",
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
                return json.loads(response.read().decode("utf-8"))
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
        body = self._post_json("/chat/completions", payload)

        try:
            content = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise AIResponseError("AI provider trả về định dạng phản hồi không hợp lệ.") from exc
        if not isinstance(content, str) or not content.strip():
            raise AIResponseError("AI provider trả về nội dung rỗng.")
        return content

    def create_embeddings(self, inputs) -> list[list[float]]:
        """Tạo embedding qua POST {base}/embeddings (chuẩn OpenAI).

        `inputs`: 1 chuỗi hoặc list chuỗi (batch) — provider tương thích
        OpenAI xử lý cả hai dạng trong cùng 1 request. Trả list vector
        theo đúng thứ tự đầu vào.
        """
        self.ensure_available()
        if isinstance(inputs, str):
            items = [inputs]
        else:
            items = [str(x) for x in inputs]
        if not items:
            return []
        body = self._post_json("/embeddings", {
            "model": self.embedding_model,
            "input": items if len(items) > 1 else items[0],
        })
        try:
            rows = body["data"]
            # Một số provider trả kèm "index" — sắp lại theo index nếu có
            # để bảo đảm thứ tự khớp đầu vào.
            if rows and isinstance(rows[0], dict) and "index" in rows[0]:
                rows = sorted(rows, key=lambda r: r.get("index", 0))
            vectors = [[float(x) for x in row["embedding"]] for row in rows]
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise AIResponseError("AI provider trả về định dạng embedding không hợp lệ.") from exc
        if len(vectors) != len(items) or any(not v for v in vectors):
            raise AIResponseError("AI provider trả về số lượng embedding không khớp đầu vào.")
        return vectors


def get_provider() -> AIProvider:
    """Factory: tạo provider theo cấu hình hiện tại.

    Chưa có AI_API_KEY -> UnavailableProvider (raise lỗi rõ ràng khi dùng),
    KHÔNG trả kết quả giả trong bất kỳ trường hợp nào.
    """
    cfg = get_ai_config()
    api_key = os.environ.get("AI_API_KEY") or _config_value("AI_API_KEY")
    if not api_key:
        return UnavailableProvider(model=cfg["model"],
                                   embedding_model=cfg["embedding_model"])
    return OpenAICompatibleProvider(
        api_key=api_key,
        model=cfg["model"],
        base_url=cfg["base_url"],
        timeout=cfg["timeout"],
        provider_name=cfg["provider"],
        embedding_model=cfg["embedding_model"],
    )
