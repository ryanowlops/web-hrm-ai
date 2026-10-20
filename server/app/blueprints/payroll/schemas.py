"""Schema (serialize + validate) cho Payroll.

Serialize thủ công có getattr để chỉ lộ đúng trường cần thiết (không lộ
thông tin ngoài phiếu lương) và không phụ thuộc quan hệ ORM cụ thể.
Validate trả danh sách lỗi dạng [{"field": ..., "message": ...}] để
routes đóng vào error.details theo format lỗi chuẩn.
"""

from datetime import date, datetime


def _iso(value):
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def period_to_dict(period):
    return {
        "id": period.id,
        "month": period.month,
        "year": period.year,
        "standard_workdays": period.standard_workdays,
        "status": period.status,
        "locked_at": _iso(getattr(period, "locked_at", None)),
        "locked_by": getattr(period, "locked_by", None),
        "created_at": _iso(getattr(period, "created_at", None)),
        "updated_at": _iso(getattr(period, "updated_at", None)),
    }


def item_to_dict(item):
    """Serialize một dòng lương / phiếu lương (tiền là số nguyên VND)."""
    employee = getattr(item, "employee", None)
    period = getattr(item, "period", None)
    return {
        "id": item.id,
        "period_id": item.period_id,
        "period": (
            {"month": period.month, "year": period.year, "status": period.status}
            if period is not None
            else None
        ),
        "employee_id": item.employee_id,
        "employee_code": getattr(employee, "code", None) if employee else None,
        "employee_name": getattr(employee, "full_name", None) if employee else None,
        "workdays_paid": item.workdays_paid,
        "base_salary": item.base_salary,
        "allowance": item.allowance,
        "insurance_deduction": item.insurance_deduction,
        "other_deduction": item.other_deduction,
        "total_salary": item.total_salary,
        "breakdown": item.breakdown,
        "currency": "VND",
        "created_at": _iso(getattr(item, "created_at", None)),
        "updated_at": _iso(getattr(item, "updated_at", None)),
    }


def validate_create_period(data):
    """Validate body POST /payroll/periods. Trả danh sách lỗi (rỗng = hợp lệ)."""
    errors = []
    if not isinstance(data, dict):
        return [{"field": "body", "message": "Body phải là một JSON object."}]

    month = data.get("month")
    if month is None:
        errors.append({"field": "month", "message": "Thiếu tháng của kỳ lương."})
    elif isinstance(month, bool) or not isinstance(month, int) or not 1 <= month <= 12:
        errors.append({"field": "month", "message": "Tháng phải là số nguyên từ 1 đến 12."})

    year = data.get("year")
    if year is None:
        errors.append({"field": "year", "message": "Thiếu năm của kỳ lương."})
    elif isinstance(year, bool) or not isinstance(year, int) or not 2000 <= year <= 2100:
        errors.append({"field": "year", "message": "Năm phải là số nguyên từ 2000 đến 2100."})

    standard = data.get("standard_workdays")
    if standard is not None:
        if (
            isinstance(standard, bool)
            or not isinstance(standard, (int, float))
            or not 0 < float(standard) <= 31
        ):
            errors.append(
                {
                    "field": "standard_workdays",
                    "message": "Ngày công chuẩn phải là số lớn hơn 0 và không quá 31.",
                }
            )
    return errors
