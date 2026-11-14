"""Routes cho Thư mời nhận việc (Offer Letter) — tiền tố /api/v1/offer-letters.

    POST   /offer-letters            Tạo thư mời (admin, hr).
    GET    /offer-letters            Danh sách thư mời (admin, hr),
                                    lọc ?status= & ?candidate_id=.
    GET    /offer-letters/<id>       Chi tiết 1 thư mời (admin, hr).
    POST   /offer-letters/<id>/send     Gửi thư (draft -> sent).
    POST   /offer-letters/<id>/respond  Ghi nhận phản hồi ứng viên
                                        (sent -> accepted | declined).
    POST   /offer-letters/<id>/withdraw Thu hồi thư
                                        (draft | sent -> withdrawn).

Trạng thái 'expired' chỉ tính lúc đọc (sent + quá hạn trả lời), không
lưu trong DB — xem services.effective_status.
"""
from flask import jsonify, request

from app.blueprints.auth.guards import load_current_user, require_roles
from app.blueprints.offer_letters import bp, schemas, services
from app.errors import ApiError

ROLES = ("admin", "hr")


def _json_body():
    data = request.get_json(silent=True)
    if data is None:
        raise ApiError(400, "VALIDATION_ERROR", "Body phải là JSON hợp lệ.")
    return data


@bp.post("")
@require_roles(*ROLES)
def create_offer_letter():
    cleaned, errors = schemas.validate_create_payload(_json_body())
    if errors:
        raise ApiError(
            400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", details=errors
        )
    user = load_current_user()
    offer = services.create_offer_letter(
        candidate_id=cleaned["candidate_id"],
        job_id=cleaned["job_id"],
        salary=cleaned["salary"],
        start_date=cleaned["start_date"],
        deadline=cleaned["deadline"],
        created_by=getattr(user, "id", None),
    )
    return jsonify({"data": schemas.offer_to_dict(offer)}), 201


@bp.get("")
@require_roles(*ROLES)
def list_offer_letters():
    rows, meta = services.list_offers(request.args)
    return jsonify(
        {"data": [schemas.offer_to_dict(row) for row in rows], "meta": meta}
    )


@bp.get("/<int:offer_id>")
@require_roles(*ROLES)
def get_offer_letter(offer_id):
    offer = services.get_offer_or_404(offer_id)
    return jsonify({"data": schemas.offer_to_dict(offer)})


@bp.post("/<int:offer_id>/send")
@require_roles(*ROLES)
def send_offer_letter(offer_id):
    offer = services.send_offer(offer_id)
    return jsonify({"data": schemas.offer_to_dict(offer)})


@bp.post("/<int:offer_id>/respond")
@require_roles(*ROLES)
def respond_offer_letter(offer_id):
    cleaned, errors = schemas.validate_respond_payload(_json_body())
    if errors:
        raise ApiError(
            400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", details=errors
        )
    offer = services.record_response(offer_id, cleaned["decision"])
    return jsonify({"data": schemas.offer_to_dict(offer)})


@bp.post("/<int:offer_id>/withdraw")
@require_roles(*ROLES)
def withdraw_offer_letter(offer_id):
    offer = services.withdraw_offer(offer_id)
    return jsonify({"data": schemas.offer_to_dict(offer)})
