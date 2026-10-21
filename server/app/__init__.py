"""Application Factory của HRM API (kiến trúc B3.1).

    from app import create_app
    app = create_app()                 # đọc APP_ENV/FLASK_ENV, mặc định development
    app = create_app("testing")        # dùng trong test
    app = create_app(config_object)    # hoặc truyền thẳng lớp/đối tượng config

Quy ước blueprint: mỗi module nghiệp vụ có `routes.py` expose biến `bp`
(blueprint tự mang url_prefix của nó dưới /api/v1). Factory đăng ký lần
lượt các module ĐÃ tồn tại; module chưa được tạo sẽ bị bỏ qua, không crash.
"""
from __future__ import annotations

import importlib
import os

from flask import Flask, jsonify
from flask_cors import CORS

from .config import Config, config_by_name
from .errors import register_error_handlers, register_jwt_error_handlers
from .extensions import db, jwt, limiter, migrate

# Thứ tự đăng ký các blueprint nghiệp vụ (B3.2). "chat" nằm trong module kb
# theo tài liệu nhưng được tách riêng nếu nhóm tạo app/chat/routes.py.
_MODULE_BLUEPRINTS = [
    "auth",
    "users",
    "departments",
    "employees",
    "attendance",
    "leave",
    "payroll",
    "recruitment",
    "performance",
    "onboarding",
    "assets",
    "training",
    "announcements",
    "shifts",
    "documents",
    "offboarding",
    "engagement",
    "people_ai",
    "ai",
    "kb",
    "chat",
    "stats",
    "notifications",
    "admin",
]

# Các vị trí có thể chứa routes.py của một module.
_MODULE_PATH_TEMPLATES = (".{name}.routes", ".blueprints.{name}.routes")


def _resolve_config(config):
    """Chấp nhận: None | tên môi trường (str) | lớp config | đối tượng config."""
    if config is None:
        env_name = os.environ.get("APP_ENV") or os.environ.get("FLASK_ENV") or "development"
        return config_by_name.get(env_name.lower(), Config)
    if isinstance(config, str):
        return config_by_name.get(config.lower(), Config)
    return config


def _load_models() -> None:
    """Import app.models (nếu worker models đã tạo) để SQLAlchemy/Migrate
    nhìn thấy toàn bộ bảng. Chưa có file thì bỏ qua."""
    try:
        from . import models  # noqa: F401
    except ModuleNotFoundError:
        pass
    except Exception:  # models lỗi import khác — chỉ cảnh báo, app vẫn chạy
        import logging
        logging.getLogger(__name__).warning(
            "app.models tồn tại nhưng import lỗi", exc_info=True)


def _register_module_blueprints(app: Flask) -> list[str]:
    """Đăng ký blueprint của các module đã tồn tại. Trả về tên đã đăng ký."""
    registered: list[str] = []
    for name in _MODULE_BLUEPRINTS:
        for template in _MODULE_PATH_TEMPLATES:
            module_path = template.format(name=name)
            try:
                module = importlib.import_module(module_path, __package__)
            except ModuleNotFoundError as exc:
                # Thiếu chính module đích (hoặc package cha) → module chưa
                # được tạo ở vị trí này; thử vị trí tiếp theo.
                missing = (exc.name or "")
                if missing in (module_path, module_path.rsplit(".", 1)[0],
                               f"app.{name}", "app.blueprints"):
                    continue
                app.logger.warning(
                    "Bỏ qua blueprint %s: lỗi import phụ thuộc (%s)", name, exc)
                break
            except Exception:
                app.logger.warning(
                    "Bỏ qua blueprint %s: import routes lỗi", name, exc_info=True)
                break

            bp = getattr(module, "bp", None)
            if bp is None:
                app.logger.warning(
                    "Module %s có routes.py nhưng không expose biến 'bp'", module_path)
                break
            try:
                app.register_blueprint(bp)
                registered.append(name)
            except Exception:
                app.logger.warning(
                    "Đăng ký blueprint %s thất bại", name, exc_info=True)
            break
    return registered


def create_app(config=None) -> Flask:
    # Nạp .env nếu có python-dotenv (Flask CLI cũng tự nạp; nạp tại đây để
    # `python run.py` và gunicorn dùng cùng một cấu hình).
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    app = Flask(__name__)
    app.config.from_object(_resolve_config(config))

    # UPLOAD_FOLDER tương đối → quy về thư mục server/ (cha của package app).
    upload_folder = app.config.get("UPLOAD_FOLDER", "uploads")
    if not os.path.isabs(upload_folder):
        upload_folder = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            upload_folder)
        app.config["UPLOAD_FOLDER"] = upload_folder
    try:
        os.makedirs(upload_folder, exist_ok=True)
    except OSError:
        app.logger.warning("Không tạo được thư mục upload: %s", upload_folder)

    # --- Extensions ---
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    limiter.init_app(app)

    # CORS: chỉ cho phép các origin frontend trong config (B8).
    CORS(app, resources={r"/api/*": {"origins": app.config.get("CORS_ORIGINS", [])}})

    # --- Lỗi chuẩn hoá (B3.4) + callback JWT ---
    register_error_handlers(app)
    register_jwt_error_handlers(jwt)

    # --- JWT blocklist cho logout (module auth cung cấp) ---
    try:
        from .blueprints.auth.services import register_jwt_blocklist
        register_jwt_blocklist(jwt)
    except Exception:  # noqa: BLE001 - module auth chưa sẵn sàng thì bỏ qua
        app.logger.warning("Chưa đăng ký được JWT blocklist", exc_info=True)

    # --- Security headers (module security độc lập của Worker 20) ---
    try:
        from .security import add_security_headers
        add_security_headers(app)
    except Exception:  # noqa: BLE001
        app.logger.warning("Chưa gắn được security headers", exc_info=True)

    # --- Models (cho Migrate/SQLAlchemy nhận diện) ---
    _load_models()

    # --- Health check ---
    from .health import bp as health_bp
    app.register_blueprint(health_bp)

    # --- Blueprint nghiệp vụ (đăng ký module nào đã tồn tại) ---
    registered = _register_module_blueprints(app)
    app.logger.info("Blueprints đã đăng ký: health, %s",
                    ", ".join(registered) if registered else "(chưa có module)")

    @app.get("/")
    def index():
        return jsonify({
            "service": "hrm-ai-api",
            "health": "/api/v1/health",
            "api_prefix": "/api/v1",
        })

    @app.shell_context_processor
    def _shell_context():
        return {"db": db, "app": app}

    # Deploy production (Koyeb + Neon): khi AUTO_CREATE_TABLES=1 thì tạo
    # toàn bộ bảng nếu DB còn trống, để service lên là chạy ngay không cần
    # chạy migration tay. Tắt mặc định ở mọi môi trường khác.
    if app.config.get("AUTO_CREATE_TABLES"):
        with app.app_context():
            db.create_all()

    return app
