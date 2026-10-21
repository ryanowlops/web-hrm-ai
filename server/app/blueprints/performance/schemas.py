"""Schemas — module Hieu suat / KPI-OKR (performance).

- Request schemas (Marshmallow): validate du lieu vao o routes.
- Ham serialize: model -> dict cho frontend, kem diem/tien do da tinh
  (cong thuc o services — schemas chi goi ham tinh, khong tu tinh lai).
"""

from marshmallow import Schema, fields, validate

from app.models.performance import PerformanceCycle


def _num(value):
    """Numeric (Decimal) -> float de JSON hoa; None giu nguyen."""
    return float(value) if value is not None else None


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class CreateCycleSchema(Schema):
    name = fields.Str(required=True, validate=validate.Length(min=1, max=120))
    start_date = fields.Date(required=True)
    end_date = fields.Date(required=True)


class CycleStatusSchema(Schema):
    status = fields.Str(
        required=True, validate=validate.OneOf(PerformanceCycle.STATUSES)
    )


class KeyResultInputSchema(Schema):
    title = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    unit = fields.Str(required=False, allow_none=True, validate=validate.Length(max=30))
    target_value = fields.Float(required=True)
    current_value = fields.Float(required=False, allow_none=True)
    weight = fields.Float(required=False, allow_none=True, validate=validate.Range(min=0))
    direction = fields.Str(
        required=False, validate=validate.OneOf(["increase", "decrease"])
    )


class CreateObjectiveSchema(Schema):
    cycle_id = fields.Int(required=True)
    employee_id = fields.Int(required=False, allow_none=True)
    department_id = fields.Int(required=False, allow_none=True)
    title = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    description = fields.Str(required=False, allow_none=True, validate=validate.Length(max=2000))
    weight = fields.Float(required=False, allow_none=True, validate=validate.Range(min=0))
    key_results = fields.List(
        fields.Nested(KeyResultInputSchema),
        required=False,
        validate=validate.Length(min=1, max=5),
    )


class UpdateObjectiveSchema(Schema):
    title = fields.Str(required=False, validate=validate.Length(min=1, max=200))
    description = fields.Str(required=False, allow_none=True, validate=validate.Length(max=2000))
    weight = fields.Float(required=False, allow_none=True, validate=validate.Range(min=0))
    key_results = fields.List(
        fields.Nested(KeyResultInputSchema),
        required=False,
        validate=validate.Length(min=1, max=5),
    )


class ReturnObjectiveSchema(Schema):
    # Ly do tra lai muc tieu (chi gui qua thong bao cho chu muc tieu,
    # khong luu DB — bang objectives khong co cot ghi chu theo tai lieu 4.3).
    note = fields.Str(required=False, allow_none=True, validate=validate.Length(max=1000))
    reason = fields.Str(required=False, allow_none=True, validate=validate.Length(max=1000))


class CheckinSchema(Schema):
    new_value = fields.Float(required=True)
    note = fields.Str(required=False, allow_none=True, validate=validate.Length(max=1000))


class CreateReviewSchema(Schema):
    cycle_id = fields.Int(required=True)
    employee_id = fields.Int(required=False, allow_none=True)
    review_type = fields.Str(
        required=True, validate=validate.OneOf(["self", "manager"])
    )
    score = fields.Float(
        required=False, allow_none=True, validate=validate.Range(min=0, max=100)
    )
    comment = fields.Str(required=False, allow_none=True, validate=validate.Length(max=2000))
    status = fields.Str(
        required=False, validate=validate.OneOf(["draft", "submitted"])
    )


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------

def _employee_name(employee):
    return getattr(employee, "full_name", None) if employee is not None else None


def cycle_to_dict(cycle):
    return {
        "id": cycle.id,
        "name": cycle.name,
        "start_date": cycle.start_date.isoformat() if cycle.start_date else None,
        "end_date": cycle.end_date.isoformat() if cycle.end_date else None,
        "status": cycle.status,
        "created_at": cycle.created_at.isoformat() if getattr(cycle, "created_at", None) else None,
        "updated_at": cycle.updated_at.isoformat() if getattr(cycle, "updated_at", None) else None,
    }


def key_result_to_dict(kr, progress=None):
    data = {
        "id": kr.id,
        "objective_id": kr.objective_id,
        "title": kr.title,
        "unit": kr.unit,
        "target_value": _num(kr.target_value),
        "current_value": _num(kr.current_value),
        "weight": _num(kr.weight),
        "direction": kr.direction,
    }
    if progress is not None:
        data["progress"] = round(progress, 4)
        data["progress_percent"] = round(progress * 100, 2)
    return data


def objective_to_dict(obj, score=None, key_result_progresses=None):
    """score: diem 0-100 do services tinh; key_result_progresses: {kr_id: progress 0..1}."""
    key_results = []
    for kr in getattr(obj, "key_results", []) or []:
        progress = None
        if key_result_progresses is not None:
            progress = key_result_progresses.get(kr.id)
        key_results.append(key_result_to_dict(kr, progress=progress))
    data = {
        "id": obj.id,
        "cycle_id": obj.cycle_id,
        "employee_id": obj.employee_id,
        "employee_name": _employee_name(getattr(obj, "employee", None)),
        "department_id": obj.department_id,
        "department_name": (
            obj.department.name
            if getattr(obj, "department", None) is not None
            else None
        ),
        "title": obj.title,
        "description": obj.description,
        "weight": _num(obj.weight),
        "status": obj.status,
        "created_by": obj.created_by,
        "creator_name": _employee_name(getattr(obj, "creator", None)),
        "key_results": key_results,
        "created_at": obj.created_at.isoformat() if getattr(obj, "created_at", None) else None,
        "updated_at": obj.updated_at.isoformat() if getattr(obj, "updated_at", None) else None,
    }
    if score is not None:
        data["score"] = round(score, 2)
        data["progress_percent"] = round(score, 2)
    return data


def checkin_to_dict(checkin):
    return {
        "id": checkin.id,
        "key_result_id": checkin.key_result_id,
        "author_id": checkin.author_id,
        "author_name": _employee_name(getattr(checkin, "author", None)),
        "old_value": _num(checkin.old_value),
        "new_value": _num(checkin.new_value),
        "note": checkin.note,
        "created_at": checkin.created_at.isoformat() if getattr(checkin, "created_at", None) else None,
    }


def review_to_dict(review):
    return {
        "id": review.id,
        "cycle_id": review.cycle_id,
        "employee_id": review.employee_id,
        "employee_name": _employee_name(getattr(review, "employee", None)),
        "reviewer_id": review.reviewer_id,
        "reviewer_name": _employee_name(getattr(review, "reviewer", None)),
        "review_type": review.review_type,
        "score": _num(review.score),
        "comment": review.comment,
        "status": review.status,
        "created_at": review.created_at.isoformat() if getattr(review, "created_at", None) else None,
        "updated_at": review.updated_at.isoformat() if getattr(review, "updated_at", None) else None,
    }
