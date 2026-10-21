"""Serializer + validator cho Gamification (theo khuôn module engagement).

Validator thủ công: mỗi hàm trả (cleaned, errors) với errors là list
{"field", "message"} để routes bọc thành VALIDATION_ERROR chuẩn.
"""

from app.models.gamification import PointsLedger, Redemption, Reward  # noqa: F401


# ---------------------------------------------------------------------------
# Serializer
# ---------------------------------------------------------------------------

def employee_brief(employee):
    if employee is None:
        return None
    department = getattr(employee, "department", None)
    return {
        "id": employee.id,
        "code": employee.code,
        "full_name": employee.full_name,
        "department_id": employee.department_id,
        "department_name": department.name if department else None,
    }


def ledger_to_dict(entry):
    return {
        "id": entry.id,
        "employee_id": entry.employee_id,
        "delta": entry.delta,
        "source_type": entry.source_type,
        "source_ref": entry.source_ref,
        "note": entry.note,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
    }


def reward_to_dict(reward, balance=None):
    in_stock = reward.stock is None or reward.stock > 0
    data = {
        "id": reward.id,
        "name": reward.name,
        "description": reward.description,
        "points_cost": reward.points_cost,
        "stock": reward.stock,
        "image_emoji": reward.image_emoji,
        "is_active": reward.is_active,
        "in_stock": in_stock,
        "created_at": reward.created_at.isoformat() if reward.created_at else None,
        "updated_at": reward.updated_at.isoformat() if reward.updated_at else None,
    }
    if balance is not None:
        data["affordable"] = bool(
            reward.is_active and in_stock and balance >= reward.points_cost
        )
    return data


def redemption_to_dict(redemption):
    reward = redemption.reward
    return {
        "id": redemption.id,
        "employee": employee_brief(redemption.employee),
        "employee_id": redemption.employee_id,
        "reward": (
            {
                "id": reward.id,
                "name": reward.name,
                "image_emoji": reward.image_emoji,
            }
            if reward is not None
            else None
        ),
        "reward_id": redemption.reward_id,
        "points_cost": redemption.points_cost,
        "status": redemption.status,
        "decided_by": redemption.decided_by,
        "decided_at": (
            redemption.decided_at.isoformat() if redemption.decided_at else None
        ),
        "note": redemption.note,
        "created_at": (
            redemption.created_at.isoformat() if redemption.created_at else None
        ),
    }


# ---------------------------------------------------------------------------
# Validator
# ---------------------------------------------------------------------------

def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _clean_text(data, field, errors, *, required=False, max_len=None):
    value = data.get(field)
    if value is None:
        if required:
            errors.append({"field": field, "message": "Trường này là bắt buộc."})
        return None
    if not isinstance(value, str):
        errors.append({"field": field, "message": "Phải là chuỗi ký tự."})
        return None
    value = value.strip()
    if required and not value:
        errors.append({"field": field, "message": "Không được để trống."})
        return None
    if max_len is not None and len(value) > max_len:
        errors.append(
            {"field": field, "message": f"Tối đa {max_len} ký tự."}
        )
        return None
    return value


def validate_reward_payload(data, *, partial=False):
    """Validate tạo (partial=False) / sửa (partial=True) quà tặng."""
    if not isinstance(data, dict):
        return None, [{"field": "body", "message": "Body phải là JSON object."}]
    errors = []
    cleaned = {}

    if not partial or "name" in data:
        name = _clean_text(data, "name", errors, required=not partial, max_len=200)
        if name is not None:
            cleaned["name"] = name

    if "description" in data:
        description = _clean_text(data, "description", errors, max_len=2000)
        cleaned["description"] = description

    if not partial or "points_cost" in data:
        cost = data.get("points_cost")
        if cost is None and not partial:
            errors.append(
                {"field": "points_cost", "message": "Trường này là bắt buộc."}
            )
        elif not _is_int(cost) or cost <= 0:
            errors.append(
                {
                    "field": "points_cost",
                    "message": "Giá điểm phải là số nguyên dương.",
                }
            )
        else:
            cleaned["points_cost"] = cost

    if "stock" in data:
        stock = data.get("stock")
        if stock is None:
            cleaned["stock"] = None  # không giới hạn
        elif not _is_int(stock) or stock < 0:
            errors.append(
                {
                    "field": "stock",
                    "message": "Tồn kho phải là số nguyên ≥ 0 hoặc để trống (không giới hạn).",
                }
            )
        else:
            cleaned["stock"] = stock

    if "image_emoji" in data:
        emoji = data.get("image_emoji")
        if not isinstance(emoji, str) or not emoji.strip() or len(emoji.strip()) > 10:
            errors.append(
                {
                    "field": "image_emoji",
                    "message": "Emoji hiển thị là 1 ký tự emoji ngắn.",
                }
            )
        else:
            cleaned["image_emoji"] = emoji.strip()

    if "is_active" in data:
        if not isinstance(data.get("is_active"), bool):
            errors.append(
                {"field": "is_active", "message": "Phải là true/false."}
            )
        else:
            cleaned["is_active"] = data["is_active"]

    if partial and not cleaned and not errors:
        errors.append(
            {"field": "body", "message": "Không có trường nào để cập nhật."}
        )
    return (cleaned if not errors else None), errors


def validate_redemption_payload(data):
    if not isinstance(data, dict):
        return None, [{"field": "body", "message": "Body phải là JSON object."}]
    errors = []
    reward_id = data.get("reward_id")
    if reward_id is None:
        errors.append({"field": "reward_id", "message": "Trường này là bắt buộc."})
    elif not _is_int(reward_id):
        errors.append({"field": "reward_id", "message": "Phải là số nguyên."})
    if errors:
        return None, errors
    return {"reward_id": reward_id}, []


def validate_decision_payload(data):
    if not isinstance(data, dict):
        return None, [{"field": "body", "message": "Body phải là JSON object."}]
    errors = []
    decision = data.get("decision")
    if decision not in ("approve", "reject"):
        errors.append(
            {
                "field": "decision",
                "message": 'Chỉ chấp nhận "approve" hoặc "reject".',
            }
        )
    note = _clean_text(data, "note", errors, max_len=255)
    if errors:
        return None, errors
    return {"decision": decision, "note": note}, []
