"""Routes — blueprint ai (chỉ HR/Admin). Phân lớp theo architecture B3.3:
routes chỉ nhận request -> kiểm tra JWT/role -> validate cơ bản -> gọi service
-> trả JSON theo quy ước. Toàn bộ logic nghiệp vụ nằm ở services.py.

Endpoints (tiền tố /api/v1/ai đăng ký trong __init__.py):
    POST /ai/cv-analyses                    Tạo job phân tích CV, trả 202
    GET  /ai/jobs/<id>                      Trạng thái job phân tích
    GET  /ai/candidates/<id>/analysis       Kết quả phân tích mới nhất của 1 CV

Lỗi luôn theo định dạng chuẩn (architecture B3.4):
    {"error": {"code": ..., "message": ..., "details": []}}
"""

from __future__ import annotations

from flask import current_app, jsonify, request

from app.ai_service.provider import AIResponseError, AIUnavailableError
from app.blueprints.auth.guards import require_roles

from . import bp
from . import services
from .services import ServiceError

ALLOWED_ROLES = ("admin", "hr")


# ---------------------------------------------------------------------------
# Phân quyền: dùng thẳng guard chuẩn của dự án (đọc role từ DB mỗi request +
# chặn tài khoản đã khoá). Trước đây blueprint này có nhánh "fallback" tự
# kiểm tra role trong JWT claims khi không tìm thấy guard dùng chung — và
# nhánh đó đã âm thầm là đường chạy THẬT vì các đường dẫn import thử đều
# không tồn tại (kiểm toán bảo mật 23/10). Fail-closed: import lỗi thì app
# không khởi động, không bao giờ chạy với guard yếu hơn.
# ---------------------------------------------------------------------------

require_ai_roles = require_roles(*ALLOWED_ROLES)


def _error(code: str, message: str, status: int, details=None):
    body = {"error": {"code": code, "message": message, "details": details or []}}
    return jsonify(body), status


def _current_user_id():
    try:
        from flask_jwt_extended import get_jwt_identity

        return get_jwt_identity()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@bp.post("/cv-analyses")
@require_ai_roles
def create_cv_analyses():
    """POST /api/v1/ai/cv-analyses  {candidate_ids: [...], job_id: int}

    Tạo job phân tích chạy nền -> 202 {"data": {job_id, status, total}}.
    AI chưa cấu hình key -> 503 AI_UNAVAILABLE (không tạo job, không bịa kết quả).
    Quá giới hạn CV/lượt -> 400 CV_BATCH_LIMIT_EXCEEDED.
    """
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error("VALIDATION_ERROR",
                      "Body phải là JSON: {candidate_ids, job_id}.", 400)
    try:
        ai_job = services.create_cv_analysis_job(
            job_id=payload.get("job_id"),
            candidate_ids=payload.get("candidate_ids"),
            created_by=_current_user_id(),
        )
    except AIUnavailableError as exc:
        return _error("AI_UNAVAILABLE", str(exc), 503)
    except ServiceError as exc:
        return _error(exc.code, exc.message, exc.status)

    services.start_cv_analysis_job(ai_job.id)
    data = services.serialize_job(ai_job)
    return jsonify({"data": data}), 202


@bp.get("/jobs/<int:job_pk>")
@require_ai_roles
def get_ai_job_status(job_pk: int):
    """GET /api/v1/ai/jobs/<id> — trạng thái pending/processing/done/failed."""
    try:
        ai_job = services.get_ai_job(job_pk)
    except ServiceError as exc:
        return _error(exc.code, exc.message, exc.status)
    return jsonify({"data": services.serialize_job(ai_job)}), 200


@bp.get("/candidates/<int:candidate_id>/analysis")
@require_ai_roles
def get_candidate_analysis(candidate_id: int):
    """GET /api/v1/ai/candidates/<id>/analysis — bản phân tích MỚI NHẤT."""
    try:
        analysis = services.get_latest_analysis(candidate_id)
    except ServiceError as exc:
        return _error(exc.code, exc.message, exc.status)
    return jsonify({"data": services.serialize_analysis(analysis)}), 200


# ---------------------------------------------------------------------------
# Bắt lỗi AI dùng chung cho cả blueprint (phòng khi lọt khỏi service)
# ---------------------------------------------------------------------------

@bp.errorhandler(AIUnavailableError)
def _handle_ai_unavailable(exc):
    return _error("AI_UNAVAILABLE", str(exc), 503)


@bp.errorhandler(AIResponseError)
def _handle_ai_response_error(exc):
    # Chi tiết lỗi thô của provider (hạ tầng/quota/model) chỉ vào log server;
    # client nhận thông điệp chung (kiểm toán bảo mật 23/10).
    current_app.logger.warning("AI provider response error: %s", exc)
    return _error(
        "AI_RESPONSE_ERROR",
        "AI tạm thời không phản hồi đúng định dạng, vui lòng thử lại sau.",
        502,
    )
