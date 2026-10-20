"""Khởi tạo tập trung các Flask extensions (kiến trúc B3.1).

Các extension được tạo ở đây (chưa gắn app) và gọi `init_app` trong
`create_app()` — tránh import vòng giữa app factory và các module.
"""
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
# Giới hạn mặc định lấy từ config RATELIMIT_DEFAULT khi init_app;
# các endpoint nhạy cảm (login, apply CV, gọi AI) gắn @limiter.limit riêng.
limiter = Limiter(key_func=get_remote_address)
