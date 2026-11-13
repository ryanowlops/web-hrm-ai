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
from datetime import date, datetime, timedelta, timezone

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


def _contracts_in_month(employee_id: int, first: date, last: date) -> list[Contract]:
    """Mọi hợp đồng (chưa terminated) giao với tháng, xếp theo ngày hiệu lực.

    Tháng có một hợp đồng thì dùng đúng nó (hành vi cũ). Tháng đổi hợp
    đồng giữa chừng thì trả về cả hai để chia ngày công theo từng đoạn.
    """
    contracts = (
        db.session.query(Contract)
        .filter(
            Contract.employee_id == employee_id,
            Contract.status != Contract.STATUS_TERMINATED,
            Contract.start_date <= last,
        )
        .order_by(Contract.start_date.asc())
        .all()
    )
    return [
        c for c in contracts if c.end_date is None or c.end_date >= first
    ]


def _contract_for_date(contracts: list[Contract], day: date) -> Contract:
    """Hợp đồng hiệu lực vào một ngày cụ thể (ngày rơi vào kẽ hở giữa hai
    hợp đồng thì lấy hợp đồng gần nhất: đoạn trước đó, hoặc đoạn sau)."""
    covering = [
        c
        for c in contracts
        if c.start_date <= day and (c.end_date is None or c.end_date >= day)
    ]
    if covering:
        return max(covering, key=lambda c: c.start_date)
    later = [c for c in contracts if c.start_date > day]
    if later:
        return min(later, key=lambda c: c.start_date)
    return max(contracts, key=lambda c: c.start_date)


def _worked_date_set(employee_id: int, first: date, last: date) -> set[date]:
    """Tập ngày đã chấm công present/late trong tháng."""
    rows = (
        db.session.query(Attendance.work_date)
        .filter(
            Attendance.employee_id == employee_id,
            Attendance.work_date >= first,
            Attendance.work_date <= last,
            Attendance.status.in_(WORKED_ATTENDANCE_STATUSES),
        )
        .all()
    )
    return {row.work_date for row in rows}


def _worked_days(employee_id: int, first: date, last: date) -> float:
    """Ngày làm thực tế: số bản ghi attendance present/late trong tháng."""
    return float(len(_worked_date_set(employee_id, first, last)))


def _leave_portions_by_date(
    employee_id: int, first: date, last: date
) -> tuple[dict[date, float], dict[date, float]]:
    """(nghỉ có phép, nghỉ không lương) theo từng ngày lịch, đã cắt theo tháng.

    Mỗi đơn được phân bổ đều theo số ngày lịch: một ngày trong đơn chiếm
    days_count / tổng-số-ngày-của-đơn (đơn 0,5 ngày vẫn đúng tỷ lệ).
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
    paid: dict[date, float] = {}
    unpaid: dict[date, float] = {}
    for req in requests:
        total_span = (req.to_date - req.from_date).days + 1
        if total_span <= 0:
            continue
        per_day = float(req.days_count) / total_span
        is_paid = bool(req.leave_type.paid) if req.leave_type is not None else True
        target = paid if is_paid else unpaid
        day = max(req.from_date, first)
        end = min(req.to_date, last)
        while day <= end:
            target[day] = target.get(day, 0.0) + per_day
            day += timedelta(days=1)
    return paid, unpaid


def _leave_days(employee_id: int, first: date, last: date) -> tuple[float, float]:
    """(ngày nghỉ có phép, ngày nghỉ không lương) đã duyệt trong tháng.

    Đơn nghỉ giao tháng được phân bổ theo tỷ lệ số ngày lịch giao nhau
    trên tổng số ngày của đơn (đơn 0,5 ngày vẫn đúng tỷ lệ).
    """
    paid_by_date, unpaid_by_date = _leave_portions_by_date(
        employee_id, first, last
    )
    return (
        round(sum(paid_by_date.values()), 2),
        round(sum(unpaid_by_date.values()), 2),
    )


def _paid_days_union(employee_id: int, first: date, last: date) -> float:
    """Ngày công hưởng lương = HỢP của ngày chấm công và ngày nghỉ có phép.

    Một ngày vừa chấm công vừa có đơn nghỉ đã duyệt chỉ tính 1 lần
    (trước đây cộng dồn thành 2 ngày hưởng lương cho cùng một ngày).
    """
    worked = _worked_date_set(employee_id, first, last)
    paid_by_date, _ = _leave_portions_by_date(employee_id, first, last)
    union = float(len(worked))
    for day, portion in paid_by_date.items():
        if day not in worked:
            union += portion
    return round(union, 2)


def _multi_contract_salary(
    contracts: list[Contract],
    employee_id: int,
    first: date,
    last: date,
    standard: float,
    rate: float,
    other_deduction: int,
) -> dict | None:
    """Chia ngày công hưởng lương theo từng đoạn hợp đồng trong tháng.

    Mỗi đoạn tính riêng bằng calculate_salary với lương/phụ cấp của đoạn
    đó; phụ cấp chia theo tỷ lệ ngày công của đoạn trên tổng ngày công
    (phụ cấp là khoản cố định theo tháng, không nhân đôi khi đổi hợp
    đồng). Trả về None khi tháng không có ngày công hưởng lương nào —
    caller dùng hợp đồng mới nhất để tính theo công thức 1 hợp đồng.
    """
    worked_dates = _worked_date_set(employee_id, first, last)
    paid_by_date, _ = _leave_portions_by_date(employee_id, first, last)
    segment_paid: dict[int, float] = {c.id: 0.0 for c in contracts}
    for day in worked_dates:
        segment_paid[_contract_for_date(contracts, day).id] += 1.0
    for day, portion in paid_by_date.items():
        if day not in worked_dates:
            segment_paid[_contract_for_date(contracts, day).id] += portion

    total_paid = round(sum(segment_paid.values()), 2)
    if total_paid <= 0:
        return None
    if total_paid > standard:
        factor = standard / total_paid
        segment_paid = {cid: round(p * factor, 4) for cid, p in segment_paid.items()}
        total_paid = standard

    segments = []
    total_salary = 0
    insurance_total = 0
    workday_salary_total = 0
    allowance_total = 0
    for contract in contracts:
        paid_c = segment_paid[contract.id]
        if paid_c <= 0:
            continue
        allowance_c = int(round(contract.allowance * paid_c / total_paid))
        seg = calculate_salary(
            base_salary=contract.base_salary,
            allowance=allowance_c,
            standard_workdays=standard,
            paid_workdays=paid_c,
            unpaid_days=0,
            insurance_rate=rate,
            other_deduction=0,
        )
        segments.append(
            {
                "contract_id": contract.id,
                "base_salary": contract.base_salary,
                "allowance": allowance_c,
                "paid_workdays": float(paid_c),
                "workday_salary": seg["breakdown"]["workday_salary"],
                "insurance_deduction": seg["insurance_deduction"],
                "total_salary": seg["total_salary"],
            }
        )
        total_salary += seg["total_salary"]
        insurance_total += seg["insurance_deduction"]
        workday_salary_total += seg["breakdown"]["workday_salary"]
        allowance_total += allowance_c

    total_salary -= other_deduction
    latest = max(contracts, key=lambda c: c.start_date)
    return {
        "workdays_paid": float(total_paid),
        "base_salary": latest.base_salary,
        "allowance": allowance_total,
        "insurance_deduction": insurance_total,
        "other_deduction": other_deduction,
        "total_salary": total_salary,
        "breakdown": {
            "formula": "sum over contract segments of "
            "(base_salary * paid_workdays / standard_workdays "
            "+ allowance - insurance_deduction) - other_deduction",
            "base_salary": latest.base_salary,
            "allowance": allowance_total,
            "standard_workdays": float(standard),
            "paid_workdays": float(total_paid),
            "workday_salary": workday_salary_total,
            "insurance_rate": float(rate),
            "insurance_deduction": insurance_total,
            "other_deduction": other_deduction,
            "total_salary": total_salary,
            "currency": "VND",
            "contract_segments": segments,
        },
    }


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
            contracts = _contracts_in_month(employee.id, first, last)
            if not contracts:
                skipped_no_contract += 1
                continue

            worked = _worked_days(employee.id, first, last)
            paid_leave, unpaid = _leave_days(employee.id, first, last)
            paid_union = _paid_days_union(employee.id, first, last)
            capped = paid_union > standard
            paid_workdays = min(paid_union, standard)
            overlap = round(worked + paid_leave - paid_union, 2)

            item = (
                db.session.query(PayrollItem)
                .filter(
                    PayrollItem.period_id == period.id,
                    PayrollItem.employee_id == employee.id,
                )
                .first()
            )
            other_deduction = item.other_deduction if item is not None else 0

            if len(contracts) == 1:
                contract = contracts[0]
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
                        "overlap_days": overlap,
                    }
                )
            else:
                multi = _multi_contract_salary(
                    contracts,
                    employee.id,
                    first,
                    last,
                    standard,
                    rate,
                    other_deduction,
                )
                if multi is None:
                    # Tháng không có ngày công hưởng lương: dùng hợp đồng
                    # mới nhất theo công thức 1 hợp đồng (thực lĩnh = phụ cấp).
                    contract = max(contracts, key=lambda c: c.start_date)
                    result = calculate_salary(
                        base_salary=contract.base_salary,
                        allowance=contract.allowance,
                        standard_workdays=standard,
                        paid_workdays=0,
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
                            "overlap_days": overlap,
                        }
                    )
                else:
                    contract = max(contracts, key=lambda c: c.start_date)
                    result = multi
                    breakdown = dict(result["breakdown"])
                    breakdown.update(
                        {
                            "contract_id": contract.id,
                            "worked_days": worked,
                            "paid_leave_days": paid_leave,
                            "unpaid_days": unpaid,
                            "paid_workdays_capped": capped,
                            "overlap_days": overlap,
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
