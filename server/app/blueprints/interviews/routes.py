"""Routes cho Interviews — prefix /api/v1/interviews (v5 mục B).

Xác thực 2 dạng:
- User đã đăng nhập: JWT (require_roles / optional JWT).
- Khách: phiên tạo kèm access_token ngẫu nhiên; các lần gọi sau gửi
  header X-Session-Token. Kiểm tra sở hữu tập trung ở
  services.assert_session_access (401 khi thiếu căn cứ, 403 khi sai).

Lỗi trả envelope chuẩn {"error": {"code", "message", "details"}}.
"""

from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from app.blueprints.auth.guards import load_current_user, require_roles
from app.blueprints.interviews import bp
from app.blueprints.interviews import schemas, services
from app.blueprints.interviews.services import ApiError
from app.extensions import db
from app.models import User


def _error(api_error):
    return jsonify({
        "error": {
            "code": api_error.code,
            "message": api_error.message,
            "details": api_error.details,
        }
    }), api_error.status


def _validation_error(errors):
    return _error(
        ApiError(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", errors)
    )


def _json_body():
    data = request.get_json(silent=True)
    if data is None:
        raise ApiError(400, "VALIDATION_ERROR", "Body phải là JSON hợp lệ.",
                       [{"field": "body", "message": "Body phải là JSON."}])
    return data


def _optional_user():
    """User từ JWT nếu có và hợp lệ; token thiếu/hỏng/hết hạn -> None
    (để luồng khách tiếp tục bằng X-Session-Token)."""
    try:
        verify_jwt_in_request(optional=True)
        identity = get_jwt_identity()
    except Exception:
        return None
    if identity is None:
        return None
    try:
        user_id = int(identity)
    except (TypeError, ValueError):
        return None
    user = db.session.get(User, user_id)
    if user is None or not user.is_active:
        return None
    return user


def _resolve_session(session_id):
    session = services.get_session_or_404(session_id)
    services.assert_session_access(
        session, _optional_user(), request.headers.get("X-Session-Token"))
    return session


# ---------------------------------------------------------------------------
# Vòng đời phiên
# ---------------------------------------------------------------------------

@bp.route("/start", methods=["POST"], strict_slashes=False)
def start_interview():
    try:
        user = _optional_user()
        cleaned, errors = schemas.validate_start_payload(
            _json_body(), is_guest=user is None)
        if errors:
            return _validation_error(errors)
        result = services.start_session(user, cleaned)
        payload = {
            "session_id": result["session_id"],
            "job": result["job"],
            "total_questions": result["total_questions"],
            "first_question": result["first_question"],
        }
        if result["access_token"]:
            payload["access_token"] = result["access_token"]
        return jsonify({"data": payload}), 201
    except ApiError as exc:
        return _error(exc)


@bp.route("/mine", methods=["GET"], strict_slashes=False)
@require_roles()
def my_interviews():
    try:
        user = load_current_user()
        return jsonify({"data": services.list_my_sessions(user)})
    except ApiError as exc:
        return _error(exc)


@bp.route("/<int:session_id>", methods=["GET"], strict_slashes=False)
def get_interview(session_id):
    try:
        session = _resolve_session(session_id)
        data = schemas.session_to_dict(session)
        if session.status == session.STATUS_IN_PROGRESS:
            qas = list(session.qas or [])
            current = (
                qas[session.current_index]
                if session.current_index < len(qas) else None
            )
            data["current_question"] = (
                schemas.question_to_dict(current) if current else None
            )
        return jsonify({"data": data})
    except ApiError as exc:
        return _error(exc)


@bp.route("/<int:session_id>/answer", methods=["POST"], strict_slashes=False)
def answer_interview(session_id):
    try:
        session = _resolve_session(session_id)
        cleaned, errors = schemas.validate_answer_payload(_json_body())
        if errors:
            return _validation_error(errors)
        return jsonify({"data": services.answer_current(session, cleaned["answer"])})
    except ApiError as exc:
        return _error(exc)


@bp.route("/<int:session_id>/finish", methods=["POST"], strict_slashes=False)
def finish_interview(session_id):
    try:
        session = _resolve_session(session_id)
        return jsonify({"data": services.finish_session(session)})
    except ApiError as exc:
        return _error(exc)
