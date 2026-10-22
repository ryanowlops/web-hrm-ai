"""Routes cho Briefing — tiền tố /api/v1/briefing (v6 mục 4.2).

Chỉ admin/hr:
    POST /briefing/generate  {period, ref_date?} → 200 {data: briefing}
    GET  /briefing/latest?period=week|month      → 200 {data: briefing}
    GET  /briefing/history?period=&limit=        → 200 {data: [...], meta}

Mọi lỗi trả envelope chuẩn {"error": {"code", "message", "details"}}
qua ApiError của app.errors + handler tập trung.
"""

from flask import jsonify, request

from app.blueprints.auth.guards import load_current_user, require_roles
from app.blueprints.briefing import bp
from app.blueprints.briefing import schemas, services
from app.errors import ApiError
from app.extensions import limiter, user_or_ip_key

BRIEFING_ROLES = ("admin", "hr")


@bp.post("/generate")
@limiter.limit("10 per hour", key_func=user_or_ip_key)
@require_roles(*BRIEFING_ROLES)
def generate_briefing():
    period, ref_date = schemas.parse_generate_body(request.get_json(silent=True))
    user = load_current_user()
    briefing = services.generate_briefing(user, period, ref_date)
    return jsonify({"data": schemas.briefing_to_dict(briefing)}), 200


@bp.get("/latest")
@require_roles(*BRIEFING_ROLES)
def latest_briefing():
    period = schemas.parse_period_arg(request.args.get("period"), required=True)
    briefing = services.latest_briefing(period)
    if briefing is None:
        raise ApiError(
            404, "BRIEFING_NOT_FOUND",
            "Chưa có báo cáo nào cho kỳ này — hãy tạo báo cáo đầu tiên.",
        )
    return jsonify({"data": schemas.briefing_to_dict(briefing)}), 200


@bp.get("/history")
@require_roles(*BRIEFING_ROLES)
def briefing_history():
    period = schemas.parse_period_arg(request.args.get("period"), required=False)
    limit = schemas.parse_limit_arg(request.args.get("limit"))
    items = services.briefing_history(period, limit)
    return jsonify({
        "data": [schemas.briefing_to_dict(item) for item in items],
        "meta": {"totalItems": len(items), "limit": limit, "period": period},
    }), 200
