"""Service layer cho module Quản lý thử việc.

Chứa toàn bộ logic nghiệp vụ + transaction. Routes chỉ validate input,
gọi service và trả JSON. Lỗi nghiệp vụ ném ra dưới dạng ApiError
(app.errors) để error handler toàn cục chuyển thành định dạng lỗi chuẩn:
    {"error": {"code": ..., "message": ..., "details": [...]}}.

Nhận diện hợp đồng thử việc: contract_type là chuỗi tự do do HR nhập
("Thử việc", "THỬ VIỆC", "thu viec"...), nên chuẩn hóa (bỏ dấu, lowercase,
gọn khoảng trắng) rồi so với "thu viec". Helper is_probation_contract là
điểm chuẩn duy nhất — payroll/services import dùng chung, không nhân bản.
"""

import re
import unicodedata
from datetime import date, timedelta

from app.errors import ApiError
from app.extensions import db
from app.models import (
    Contract,
    Department,
    Employee,
    Notification,
    ProbationEvaluation,
    User,
)

# Hạn "sắp hết" dùng cho summary: hợp đồng thử việc còn <= 14 ngày.
EXPIRING_SOON_DAYS = 14

# Manager chỉ thấy nhân viên thuộc phòng mình quản lý (cùng quy ước với
# stats/routes._manager_department_ids).
HR_ADMIN_ROLES = ("admin", "hr")


def _normalize_contract_type(value) -> str:
    """Chuẩn hóa contract_type: bỏ dấu, lowercase, gọn khoảng trắng.

    "Thử việc" / "THỬ VIỆC" / "  Thu   viec " -> "thu viec".
    """
    if value is None:
        return ""
    text = unicodedata.normalize("NFD", str(value))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.replace("đ", "d").replace("Đ", "D")
    return re.sub(r"\s+", " ", text.strip().lower())


def is_probation_contract(contract) -> bool:
    """True khi hợp đồng là hợp đồng thử việc (theo contract_type)."""
    if contract is None:
        return False
    return _normalize_contract_type(contract.contract_type) == "thu viec"


def _manager_department_ids(user) -> list[int]:
    """Các phòng ban trong phạm vi của Manager (rỗng nếu không có).

    Ưu tiên mọi phòng ban mà nhân viên làm trưởng phòng
    (departments.manager_id); nếu không làm trưởng phòng nào thì lùi về
    phòng ban nhân viên đang thuộc về.
    """
    employee = user.employee if user is not None else None
    if employee is None:
        return []
    managed = (
        Department.query.filter_by(manager_id=employee.id)
        .order_by(Department.id)
        .all()
    )
    if managed:
        return [dept.id for dept in managed]
    if employee.department_id is not None:
        return [employee.department_id]
    return []


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


def _probation_contracts(user) -> list[Contract]:
    """Mọi hợp đồng thử việc đang ACTIVE của nhân viên đang làm việc.

    Manager chỉ thấy phòng mình quản lý; admin/hr thấy toàn công ty.
    Sắp xếp: sắp hết hạn trước (end_date tăng dần, null — không thời hạn —
    xếp cuối). Lọc "thử việc" bằng Python vì chuẩn hóa dấu cần hàm Python
    (không dịch được sang SQL).
    """
    query = (
        db.session.query(Contract)
        .join(Employee, Contract.employee_id == Employee.id)
        .filter(
            Contract.status == Contract.STATUS_ACTIVE,
            Employee.status.in_(
                (Employee.STATUS_WORKING, Employee.STATUS_ON_LEAVE)
            ),
        )
    )
    if user is not None and user.role == "manager":
        dept_ids = _manager_department_ids(user)
        if not dept_ids:
            raise ApiError(
                403,
                "FORBIDDEN",
                "Tài khoản Manager chưa gắn với phòng ban nào.",
            )
        query = query.filter(Employee.department_id.in_(dept_ids))
    contracts = query.order_by(
        Contract.end_date.asc().nulls_last(), Contract.id.asc()
    ).all()
    return [c for c in contracts if is_probation_contract(c)]


def _rows_with_evaluations(contracts: list[Contract], today: date) -> list[dict]:
    """Gắn nhân viên + đánh giá mới nhất + số ngày còn lại cho mỗi hợp đồng."""
    evaluations: dict[int, ProbationEvaluation] = {}
    ids = [c.id for c in contracts]
    if ids:
        for ev in (
            ProbationEvaluation.query.filter(
                ProbationEvaluation.contract_id.in_(ids)
            )
            .order_by(
                ProbationEvaluation.created_at.desc(),
                ProbationEvaluation.id.desc(),
            )
            .all()
        ):
            # Query đã xếp mới nhất trước nên giữ lại bản đầu tiên gặp.
            evaluations.setdefault(ev.contract_id, ev)
    rows = []
    for contract in contracts:
        employee = contract.employee
        rows.append(
            {
                "contract": contract,
                "employee": employee,
                "evaluation": evaluations.get(contract.id),
                "days_remaining": (
                    (contract.end_date - today).days
                    if contract.end_date is not None
                    else None
                ),
            }
        )
    return rows


def list_probation(args, user) -> tuple[list[dict], dict]:
    """Danh sách thử việc, phân trang, kèm đánh giá mới nhất nếu có."""
    today = date.today()
    contracts = _probation_contracts(user)
    rows = _rows_with_evaluations(contracts, today)
    page, limit = parse_pagination(args)
    total = len(rows)
    total_pages = (total + limit - 1) // limit if total else 0
    page_rows = rows[(page - 1) * limit : page * limit]
    meta = {
        "page": page,
        "limit": limit,
        "totalItems": total,
        "totalPages": total_pages,
    }
    return page_rows, meta


def probation_summary(user) -> dict:
    """Tổng quan thử việc: đang thử việc / sắp hết hạn / đã quá hạn."""
    today = date.today()
    contracts = _probation_contracts(user)
    expiring_soon = 0
    overdue = 0
    for contract in contracts:
        if contract.end_date is None:
            continue
        days = (contract.end_date - today).days
        if days < 0:
            overdue += 1
        elif days <= EXPIRING_SOON_DAYS:
            expiring_soon += 1
    return {
        "total": len(contracts),
        "expiringSoon": expiring_soon,
        "overdue": overdue,
        "expiringWithinDays": EXPIRING_SOON_DAYS,
    }


def get_contract_or_404(contract_id: int) -> Contract:
    contract = db.session.get(Contract, contract_id)
    if contract is None:
        raise ApiError(404, "CONTRACT_NOT_FOUND", "Không tìm thấy hợp đồng.")
    return contract


def _latest_evaluation(contract_id: int):
    return (
        ProbationEvaluation.query.filter_by(contract_id=contract_id)
        .order_by(
            ProbationEvaluation.created_at.desc(),
            ProbationEvaluation.id.desc(),
        )
        .first()
    )


def _check_manager_scope(user, employee: Employee) -> None:
    """Manager chỉ được đánh giá nhân viên thuộc phòng mình quản lý."""
    if user is None or user.role != "manager":
        return
    dept_ids = _manager_department_ids(user)
    if employee.department_id not in dept_ids:
        raise ApiError(
            403,
            "FORBIDDEN",
            "Nhân viên này không thuộc phòng ban bạn quản lý.",
        )


def _notify_hr_admins(title: str, content: str, related_id: int) -> None:
    """Thông báo cho mọi tài khoản admin/hr (dùng khi thử việc không đạt)."""
    for account in User.query.filter(User.role.in_(HR_ADMIN_ROLES)).all():
        db.session.add(
            Notification(
                user_id=account.id,
                type="probation",
                title=title,
                content=content,
                is_read=False,
                related_type="probation_evaluation",
                related_id=related_id,
            )
        )


def evaluate_contract(contract_id: int, data: dict, evaluator):
    """Đánh giá một hợp đồng thử việc: pass / fail / extend.

    - pass: chấm dứt hợp đồng thử việc (end_date = hôm nay) + tạo hợp đồng
      chính thức mới từ ngày mai, giữ nguyên lương/phụ cấp (base trong hợp
      đồng thử việc là lương chính thức; lương thử việc 85% chỉ là cách
      tính lúc trả lương — xem payroll/services).
    - fail: chấm dứt hợp đồng thử việc + chuyển nhân viên sang resigned +
      thông báo cho HR. KHÔNG tự chạy offboarding (tài sản HR xử lý riêng).
    - extend: dời end_date thêm extend_days (hợp đồng không thời hạn thì
      không gia hạn được).
    Mọi quyết định đều ghi 1 row ProbationEvaluation. Đánh giá lại cùng hợp
    đồng sau khi đã pass/fail -> 409 (đã chốt); sau extend thì được đánh giá
    tiếp. Toàn bộ nằm trong 1 transaction.
    """
    contract = get_contract_or_404(contract_id)
    if not is_probation_contract(contract):
        raise ApiError(
            400,
            "NOT_PROBATION_CONTRACT",
            "Hợp đồng này không phải hợp đồng thử việc.",
        )
    employee = contract.employee
    _check_manager_scope(evaluator, employee)
    if contract.status != Contract.STATUS_ACTIVE:
        raise ApiError(
            409,
            "CONTRACT_NOT_ACTIVE",
            "Hợp đồng này không còn hiệu lực.",
        )
    latest = _latest_evaluation(contract.id)
    if latest is not None and latest.decision in (
        ProbationEvaluation.DECISION_PASS,
        ProbationEvaluation.DECISION_FAIL,
    ):
        raise ApiError(
            409,
            "PROBATION_ALREADY_DECIDED",
            "Hợp đồng thử việc này đã có quyết định chốt rồi.",
        )

    decision = data["decision"]
    today = date.today()
    new_contract = None
    if decision == ProbationEvaluation.DECISION_PASS:
        contract.status = Contract.STATUS_TERMINATED
        contract.end_date = today
        new_contract = Contract(
            employee_id=contract.employee_id,
            contract_type="Không xác định thời hạn",
            start_date=today + timedelta(days=1),
            end_date=None,
            base_salary=contract.base_salary,
            allowance=contract.allowance,
            status=Contract.STATUS_ACTIVE,
        )
        db.session.add(new_contract)
    elif decision == ProbationEvaluation.DECISION_FAIL:
        contract.status = Contract.STATUS_TERMINATED
        contract.end_date = today
        employee.status = Employee.STATUS_RESIGNED
    elif decision == ProbationEvaluation.DECISION_EXTEND:
        if contract.end_date is None:
            raise ApiError(
                400,
                "VALIDATION_ERROR",
                "Không gia hạn được hợp đồng thử việc không thời hạn.",
            )
        contract.end_date = contract.end_date + timedelta(
            days=data["extend_days"]
        )

    evaluation = ProbationEvaluation(
        contract_id=contract.id,
        employee_id=contract.employee_id,
        decision=decision,
        notes=data.get("notes"),
        evaluated_by=getattr(evaluator, "id", None),
    )
    db.session.add(evaluation)
    db.session.flush()  # lấy evaluation.id để gắn vào thông báo cho HR
    if decision == ProbationEvaluation.DECISION_FAIL:
        # Không tự chạy offboarding (tài sản HR xử lý riêng) — chỉ báo HR.
        _notify_hr_admins(
            "Nhân viên không đạt thử việc",
            f"{employee.full_name} ({employee.code}) không đạt thử việc. "
            "Hợp đồng thử việc đã chấm dứt; HR xử lý tài sản và bàn giao.",
            evaluation.id,
        )
    db.session.commit()
    return contract, evaluation, new_contract
