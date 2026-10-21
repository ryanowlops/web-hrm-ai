"""Routes cho People AI — tiền tố /api/v1/people-ai (mục 5.3).

    GET /people-ai/attrition-risk?department_id=&level=
        Điểm nguy cơ nghỉ việc tính tại chỗ theo luật minh bạch.
        Chỉ admin/hr/manager (employee -> 403 qua require_roles);
        manager luôn bị giới hạn ở nhóm của mình trong services.
"""
from flask import jsonify, request

from app.blueprints.auth.guards import load_current_user, require_roles
from app.blueprints.people_ai import bp, services


@bp.get("/attrition-risk")
@require_roles("admin", "hr", "manager")
def attrition_risk():
    user = load_current_user()
    department_id = request.args.get("department_id", type=int)
    level = request.args.get("level", type=str)
    result = services.get_attrition_risk(
        user, department_id=department_id, level=level)
    return jsonify({"data": result})
