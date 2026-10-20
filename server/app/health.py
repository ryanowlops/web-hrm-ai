"""Health check cho nền tảng triển khai / Docker (kiến trúc B9).

    GET /api/v1/health  →  {"status": "ok", "service": "hrm-ai-api"}
"""
from flask import Blueprint, jsonify

bp = Blueprint("health", __name__, url_prefix="/api/v1")


@bp.get("/health")
def health():
    return jsonify({"status": "ok", "service": "hrm-ai-api"})
