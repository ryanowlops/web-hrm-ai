"""Schema (serialize + validate) cho module Shifts (ca lam, tang ca, giai trinh).

Theo khuon training/schemas.py: serialize thu cong co getattr an toan,
validate tra (cleaned_data, errors) voi errors dang
[{"field": ..., "message": ...}] de routes dong vao error.details.
"""

from datetime import date, datetime, time

from app.extensions import db
from app.models import User

APPROVAL_STATUSES = ("pending", "manager_approved", "approved", "rejected")


def _iso(value):
    if value is None:
        return None
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    return value


def _user_name(user_id):
    if not user_id:
        return None
    user = db.session.get(User, user_id)
    return user.full_name if user else None


def _employee_fields(employee):
    if employee is None:
        return {
            "employee_id": None,
            "employee_name": None,
            "employee_code": None,
            "department_id": None,
            "department_name": None,
        }
    department = getattr(employee, "department", None)
    return {
        "employee_id": employee.id,
        "employee_name": getattr(employee, "full_name", None),
        "employee_code": getattr(employee, "code", None),
        "department_id": getattr(employee, "department_id", None),
        "department_name": getattr(department, "name", None) if department else None,
    }


# ---------------------------------------------------------------------------
# Serialize
# ---------------------------------------------------------------------------

def definition_to_dict(definition):
    return {
        "id": definition.id,
        "name": definition.name,
        "start_time": _iso(definition.start_time),
        "end_time": _iso(definition.end_time),
        "break_minutes": definition.break_minutes,
        "is_overnight": bool(definition.is_overnight),
        "is_active": bool(definition.is_active),
        "created_at": _iso(getattr(definition, "created_at", None)),
        "updated_at": _iso(getattr(definition, "updated_at", None)),
    }


def assignment_to_dict(assignment):
    shift = getattr(assignment, "shift", None)
    data = {
        "id": assignment.id,
        "shift_id": assignment.shift_id,
        "shift_name": getattr(shift, "name", None) if shift else None,
        "work_date": _iso(assignment.work_date),
        "note": assignment.note,
        "created_at": _iso(getattr(assignment, "created_at", None)),
        "updated_at": _iso(getattr(assignment, "updated_at", None)),
    }
    data.update(_employee_fields(getattr(assignment, "employee", None)))
    return data


def _approval_fields(obj):
    return {
        "status": obj.status,
        "manager_decision": obj.manager_decision,
        "manager_decided_by": obj.manager_decided_by,
        "manager_decided_by_name": _user_name(obj.manager_decided_by),
        "manager_decided_at": _iso(obj.manager_decided_at),
        "manager_note": obj.manager_note,
        "hr_decision": obj.hr_decision,
        "hr_decided_by": obj.hr_decided_by,
        "hr_decided_by_name": _user_name(obj.hr_decided_by),
        "hr_decided_at": _iso(obj.hr_decided_at),
        "hr_note": obj.hr_note,
    }


def overtime_to_dict(overtime):
    data = {
        "id": overtime.id,
        "work_date": _iso(overtime.work_date),
        "hours": overtime.hours,
        "reason": overtime.reason,
        "created_at": _iso(getattr(overtime, "created_at", None)),
        "updated_at": _iso(getattr(overtime, "updated_at", None)),
    }
    data.update(_employee_fields(getattr(overtime, "employee", None)))
    data.update(_approval_fields(overtime))
    return data


def correction_to_dict(correction):
    data = {
        "id": correction.id,
        "attendance_id": correction.attendance_id,
        "work_date": _iso(correction.work_date),
        "requested_check_in": _iso(correction.requested_check_in),
        "requested_check_out": _iso(correction.requested_check_out),
        "reason": correction.reason,
        "created_at": _iso(getattr(correction, "created_at", None)),
        "updated_at": _iso(getattr(correction, "updated_at", None)),
    }
    data.update(_employee_fields(getattr(correction, "employee", None)))
    data.update(_approval_fields(correction))
    return data


# ---------------------------------------------------------------------------
# Parse helpers (dung trong validate)
# ---------------------------------------------------------------------------

def parse_date_value(value):
    """'YYYY-MM-DD' -> date, khong hop le tra None."""
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


def parse_time_value(value):
    """'HH:MM' hoac 'HH:MM:SS' -> time, khong hop le tra None."""
    if isinstance(value, time):
        return value
    if not isinstance(value, str):
        return None
    try:
        return time.fromisoformat(value.strip())
    except ValueError:
        return None


def parse_datetime_value(value):
    """ISO datetime -> datetime, khong hop le tra None."""
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.strip().replace("Z", "+00:00")).replace(
            tzinfo=None
        )
    except ValueError:
        return None


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
    if field in data and data[field] is not None:
        if not isinstance(data[field], str):
            errors.append({"field": field, "message": "Phải là chuỗi."})
        elif len(data[field]) > max_len:
            errors.append({"field": field, "message": f"Tối đa {max_len} ký tự."})


def _validate_optional_bool(data, field, errors):
    if field in data and data[field] is not None and not isinstance(data[field], bool):
        errors.append({"field": field, "message": "Phải là true/false."})


def validate_definition_payload(data, partial=False):
    """Body dinh nghia ca: name, start_time, end_time, break_minutes,
    is_overnight, is_active."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    _validate_string(data, "name", errors, required=True, max_len=120, partial=partial)
    for field in ("start_time", "end_time"):
        if field not in data:
            if not partial:
                errors.append({"field": field, "message": "Trường này là bắt buộc."})
        elif parse_time_value(data[field]) is None:
            errors.append(
                {"field": field, "message": "Giờ không hợp lệ (HH:MM hoặc HH:MM:SS)."}
            )
    if "break_minutes" in data and data["break_minutes"] is not None:
        value = data["break_minutes"]
        if isinstance(value, bool) or not isinstance(value, int):
            errors.append({"field": "break_minutes", "message": "Phải là số nguyên (phút)."})
        elif value < 0 or value > 480:
            errors.append({"field": "break_minutes", "message": "Phải trong khoảng 0–480."})
    _validate_optional_bool(data, "is_overnight", errors)
    _validate_optional_bool(data, "is_active", errors)
    if errors:
        return {}, errors

    cleaned = {}
    if "name" in data:
        cleaned["name"] = data["name"].strip()
    for field in ("start_time", "end_time"):
        if field in data:
            cleaned[field] = parse_time_value(data[field])
    if "break_minutes" in data and data["break_minutes"] is not None:
        cleaned["break_minutes"] = int(data["break_minutes"])
    for field in ("is_overnight", "is_active"):
        if field in data and data[field] is not None:
            cleaned[field] = bool(data[field])
    return cleaned, errors


def validate_assignment_payload(data):
    """Body {employee_id, shift_id, work_date, note?}."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    for field in ("employee_id", "shift_id"):
        value = data.get(field)
        if isinstance(value, bool) or not isinstance(value, int):
            errors.append({"field": field, "message": "Phải là số nguyên."})
    if parse_date_value(data.get("work_date")) is None:
        errors.append(
            {"field": "work_date", "message": "Ngày không hợp lệ (YYYY-MM-DD)."}
        )
    _validate_optional_string(data, "note", errors, max_len=255)
    if errors:
        return {}, errors
    return {
        "employee_id": data["employee_id"],
        "shift_id": data["shift_id"],
        "work_date": parse_date_value(data["work_date"]),
        "note": (data.get("note") or "").strip() or None,
    }, errors


def validate_overtime_payload(data):
    """Body {work_date, hours, reason?, employee_id? (chi HR/Admin tao ho)}."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    if parse_date_value(data.get("work_date")) is None:
        errors.append(
            {"field": "work_date", "message": "Ngày không hợp lệ (YYYY-MM-DD)."}
        )
    hours = data.get("hours")
    if isinstance(hours, bool) or not isinstance(hours, (int, float)):
        errors.append({"field": "hours", "message": "Số giờ tăng ca là bắt buộc và phải là số."})
    elif hours <= 0 or hours > 16:
        errors.append({"field": "hours", "message": "Số giờ phải trong khoảng (0, 16]."})
    if "employee_id" in data and data["employee_id"] is not None:
        value = data["employee_id"]
        if isinstance(value, bool) or not isinstance(value, int):
            errors.append({"field": "employee_id", "message": "Phải là số nguyên."})
    _validate_optional_string(data, "reason", errors, max_len=2000)
    if errors:
        return {}, errors
    cleaned = {
        "work_date": parse_date_value(data["work_date"]),
        "hours": float(hours),
        "reason": (data.get("reason") or "").strip() or None,
    }
    if data.get("employee_id") is not None:
        cleaned["employee_id"] = data["employee_id"]
    return cleaned, errors


def validate_correction_payload(data):
    """Body {work_date, requested_check_in?, requested_check_out?, reason,
    attendance_id?, employee_id?}. Bat buoc co it nhat 1 gio de xuat."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    if parse_date_value(data.get("work_date")) is None:
        errors.append(
            {"field": "work_date", "message": "Ngày không hợp lệ (YYYY-MM-DD)."}
        )
    check_in = check_out = None
    if data.get("requested_check_in") is not None:
        check_in = parse_datetime_value(data["requested_check_in"])
        if check_in is None:
            errors.append(
                {"field": "requested_check_in", "message": "Thời gian không hợp lệ (ISO datetime)."}
            )
    if data.get("requested_check_out") is not None:
        check_out = parse_datetime_value(data["requested_check_out"])
        if check_out is None:
            errors.append(
                {"field": "requested_check_out", "message": "Thời gian không hợp lệ (ISO datetime)."}
            )
    if (
        data.get("requested_check_in") is None
        and data.get("requested_check_out") is None
    ):
        errors.append(
            {
                "field": "requested_check_in",
                "message": "Cần đề xuất ít nhất giờ vào hoặc giờ ra.",
            }
        )
    if check_in is not None and check_out is not None and check_out <= check_in:
        errors.append(
            {"field": "requested_check_out", "message": "Giờ ra phải sau giờ vào."}
        )
    _validate_string(data, "reason", errors, required=True, max_len=2000)
    for field in ("attendance_id", "employee_id"):
        if field in data and data[field] is not None:
            value = data[field]
            if isinstance(value, bool) or not isinstance(value, int):
                errors.append({"field": field, "message": "Phải là số nguyên."})
    if errors:
        return {}, errors
    cleaned = {
        "work_date": parse_date_value(data["work_date"]),
        "requested_check_in": check_in,
        "requested_check_out": check_out,
        "reason": data["reason"].strip(),
    }
    if data.get("attendance_id") is not None:
        cleaned["attendance_id"] = data["attendance_id"]
    if data.get("employee_id") is not None:
        cleaned["employee_id"] = data["employee_id"]
    return cleaned, errors


def validate_decision_payload(data):
    """Body {decision: "approve"|"reject", note?}.

    Chap nhan ca "approved"/"rejected" de tuong thich ban ghi cu.
    Tra (decision_chuan, note, errors) voi decision_chuan la
    "approved" | "rejected" (gia tri luu xuong DB nhu mau leave).
    """
    errors = []
    if not isinstance(data, dict):
        return None, None, [{"field": "body", "message": "Body phải là JSON object."}]
    raw = data.get("decision")
    mapping = {
        "approve": "approved",
        "approved": "approved",
        "reject": "rejected",
        "rejected": "rejected",
    }
    decision = mapping.get(raw) if isinstance(raw, str) else None
    if decision is None:
        errors.append(
            {"field": "decision", "message": "Quyết định phải là 'approve' hoặc 'reject'."}
        )
    note = data.get("note")
    if note is not None and not isinstance(note, str):
        errors.append({"field": "note", "message": "Phải là chuỗi."})
        note = None
    note = (note or "").strip()
    if decision == "rejected" and not note:
        errors.append(
            {"field": "note", "message": "Từ chối đơn bắt buộc phải nhập lý do."}
        )
    if errors:
        return None, None, errors
    return decision, note or None, errors
