"""Schema (serialize + validate) cho module Offboarding.

Serialize thu cong theo quy uoc cac module khac (onboarding):
- Process kem tien do % = so task is_done / tong task.
- Task tra kem ten nguoi tick (done_by_name) de frontend hien thi.
Validate tra (cleaned, errors) voi errors dang [{"field", "message"}].
"""

from datetime import date, datetime


def _iso(value):
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def process_progress(process):
    """(progress_percent, total_tasks, done_tasks)."""
    tasks = list(process.tasks or [])
    total = len(tasks)
    done = sum(1 for t in tasks if t.is_done)
    percent = round(done * 100 / total) if total else 0
    return percent, total, done


# ---------------------------------------------------------------------------
# Serialize
# ---------------------------------------------------------------------------

def task_to_dict(task):
    process = getattr(task, "process", None)
    done_by_user = getattr(task, "done_by_user", None)
    return {
        "id": task.id,
        "process_id": task.process_id,
        "process_employee_id": getattr(process, "employee_id", None),
        "title": task.title,
        "category": task.category,
        "assignee_role": task.assignee_role,
        "is_done": bool(task.is_done),
        "done_by": task.done_by,
        "done_by_name": getattr(done_by_user, "full_name", None)
        if done_by_user else None,
        "done_at": _iso(task.done_at),
        "note": task.note,
        "sort_order": task.sort_order,
        "created_at": _iso(getattr(task, "created_at", None)),
        "updated_at": _iso(getattr(task, "updated_at", None)),
    }


def process_to_dict(process, include_tasks=False):
    employee = getattr(process, "employee", None)
    initiator = getattr(process, "initiator", None)
    percent, total, done = process_progress(process)
    department = getattr(employee, "department", None) if employee else None
    position = getattr(employee, "position", None) if employee else None
    data = {
        "id": process.id,
        "employee_id": process.employee_id,
        "employee_name": getattr(employee, "full_name", None) if employee else None,
        "employee_code": getattr(employee, "code", None) if employee else None,
        "employee_email": getattr(employee, "email", None) if employee else None,
        "avatar_url": getattr(employee, "avatar_url", None) if employee else None,
        "department_id": getattr(employee, "department_id", None) if employee else None,
        "department_name": getattr(department, "name", None) if department else None,
        "position_title": getattr(position, "title", None) if position else None,
        "manager_id": getattr(employee, "manager_id", None) if employee else None,
        "last_working_day": _iso(process.last_working_day),
        "reason": process.reason,
        "status": process.status,
        "initiated_by": process.initiated_by,
        "initiated_by_name": getattr(initiator, "full_name", None)
        if initiator else None,
        "completed_at": _iso(process.completed_at),
        "progress_percent": percent,
        "total_tasks": total,
        "done_tasks": done,
        "created_at": _iso(getattr(process, "created_at", None)),
        "updated_at": _iso(getattr(process, "updated_at", None)),
    }
    if include_tasks:
        tasks = sorted(
            process.tasks or [],
            key=lambda t: (t.sort_order or 0, t.id or 0),
        )
        data["tasks"] = [task_to_dict(t) for t in tasks]
    return data


# ---------------------------------------------------------------------------
# Validate
# ---------------------------------------------------------------------------

def _validate_optional_int(data, field, errors):
    if field in data and data[field] is not None:
        value = data[field]
        if isinstance(value, bool) or not isinstance(value, int):
            errors.append({"field": field, "message": "Phải là số nguyên."})


def _parse_date(value):
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value.strip()[:10])
        except ValueError:
            return None
    return None


def validate_create_payload(data):
    """POST /offboarding: { employee_id, last_working_day, reason? }."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    if "employee_id" not in data or data["employee_id"] is None:
        errors.append({"field": "employee_id", "message": "Trường này là bắt buộc."})
    _validate_optional_int(data, "employee_id", errors)
    last_day = None
    if "last_working_day" not in data or data["last_working_day"] is None:
        errors.append({
            "field": "last_working_day", "message": "Trường này là bắt buộc."
        })
    else:
        last_day = _parse_date(data["last_working_day"])
        if last_day is None:
            errors.append({
                "field": "last_working_day",
                "message": "Ngày không hợp lệ (định dạng YYYY-MM-DD).",
            })
    reason = data.get("reason")
    if reason is not None:
        if not isinstance(reason, str):
            errors.append({"field": "reason", "message": "Phải là chuỗi."})
        elif len(reason.strip()) > 1000:
            errors.append({"field": "reason", "message": "Tối đa 1000 ký tự."})
    if errors:
        return {}, errors
    return {
        "employee_id": data["employee_id"],
        "last_working_day": last_day,
        "reason": (reason.strip() if isinstance(reason, str) and reason.strip() else None),
    }, []


def validate_task_update_payload(data):
    """PATCH /tasks/<id>: { is_done?, note? } — it nhat 1 truong."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    if "is_done" in data and data["is_done"] is not None \
            and not isinstance(data["is_done"], bool):
        errors.append({"field": "is_done", "message": "Phải là true/false."})
    if "note" in data and data["note"] is not None \
            and not isinstance(data["note"], str):
        errors.append({"field": "note", "message": "Phải là chuỗi."})
    cleaned = {}
    for field in ("is_done", "note"):
        if field in data:
            cleaned[field] = data[field]
    if not cleaned:
        errors.append({"field": "body", "message": "Không có trường nào để cập nhật."})
    return cleaned, errors
