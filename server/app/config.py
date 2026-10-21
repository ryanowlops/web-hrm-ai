"""Cấu hình ứng dụng — chỉ đọc từ biến môi trường (kiến trúc B3.1).

- File `.env` KHÔNG được commit; chỉ commit `.env.example`.
- Giá trị mặc định trong file này chỉ dành cho môi trường dev local:
  production BẮT BUỘC đặt JWT_SECRET_KEY và DATABASE_URL qua env.
"""
from __future__ import annotations

import os
from datetime import timedelta


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _cors_origins() -> list[str]:
    raw = os.environ.get("CORS_ORIGINS", "http://localhost:5173")
    return [o.strip() for o in raw.split(",") if o.strip()]


class Config:
    """Cấu hình nền cho mọi môi trường."""

    # --- Chung ---
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-me")
    DEBUG = False
    TESTING = False

    # --- Database ---
    # Mặc định SQLite cho dev local; production dùng PostgreSQL qua DATABASE_URL,
    # ví dụ: postgresql+psycopg2://user:pass@db:5432/hrm
    # Neon/Heroku cấp URL dạng postgres:// hoặc postgresql:// — chuẩn hoá
    # tại đây và GHIM driver psycopg2: SQLAlchemy 2.x mặc định chọn psycopg
    # (v3) cho scheme postgresql://, mà image chỉ cài psycopg2-binary nên
    # sẽ văng ModuleNotFoundError khi tạo engine (đã gặp trên Render).
    _db_url = os.environ.get("DATABASE_URL", "sqlite:///hrm.db")
    if _db_url.startswith("postgres://"):
        _db_url = "postgresql+psycopg2://" + _db_url[len("postgres://"):]
    elif _db_url.startswith("postgresql://"):
        _db_url = "postgresql+psycopg2://" + _db_url[len("postgresql://"):]
    SQLALCHEMY_DATABASE_URI = _db_url
    # Bật khi deploy (Koyeb): tự tạo bảng khi khởi động nếu DB còn trống.
    AUTO_CREATE_TABLES = os.environ.get("AUTO_CREATE_TABLES", "0") == "1"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    # --- JWT (Flask-JWT-Extended, ADR-7) ---
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev-jwt-secret-change-me-in-production-0123456789")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=30)   # access ngắn hạn 15–60 phút
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=7)      # refresh 7 ngày
    JWT_TOKEN_LOCATION = ["headers"]                   # Authorization: Bearer <token>
    JWT_HEADER_NAME = "Authorization"
    JWT_HEADER_TYPE = "Bearer"

    # --- Upload (CV, tài liệu quy chế) ---
    # Đường dẫn tương đối được quy về thư mục server/ trong create_app().
    UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER", "uploads")
    MAX_CV_SIZE_MB = int(os.environ.get("MAX_CV_SIZE_MB", "5"))
    MAX_KB_SIZE_MB = int(os.environ.get("MAX_KB_SIZE_MB", "10"))
    # Flask chặn 413 sớm theo giới hạn lớn nhất (KB 10MB); từng service tự
    # kiểm tra giới hạn riêng của mình (CV 5MB, KB 10MB).
    MAX_CONTENT_LENGTH = max(MAX_CV_SIZE_MB, MAX_KB_SIZE_MB) * 1024 * 1024
    ALLOWED_CV_EXTENSIONS = {"pdf"}

    # --- CORS (chỉ cho phép domain frontend, B8) ---
    CORS_ORIGINS = _cors_origins()

    # --- Rate limit (Flask-Limiter) ---
    RATELIMIT_DEFAULT = os.environ.get("RATELIMIT_DEFAULT", "600 per hour")
    RATELIMIT_STORAGE_URI = os.environ.get("RATELIMIT_STORAGE_URI", "memory://")

    # --- AI (A6.3: không khóa nhà cung cấp, cấu hình hoàn toàn qua env) ---
    AI_PROVIDER = os.environ.get("AI_PROVIDER", "")          # ví dụ: openai-compatible
    AI_MODEL = os.environ.get("AI_MODEL", "")
    AI_API_KEY = os.environ.get("AI_API_KEY", "")            # CHỈ ở server, không commit
    # Model embedding cho RAG (KB/chatbot) — provider đọc qua ai_service.
    AI_EMBEDDING_MODEL = os.environ.get("AI_EMBEDDING_MODEL", "text-embedding-3-small")
    EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "")
    AI_MAX_CANDIDATES_PER_RUN = int(os.environ.get("AI_MAX_CANDIDATES_PER_RUN", "20"))
    AI_REQUEST_TIMEOUT = int(os.environ.get("AI_REQUEST_TIMEOUT", "60"))

    # --- Nghiệp vụ mặc định (có thể ghi đè bằng bảng settings) ---
    WORK_START_TIME = os.environ.get("WORK_START_TIME", "08:30")
    DEFAULT_ANNUAL_LEAVE_DAYS = int(os.environ.get("DEFAULT_ANNUAL_LEAVE_DAYS", "12"))


class DevelopmentConfig(Config):
    DEBUG = True


class TestingConfig(Config):
    TESTING = True
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "TEST_DATABASE_URL", "sqlite:///:memory:")
    JWT_SECRET_KEY = "testing-jwt-secret"
    RATELIMIT_ENABLED = False


class ProductionConfig(Config):
    DEBUG = False


config_by_name = {
    "development": DevelopmentConfig,
    "dev": DevelopmentConfig,
    "testing": TestingConfig,
    "test": TestingConfig,
    "production": ProductionConfig,
    "prod": ProductionConfig,
}
