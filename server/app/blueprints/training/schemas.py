"""Schema (serialize + validate) cho module Training.

Serialize thủ công có kiểm tra getattr để không phụ thuộc quan hệ ORM cụ thể.
Validate trả (cleaned_data, errors) với errors dạng
[{"field": ..., "message": ...}] để routes đóng vào error.details —
đúng quy ước của các module hiện tại (departments, employees...).
"""

from datetime import date, datetime

from app.models.training import CourseEnrollment


def _iso(value):
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def course_to_dict(course, enrollment_total=None, enrollment_completed=None):
    return {
        "id": course.id,
        "title": course.title,
        "description": getattr(course, "description", None),
        "category": getattr(course, "category", None),
        "duration_hours": getattr(course, "duration_hours", 0),
        "is_mandatory": bool(getattr(course, "is_mandatory", False)),
        "is_active": bool(getattr(course, "is_active", True)),
        "enrollment_total": enrollment_total,
        "enrollment_completed": enrollment_completed,
        "created_at": _iso(getattr(course, "created_at", None)),
        "updated_at": _iso(getattr(course, "updated_at", None)),
    }


def enrollment_to_dict(enrollment, include_course=False):
    employee = getattr(enrollment, "employee", None)
    enroller = getattr(enrollment, "enroller", None)
    data = {
        "id": enrollment.id,
        "course_id": enrollment.course_id,
        "employee_id": enrollment.employee_id,
        "employee_name": getattr(employee, "full_name", None) if employee else None,
        "employee_code": getattr(employee, "code", None) if employee else None,
        "status": enrollment.status,
        "progress": enrollment.progress,
        "enrolled_by": getattr(enrollment, "enrolled_by", None),
        "enrolled_by_name": getattr(enroller, "full_name", None) if enroller else None,
        "completed_at": _iso(getattr(enrollment, "completed_at", None)),
        "created_at": _iso(getattr(enrollment, "created_at", None)),
        "updated_at": _iso(getattr(enrollment, "updated_at", None)),
    }
    if include_course:
        course = getattr(enrollment, "course", None)
        data["course"] = course_to_dict(course) if course else None
        data["course_title"] = getattr(course, "title", None) if course else None
    return data


# ---------------------------------------------------------------------------
# Validate payloads
# ---------------------------------------------------------------------------

def _validate_string(data, field, errors, *, required, max_len=255, partial=False):
    if field not in data:
        if required and not partial:
            errors.append({"field": field, "message": "Trường này là bắt buộc."})
        return
    value = data[field]
    if not isinstance(value, str) or not value.strip():
        errors.append({"field": field, "message": "Phải là chuỗi không rỗng."})
        return
    if len(value.strip()) > max_len:
        errors.append({"field": field, "message": f"Tối đa {max_len} ký tự."})


def _validate_optional_string(data, field, errors, *, max_len=255):
    if field in data and data[field] is not None and not isinstance(data[field], str):
        errors.append({"field": field, "message": "Phải là chuỗi."})
    elif (
        field in data
        and isinstance(data.get(field), str)
        and len(data[field]) > max_len
    ):
        errors.append({"field": field, "message": f"Tối đa {max_len} ký tự."})


def _validate_optional_bool(data, field, errors):
    if field in data and data[field] is not None and not isinstance(data[field], bool):
        errors.append({"field": field, "message": "Phải là true/false."})


def validate_course_payload(data, partial=False):
    """Trả (cleaned_data, errors). Chỉ giữ các trường được phép ghi."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    _validate_string(data, "title", errors, required=True, max_len=200, partial=partial)
    _validate_optional_string(data, "description", errors, max_len=5000)
    _validate_optional_string(data, "category", errors, max_len=100)
    if "duration_hours" in data and data["duration_hours"] is not None:
        value = data["duration_hours"]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            errors.append({"field": "duration_hours", "message": "Phải là số (giờ)."})
        elif value < 0:
            errors.append({"field": "duration_hours", "message": "Không được âm."})
    _validate_optional_bool(data, "is_mandatory", errors)
    _validate_optional_bool(data, "is_active", errors)
    if errors:
        return {}, errors

    cleaned = {}
    for field in ("title", "description", "category"):
        if field in data:
            value = data[field]
            cleaned[field] = value.strip() if isinstance(value, str) else value
    if "duration_hours" in data and data["duration_hours"] is not None:
        cleaned["duration_hours"] = float(data["duration_hours"])
    for field in ("is_mandatory", "is_active"):
        if field in data and data[field] is not None:
            cleaned[field] = bool(data[field])
    return cleaned, errors


def validate_enroll_payload(data):
    """Body {employee_ids: [int, ...]} — bắt buộc, không rỗng, không trùng."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    ids = data.get("employee_ids")
    if not isinstance(ids, list) or not ids:
        errors.append(
            {"field": "employee_ids", "message": "Phải là danh sách id nhân viên không rỗng."}
        )
        return {}, errors
    cleaned_ids = []
    for value in ids:
        if isinstance(value, bool) or not isinstance(value, int):
            errors.append(
                {"field": "employee_ids", "message": "Mọi id phải là số nguyên."}
            )
            return {}, errors
        if value not in cleaned_ids:
            cleaned_ids.append(value)
    return {"employee_ids": cleaned_ids}, errors


def validate_enrollment_patch(data):
    """Body {progress?: int 0..100, status?: assigned|in_progress|completed}."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    if "progress" not in data and "status" not in data:
        errors.append(
            {"field": "body", "message": "Cần ít nhất một trường: progress hoặc status."}
        )
        return {}, errors
    if "progress" in data and data["progress"] is not None:
        value = data["progress"]
        if isinstance(value, bool) or not isinstance(value, int):
            errors.append({"field": "progress", "message": "Phải là số nguyên 0–100."})
        elif value < 0 or value > 100:
            errors.append({"field": "progress", "message": "Phải trong khoảng 0–100."})
    if "status" in data and data["status"] is not None:
        if data["status"] not in CourseEnrollment.STATUSES:
            errors.append(
                {
                    "field": "status",
                    "message": "Trạng thái không hợp lệ (assigned|in_progress|completed).",
                }
            )
    if errors:
        return {}, errors
    cleaned = {}
    if "progress" in data and data["progress"] is not None:
        cleaned["progress"] = int(data["progress"])
    if "status" in data and data["status"] is not None:
        cleaned["status"] = data["status"]
    return cleaned, errors
