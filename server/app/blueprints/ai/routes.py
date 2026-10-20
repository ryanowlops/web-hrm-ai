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

from functools import wraps

from flask import jsonify, request

from app.ai_service.provider import AIResponseError, AIUnavailableError

from . import bp
from . import services
from .services import ServiceError

ALLOWED_ROLES = ("admin", "hr")


# ---------------------------------------------------------------------------
# Phân quyền: ưu tiên require_roles dùng chung của dự án; nếu module dùng
# chung chưa sẵn sàng thì fallback kiểm tra role trong JWT claims tại đây.
# Dù ở nhánh nào, server luôn là nơi quyết định quyền (architecture B1/B8).
# ---------------------------------------------------------------------------

def _load_shared_require_roles():
    for module_path in (
        "app.utils.decorators",
        "app.common.decorators",
        "app.security.decorators",
        "app.auth.decorators",
        "app.decorators",
    ):
        try:
            module = __import__(module_path, fromlist=["require_roles"])
            candidate = getattr(module, "require_roles", None)
            if callable(candidate):
                return candidate
        except ImportError:
            continue
    return None


_shared_require_roles = _load_shared_require_roles()


def _error(code: str, message: str, status: int, details=None):
    body = {"error": {"code": code, "message": message, "details": details or []}}
    return jsonify(body), status


def _fallback_require_roles(*roles):
    """Kiểm tra JWT + role claim khi chưa có decorator dùng chung."""
    allowed = {r.lower() for r in roles}

    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            try:
                from flask_jwt_extended import get_jwt, verify_jwt_in_request

                verify_jwt_in_request()
                claims = get_jwt() or {}
            except ImportError:
                return _error("UNAUTHORIZED",
                              "Máy chủ chưa cấu hình xác thực JWT.", 401)
            except Exception:
                return _error("UNAUTHORIZED",
                              "Thiếu hoặc token không hợp lệ/hết hạn.", 401)
            role = str(claims.get("role") or claims.get("user_role") or "").lower()
            if role not in allowed:
                return _error("FORBIDDEN",
                              "Bạn không có quyền sử dụng chức năng AI sàng lọc CV.", 403)
            return view(*args, **kwargs)

        return wrapper

    return decorator


require_ai_roles = (
    _shared_require_roles(*ALLOWED_ROLES)
    if _shared_require_roles is not None
    else _fallback_require_roles(*ALLOWED_ROLES)
)


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
    return _error("AI_RESPONSE_ERROR", str(exc), 502)
