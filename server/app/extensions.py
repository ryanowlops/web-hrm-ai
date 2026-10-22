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


def user_or_ip_key() -> str:
    """Khoá rate-limit cho các limit riêng: ưu tiên danh tính JWT.

    Các endpoint AI dùng chung một quota toàn hệ thống — khoá theo IP khiến
    cả công ty (chung NAT) chia nhau một hạn mức và một tài khoản nội bộ vẫn
    có thể đốt hết quota qua nhiều IP. Khoá theo user id khi đã đăng nhập,
    chưa đăng nhập thì lui về IP.
    """
    try:
        from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

        verify_jwt_in_request(optional=True)
        identity = get_jwt_identity()
        if identity:
            return f"user:{identity}"
    except Exception:
        pass
    return f"ip:{get_remote_address()}"
