"""Schema (serialize + validate) cho Employees & Contracts.

Ngày tháng nhận/trả theo ISO 8601 (YYYY-MM-DD). Tiền tệ là số nguyên VND.
Validate trả (cleaned_data, errors) với errors dạng
[{"field": ..., "message": ...}] để đóng vào error.details chuẩn.
"""

import re
from datetime import date, datetime

from app.blueprints.employees.services import CONTRACT_STATUSES, EMPLOYEE_STATUSES

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _iso(value):
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def employee_to_dict(employee):
    department = getattr(employee, "department", None)
    position = getattr(employee, "position", None)
    manager = getattr(employee, "manager", None)
    return {
        "id": employee.id,
        "code": getattr(employee, "code", None),
        "full_name": employee.full_name,
        "email": getattr(employee, "email", None),
        "phone": getattr(employee, "phone", None),
        "date_of_birth": _iso(getattr(employee, "date_of_birth", None)),
        "gender": getattr(employee, "gender", None),
        "address": getattr(employee, "address", None),
        "department_id": getattr(employee, "department_id", None),
        "department_name": getattr(department, "name", None)
        if department else None,
        "position_id": getattr(employee, "position_id", None),
        "position_title": getattr(position, "title", None)
        if position else None,
        "manager_id": getattr(employee, "manager_id", None),
        "manager_name": getattr(manager, "full_name", None)
        if manager else None,
        "start_date": _iso(getattr(employee, "start_date", None)),
        "status": getattr(employee, "status", None),
        "avatar_url": getattr(employee, "avatar_url", None),
        "created_at": _iso(getattr(employee, "created_at", None)),
        "updated_at": _iso(getattr(employee, "updated_at", None)),
    }


def contract_to_dict(contract, days_until_expiry=None, is_expiring_soon=False):
    return {
        "id": contract.id,
        "employee_id": getattr(contract, "employee_id", None),
        "contract_type": getattr(contract, "contract_type", None),
        "start_date": _iso(getattr(contract, "start_date", None)),
        "end_date": _iso(getattr(contract, "end_date", None)),
        "base_salary": getattr(contract, "base_salary", None),
        "allowance": getattr(contract, "allowance", None),
        "status": getattr(contract, "status", None),
        "days_until_expiry": days_until_expiry,
        "is_expiring_soon": is_expiring_soon,
        "created_at": _iso(getattr(contract, "created_at", None)),
        "updated_at": _iso(getattr(contract, "updated_at", None)),
    }


# ---------------------------------------------------------------------------
# Validate
# ---------------------------------------------------------------------------

def _parse_date(value):
    """Parse 'YYYY-MM-DD' -> date, lỗi trả None kèm flag."""
    if value is None:
        return None, True
    if isinstance(value, date) and not isinstance(value, datetime):
        return value, True
    if isinstance(value, str):
        try:
            return date.fromisoformat(value.strip()), True
        except ValueError:
            return None, False
    return None, False


def _check_int(data, field, errors, *, required=False, partial=False,
               min_value=None):
    if field not in data:
        if required and not partial:
            errors.append({"field": field, "message": "Trường này là bắt buộc."})
        return
    value = data[field]
    if value is None:
        if required and not partial:
            errors.append({"field": field, "message": "Trường này là bắt buộc."})
        return
    if isinstance(value, bool) or not isinstance(value, int):
        errors.append({"field": field, "message": "Phải là số nguyên."})
        return
    if min_value is not None and value < min_value:
        errors.append(
            {"field": field, "message": f"Phải lớn hơn hoặc bằng {min_value}."}
        )


def validate_employee_payload(data, partial=False):
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]

    # full_name: bắt buộc khi tạo mới
    if "full_name" not in data:
        if not partial:
            errors.append(
                {"field": "full_name", "message": "Trường này là bắt buộc."}
            )
    elif not isinstance(data["full_name"], str) or not data["full_name"].strip():
        errors.append(
            {"field": "full_name", "message": "Phải là chuỗi không rỗng."}
        )

    if "code" in data and data["code"] is not None:
        if not isinstance(data["code"], str) or not data["code"].strip():
            errors.append({"field": "code", "message": "Phải là chuỗi không rỗng."})

    # email: bắt buộc khi tạo mới (cột NOT NULL + unique trong model)
    if "email" not in data or data["email"] is None:
        if not partial:
            errors.append(
                {"field": "email", "message": "Trường này là bắt buộc."}
            )
    elif not isinstance(data["email"], str) or not EMAIL_RE.match(data["email"]):
        errors.append({"field": "email", "message": "Email không đúng định dạng."})

    for field in ("department_id", "position_id", "manager_id"):
        _check_int(data, field, errors)

    if "status" in data and data["status"] is not None:
        if data["status"] not in EMPLOYEE_STATUSES:
            errors.append({
                "field": "status",
                "message": "Trạng thái phải thuộc: " + ", ".join(EMPLOYEE_STATUSES),
            })

    cleaned = {}
    for field in ("code", "full_name", "email", "phone", "gender", "address",
                  "avatar_url"):
        if field in data:
            value = data[field]
            cleaned[field] = value.strip() if isinstance(value, str) else value
    for field in ("department_id", "position_id", "manager_id", "status"):
        if field in data:
            cleaned[field] = data[field]
    for field in ("date_of_birth", "start_date"):
        if field in data:
            parsed, ok = _parse_date(data[field])
            if not ok:
                errors.append({
                    "field": field,
                    "message": "Ngày không đúng định dạng YYYY-MM-DD.",
                })
            else:
                cleaned[field] = parsed
    return cleaned, errors


def validate_contract_payload(data, partial=False):
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]

    if "contract_type" not in data:
        if not partial:
            errors.append(
                {"field": "contract_type", "message": "Trường này là bắt buộc."}
            )
    elif not isinstance(data["contract_type"], str) \
            or not data["contract_type"].strip():
        errors.append(
            {"field": "contract_type", "message": "Phải là chuỗi không rỗng."}
        )

    cleaned = {}
    if "contract_type" in data:
        value = data["contract_type"]
        cleaned["contract_type"] = value.strip() if isinstance(value, str) else value

    start_date = end_date = None
    for field in ("start_date", "end_date"):
        if field in data:
            parsed, ok = _parse_date(data[field])
            if not ok:
                errors.append({
                    "field": field,
                    "message": "Ngày không đúng định dạng YYYY-MM-DD.",
                })
            else:
                cleaned[field] = parsed
                if field == "start_date":
                    start_date = parsed
                else:
                    end_date = parsed
        elif field == "start_date" and not partial:
            errors.append(
                {"field": "start_date", "message": "Trường này là bắt buộc."}
            )
    if start_date and end_date and end_date < start_date:
        errors.append({
            "field": "end_date",
            "message": "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.",
        })

    _check_int(data, "base_salary", errors, required=True, partial=partial,
               min_value=0)
    _check_int(data, "allowance", errors, min_value=0)
    for field in ("base_salary", "allowance"):
        if field in data:
            cleaned[field] = data[field]

    if "status" in data and data["status"] is not None:
        if data["status"] not in CONTRACT_STATUSES:
            errors.append({
                "field": "status",
                "message": "Trạng thái phải thuộc: " + ", ".join(CONTRACT_STATUSES),
            })
        else:
            cleaned["status"] = data["status"]
    return cleaned, errors
