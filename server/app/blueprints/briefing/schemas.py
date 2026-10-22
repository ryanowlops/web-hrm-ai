"""Validate input + serialize Briefing (v6 mục 4.2).

Lỗi validate ném ApiError chuẩn của app.errors (envelope
{"error": {"code", "message", "details"}} do handler tập trung xử lý).
"""

from datetime import date, datetime

from app.errors import ApiError
from app.models.briefing import Briefing


def parse_generate_body(body) -> tuple[str, date]:
    """Đọc {period, ref_date?} → (period, ref_date); 400 nếu không hợp lệ.

    ref_date vắng mặt → hôm nay theo ICT (services.today_ict()).
    """
    from app.blueprints.briefing.services import today_ict

    if body is None:
        body = {}
    if not isinstance(body, dict):
        raise ApiError(
            400, "VALIDATION_ERROR", "Body phải là JSON object.",
            [{"field": "body", "message": "Phải là JSON object."}],
        )
    period = body.get("period")
    if period not in Briefing.PERIODS:
        raise ApiError(
            400, "VALIDATION_ERROR", "Kỳ báo cáo không hợp lệ.",
            [{"field": "period", "message": "Chỉ nhận 'week' hoặc 'month'."}],
        )
    raw_ref = body.get("ref_date")
    if raw_ref is None or raw_ref == "":
        return period, today_ict()
    try:
        ref_date = datetime.strptime(str(raw_ref), "%Y-%m-%d").date()
    except (TypeError, ValueError):
        raise ApiError(
            400, "VALIDATION_ERROR", "Ngày neo kỳ báo cáo không hợp lệ.",
            [{"field": "ref_date", "message": "Định dạng phải là YYYY-MM-DD."}],
        )
    return period, ref_date


def parse_period_arg(raw, *, required: bool) -> str | None:
    """Đọc tham số ?period= cho latest/history; 400 nếu có mà sai giá trị."""
    if raw is None or raw == "":
        if required:
            raise ApiError(
                400, "VALIDATION_ERROR", "Thiếu tham số period.",
                [{"field": "period", "message": "Chỉ nhận 'week' hoặc 'month'."}],
            )
        return None
    if raw not in Briefing.PERIODS:
        raise ApiError(
            400, "VALIDATION_ERROR", "Kỳ báo cáo không hợp lệ.",
            [{"field": "period", "message": "Chỉ nhận 'week' hoặc 'month'."}],
        )
    return raw


def parse_limit_arg(raw, default: int = 20, maximum: int = 100) -> int:
    if raw is None or raw == "":
        return default
    try:
        limit = int(raw)
    except (TypeError, ValueError):
        raise ApiError(
            400, "VALIDATION_ERROR", "Tham số limit không hợp lệ.",
            [{"field": "limit", "message": "Phải là số nguyên."}],
        )
    return max(1, min(limit, maximum))


def briefing_to_dict(briefing: Briefing) -> dict:
    numbers = briefing.numbers or {}
    return {
        "id": briefing.id,
        "period": briefing.period,
        "ref_date": briefing.ref_date.isoformat() if briefing.ref_date else None,
        "period_start": numbers.get("period_start"),
        "period_end": numbers.get("period_end"),
        "numbers": numbers,
        "prose": briefing.prose,
        "source": briefing.source,
        "created_by": briefing.created_by,
        "created_by_name": (
            briefing.creator.employee.full_name
            if briefing.creator is not None and briefing.creator.employee is not None
            else None
        ),
        "created_at": (
            briefing.created_at.isoformat() if briefing.created_at else None
        ),
    }
