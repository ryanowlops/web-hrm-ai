"""Health check cho nền tảng triển khai / Docker (kiến trúc B9).

    GET /api/v1/health  →  {"status": "ok", "service": "hrm-ai-api", "db": "ok"}

Từ đợt tối ưu tốc độ 2026-10-23: health còn chạm nhẹ vào DB (SELECT 1,
best-effort — lỗi DB vẫn trả 200 để Render không báo động oan) để hook
giữ ấm 10 phút/lần đồng thời giữ Neon Postgres không ngủ (compute của
Neon free tự suspend sau vài phút không có truy vấn; một lượt SELECT 1
mỗi 10 phút rẻ hơn nhiều so với để người dùng đầu tiên sau giờ nghỉ
phải chờ DB thức dậy vài giây).
"""
from flask import Blueprint, jsonify
from sqlalchemy import text

from .extensions import db, limiter

bp = Blueprint("health", __name__, url_prefix="/api/v1")


@bp.get("/health")
@limiter.exempt
def health():
    db_status = "ok"
    try:
        db.session.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 - health không được gục theo DB
        db_status = "down"
    return jsonify({"status": "ok", "service": "hrm-ai-api", "db": db_status})
