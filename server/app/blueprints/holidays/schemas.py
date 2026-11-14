"""Schema (serialize + validate) cho Holidays (lịch nghỉ lễ).

Serialize theo quy ước camelCase của các module mới (xem announcements):
frontend nhận date dạng ISO "YYYY-MM-DD". Validate trả danh sách lỗi
dạng [{"field": ..., "message": ...}] để routes đóng vào error.details.
"""

from datetime import date


def holiday_to_dict(holiday):
    creator = getattr(holiday, "creator", None)
    return {
        "id": holiday.id,
        "date": holiday.date.isoformat() if holiday.date else None,
        "name": holiday.name,
        "description": getattr(holiday, "description", None),
        "isNational": bool(holiday.is_national),
        "createdBy": getattr(holiday, "created_by", None),
        "createdByName": getattr(creator, "full_name", None) if creator else None,
        "createdAt": (
            holiday.created_at.isoformat() if holiday.created_at else None
        ),
        "updatedAt": (
            holiday.updated_at.isoformat() if holiday.updated_at else None
        ),
    }


def _parse_date(value):
    """Trả (date_obj, None) nếu hợp lệ, (None, message) nếu không."""
    if not isinstance(value, str) or not value.strip():
        return None, "Phải là chuỗi ngày dạng YYYY-MM-DD."
    try:
        return date.fromisoformat(value.strip()[:10]), None
    except ValueError:
        return None, "Ngày không hợp lệ (định dạng YYYY-MM-DD)."


def validate_holiday_payload(data):
    """Trả (cleaned_data, errors). Chỉ giữ các trường được phép ghi."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]

    cleaned = {}

    # date — bắt buộc, ngày thật theo lịch (2026-02-30 -> lỗi).
    if "date" not in data:
        errors.append({"field": "date", "message": "Trường này là bắt buộc."})
    else:
        parsed, error = _parse_date(data["date"])
        if error:
            errors.append({"field": "date", "message": error})
        else:
            cleaned["date"] = parsed

    # name — bắt buộc, không rỗng, tối đa 255 ký tự.
    if "name" not in data:
        errors.append({"field": "name", "message": "Trường này là bắt buộc."})
    elif not isinstance(data["name"], str) or not data["name"].strip():
        errors.append({"field": "name", "message": "Phải là chuỗi không rỗng."})
    elif len(data["name"].strip()) > 255:
        errors.append({"field": "name", "message": "Tối đa 255 ký tự."})
    else:
        cleaned["name"] = data["name"].strip()

    # description — tùy chọn.
    if "description" in data and data["description"] is not None:
        if not isinstance(data["description"], str):
            errors.append({"field": "description", "message": "Phải là chuỗi."})
        else:
            cleaned["description"] = data["description"].strip() or None

    # is_national — tùy chọn, mặc định True.
    if "is_national" in data and data["is_national"] is not None:
        if not isinstance(data["is_national"], bool):
            errors.append(
                {"field": "is_national", "message": "Phải là true/false."}
            )
        else:
            cleaned["is_national"] = data["is_national"]

    return cleaned, errors
