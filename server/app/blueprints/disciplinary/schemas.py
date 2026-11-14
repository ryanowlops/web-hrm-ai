"""Schema (serialize + validate) cho Kỷ luật nhân viên.

Serialize theo quy ước camelCase của các module mới (xem holidays /
probation): frontend nhận date dạng ISO "YYYY-MM-DD". Validate trả danh
sách lỗi dạng [{"field": ..., "message": ...}] để routes đóng vào
error.details.
"""

from datetime import date

from app.models.disciplinary import DisciplinaryRecord


def record_to_dict(record):
    """Serialize một biên bản kỷ luật, kèm thông tin nhân viên + người lập."""
    employee = getattr(record, "employee", None)
    department = getattr(employee, "department", None) if employee else None
    issuer = getattr(record, "issuer", None)
    return {
        "id": record.id,
        "employeeId": record.employee_id,
        "employeeCode": getattr(employee, "code", None) if employee else None,
        "employeeName": (
            getattr(employee, "full_name", None) if employee else None
        ),
        "departmentId": (
            getattr(employee, "department_id", None) if employee else None
        ),
        "departmentName": (
            getattr(department, "name", None) if department else None
        ),
        "type": record.type,
        "severity": record.severity,
        "title": record.title,
        "description": record.description,
        "actionTaken": record.action_taken,
        "issuedBy": record.issued_by,
        "issuedByName": getattr(issuer, "full_name", None) if issuer else None,
        "issuedDate": (
            record.issued_date.isoformat() if record.issued_date else None
        ),
        "status": record.status,
        "resolvedNote": record.resolved_note,
        "createdAt": (
            record.created_at.isoformat() if record.created_at else None
        ),
        "updatedAt": (
            record.updated_at.isoformat() if record.updated_at else None
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


def _optional_text(data, field, cleaned, errors, max_length=None):
    """Đọc một trường text tùy chọn: chuỗi, strip, rỗng -> None."""
    if field not in data or data[field] is None:
        return
    value = data[field]
    if not isinstance(value, str):
        errors.append({"field": field, "message": "Phải là chuỗi."})
        return
    value = value.strip()
    if max_length is not None and len(value) > max_length:
        errors.append(
            {"field": field, "message": f"Tối đa {max_length} ký tự."}
        )
        return
    cleaned[field] = value or None


def validate_create_payload(data):
    """Trả (cleaned_data, errors). Chỉ giữ các trường được phép ghi."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]

    cleaned = {}

    # employee_id — bắt buộc, số nguyên.
    employee_id = data.get("employee_id")
    if employee_id is None:
        errors.append(
            {"field": "employee_id", "message": "Trường này là bắt buộc."}
        )
    elif isinstance(employee_id, bool) or not isinstance(employee_id, int):
        errors.append(
            {"field": "employee_id", "message": "Phải là số nguyên."}
        )
    else:
        cleaned["employee_id"] = employee_id

    # type — bắt buộc, một trong 4 loại kỷ luật.
    record_type = data.get("type")
    if record_type not in DisciplinaryRecord.TYPES:
        errors.append(
            {
                "field": "type",
                "message": (
                    "type phải là verbal, written, final hoặc suspension."
                ),
            }
        )
    else:
        cleaned["type"] = record_type

    # severity — bắt buộc, một trong 3 mức độ.
    severity = data.get("severity")
    if severity not in DisciplinaryRecord.SEVERITIES:
        errors.append(
            {
                "field": "severity",
                "message": "severity phải là low, medium hoặc high.",
            }
        )
    else:
        cleaned["severity"] = severity

    # title — bắt buộc, không rỗng, tối đa 200 ký tự.
    if "title" not in data:
        errors.append({"field": "title", "message": "Trường này là bắt buộc."})
    elif not isinstance(data["title"], str) or not data["title"].strip():
        errors.append({"field": "title", "message": "Phải là chuỗi không rỗng."})
    elif len(data["title"].strip()) > 200:
        errors.append({"field": "title", "message": "Tối đa 200 ký tự."})
    else:
        cleaned["title"] = data["title"].strip()

    # description / action_taken — tùy chọn.
    _optional_text(data, "description", cleaned, errors)
    _optional_text(data, "action_taken", cleaned, errors)

    # issued_date — tùy chọn, mặc định hôm nay.
    if "issued_date" in data and data["issued_date"] is not None:
        parsed, error = _parse_date(data["issued_date"])
        if error:
            errors.append({"field": "issued_date", "message": error})
        else:
            cleaned["issued_date"] = parsed

    return cleaned, errors


def validate_resolve_payload(data):
    """Trả (cleaned_data, errors) cho giải quyết biên bản."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]

    cleaned = {}
    _optional_text(data, "resolved_note", cleaned, errors)
    return cleaned, errors
