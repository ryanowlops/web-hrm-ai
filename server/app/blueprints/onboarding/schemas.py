"""Schema (serialize + validate) cho module Onboarding.

Serialize thu cong theo quy uoc cac module khac (departments/employees):
- Trang thai task tra ve la trang thai HIEN THI (effective): task chua
  xong ma da qua due_date se bao "overdue" du DB van luu "pending".
- Moi task kem truong `stage` (before/first_day/first_week) de frontend
  gom nhom theo giai doan ma khong phai tu tinh lai.
Validate tra (cleaned, errors) voi errors dang [{"field", "message"}].
"""

from datetime import date, datetime

from app.models.onboarding import (
    OnboardingTask,
    OnboardingTemplateTask,
)

DONE_STATUSES = OnboardingTask.DONE_STATUSES


def _iso(value):
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def effective_status(task):
    """Trang thai hien thi: qua han neu chua xong va da qua due_date."""
    if task.status in DONE_STATUSES or task.status == OnboardingTask.STATUS_SKIPPED:
        return task.status
    if task.due_date is not None and task.due_date < date.today():
        return OnboardingTask.STATUS_OVERDUE
    return task.status


def is_overdue(task):
    return effective_status(task) == OnboardingTask.STATUS_OVERDUE


def stage_of(task, plan):
    """Giai doan theo due_date so voi ngay bat dau cua plan."""
    if task.due_date is None or plan is None or plan.start_date is None:
        return "first_week"
    offset = (task.due_date - plan.start_date).days
    if offset < 0:
        return "before"
    if offset == 0:
        return "first_day"
    return "first_week"


def plan_progress(plan):
    """(progress_percent, total_tasks, done_tasks, overdue_tasks)."""
    tasks = list(plan.tasks or [])
    counted = [t for t in tasks if t.status != OnboardingTask.STATUS_SKIPPED]
    done = [t for t in counted if t.status in DONE_STATUSES]
    overdue = [t for t in tasks if is_overdue(t)]
    total = len(counted)
    percent = round(len(done) * 100 / total) if total else 0
    return percent, total, len(done), len(overdue)


# ---------------------------------------------------------------------------
# Serialize
# ---------------------------------------------------------------------------

def template_task_to_dict(task):
    return {
        "id": task.id,
        "template_id": task.template_id,
        "title": task.title,
        "description": task.description,
        "assignee_role": task.assignee_role,
        "due_offset_days": task.due_offset_days,
        "task_type": task.task_type,
        "sort_order": task.sort_order,
    }


def template_to_dict(template, include_tasks=True):
    department = getattr(template, "department", None)
    position = getattr(template, "position", None)
    data = {
        "id": template.id,
        "name": template.name,
        "department_id": template.department_id,
        "department_name": getattr(department, "name", None) if department else None,
        "position_id": template.position_id,
        "position_title": getattr(position, "title", None) if position else None,
        "is_active": bool(template.is_active),
        "created_at": _iso(getattr(template, "created_at", None)),
        "updated_at": _iso(getattr(template, "updated_at", None)),
    }
    if include_tasks:
        tasks = sorted(
            template.tasks or [],
            key=lambda t: (t.sort_order or 0, t.id or 0),
        )
        data["tasks"] = [template_task_to_dict(t) for t in tasks]
    return data


def task_to_dict(task):
    plan = getattr(task, "plan", None)
    assignee = getattr(task, "assignee", None)
    completer = getattr(task, "completer", None)
    plan_employee = getattr(plan, "employee", None) if plan else None
    return {
        "id": task.id,
        "plan_id": task.plan_id,
        "plan_employee_id": getattr(plan, "employee_id", None),
        "plan_employee_name": getattr(plan_employee, "full_name", None)
        if plan_employee else None,
        "title": task.title,
        "description": task.description,
        "assignee_id": task.assignee_id,
        "assignee_name": getattr(assignee, "full_name", None) if assignee else None,
        "assignee_role": task.assignee_role,
        "due_date": _iso(task.due_date),
        "task_type": task.task_type,
        "status": effective_status(task),
        "stored_status": task.status,
        "is_overdue": is_overdue(task),
        "stage": stage_of(task, plan),
        "completed_at": _iso(task.completed_at),
        "completed_by": task.completed_by,
        "completed_by_name": getattr(completer, "full_name", None) if completer else None,
        "note": task.note,
        "created_at": _iso(getattr(task, "created_at", None)),
        "updated_at": _iso(getattr(task, "updated_at", None)),
    }


def plan_to_dict(plan, include_tasks=False):
    employee = getattr(plan, "employee", None)
    template = getattr(plan, "template", None)
    percent, total, done, overdue = plan_progress(plan)
    department = getattr(employee, "department", None) if employee else None
    position = getattr(employee, "position", None) if employee else None
    data = {
        "id": plan.id,
        "employee_id": plan.employee_id,
        "employee_name": getattr(employee, "full_name", None) if employee else None,
        "employee_code": getattr(employee, "code", None) if employee else None,
        "employee_email": getattr(employee, "email", None) if employee else None,
        "avatar_url": getattr(employee, "avatar_url", None) if employee else None,
        "department_id": getattr(employee, "department_id", None) if employee else None,
        "department_name": getattr(department, "name", None) if department else None,
        "position_title": getattr(position, "title", None) if position else None,
        "manager_id": getattr(employee, "manager_id", None) if employee else None,
        "template_id": plan.template_id,
        "template_name": getattr(template, "name", None) if template else None,
        "start_date": _iso(plan.start_date),
        "status": plan.status,
        "progress_percent": percent,
        "total_tasks": total,
        "done_tasks": done,
        "overdue_tasks": overdue,
        "created_at": _iso(getattr(plan, "created_at", None)),
        "updated_at": _iso(getattr(plan, "updated_at", None)),
    }
    if include_tasks:
        tasks = sorted(
            plan.tasks or [],
            key=lambda t: (t.due_date or date.max, t.id or 0),
        )
        data["tasks"] = [task_to_dict(t) for t in tasks]
    return data


# ---------------------------------------------------------------------------
# Validate
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


def _validate_optional_int(data, field, errors):
    if field in data and data[field] is not None:
        value = data[field]
        if isinstance(value, bool) or not isinstance(value, int):
            errors.append({"field": field, "message": "Phải là số nguyên."})


def validate_template_task_payload(item, index):
    errors = []
    prefix = f"tasks[{index}]"
    if not isinstance(item, dict):
        return {}, [{"field": prefix, "message": "Đầu việc phải là object."}]
    _validate_string(item, "title", errors, required=True, max_len=255)
    errors = [{**e, "field": f"{prefix}.{e['field']}"} for e in errors]
    if "assignee_role" in item and item["assignee_role"] is not None:
        if item["assignee_role"] not in OnboardingTemplateTask.ASSIGNEE_ROLES:
            errors.append({
                "field": f"{prefix}.assignee_role",
                "message": "Vai trò phụ trách không hợp lệ.",
            })
    if "task_type" in item and item["task_type"] is not None:
        if item["task_type"] not in OnboardingTemplateTask.TASK_TYPES:
            errors.append({
                "field": f"{prefix}.task_type",
                "message": "Loại đầu việc không hợp lệ.",
            })
    for field in ("due_offset_days", "sort_order"):
        if field in item and item[field] is not None:
            value = item[field]
            if isinstance(value, bool) or not isinstance(value, int):
                errors.append({"field": f"{prefix}.{field}", "message": "Phải là số nguyên."})
    if errors:
        return {}, errors
    return {
        "title": item["title"].strip(),
        "description": (item.get("description") or None),
        "assignee_role": item.get("assignee_role") or OnboardingTemplateTask.ROLE_EMPLOYEE,
        "due_offset_days": item.get("due_offset_days") or 0,
        "task_type": item.get("task_type") or OnboardingTemplateTask.TYPE_TASK,
        "sort_order": item.get("sort_order") or 0,
    }, []


def validate_template_payload(data, partial=False):
    """Trả (cleaned, errors) cho POST/PATCH template (tasks la danh sach day du)."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    _validate_string(data, "name", errors, required=True, max_len=200, partial=partial)
    _validate_optional_int(data, "department_id", errors)
    _validate_optional_int(data, "position_id", errors)
    if "is_active" in data and data["is_active"] is not None \
            and not isinstance(data["is_active"], bool):
        errors.append({"field": "is_active", "message": "Phải là true/false."})
    cleaned = {}
    for field in ("name", "department_id", "position_id", "is_active"):
        if field in data:
            value = data[field]
            cleaned[field] = value.strip() if isinstance(value, str) else value
    if "tasks" in data and data["tasks"] is not None:
        if not isinstance(data["tasks"], list):
            errors.append({"field": "tasks", "message": "Phải là danh sách đầu việc."})
        else:
            cleaned_tasks = []
            for index, item in enumerate(data["tasks"]):
                cleaned_task, task_errors = validate_template_task_payload(item, index)
                errors.extend(task_errors)
                if cleaned_task:
                    cleaned_tasks.append(cleaned_task)
            if not errors:
                cleaned["tasks"] = cleaned_tasks
    return cleaned, errors


def validate_plan_payload(data):
    """POST /plans: { employee_id (bat buoc), template_id (tuy chon) }."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    if "employee_id" not in data or data["employee_id"] is None:
        errors.append({"field": "employee_id", "message": "Trường này là bắt buộc."})
    _validate_optional_int(data, "employee_id", errors)
    _validate_optional_int(data, "template_id", errors)
    cleaned = {}
    for field in ("employee_id", "template_id"):
        if field in data:
            cleaned[field] = data[field]
    return cleaned, errors


def validate_task_update_payload(data):
    """PATCH /tasks/<id>: { status?, note?, assignee_id? }."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    if "status" in data and data["status"] is not None:
        if data["status"] not in OnboardingTask.SETTABLE_STATUSES:
            errors.append({
                "field": "status",
                "message": "Trạng thái không hợp lệ (chỉ đặt được: "
                           + ", ".join(OnboardingTask.SETTABLE_STATUSES) + ").",
            })
    if "note" in data and data["note"] is not None \
            and not isinstance(data["note"], str):
        errors.append({"field": "note", "message": "Phải là chuỗi."})
    _validate_optional_int(data, "assignee_id", errors)
    cleaned = {}
    for field in ("status", "note", "assignee_id"):
        if field in data:
            cleaned[field] = data[field]
    if not cleaned:
        errors.append({"field": "body", "message": "Không có trường nào để cập nhật."})
    return cleaned, errors
