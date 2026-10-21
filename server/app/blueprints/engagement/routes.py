"""Routes cho Engagement — prefix /api/v1/engagement.

Phân quyền (hợp đồng feature-expansion-v3 mục 4):
- Kudos + cột mốc: mọi vai trò đã đăng nhập (cấm tự tặng kudos — check ở service).
- Tạo/đóng khảo sát + xem kết quả: admin, hr (kết quả hr/admin only để bảo
  vệ ẩn danh ở nhóm nhỏ; manager chỉ trả lời như nhân viên).
- Trả lời khảo sát: mọi vai trò, mỗi user 1 lần (lần 2 -> 409).
Mọi lỗi trả định dạng chuẩn {"error": {"code", "message", "details"}}.
"""

from flask import jsonify, request

from app.blueprints.auth.guards import require_roles
from app.blueprints.engagement import bp
from app.blueprints.engagement import schemas, services
from app.blueprints.engagement.services import ApiError

ALL_ROLES = ("admin", "hr", "manager", "employee")
HR_ROLES = ("admin", "hr")


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


# ---------------------------------------------------------------------------
# Kudos
# ---------------------------------------------------------------------------

@bp.route("/kudos", methods=["POST"], strict_slashes=False)
@require_roles(*ALL_ROLES)
def create_kudo():
    try:
        cleaned, errors = schemas.validate_kudo_payload(_json_body())
        if errors:
            return _validation_error(errors)
        user = services.current_user()
        kudo = services.create_kudo(user, cleaned)
        return jsonify({"data": schemas.kudo_to_dict(kudo)}), 201
    except ApiError as exc:
        return _error(exc)


@bp.route("/kudos", methods=["GET"], strict_slashes=False)
@require_roles(*ALL_ROLES)
def list_kudos():
    try:
        items, meta = services.list_kudos(request.args)
        return jsonify({
            "data": [schemas.kudo_to_dict(k) for k in items],
            "meta": meta,
        }), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/kudos/leaderboard", methods=["GET"], strict_slashes=False)
@require_roles(*ALL_ROLES)
def kudos_leaderboard():
    try:
        data = services.kudos_leaderboard(request.args.get("month"))
        return jsonify({"data": data}), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/kudos/mine", methods=["GET"], strict_slashes=False)
@require_roles(*ALL_ROLES)
def my_kudos():
    try:
        user = services.current_user()
        return jsonify({"data": services.my_kudos(user)}), 200
    except ApiError as exc:
        return _error(exc)


# ---------------------------------------------------------------------------
# Cột mốc
# ---------------------------------------------------------------------------

@bp.route("/milestones", methods=["GET"], strict_slashes=False)
@require_roles(*ALL_ROLES)
def milestones():
    try:
        data = services.milestones(request.args.get("month"))
        return jsonify({"data": data}), 200
    except ApiError as exc:
        return _error(exc)


# ---------------------------------------------------------------------------
# Khảo sát
# ---------------------------------------------------------------------------

@bp.route("/surveys", methods=["POST"], strict_slashes=False)
@require_roles(*HR_ROLES)
def create_survey():
    try:
        cleaned, errors = schemas.validate_survey_payload(_json_body())
        if errors:
            return _validation_error(errors)
        user = services.current_user()
        survey = services.create_survey(user, cleaned)
        return jsonify({
            "data": schemas.survey_to_dict(survey, responded=False, response_count=0)
        }), 201
    except ApiError as exc:
        return _error(exc)


@bp.route("/surveys", methods=["GET"], strict_slashes=False)
@require_roles(*ALL_ROLES)
def list_surveys():
    try:
        user = services.current_user()
        return jsonify({"data": services.list_surveys(user)}), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/surveys/<int:survey_id>", methods=["GET"])
@require_roles(*ALL_ROLES)
def get_survey(survey_id):
    try:
        user = services.current_user()
        survey = services.get_survey_for_user(survey_id, user)
        responded = services._responded(survey.id, user.id)
        response_count = (
            services._response_count(survey.id)
            if user.role in HR_ROLES
            else None
        )
        return jsonify({
            "data": schemas.survey_to_dict(
                survey, responded=responded, response_count=response_count
            )
        }), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/surveys/<int:survey_id>/responses", methods=["POST"])
@require_roles(*ALL_ROLES)
def respond_survey(survey_id):
    try:
        body = _json_body()
        answers = body.get("answers") if isinstance(body, dict) else None
        if answers is None:
            # Cho phép gửi thẳng object đáp án không bọc "answers".
            answers = body
        user = services.current_user()
        response = services.respond_survey(user, survey_id, answers)
        return jsonify({"data": {"id": response.id, "responded": True}}), 201
    except ApiError as exc:
        return _error(exc)


@bp.route("/surveys/<int:survey_id>/results", methods=["GET"])
@require_roles(*HR_ROLES)
def survey_results(survey_id):
    try:
        return jsonify({"data": services.survey_results(survey_id)}), 200
    except ApiError as exc:
        return _error(exc)


@bp.route("/surveys/<int:survey_id>/close", methods=["POST"])
@require_roles(*HR_ROLES)
def close_survey(survey_id):
    try:
        survey = services.close_survey(survey_id)
        return jsonify({
            "data": schemas.survey_to_dict(
                survey, response_count=services._response_count(survey.id)
            )
        }), 200
    except ApiError as exc:
        return _error(exc)
