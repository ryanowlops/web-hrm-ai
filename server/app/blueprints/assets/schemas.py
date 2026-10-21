"""Schema (serialize + validate) cho module Assets.

Serialize thủ công có kiểm tra getattr như các module khác. Validate trả
danh sách lỗi [{"field": ..., "message": ...}] để routes đóng vào
error.details. Ngày mua (purchase_date) lưu dạng date — nhận chuỗi
"YYYY-MM-DD" từ JSON.
"""

from datetime import date, datetime

from app.models.assets import Asset

ASSET_STATUSES = Asset.STATUSES


def _iso(value):
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def asset_to_dict(asset, active_assignment=None):
    """Serialize tài sản.

    active_assignment (AssetAssignment đang 'active' hoặc None) do service
    truyền vào để gắn thông tin người đang giữ, tránh N+1 ở routes.
    """
    holder = None
    if active_assignment is not None:
        employee = getattr(active_assignment, "employee", None)
        holder = {
            "assignment_id": active_assignment.id,
            "employee_id": active_assignment.employee_id,
            "employee_name": getattr(employee, "full_name", None)
            if employee
            else None,
            "employee_code": getattr(employee, "code", None) if employee else None,
            "assigned_at": _iso(getattr(active_assignment, "assigned_at", None)),
        }
    return {
        "id": asset.id,
        "code": asset.code,
        "name": asset.name,
        "category": getattr(asset, "category", None),
        "serial": getattr(asset, "serial", None),
        "status": asset.status,
        "purchase_date": _iso(getattr(asset, "purchase_date", None)),
        "notes": getattr(asset, "notes", None),
        "holder": holder,
        "created_at": _iso(getattr(asset, "created_at", None)),
        "updated_at": _iso(getattr(asset, "updated_at", None)),
    }


def assignment_to_dict(assignment):
    asset = getattr(assignment, "asset", None)
    employee = getattr(assignment, "employee", None)
    return {
        "id": assignment.id,
        "asset_id": assignment.asset_id,
        "asset_code": getattr(asset, "code", None) if asset else None,
        "asset_name": getattr(asset, "name", None) if asset else None,
        "employee_id": assignment.employee_id,
        "employee_name": getattr(employee, "full_name", None) if employee else None,
        "employee_code": getattr(employee, "code", None) if employee else None,
        "assigned_at": _iso(getattr(assignment, "assigned_at", None)),
        "returned_at": _iso(getattr(assignment, "returned_at", None)),
        "status": assignment.status,
        "note": getattr(assignment, "note", None),
        "created_at": _iso(getattr(assignment, "created_at", None)),
        "updated_at": _iso(getattr(assignment, "updated_at", None)),
    }


def my_asset_to_dict(assignment):
    """Một dòng 'tài sản của tôi': thông tin tài sản + lượt cấp phát của mình."""
    asset = getattr(assignment, "asset", None)
    data = asset_to_dict(asset) if asset is not None else {"id": assignment.asset_id}
    data["assignment_id"] = assignment.id
    data["assigned_at"] = _iso(getattr(assignment, "assigned_at", None))
    data["assignment_note"] = getattr(assignment, "note", None)
    return data


# ---------------------------------------------------------------------------
# Validate payload
# ---------------------------------------------------------------------------

def _validate_string(data, field, errors, *, required, max_len=255,
                     partial=False):
    if field not in data:
        if required and not partial:
            errors.append({"field": field, "message": "Trường này là bắt buộc."})
        return
    value = data[field]
    if value is None:
        if required:
            errors.append({"field": field, "message": "Trường này là bắt buộc."})
        return
    if not isinstance(value, str) or not value.strip():
        errors.append({"field": field, "message": "Phải là chuỗi không rỗng."})
        return
    if len(value.strip()) > max_len:
        errors.append({"field": field, "message": f"Tối đa {max_len} ký tự."})


def _validate_optional_text(data, field, errors):
    if field in data and data[field] is not None and not isinstance(data[field], str):
        errors.append({"field": field, "message": "Phải là chuỗi."})


def _parse_date(value):
    """'YYYY-MM-DD' -> date, không hợp lệ trả None."""
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.strptime(value.strip(), "%Y-%m-%d").date()
        except ValueError:
            return None
    return None


def validate_asset_payload(data, partial=False):
    """Trả (cleaned_data, errors). Chỉ giữ các trường được phép ghi."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    _validate_string(data, "code", errors, required=True, max_len=50,
                     partial=partial)
    _validate_string(data, "name", errors, required=True, max_len=200,
                     partial=partial)
    _validate_string(data, "category", errors, required=False, max_len=100,
                     partial=partial)
    _validate_string(data, "serial", errors, required=False, max_len=100,
                     partial=partial)
    _validate_optional_text(data, "notes", errors)

    if "status" in data and data["status"] is not None:
        if data["status"] not in ASSET_STATUSES:
            errors.append(
                {
                    "field": "status",
                    "message": "Trạng thái không hợp lệ "
                               f"({', '.join(ASSET_STATUSES)}).",
                }
            )

    purchase_date = None
    if "purchase_date" in data and data["purchase_date"] is not None:
        purchase_date = _parse_date(data["purchase_date"])
        if purchase_date is None:
            errors.append(
                {
                    "field": "purchase_date",
                    "message": "Ngày mua phải theo định dạng YYYY-MM-DD.",
                }
            )

    cleaned = {}
    for field in ("code", "name", "category", "serial", "notes"):
        if field in data:
            value = data[field]
            cleaned[field] = value.strip() if isinstance(value, str) else value
    if "status" in data and data["status"] is not None:
        cleaned["status"] = data["status"]
    if "purchase_date" in data:
        cleaned["purchase_date"] = purchase_date
    return cleaned, errors


def validate_assign_payload(data):
    """Payload cấp phát: {employee_id (bắt buộc), note?}."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    if "employee_id" not in data or data["employee_id"] is None:
        errors.append({"field": "employee_id", "message": "Trường này là bắt buộc."})
    else:
        value = data["employee_id"]
        if isinstance(value, bool) or not isinstance(value, int):
            errors.append({"field": "employee_id", "message": "Phải là số nguyên."})
    _validate_optional_text(data, "note", errors)
    cleaned = {}
    if "employee_id" in data:
        cleaned["employee_id"] = data["employee_id"]
    if "note" in data:
        note = data["note"]
        cleaned["note"] = note.strip() if isinstance(note, str) else note
    return cleaned, errors


def validate_return_payload(data):
    """Payload thu hồi: body có thể rỗng; note là tuỳ chọn."""
    errors = []
    if data is None:
        return {}, []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    _validate_optional_text(data, "note", errors)
    cleaned = {}
    if "note" in data:
        note = data["note"]
        cleaned["note"] = note.strip() if isinstance(note, str) else note
    return cleaned, errors
