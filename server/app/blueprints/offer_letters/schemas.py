"""Schema (serialize + validate) cho Thư mời nhận việc (Offer Letter).

Serialize theo quy ước camelCase của các module mới (xem probation,
holidays): frontend nhận date dạng ISO "YYYY-MM-DD". Trạng thái trả về
là trạng thái hiển thị — 'sent' quá hạn trả lời serialize thành
'expired' (xem services.effective_status). Validate trả danh sách lỗi
dạng [{"field": ..., "message": ...}] để routes đóng vào error.details.
"""

from datetime import date

from app.blueprints.offer_letters.services import effective_status
from app.models.offer_letter import OfferLetter


def offer_to_dict(offer, today=None):
    candidate = getattr(offer, "candidate", None)
    job = getattr(offer, "job", None)
    creator = getattr(offer, "creator", None)
    job_title = None
    if job is not None:
        job_title = job.title
    elif candidate is not None and getattr(candidate, "job", None) is not None:
        job_title = candidate.job.title
    return {
        "id": offer.id,
        "candidateId": offer.candidate_id,
        "candidateName": getattr(candidate, "full_name", None)
        if candidate is not None
        else None,
        "candidateEmail": getattr(candidate, "email", None)
        if candidate is not None
        else None,
        "jobId": offer.job_id,
        "jobTitle": job_title,
        "salary": offer.salary,
        "startDate": (
            offer.start_date.isoformat() if offer.start_date else None
        ),
        "deadline": offer.deadline.isoformat() if offer.deadline else None,
        # Trạng thái hiển thị (sent quá hạn -> expired, không đổi DB).
        "status": effective_status(offer, today),
        "letterBody": offer.letter_body,
        "createdBy": getattr(offer, "created_by", None),
        "createdByName": getattr(creator, "full_name", None)
        if creator
        else None,
        "createdAt": offer.created_at.isoformat() if offer.created_at else None,
        "updatedAt": offer.updated_at.isoformat() if offer.updated_at else None,
    }


def _parse_date(value):
    """Trả (date_obj, None) nếu hợp lệ, (None, message) nếu không."""
    if not isinstance(value, str) or not value.strip():
        return None, "Phải là chuỗi ngày dạng YYYY-MM-DD."
    try:
        return date.fromisoformat(value.strip()[:10]), None
    except ValueError:
        return None, "Ngày không hợp lệ (định dạng YYYY-MM-DD)."


def validate_create_payload(data):
    """Trả (cleaned_data, errors). Chỉ giữ các trường được phép ghi."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]

    cleaned = {}

    # candidate_id — bắt buộc, số nguyên.
    if "candidate_id" not in data:
        errors.append(
            {"field": "candidate_id", "message": "Trường này là bắt buộc."}
        )
    elif isinstance(data["candidate_id"], bool) or not isinstance(
        data["candidate_id"], int
    ):
        errors.append(
            {"field": "candidate_id", "message": "Phải là số nguyên."}
        )
    else:
        cleaned["candidate_id"] = data["candidate_id"]

    # job_id — tùy chọn, số nguyên hoặc null.
    if "job_id" in data and data["job_id"] is not None:
        if isinstance(data["job_id"], bool) or not isinstance(
            data["job_id"], int
        ):
            errors.append({"field": "job_id", "message": "Phải là số nguyên."})
        else:
            cleaned["job_id"] = data["job_id"]
    else:
        cleaned["job_id"] = None

    # salary — bắt buộc, số nguyên > 0 (VNĐ/tháng).
    if "salary" not in data:
        errors.append({"field": "salary", "message": "Trường này là bắt buộc."})
    elif isinstance(data["salary"], bool) or not isinstance(data["salary"], int):
        errors.append({"field": "salary", "message": "Phải là số nguyên."})
    elif data["salary"] <= 0:
        errors.append({"field": "salary", "message": "Phải lớn hơn 0."})
    else:
        cleaned["salary"] = data["salary"]

    # start_date — bắt buộc, ngày thật theo lịch.
    if "start_date" not in data:
        errors.append(
            {"field": "start_date", "message": "Trường này là bắt buộc."}
        )
    else:
        parsed, error = _parse_date(data["start_date"])
        if error:
            errors.append({"field": "start_date", "message": error})
        else:
            cleaned["start_date"] = parsed

    # deadline — tùy chọn, ngày thật theo lịch hoặc null.
    if "deadline" in data and data["deadline"] is not None:
        parsed, error = _parse_date(data["deadline"])
        if error:
            errors.append({"field": "deadline", "message": error})
        else:
            cleaned["deadline"] = parsed
    else:
        cleaned["deadline"] = None

    return cleaned, errors


def validate_respond_payload(data):
    """Trả (cleaned_data, errors) cho POST /<id>/respond."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]

    cleaned = {}
    decision = data.get("decision")
    if decision not in (
        OfferLetter.STATUS_ACCEPTED,
        OfferLetter.STATUS_DECLINED,
    ):
        errors.append(
            {
                "field": "decision",
                "message": "decision phải là accepted hoặc declined.",
            }
        )
    else:
        cleaned["decision"] = decision
    return cleaned, errors
