"""Routes cho Quản lý thử việc — tiền tố /api/v1/probation.

    GET  /probation                    Danh sách thử việc (admin/hr/manager),
                                       kèm đánh giá mới nhất nếu có.
    GET  /probation/summary            Tổng quan: đang thử việc / sắp hết
                                       hạn / đã quá hạn (admin/hr/manager).
    POST /probation/<id>/evaluate      Đánh giá thử việc: pass / fail /
                                       extend (admin/hr/manager của nhân
                                       viên đó).
"""
from flask import jsonify, request

from app.blueprints.auth.guards import load_current_user, require_roles
from app.blueprints.probation import bp, schemas, services
from app.errors import ApiError

READ_ROLES = ("admin", "hr", "manager")
WRITE_ROLES = ("admin", "hr", "manager")


def _json_body():
    data = request.get_json(silent=True)
    if data is None:
        raise ApiError(400, "VALIDATION_ERROR", "Body phải là JSON hợp lệ.")
    return data


@bp.get("")
@require_roles(*READ_ROLES)
def list_probation():
    user = load_current_user()
    rows, meta = services.list_probation(request.args, user)
    return jsonify(
        {"data": [schemas.probation_to_dict(row) for row in rows], "meta": meta}
    )


@bp.get("/summary")
@require_roles(*READ_ROLES)
def probation_summary():
    user = load_current_user()
    return jsonify({"data": services.probation_summary(user)})


@bp.post("/<int:contract_id>/evaluate")
@require_roles(*WRITE_ROLES)
def evaluate_probation(contract_id):
    cleaned, errors = schemas.validate_evaluate_payload(_json_body())
    if errors:
        raise ApiError(
            400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", details=errors
        )
    user = load_current_user()
    contract, evaluation, new_contract = services.evaluate_contract(
        contract_id, cleaned, user
    )
    return jsonify(
        {
            "data": {
                "contract": schemas.contract_to_dict(contract),
                "evaluation": schemas.evaluation_to_dict(evaluation),
                "newContract": schemas.contract_to_dict(new_contract),
            }
        }
    ), 200
