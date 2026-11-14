"""Schema (serialize + validate) cho Đổi ca làm việc.

Serialize theo quy ước camelCase của các module mới (xem probation,
holidays): frontend nhận date dạng ISO "YYYY-MM-DD". Validate trả danh
sách lỗi dạng [{"field": ..., "message": ...}] để routes đóng vào
error.details.
"""

from datetime import date

from app.models.shift_swap import ShiftSwapRequest


def _employee_name(employee):
    return getattr(employee, "full_name", None) if employee else None


def _employee_code(employee):
    return getattr(employee, "code", None) if employee else None


def _employee_department(employee):
    if not employee:
        return None
    department = getattr(employee, "department", None)
    return getattr(department, "name", None) if department else None


def swap_to_dict(swap):
    decider = getattr(swap, "decider", None)
    return {
        "id": swap.id,
        "requesterId": swap.requester_id,
        "requesterName": _employee_name(swap.requester),
        "requesterCode": _employee_code(swap.requester),
        "requesterDepartment": _employee_department(swap.requester),
        "targetId": swap.target_id,
        "targetName": _employee_name(swap.target),
        "targetCode": _employee_code(swap.target),
        "targetDepartment": _employee_department(swap.target),
        "workDate": swap.work_date.isoformat() if swap.work_date else None,
        "status": swap.status,
        "note": swap.note,
        "decidedBy": swap.decided_by,
        "decidedByName": getattr(decider, "full_name", None)
        if decider
        else None,
        "createdAt": (
            swap.created_at.isoformat() if swap.created_at else None
        ),
        "updatedAt": (
            swap.updated_at.isoformat() if swap.updated_at else None
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


def _validate_note(data, cleaned, errors):
    """Ghi chú — tùy chọn, phải là chuỗi nếu có."""
    if "note" in data and data["note"] is not None:
        if not isinstance(data["note"], str):
            errors.append({"field": "note", "message": "Phải là chuỗi."})
        else:
            cleaned["note"] = data["note"].strip() or None


def validate_create_payload(data):
    """Trả (cleaned_data, errors). Chỉ giữ các trường được phép ghi."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]

    cleaned = {}

    # target_id — bắt buộc, số nguyên (id nhân viên được chọn đổi ca).
    target_id = data.get("target_id")
    if target_id is None:
        errors.append(
            {"field": "target_id", "message": "Trường này là bắt buộc."}
        )
    elif isinstance(target_id, bool) or not isinstance(target_id, int):
        errors.append(
            {"field": "target_id", "message": "target_id phải là số nguyên."}
        )
    else:
        cleaned["target_id"] = target_id

    # work_date — bắt buộc, ngày thật theo lịch (2026-02-30 -> lỗi).
    if "work_date" not in data:
        errors.append(
            {"field": "work_date", "message": "Trường này là bắt buộc."}
        )
    else:
        parsed, error = _parse_date(data["work_date"])
        if error:
            errors.append({"field": "work_date", "message": error})
        else:
            cleaned["work_date"] = parsed

    _validate_note(data, cleaned, errors)

    return cleaned, errors


def validate_decision_payload(data):
    """Trả (cleaned_data, errors) cho approve/reject — chỉ ghi chú tùy chọn.

    Ghi chú khi từ chối chỉ dùng để hiển thị/xác nhận phía client, không
    ghi đè ghi chú của người tạo đơn (model chỉ có một cột note).
    """
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]

    cleaned = {}
    _validate_note(data, cleaned, errors)
    return cleaned, errors


def validate_status_filter(value):
    """Trả True khi ?status= hợp lệ (rỗng hoặc một trạng thái đã biết)."""
    if value is None or value == "":
        return True
    return value in ShiftSwapRequest.STATUSES
