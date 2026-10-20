"""Schema (serialize + validate) cho Departments & Positions.

Serialize thủ công có kiểm tra getattr để không lộ trường nhạy cảm và
không phụ thuộc quan hệ ORM cụ thể. Validate trả danh sách lỗi dạng
[{"field": ..., "message": ...}] để routes đóng vào error.details.
"""

from datetime import date, datetime


def _iso(value):
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def department_to_dict(department, employee_total=None):
    manager = getattr(department, "manager", None)
    data = {
        "id": department.id,
        "name": department.name,
        "manager_id": getattr(department, "manager_id", None),
        "manager_name": getattr(manager, "full_name", None) if manager else None,
        "description": getattr(department, "description", None),
        "employee_count": employee_total,
        "created_at": _iso(getattr(department, "created_at", None)),
        "updated_at": _iso(getattr(department, "updated_at", None)),
    }
    return data


def position_to_dict(position):
    department = getattr(position, "department", None)
    return {
        "id": position.id,
        "title": position.title,
        "department_id": getattr(position, "department_id", None),
        "department_name": getattr(department, "name", None)
        if department
        else None,
        "created_at": _iso(getattr(position, "created_at", None)),
        "updated_at": _iso(getattr(position, "updated_at", None)),
    }


def _validate_string(data, field, errors, *, required, max_len=255,
                     partial=False):
    if field not in data:
        if required and not partial:
            errors.append({"field": field, "message": "Trường này là bắt buộc."})
        return
    value = data[field]
    if not isinstance(value, str) or not value.strip():
        errors.append({"field": field, "message": "Phải là chuỗi không rỗng."})
        return
    if len(value.strip()) > max_len:
        errors.append(
            {"field": field, "message": f"Tối đa {max_len} ký tự."}
        )


def _validate_optional_int(data, field, errors):
    if field in data and data[field] is not None:
        value = data[field]
        if isinstance(value, bool) or not isinstance(value, int):
            errors.append({"field": field, "message": "Phải là số nguyên."})


def validate_department_payload(data, partial=False):
    """Trả (cleaned_data, errors). Chỉ giữ các trường được phép ghi."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    _validate_string(data, "name", errors, required=True, partial=partial)
    _validate_optional_int(data, "manager_id", errors)
    if "description" in data and data["description"] is not None \
            and not isinstance(data["description"], str):
        errors.append({"field": "description", "message": "Phải là chuỗi."})
    cleaned = {}
    for field in ("name", "manager_id", "description"):
        if field in data:
            value = data[field]
            cleaned[field] = value.strip() if isinstance(value, str) else value
    return cleaned, errors


def validate_position_payload(data, partial=False):
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    _validate_string(data, "title", errors, required=True, partial=partial)
    if "department_id" not in data:
        if not partial:
            errors.append(
                {"field": "department_id", "message": "Trường này là bắt buộc."}
            )
    else:
        _validate_optional_int(data, "department_id", errors)
        if data["department_id"] is None and not partial:
            errors.append(
                {"field": "department_id", "message": "Trường này là bắt buộc."}
            )
    cleaned = {}
    for field in ("title", "department_id"):
        if field in data:
            value = data[field]
            cleaned[field] = value.strip() if isinstance(value, str) else value
    return cleaned, errors
