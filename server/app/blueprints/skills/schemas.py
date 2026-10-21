"""Schema (serialize + validate) cho module Skills.

Serialize thủ công theo quy ước các module hiện có. Validate trả
(cleaned_data, errors) với errors dạng [{"field", "message"}] để routes
đóng vào envelope {"error": {"code", "message", "details"}}.
"""

from datetime import date, datetime

from app.models.skill import Skill


def _iso(value):
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def skill_to_dict(skill, holder_count=None):
    data = {
        "id": skill.id,
        "name": skill.name,
        "category": getattr(skill, "category", None),
        "description": getattr(skill, "description", None),
        "created_at": _iso(getattr(skill, "created_at", None)),
        "updated_at": _iso(getattr(skill, "updated_at", None)),
    }
    if holder_count is not None:
        data["holder_count"] = holder_count
    return data


def employee_skill_to_dict(row, skill=None):
    skill = skill or getattr(row, "skill", None)
    return {
        "id": row.id,
        "employee_id": row.employee_id,
        "skill_id": row.skill_id,
        "skill_name": getattr(skill, "name", None) if skill else None,
        "category": getattr(skill, "category", None) if skill else None,
        "level": row.level,
        "updated_at": _iso(getattr(row, "updated_at", None)),
    }


def employee_brief(employee):
    department = getattr(employee, "department", None)
    position = getattr(employee, "position", None)
    return {
        "id": employee.id,
        "code": employee.code,
        "full_name": employee.full_name,
        "department_id": getattr(employee, "department_id", None),
        "department_name": getattr(department, "name", None) if department else None,
        "position_id": getattr(employee, "position_id", None),
        "position_name": getattr(position, "title", None) if position else None,
    }


# ---------------------------------------------------------------------------
# Validate payloads
# ---------------------------------------------------------------------------

def validate_skill_payload(data, partial=False):
    """Body {name, category?, description?}."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    if "name" in data or not partial:
        value = data.get("name")
        if not isinstance(value, str) or not value.strip():
            errors.append({"field": "name", "message": "Tên kỹ năng là bắt buộc."})
        elif len(value.strip()) > 120:
            errors.append({"field": "name", "message": "Tối đa 120 ký tự."})
    if "category" in data and data["category"] is not None:
        if data["category"] not in Skill.CATEGORIES:
            errors.append({
                "field": "category",
                "message": "Nhóm kỹ năng không hợp lệ ("
                           + " / ".join(Skill.CATEGORIES) + ").",
            })
    if "description" in data and data["description"] is not None:
        if not isinstance(data["description"], str):
            errors.append({"field": "description", "message": "Phải là chuỗi."})
        elif len(data["description"]) > 5000:
            errors.append({"field": "description", "message": "Tối đa 5000 ký tự."})
    if errors:
        return {}, errors
    cleaned = {}
    if "name" in data:
        cleaned["name"] = data["name"].strip()
    if "category" in data:
        cleaned["category"] = data["category"]
    if "description" in data:
        value = data["description"]
        cleaned["description"] = value.strip() if isinstance(value, str) else value
    return cleaned, errors


def validate_levels_payload(data):
    """Body {items: [{skill_id: int, level: int 1..5}, ...]} — không rỗng."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    items = data.get("items")
    if not isinstance(items, list) or not items:
        errors.append({
            "field": "items",
            "message": "Phải là danh sách {skill_id, level} không rỗng.",
        })
        return {}, errors
    cleaned_by_skill = {}
    for item in items:
        if not isinstance(item, dict):
            errors.append({"field": "items", "message": "Mỗi mục phải là object."})
            return {}, errors
        skill_id = item.get("skill_id")
        level = item.get("level")
        if isinstance(skill_id, bool) or not isinstance(skill_id, int):
            errors.append({"field": "skill_id", "message": "skill_id phải là số nguyên."})
            return {}, errors
        if isinstance(level, bool) or not isinstance(level, int):
            errors.append({"field": "level", "message": "level phải là số nguyên 1–5."})
            return {}, errors
        if level < 1 or level > 5:
            errors.append({"field": "level", "message": "level phải trong khoảng 1–5."})
            return {}, errors
        # Trùng skill_id trong 1 payload: giữ giá trị cuối.
        cleaned_by_skill[skill_id] = {"skill_id": skill_id, "level": level}
    return {"items": list(cleaned_by_skill.values())}, errors
