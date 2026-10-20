"""Service layer cho Payroll — kỳ lương, tính lương, chốt kỳ, phiếu lương.

Nghiệp vụ theo docs/architecture.md A5.3 + B5.4:

- HR tạo kỳ lương (tháng/năm); trùng kỳ -> 409.
- Tính lương: với từng nhân viên đang làm việc, lấy hợp đồng hiện hành,
  đếm ngày công thực tế từ `attendance` (present/late), cộng ngày nghỉ
  CÓ phép và trừ ngày nghỉ KHÔNG lương từ `leave_requests` đã duyệt,
  rồi dùng hàm thuần ở calculator.py để tính (lưu breakdown JSON).
- Chốt kỳ (lock): kỳ đã locked thì không tính lại được nữa -> 409 khi
  calculate; phiếu lương của nhân viên chỉ xem được sau khi kỳ đã locked.

Mọi thao tác ghi nằm trong transaction; lỗi nghiệp vụ ném ApiError
(status, code, message, details) để routes trả format lỗi chuẩn.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime, timezone

from app.blueprints.payroll.calculator import (
    DEFAULT_INSURANCE_RATE,
    calculate_salary,
    standard_workdays_of_month,
)
from app.extensions import db
from app.models import (
    Attendance,
    AuditLog,
    Contract,
    Employee,
    LeaveRequest,
    PayrollItem,
    PayrollPeriod,
    Setting,
)

HR_ROLES = ("admin", "hr")
# Nhân viên được tính lương: đang làm việc hoặc đang nghỉ chế độ dài hạn,
# không tính người đã nghỉ việc.
PAYROLL_EMPLOYEE_STATUSES = (Employee.STATUS_WORKING, Employee.STATUS_ON_LEAVE)
WORKED_ATTENDANCE_STATUSES = (Attendance.STATUS_PRESENT, Attendance.STATUS_LATE)


class ApiError(Exception):
    """Lỗi nghiệp vụ có mã HTTP + code chuẩn để routes trả về."""

    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or []


# ---------------------------------------------------------------------------
# Helpers dùng chung
# ---------------------------------------------------------------------------


def get_or_404(model, pk, code, message):
    """Lấy bản ghi theo khóa chính, không có thì ném ApiError 404."""
    obj = None
    try:
        obj = db.session.get(model, pk)
    except Exception:
        obj = None
    if obj is None:
        raise ApiError(404, code, message)
    return obj


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
    """Phân trang một query SQLAlchemy, trả (items, meta) đúng quy ước B6."""
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


def _month_range(year: int, month: int) -> tuple[date, date]:
    first = date(year, month, 1)
    last = date(year, month, calendar.monthrange(year, month)[1])
    return first, last


def _insurance_rate() -> float:
    """Tỷ lệ bảo hiểm từ settings (key "insurance_rate").

    Chấp nhận value là số (0.105) hoặc dict {"rate": 0.105} / {"value": ...}.
    Thiếu/sai cấu hình thì dùng mặc định 10,5% của calculator.
    """
    raw = Setting.get_value("insurance_rate", None)
    if isinstance(raw, dict):
        raw = raw.get("rate", raw.get("value"))
    try:
        rate = float(raw)
    except (TypeError, ValueError):
        return float(DEFAULT_INSURANCE_RATE)
    if rate < 0 or rate >= 1:
        return float(DEFAULT_INSURANCE_RATE)
    return rate


def _add_audit(actor, action: str, period: PayrollPeriod, detail: dict) -> None:
    """Ghi AuditLog trong cùng transaction (chỉ metadata, không chi tiết lương)."""
    db.session.add(
        AuditLog(
            user_id=getattr(actor, "id", None),
            action=action,
            entity_type="payroll_period",
            entity_id=period.id,
            detail=detail,
        )
    )


# ---------------------------------------------------------------------------
# Kỳ lương
# ---------------------------------------------------------------------------


def create_period(data: dict, actor) -> PayrollPeriod:
    month = data["month"]
    year = data["year"]
    existing = (
        db.session.query(PayrollPeriod)
        .filter(PayrollPeriod.month == month, PayrollPeriod.year == year)
        .first()
    )
    if existing is not None:
        raise ApiError(
            409,
            "PAYROLL_PERIOD_EXISTS",
            f"Đã tồn tại kỳ lương tháng {month}/{year}.",
        )
    standard = data.get("standard_workdays")
    if standard is None:
        standard = standard_workdays_of_month(year, month)
    period = PayrollPeriod(
        month=month,
        year=year,
        standard_workdays=float(standard),
        status=PayrollPeriod.STATUS_DRAFT,
    )
    db.session.add(period)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise ApiError(
            409, "PAYROLL_PERIOD_EXISTS", f"Đã tồn tại kỳ lương tháng {month}/{year}."
        )
    return period


def list_periods(args):
    query = db.session.query(PayrollPeriod)
    year = args.get("year", type=int)
    month = args.get("month", type=int)
    status = args.get("status")
    if year:
        query = query.filter(PayrollPeriod.year == year)
    if month:
        query = query.filter(PayrollPeriod.month == month)
    if status:
        query = query.filter(PayrollPeriod.status == status)
    query = query.order_by(PayrollPeriod.year.desc(), PayrollPeriod.month.desc())
    page, limit = parse_pagination(args)
    return paginate(query, page, limit)


def get_period(period_id: int) -> PayrollPeriod:
    return get_or_404(
        PayrollPeriod, period_id, "PAYROLL_PERIOD_NOT_FOUND", "Không tìm thấy kỳ lương."
    )


# ---------------------------------------------------------------------------
# Tính lương
# ---------------------------------------------------------------------------


def _active_contract(employee_id: int, first: date, last: date) -> Contract | None:
    """Hợp đồng hiệu lực trong tháng: chưa terminated, khoảng ngày giao tháng."""
    contracts = (
        db.session.query(Contract)
        .filter(
            Contract.employee_id == employee_id,
            Contract.status != Contract.STATUS_TERMINATED,
            Contract.start_date <= last,
        )
        .order_by(Contract.start_date.desc())
        .all()
    )
    for contract in contracts:
        if contract.end_date is None or contract.end_date >= first:
            return contract
    return None


def _worked_days(employee_id: int, first: date, last: date) -> float:
    """Ngày làm thực tế: số bản ghi attendance present/late trong tháng."""
    count = (
        db.session.query(Attendance)
        .filter(
            Attendance.employee_id == employee_id,
            Attendance.work_date >= first,
            Attendance.work_date <= last,
            Attendance.status.in_(WORKED_ATTENDANCE_STATUSES),
        )
        .count()
    )
    return float(count)


def _leave_days(employee_id: int, first: date, last: date) -> tuple[float, float]:
    """(ngày nghỉ có phép, ngày nghỉ không lương) đã duyệt trong tháng.

    Đơn nghỉ giao tháng được phân bổ theo tỷ lệ số ngày lịch giao nhau
    trên tổng số ngày của đơn (đơn 0,5 ngày vẫn đúng tỷ lệ).
    """
    requests = (
        db.session.query(LeaveRequest)
        .filter(
            LeaveRequest.employee_id == employee_id,
            LeaveRequest.status == LeaveRequest.STATUS_APPROVED,
            LeaveRequest.from_date <= last,
            LeaveRequest.to_date >= first,
        )
        .all()
    )
    paid_days = 0.0
    unpaid_days = 0.0
    for req in requests:
        total_span = (req.to_date - req.from_date).days + 1
        if total_span <= 0:
            continue
        overlap = (min(req.to_date, last) - max(req.from_date, first)).days + 1
        if overlap <= 0:
            continue
        portion = float(req.days_count) * overlap / total_span
        is_paid = bool(req.leave_type.paid) if req.leave_type is not None else True
        if is_paid:
            paid_days += portion
        else:
            unpaid_days += portion
    return round(paid_days, 2), round(unpaid_days, 2)


def calculate_period(period_id: int, actor) -> dict:
    """Tính (hoặc tính lại) toàn bộ dòng lương của một kỳ draft.

    Kỳ đã locked -> 409 PERIOD_LOCKED. Nhân viên không có hợp đồng hiệu lực
    trong tháng sẽ bị bỏ qua và đếm vào "skipped_no_contract" của kết quả.
    Khấu trừ khác (other_deduction) đã nhập tay trước đó được giữ nguyên
    khi tính lại.
    """
    period = get_period(period_id)
    if period.status == PayrollPeriod.STATUS_LOCKED:
        raise ApiError(
            409,
            "PERIOD_LOCKED",
            "Kỳ lương đã chốt, không thể tính lại. Muốn sửa phải mở khóa theo quy trình.",
        )

    first, last = _month_range(period.year, period.month)
    standard = float(period.standard_workdays) or standard_workdays_of_month(
        period.year, period.month
    )
    rate = _insurance_rate()

    employees = (
        db.session.query(Employee)
        .filter(Employee.status.in_(PAYROLL_EMPLOYEE_STATUSES))
        .order_by(Employee.id)
        .all()
    )

    created = updated = skipped_no_contract = 0
    total_salary_sum = 0
    try:
        for employee in employees:
            if employee.start_date is not None and employee.start_date > last:
                continue  # chưa vào làm trong tháng này
            contract = _active_contract(employee.id, first, last)
            if contract is None:
                skipped_no_contract += 1
                continue

            worked = _worked_days(employee.id, first, last)
            paid_leave, unpaid = _leave_days(employee.id, first, last)
            paid_raw = worked + paid_leave
            capped = paid_raw > standard
            paid_workdays = min(paid_raw, standard)

            item = (
                db.session.query(PayrollItem)
                .filter(
                    PayrollItem.period_id == period.id,
                    PayrollItem.employee_id == employee.id,
                )
                .first()
            )
            other_deduction = item.other_deduction if item is not None else 0

            result = calculate_salary(
                base_salary=contract.base_salary,
                allowance=contract.allowance,
                standard_workdays=standard,
                paid_workdays=paid_workdays,
                unpaid_days=unpaid,
                insurance_rate=rate,
                other_deduction=other_deduction,
            )
            breakdown = dict(result["breakdown"])
            breakdown.update(
                {
                    "contract_id": contract.id,
                    "worked_days": worked,
                    "paid_leave_days": paid_leave,
                    "paid_workdays_capped": capped,
                }
            )

            if item is None:
                item = PayrollItem(period_id=period.id, employee_id=employee.id)
                db.session.add(item)
                created += 1
            else:
                updated += 1
            item.workdays_paid = result["workdays_paid"]
            item.base_salary = result["base_salary"]
            item.allowance = result["allowance"]
            item.insurance_deduction = result["insurance_deduction"]
            item.other_deduction = result["other_deduction"]
            item.total_salary = result["total_salary"]
            item.breakdown = breakdown
            total_salary_sum += result["total_salary"]

        _add_audit(
            actor,
            "payroll.calculate",
            period,
            {
                "month": period.month,
                "year": period.year,
                "items_created": created,
                "items_updated": updated,
                "skipped_no_contract": skipped_no_contract,
            },
        )
        db.session.commit()
    except ApiError:
        db.session.rollback()
        raise
    except Exception:
        db.session.rollback()
        raise

    return {
        "period_id": period.id,
        "month": period.month,
        "year": period.year,
        "status": period.status,
        "items_created": created,
        "items_updated": updated,
        "skipped_no_contract": skipped_no_contract,
        "total_salary": total_salary_sum,
    }


def lock_period(period_id: int, actor) -> PayrollPeriod:
    """Chốt kỳ lương: sau khi chốt, nhân viên xem được phiếu lương của mình."""
    period = get_period(period_id)
    if period.status == PayrollPeriod.STATUS_LOCKED:
        raise ApiError(409, "PERIOD_ALREADY_LOCKED", "Kỳ lương này đã được chốt trước đó.")
    period.status = PayrollPeriod.STATUS_LOCKED
    period.locked_at = datetime.now(timezone.utc)
    period.locked_by = getattr(actor, "id", None)
    _add_audit(
        actor,
        "payroll.lock",
        period,
        {"month": period.month, "year": period.year},
    )
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return period


# ---------------------------------------------------------------------------
# Dòng lương & phiếu lương
# ---------------------------------------------------------------------------


def list_items(period_id: int, args):
    period = get_period(period_id)
    query = db.session.query(PayrollItem).filter(PayrollItem.period_id == period.id)
    employee_id = args.get("employee_id", type=int)
    if employee_id:
        query = query.filter(PayrollItem.employee_id == employee_id)
    search = (args.get("search") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.join(Employee, PayrollItem.employee_id == Employee.id).filter(
            db.or_(Employee.full_name.ilike(like), Employee.code.ilike(like))
        )
    sort_by = args.get("sortBy")
    sort_col = {
        "total_salary": PayrollItem.total_salary,
        "base_salary": PayrollItem.base_salary,
        "workdays_paid": PayrollItem.workdays_paid,
    }.get(sort_by, PayrollItem.employee_id)
    if (args.get("sortOrder") or "asc").lower() == "desc":
        sort_col = sort_col.desc()
    query = query.order_by(sort_col)
    page, limit = parse_pagination(args)
    return paginate(query, page, limit)


def get_my_payslip(user, period_id: int | None) -> PayrollItem:
    """Phiếu lương của chính nhân viên gắn với tài khoản đang đăng nhập.

    Chỉ trả khi kỳ đã locked; kỳ chưa chốt hoặc không có dòng lương -> 404
    (không lộ thông tin lương chưa chính thức — B8).
    """
    employee_id = getattr(user, "employee_id", None)
    if not employee_id:
        raise ApiError(
            404, "PAYSLIP_NOT_FOUND", "Tài khoản chưa gắn với hồ sơ nhân viên nào."
        )
    query = db.session.query(PayrollItem).join(
        PayrollPeriod, PayrollItem.period_id == PayrollPeriod.id
    )
    query = query.filter(
        PayrollItem.employee_id == employee_id,
        PayrollPeriod.status == PayrollPeriod.STATUS_LOCKED,
    )
    if period_id:
        query = query.filter(PayrollItem.period_id == period_id)
    else:
        query = query.order_by(
            PayrollPeriod.year.desc(), PayrollPeriod.month.desc()
        )
    item = query.first()
    if item is None:
        raise ApiError(
            404, "PAYSLIP_NOT_FOUND", "Chưa có phiếu lương đã chốt cho kỳ này."
        )
    return item
