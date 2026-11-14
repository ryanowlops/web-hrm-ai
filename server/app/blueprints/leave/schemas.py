"""Schemas — module Nghỉ phép (leave).

- Request schemas (Marshmallow): validate dữ liệu vào ở routes.
- Hàm serialize: chuyển model -> dict trả về cho frontend.
  Response không bao giờ chứa dữ liệu ngoài phạm vi module này.
"""

from datetime import date

from marshmallow import Schema, fields, validate

from app.models import LeaveCarryover


class CreateLeaveRequestSchema(Schema):
    leave_type_id = fields.Int(required=True)
    from_date = fields.Date(required=True)
    to_date = fields.Date(required=True)
    reason = fields.Str(
        required=True, validate=validate.Length(min=1, max=1000)
    )


class DecisionSchema(Schema):
    decision = fields.Str(
        required=True, validate=validate.OneOf(["approved", "rejected"])
    )
    note = fields.Str(required=False, allow_none=True, validate=validate.Length(max=1000))


def _employee_name(employee):
    return getattr(employee, "full_name", None) if employee is not None else None


def leave_type_to_dict(leave_type):
    return {
        "id": leave_type.id,
        "name": leave_type.name,
        "paid": bool(leave_type.paid),
        "annual_quota_days": leave_type.annual_quota_days,
    }


def _carried_summary(employee_id, leave_type_id, year):
    """Phép cộng dồn còn lại (chưa hết hạn tại hôm nay) + hạn gần nhất."""
    today = date.today()
    rows = (
        LeaveCarryover.query.filter_by(
            employee_id=employee_id,
            leave_type_id=leave_type_id,
            from_year=year - 1,
        )
        .filter(
            LeaveCarryover.expires_on >= today,
            LeaveCarryover.days_remaining > 0,
        )
        .all()
    )
    carried = sum((row.days_remaining or 0) for row in rows)
    expires = min((row.expires_on for row in rows), default=None)
    return carried, expires


def balance_to_dict(leave_type, balance):
    total = balance.total_days or 0
    used = balance.used_days or 0
    # remaining_days giữ nguyên nghĩa cũ (quota còn lại) để không vỡ
    # client/test cũ; phép cộng dồn hiện riêng ở 3 field dưới.
    carried, expires = _carried_summary(
        balance.employee_id, balance.leave_type_id, balance.year
    )
    return {
        "id": balance.id,
        "employee_id": balance.employee_id,
        "leave_type_id": balance.leave_type_id,
        "leave_type_name": leave_type.name if leave_type else None,
        "year": balance.year,
        "total_days": total,
        "used_days": used,
        "remaining_days": total - used,
        "carried_days": carried,
        "carried_expires_on": expires.isoformat() if expires else None,
        "available_days": (total - used) + carried,
    }


def _related_name(obj, relation, attr="name"):
    rel = getattr(obj, relation, None)
    return getattr(rel, attr, None) if rel is not None else None


def leave_request_to_dict(request):
    employee = getattr(request, "employee", None)
    return {
        "id": request.id,
        "employee_id": request.employee_id,
        "employee_name": _employee_name(employee),
        "leave_type_id": request.leave_type_id,
        "leave_type_name": _related_name(request, "leave_type"),
        "from_date": request.from_date.isoformat() if request.from_date else None,
        "to_date": request.to_date.isoformat() if request.to_date else None,
        "days_count": request.days_count,
        "reason": request.reason,
        "status": request.status,
        "manager_decision": getattr(request, "manager_decision", None),
        "manager_note": getattr(request, "manager_note", None),
        "hr_decision": getattr(request, "hr_decision", None),
        "hr_note": getattr(request, "hr_note", None),
        "decided_at": request.decided_at.isoformat() if getattr(request, "decided_at", None) else None,
        "created_at": request.created_at.isoformat() if getattr(request, "created_at", None) else None,
        "updated_at": request.updated_at.isoformat() if getattr(request, "updated_at", None) else None,
    }


def calendar_entry_to_dict(request):
    data = leave_request_to_dict(request)
    employee = getattr(request, "employee", None)
    data["department_id"] = (
        getattr(employee, "department_id", None) if employee is not None else None
    )
    return data
