"""Service layer cho module Holidays (lịch nghỉ lễ).

Chứa toàn bộ logic nghiệp vụ + transaction. Routes chỉ validate input,
gọi service và trả JSON. Lỗi nghiệp vụ ném ra dưới dạng ApiError
(app.errors) để error handler toàn cục chuyển thành định dạng lỗi chuẩn:
    {"error": {"code": ..., "message": ..., "details": [...]}}.
"""

from sqlalchemy.exc import IntegrityError

from app.errors import ApiError
from app.extensions import db
from app.models import Holiday


def parse_pagination(args):
    """Đọc page/limit từ query string, kẹp trong giới hạn cho phép."""
    try:
        page = int(args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    try:
        limit = int(args.get("limit", 20))
    except (TypeError, ValueError):
        limit = 20
    page = max(page, 1)
    limit = min(max(limit, 1), 100)
    return page, limit


def paginate(query, page, limit):
    """Phân trang một query SQLAlchemy, trả (items, meta) đúng quy ước."""
    total = query.count()
    total_pages = (total + limit - 1) // limit if total else 0
    items = query.offset((page - 1) * limit).limit(limit).all()
    meta = {
        "page": page,
        "limit": limit,
        "totalItems": total,
        "totalPages": total_pages,
    }
    return items, meta


def list_holidays(args):
    """Danh sách ngày lễ, sắp xếp theo ngày tăng dần.

    Lọc theo năm qua ?year=YYYY. year không phải số nguyên -> 400.
    """
    query = Holiday.query
    year = args.get("year")
    if year:
        try:
            year_int = int(year)
        except (TypeError, ValueError):
            raise ApiError(
                400, "VALIDATION_ERROR", "year phải là số nguyên.",
                details=[{"field": "year", "message": "Phải là số nguyên."}],
            )
        query = query.filter(db.extract("year", Holiday.date) == year_int)
    query = query.order_by(Holiday.date.asc())
    page, limit = parse_pagination(args)
    return paginate(query, page, limit)


def get_holiday(holiday_id):
    holiday = db.session.get(Holiday, holiday_id)
    if holiday is None:
        raise ApiError(404, "HOLIDAY_NOT_FOUND", "Không tìm thấy ngày lễ.")
    return holiday


def create_holiday(data, created_by=None):
    """Thêm ngày lễ. Một ngày chỉ có thể là một ngày lễ (trùng -> 409)."""
    if Holiday.query.filter_by(date=data["date"]).first() is not None:
        raise ApiError(
            409, "HOLIDAY_DATE_EXISTS", "Ngày này đã là ngày lễ.",
            details=[{"field": "date", "message": "Ngày lễ đã tồn tại."}],
        )
    holiday = Holiday(
        date=data["date"],
        name=data["name"],
        description=data.get("description"),
        is_national=data.get("is_national", True),
        created_by=created_by,
    )
    db.session.add(holiday)
    try:
        db.session.commit()
    except IntegrityError:
        # Phòng đua tranh: unique constraint ở DB là chốt chặn cuối.
        db.session.rollback()
        raise ApiError(
            409, "HOLIDAY_DATE_EXISTS", "Ngày này đã là ngày lễ.",
            details=[{"field": "date", "message": "Ngày lễ đã tồn tại."}],
        )
    return holiday


def delete_holiday(holiday_id):
    holiday = get_holiday(holiday_id)
    db.session.delete(holiday)
    db.session.commit()
    return holiday
