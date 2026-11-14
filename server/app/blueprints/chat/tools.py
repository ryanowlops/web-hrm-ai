"""Tool layer cho Chatbot HR — tra DỮ LIỆU THẬT theo quyền của người hỏi.

Quy tắc do anh đặt (2026-11-14): AI chỉ ĐỌC dữ liệu để tra cứu — TUYỆT ĐỐI
không xoá dữ liệu DB. Không tool nào trong module này gọi bất kỳ thao tác
xoá bản ghi nào; guard test tests/test_chat_no_delete.py quét
toàn bộ blueprint chat/people_ai/ai và fail nếu xuất hiện lệnh xoá.

Hợp đồng feature-expansion-v3 mục 5.1 (gói 3 — People AI):

- Mỗi tool là một hàm Python nhận (user, **args) và TỰ ép phạm vi dữ liệu
  theo role của user: employee = chỉ chính mình; manager = nhóm/phòng
  mình; hr/admin = toàn công ty. Lớp chọn ý định (từ khoá tất định hoặc
  AI phân loại) chỉ quyết định GỌI tool nào — không bao giờ quyết định
  được phạm vi dữ liệu, và model không được tự viết số liệu.
- Câu trả lời được dựng hoàn toàn từ dữ liệu DB thật do tool trả về;
  try_answer() gắn thêm dòng nguồn bắt buộc ở cuối.
- try_answer() trả None khi câu hỏi không thuộc tool nào (kể cả khi tool
  lỗi bất ngờ) để services.ask_question giữ nguyên luồng RAG tài liệu cũ.

Chọn ý định:
  1) Từ khoá tiếng Việt (so khớp trên bản đã bỏ dấu) — nhanh, tất định,
     chạy được cả khi chưa cấu hình AI key.
  2) Nếu từ khoá không khớp và provider AI khả dụng: nhờ AI phân loại ý
     định (provider hiện tại chỉ hỗ trợ chat completion ép JSON — chưa
     có API function/tool-calling riêng — nên dùng phân loại JSON qua
     chat_completion; scope vẫn do tool tự ép). Mọi lỗi đều rơi về None.
"""
from __future__ import annotations

import json
import re
import unicodedata
from datetime import date, timedelta
from zoneinfo import ZoneInfo

from flask import current_app

from app.extensions import db
from app.models import (
    Attendance,
    Department,
    Employee,
    LeaveRequest,
    PayrollItem,
    PayrollPeriod,
)

SOURCE_LINE = "Nguồn: dữ liệu trực tiếp từ hệ thống (theo quyền truy cập của bạn)."
_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

_NO_PROFILE_TEXT = (
    "Tài khoản của bạn chưa được gắn với hồ sơ nhân viên nên mình chưa tra "
    "được dữ liệu cá nhân. Vui lòng liên hệ HR để được gắn hồ sơ nhé."
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _today() -> date:
    """Ngày hiện tại theo múi giờ nghiệp vụ Asia/Ho_Chi_Minh (như stats)."""
    from datetime import datetime

    return datetime.now(_TZ).date()


def _fold(text: str) -> str:
    """Viết thường + bỏ dấu tiếng Việt để so từ khoá có/không dấu như nhau."""
    lowered = (text or "").lower().replace("đ", "d")
    decomposed = unicodedata.normalize("NFD", lowered)
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def _fmt_days(value) -> str:
    """Số ngày phép: 10.0 -> '10', 10.5 -> '10,5' (thập phân kiểu Việt)."""
    number = float(value or 0)
    if number == int(number):
        return str(int(number))
    return f"{number:.1f}".rstrip("0").rstrip(".").replace(".", ",")


def _fmt_money(value) -> str:
    """Tiền VND nguyên: 12345678 -> '12.345.678 đ'."""
    return f"{int(value or 0):,}".replace(",", ".") + " đ"


def _fmt_date(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def _employee_of(user) -> Employee | None:
    """Hồ sơ nhân viên gắn với tài khoản; None nếu tài khoản chưa gắn."""
    employee_id = getattr(user, "employee_id", None)
    if employee_id:
        employee = db.session.get(Employee, employee_id)
        if employee is not None:
            return employee
    return getattr(user, "employee", None)


def _month_range(year: int, month: int) -> tuple[date, date]:
    first = date(year, month, 1)
    if month == 12:
        return first, date(year + 1, 1, 1)
    return first, date(year, month + 1, 1)


# ---------------------------------------------------------------------------
# Tools — mỗi hàm tự ép scope theo role
# ---------------------------------------------------------------------------

def tool_my_leave_balance(user, **_args) -> str:
    """Số phép còn lại của chính người hỏi (mọi role, luôn là của mình)."""
    employee = _employee_of(user)
    if employee is None:
        return _NO_PROFILE_TEXT
    from app.blueprints.leave import services as leave_services

    balances = leave_services.get_my_balances(employee)
    if not balances:
        return "Hệ thống chưa cấu hình loại phép có hạn mức nào cho bạn."
    lines = [f"Số ngày phép của bạn trong năm {_today().year}:"]
    for leave_type, balance in balances:
        total = balance.total_days or 0
        used = balance.used_days or 0
        lines.append(
            f"- {leave_type.name}: còn {_fmt_days(total - used)} ngày "
            f"(tổng {_fmt_days(total)} ngày, đã dùng {_fmt_days(used)} ngày)."
        )
    return "\n".join(lines)


def _payslip_text(item: PayrollItem, provisional: bool = False) -> str:
    """Phiếu lương 1 người — gồm tiền OT + hệ số thử việc nếu có.

    provisional=True: kỳ chưa chốt — số liệu tạm tính, ghi rõ trong câu trả lời.
    """
    period = item.period
    employee = item.employee
    who = (f"{employee.full_name} ({employee.code})"
           if employee is not None else "bạn")
    lines = [f"Phiếu lương kỳ {period.month}/{period.year} của {who}:"]
    if provisional:
        lines.append("Số liệu tạm tính — kỳ lương chưa chốt.")
    lines.append(f"- Ngày công hưởng lương: {_fmt_days(item.workdays_paid)} ngày.")
    lines.append(f"- Lương cơ bản: {_fmt_money(item.base_salary)}.")
    lines.append(f"- Phụ cấp: {_fmt_money(item.allowance)}.")
    bd = item.breakdown or {}
    ot_pay = bd.get("overtime_pay") or 0
    if ot_pay:
        lines.append(
            f"- Tiền tăng ca: {_fmt_money(ot_pay)} "
            f"({_fmt_days(bd.get('overtime_hours') or 0)} giờ).")
    prob_factor = bd.get("probation_factor")
    if prob_factor:
        lines.append(
            f"- Hệ số thử việc: {prob_factor} "
            f"(lương thử việc {prob_factor * 100:.0f}% lương chính thức, "
            f"{_fmt_days(bd.get('probation_days') or 0)} ngày).")
    lines.append(f"- Khấu trừ bảo hiểm: {_fmt_money(item.insurance_deduction)}.")
    lines.append(f"- Khấu trừ khác: {_fmt_money(item.other_deduction)}.")
    lines.append(f"- THỰC LĨNH: {_fmt_money(item.total_salary)}.")
    return "\n".join(lines)


def _payroll_mention_pool(user, employee) -> list:
    """Nhân viên mà người hỏi được phép xem lương: admin/hr = toàn công ty,
    manager = nhóm mình + chính mình, employee = chỉ chính mình."""
    role = getattr(user, "role", "employee")
    if role in ("admin", "hr"):
        return Employee.query.order_by(Employee.id).all()
    if role == "manager" and employee is not None:
        from app.blueprints.leave import services as leave_services

        ids = set(leave_services._team_employee_ids(employee)) | {employee.id}
        return (Employee.query.filter(Employee.id.in_(sorted(ids)))
                .order_by(Employee.id).all())
    return [employee] if employee is not None else []


def _find_payroll_employee(user, employee, question: str):
    """Nhân viên được nhắc tới trong câu hỏi, trong phạm vi xem lương.

    Chỉ khớp theo mã NV hoặc họ tên đầy đủ — KHÔNG khớp tên riêng
    ("Minh", "Lan", "Viên"...): tên riêng trùng từ thường ("viên" trong
    "nhân viên", "mình" gõ không dấu thành "minh") nên đoán sai sẽ LỘ
    lương người khác. Không khớp -> rơi về phiếu của mình / bảng lương,
    tuyệt đối không đoán người.
    Trả (employee|None, mentioned_out_of_scope: bool).
    """
    folded = _fold(question or "")
    pool = _payroll_mention_pool(user, employee)
    if not pool:
        return None, False
    matches = []
    for cand in pool:
        code = (getattr(cand, "code", "") or "").strip().lower()
        if code and code in (question or "").lower():
            matches.append(cand)
            continue
        full = _fold(getattr(cand, "full_name", "") or "")
        if full and full in folded:
            matches.append(cand)
            continue
    if len(matches) == 1:
        return matches[0], False
    if len(matches) > 1:
        return None, False  # mơ hồ -> không đoán người
    # Có nhắc tới một nhân viên NGOÀI phạm vi (mã hoặc họ tên đầy đủ)?
    pool_ids = {c.id for c in pool}
    for cand in Employee.query.order_by(Employee.id).all():
        if cand.id in pool_ids:
            continue
        code = (getattr(cand, "code", "") or "").strip().lower()
        full = _fold(getattr(cand, "full_name", "") or "")
        if (code and code in (question or "").lower()) or (full and full in folded):
            return None, True
    return None, False


def _payroll_table_text(period, items, provisional: bool = False) -> str:
    """Bảng lương gọn 1 kỳ: tổng thực lĩnh + top 5 cao nhất."""
    if not items:
        return (f"Kỳ lương tháng {period.month}/{period.year} "
                "chưa có phiếu lương nào.")
    total = sum(int(it.total_salary or 0) for it in items)
    lines = [f"Bảng lương tháng {period.month}/{period.year} "
             f"({len(items)} người, tổng thực lĩnh {_fmt_money(total)}):"]
    if provisional:
        lines.append("Số liệu tạm tính — kỳ lương chưa chốt.")
    for it in items[:5]:
        emp = it.employee
        who = (f"{emp.full_name} ({emp.code})" if emp is not None
               else f"NV#{it.employee_id}")
        lines.append(f"- {who}: {_fmt_money(it.total_salary)} "
                     f"({_fmt_days(it.workdays_paid)} ngày công).")
    if len(items) > 5:
        lines.append(f"... và {len(items) - 5} người khác "
                     "(xem chi tiết ở trang Bảng lương).")
    return "\n".join(lines)


def tool_my_payslip(user, month=None, year=None, question=None, **_args) -> str:
    """Tra cứu lương theo quyền — CHỈ ĐỌC, không thay đổi dữ liệu.

    - Nhắc tên/mã nhân viên -> phiếu của người đó (admin/hr: ai cũng được;
      manager: trong nhóm mình; employee: chỉ chính mình; ngoài phạm vi ->
      từ chối rõ ràng, KHÔNG lấy lương người khác, KHÔNG rơi về RAG).
    - Không nhắc ai: admin/hr -> bảng lương toàn công ty kỳ đó;
      manager -> bảng lương nhóm mình; employee -> phiếu của mình.
    - Kỳ chưa chốt vẫn trả số thật, ghi rõ "tạm tính — chưa chốt".
    """
    employee = _employee_of(user)
    role = getattr(user, "role", "employee")
    today = _today()
    month = int(month) if month else today.month
    year = int(year) if year else today.year
    period = PayrollPeriod.query.filter_by(month=month, year=year).first()
    if period is None:
        return f"Hệ thống chưa có kỳ lương tháng {month}/{year}."

    provisional = period.status != PayrollPeriod.STATUS_LOCKED
    mentioned, out_of_scope = _find_payroll_employee(user, employee, question or "")
    if out_of_scope:
        if role == "manager":
            return ("Bạn chỉ xem được phiếu lương của mình và nhóm mình quản lý.")
        return "Bạn chỉ xem được phiếu lương của chính mình."
    if mentioned is not None:
        item = PayrollItem.query.filter_by(
            period_id=period.id, employee_id=mentioned.id).first()
        if item is None:
            return (f"{mentioned.full_name} ({mentioned.code}) không có phiếu "
                    f"lương trong kỳ {month}/{year}.")
        return _payslip_text(item, provisional=provisional)

    if role in ("admin", "hr"):
        items = (PayrollItem.query.filter_by(period_id=period.id)
                 .order_by(PayrollItem.total_salary.desc()).all())
        return _payroll_table_text(period, items, provisional=provisional)
    if role == "manager" and employee is not None:
        from app.blueprints.leave import services as leave_services

        ids = sorted(set(leave_services._team_employee_ids(employee)) | {employee.id})
        items = (PayrollItem.query.filter(
                     PayrollItem.period_id == period.id,
                     PayrollItem.employee_id.in_(ids))
                 .order_by(PayrollItem.total_salary.desc()).all())
        return _payroll_table_text(period, items, provisional=provisional)
    if employee is None:
        return _NO_PROFILE_TEXT
    item = PayrollItem.query.filter_by(
        period_id=period.id, employee_id=employee.id).first()
    if item is None:
        return (f"Bạn không có phiếu lương trong kỳ {month}/{year} "
                "(có thể bạn chưa thuộc diện tính lương kỳ này).")
    return _payslip_text(item, provisional=provisional)


def tool_my_attendance(user, month=None, year=None, **_args) -> str:
    """Tổng hợp chấm công của chính người hỏi trong 1 tháng."""
    employee = _employee_of(user)
    if employee is None:
        return _NO_PROFILE_TEXT
    today = _today()
    month = int(month) if month else today.month
    year = int(year) if year else today.year
    first, next_first = _month_range(year, month)
    records = (Attendance.query
               .filter(Attendance.employee_id == employee.id,
                       Attendance.work_date >= first,
                       Attendance.work_date < next_first)
               .all())
    from app.blueprints.attendance import services as attendance_services

    summary = attendance_services.summarize(records)
    attended = summary["present"] + summary["late"]
    return (
        f"Tổng hợp chấm công tháng {month}/{year} của bạn: "
        f"đã đi làm {attended} ngày (đúng giờ {summary['present']}, "
        f"đi muộn {summary['late']}), vắng {summary['absent']} ngày, "
        f"nghỉ phép {summary['on_leave']} ngày."
    )


def _leave_scope_ids(user, employee) -> list[int] | None:
    """Danh sách employee_id được phép xem lịch nghỉ; None = toàn công ty."""
    role = getattr(user, "role", "employee")
    if role in ("admin", "hr"):
        return None
    if role == "manager" and employee is not None:
        from app.blueprints.leave import services as leave_services

        return sorted(leave_services._team_employee_ids(employee))
    return [employee.id] if employee is not None else []


def tool_who_on_leave(user, on_date=None, **_args) -> str:
    """Ai đang nghỉ phép vào 1 ngày — employee chỉ thấy của mình."""
    target = on_date or _today()
    employee = _employee_of(user)
    role = getattr(user, "role", "employee")
    if role == "employee" and employee is None:
        return _NO_PROFILE_TEXT
    scope_ids = _leave_scope_ids(user, employee)
    query = LeaveRequest.query.filter(
        LeaveRequest.status == LeaveRequest.STATUS_APPROVED,
        LeaveRequest.from_date <= target,
        LeaveRequest.to_date >= target,
    )
    if scope_ids is not None:
        query = query.filter(LeaveRequest.employee_id.in_(scope_ids or [-1]))
    requests = query.order_by(LeaveRequest.from_date).all()

    if role == "employee":
        if requests:
            req = requests[0]
            return (
                f"Ngày {_fmt_date(target)} bạn đang trong thời gian nghỉ phép "
                f"đã duyệt ({req.leave_type.name if req.leave_type else 'Nghỉ phép'}, "
                f"từ {_fmt_date(req.from_date)} đến {_fmt_date(req.to_date)})."
            )
        return (
            f"Ngày {_fmt_date(target)} bạn không có đơn nghỉ phép nào đã duyệt. "
            "Mình chỉ tra được lịch nghỉ của chính bạn — lịch nghỉ của đồng "
            "nghiệp bạn xem thêm ở trang Lịch team nhé."
        )

    if not requests:
        scope_text = "trong nhóm của bạn" if role == "manager" else "trong công ty"
        return f"Ngày {_fmt_date(target)} không có ai {scope_text} đang nghỉ phép."
    lines = [f"Ngày {_fmt_date(target)}, những người đang nghỉ phép:"]
    for req in requests[:20]:
        emp = req.employee
        name = emp.full_name if emp else "—"
        dept = (emp.department.name if emp is not None and emp.department else None)
        dept_text = f" ({dept})" if dept else ""
        type_text = req.leave_type.name if req.leave_type else "Nghỉ phép"
        lines.append(
            f"- {name}{dept_text} — {type_text}, "
            f"{_fmt_date(req.from_date)} đến {_fmt_date(req.to_date)}."
        )
    if len(requests) > 20:
        lines.append(f"… và {len(requests) - 20} người nữa.")
    return "\n".join(lines)


def tool_my_pending_approvals(user, **_args) -> str:
    """Đơn nghỉ đang chờ quyết định — theo đúng cấp duyệt của người hỏi."""
    role = getattr(user, "role", "employee")
    employee = _employee_of(user)
    waiting = (LeaveRequest.STATUS_PENDING, LeaveRequest.STATUS_MANAGER_APPROVED)

    if role == "manager":
        if employee is None:
            return _NO_PROFILE_TEXT
        from app.blueprints.leave import services as leave_services

        team_ids = sorted(leave_services._team_employee_ids(employee))
        requests = (LeaveRequest.query
                    .filter(LeaveRequest.employee_id.in_(team_ids or [-1]),
                            LeaveRequest.status == LeaveRequest.STATUS_PENDING)
                    .order_by(LeaveRequest.created_at)
                    .all())
        if not requests:
            return "Hiện không có đơn nghỉ phép nào đang chờ bạn duyệt."
        lines = [f"Có {len(requests)} đơn nghỉ phép đang chờ bạn duyệt (cấp quản lý):"]
        for req in requests[:5]:
            emp = req.employee
            name = emp.full_name if emp else "—"
            type_text = req.leave_type.name if req.leave_type else "Nghỉ phép"
            lines.append(
                f"- {name} — {type_text}, {_fmt_date(req.from_date)} đến "
                f"{_fmt_date(req.to_date)} ({_fmt_days(req.days_count)} ngày)."
            )
        if len(requests) > 5:
            lines.append(f"… và {len(requests) - 5} đơn nữa — xem đầy đủ ở trang Nghỉ phép.")
        return "\n".join(lines)

    if role in ("admin", "hr"):
        hr_waiting = LeaveRequest.query.filter_by(
            status=LeaveRequest.STATUS_MANAGER_APPROVED).count()
        manager_waiting = LeaveRequest.query.filter_by(
            status=LeaveRequest.STATUS_PENDING).count()
        if hr_waiting == 0 and manager_waiting == 0:
            return "Hiện không có đơn nghỉ phép nào đang chờ duyệt trong công ty."
        return (
            f"Hiện có {hr_waiting} đơn đang chờ HR duyệt (đã qua cấp quản lý) "
            f"và {manager_waiting} đơn đang chờ quản lý duyệt."
        )

    # employee: đơn của chính mình đang chờ
    if employee is None:
        return _NO_PROFILE_TEXT
    requests = (LeaveRequest.query
                .filter(LeaveRequest.employee_id == employee.id,
                        LeaveRequest.status.in_(waiting))
                .order_by(LeaveRequest.created_at)
                .all())
    if not requests:
        return "Bạn không có đơn nghỉ phép nào đang chờ duyệt."
    status_labels = {
        LeaveRequest.STATUS_PENDING: "chờ quản lý duyệt",
        LeaveRequest.STATUS_MANAGER_APPROVED: "chờ HR duyệt",
    }
    lines = [f"Bạn có {len(requests)} đơn nghỉ phép đang chờ duyệt:"]
    for req in requests[:5]:
        type_text = req.leave_type.name if req.leave_type else "Nghỉ phép"
        lines.append(
            f"- {type_text}, {_fmt_date(req.from_date)} đến {_fmt_date(req.to_date)} "
            f"— {status_labels.get(req.status, req.status)}."
        )
    return "\n".join(lines)


def tool_team_overview(user, **_args) -> str:
    """Tổng quan sĩ số theo scope: manager = phòng mình, hr/admin = công ty."""
    role = getattr(user, "role", "employee")
    if role == "employee":
        return (
            "Thông tin tổng quan sĩ số chỉ dành cho quản lý và HR. "
            "Bạn cứ hỏi về ngày phép, phiếu lương hoặc chấm công của chính mình nhé."
        )
    employee = _employee_of(user)
    today = _today()
    department_id = None
    department_name = None
    if role == "manager":
        if employee is None:
            return _NO_PROFILE_TEXT
        managed = (Department.query.filter_by(manager_id=employee.id)
                   .order_by(Department.id).first())
        if managed is not None:
            department_id, department_name = managed.id, managed.name
        elif employee.department_id:
            department_id = employee.department_id
            department_name = employee.department.name if employee.department else None
        if department_id is None:
            return "Tài khoản quản lý của bạn chưa gắn với phòng ban nào để xem tổng quan."

    emp_query = Employee.query.filter(Employee.status != Employee.STATUS_RESIGNED)
    if department_id is not None:
        emp_query = emp_query.filter(Employee.department_id == department_id)
    total = emp_query.count()

    leave_query = LeaveRequest.query.filter(
        LeaveRequest.status == LeaveRequest.STATUS_APPROVED,
        LeaveRequest.from_date <= today,
        LeaveRequest.to_date >= today,
    )
    if department_id is not None:
        leave_query = leave_query.join(
            Employee, LeaveRequest.employee_id == Employee.id
        ).filter(Employee.department_id == department_id)
    on_leave_today = len({req.employee_id for req in leave_query.all()})

    if department_id is not None:
        return (
            f"Tổng quan phòng {department_name or ''} hôm nay ({_fmt_date(today)}): "
            f"{total} nhân viên đang làm việc, {on_leave_today} người đang nghỉ phép."
        )
    total_departments = Department.query.count()
    return (
        f"Tổng quan công ty hôm nay ({_fmt_date(today)}): {total} nhân viên "
        f"đang làm việc thuộc {total_departments} phòng ban, "
        f"{on_leave_today} người đang nghỉ phép."
    )


TOOLS = {
    "leave_balance": tool_my_leave_balance,
    "payslip": tool_my_payslip,
    "attendance": tool_my_attendance,
    "who_on_leave": tool_who_on_leave,
    "pending_approvals": tool_my_pending_approvals,
    "team_overview": tool_team_overview,
}


# ---------------------------------------------------------------------------
# Nhận diện ý định — từ khoá tất định (bản bỏ dấu)
# ---------------------------------------------------------------------------

_MONTH_RE = re.compile(r"thang\s*(\d{1,2})(?:\s*/\s*(\d{4}))?")
_DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})(?:/(\d{4}))?")


def _parse_month_year(folded: str) -> tuple[int | None, int | None]:
    """Trích (tháng, năm) từ câu hỏi đã bỏ dấu; (None, None) nếu không rõ."""
    today = _today()
    month = year = None
    if "thang nay" in folded:
        month, year = today.month, today.year
    elif "thang truoc" in folded:
        prev = today.replace(day=1) - timedelta(days=1)
        month, year = prev.month, prev.year
    match = _MONTH_RE.search(folded)
    if match:
        candidate = int(match.group(1))
        if 1 <= candidate <= 12:
            month = candidate
            if match.group(2):
                year = int(match.group(2))
            elif year is None:
                year = today.year
    if year is None:
        year_match = re.search(r"nam\s*(\d{4})", folded)
        if year_match:
            year = int(year_match.group(1))
    return month, year


def _parse_leave_date(folded: str) -> date:
    """Ngày cần tra lịch nghỉ: hôm nay/ngày mai/hôm qua/dd/mm — mặc định hôm nay."""
    today = _today()
    if "ngay mai" in folded:
        return today + timedelta(days=1)
    if "hom qua" in folded:
        return today - timedelta(days=1)
    match = _DATE_RE.search(folded)
    if match:
        try:
            return date(int(match.group(3)) if match.group(3) else today.year,
                        int(match.group(2)), int(match.group(1)))
        except ValueError:
            return today
    return today


def detect_intent(question: str) -> tuple[str, dict] | None:
    """Nhận diện ý định bằng từ khoá tiếng Việt (có/không dấu đều khớp).

    Trả (tên tool, kwargs) hoặc None. Thứ tự kiểm tra từ cụ thể tới chung
    để câu như "phòng tôi có ai đang nghỉ hôm nay" rơi vào who_on_leave
    thay vì team_overview. Câu hỏi chính sách thuần ("quy trình xin nghỉ
    phép", "quy định chấm công", "chính sách lương") không khớp tool nào.
    """
    folded = _fold(question)
    month, year = _parse_month_year(folded)
    tokens = set(folded.split())

    if ("phieu luong" in folded or "thuc linh" in folded
            or "bang luong" in folded or "ai luong cao" in folded
            or ("luong" in folded and ("cua toi" in folded or month is not None))):
        return "payslip", {"month": month, "year": year}

    if (("phep" in folded and ("con lai" in folded or "con bao nhieu" in folded
                               or "bao nhieu ngay phep" in folded
                               or "con may ngay phep" in folded))
            or "so du phep" in folded):
        return "leave_balance", {}

    if ("ai dang nghi" in folded or "ai vang" in folded
            or ("ai" in tokens and "nghi" in folded)):
        return "who_on_leave", {"on_date": _parse_leave_date(folded)}

    if "cham cong" in folded and ("cua toi" in folded or month is not None):
        return "attendance", {"month": month, "year": year}

    if "cho duyet" in folded:
        return "pending_approvals", {}

    if ("si so" in folded or "bao nhieu nhan vien" in folded
            or "tong nhan vien" in folded or "nhan su phong" in folded):
        return "team_overview", {}

    return None


# ---------------------------------------------------------------------------
# Nhận diện ý định bằng AI (khi provider khả dụng) — chỉ PHÂN LOẠI
# ---------------------------------------------------------------------------

_CLASSIFY_SYSTEM_PROMPT = (
    "Bạn là bộ phân loại ý định cho chatbot HR nội bộ. Đọc câu hỏi của nhân "
    "viên và trả về DUY NHẤT một JSON {\"intent\": ..., \"month\": ..., "
    "\"year\": ...} — không giải thích. intent là một trong: "
    "\"leave_balance\" (hỏi số phép còn lại của bản thân), \"payslip\" (hỏi "
    "phiếu lương/bảng lương — của bản thân, của nhân viên khác, hoặc toàn công ty), \"attendance\" (hỏi tổng hợp chấm công "
    "của bản thân), \"who_on_leave\" (hỏi ai đang nghỉ phép), "
    "\"pending_approvals\" (hỏi đơn đang chờ duyệt), \"team_overview\" (hỏi "
    "sĩ số/tổng quan nhân sự), \"none\" (mọi câu hỏi khác, đặc biệt là hỏi "
    "chính sách/quy chế). month/year là tháng/năm được nhắc tới trong câu "
    "hỏi (số nguyên) hoặc null nếu không nhắc."
)


def _classify_with_llm(question: str) -> tuple[str, dict] | None:
    """Nhờ AI phân loại ý định khi từ khoá không khớp; None nếu không được.

    Provider hiện tại (ai_service) chưa có API function/tool-calling —
    chat_completion ép trả JSON nên dùng nó để phân loại. Model CHỈ chọn
    ý định; tool vẫn tự ép scope và tự lấy số liệu thật.
    """
    try:
        from app import ai_service

        provider = ai_service.get_provider()
    except Exception:
        return None
    if provider is None or not getattr(provider, "is_available", False):
        return None
    try:
        raw = provider.chat_completion(
            _CLASSIFY_SYSTEM_PROMPT, f"Câu hỏi: {question}")
        parsed = json.loads(raw)
    except Exception:
        current_app.logger.warning(
            "Chatbot: phân loại ý định bằng AI thất bại, dùng luồng RAG.",
            exc_info=True)
        return None
    if not isinstance(parsed, dict):
        return None
    intent = parsed.get("intent")
    if intent not in TOOLS:
        return None
    kwargs: dict = {}
    if intent in ("payslip", "attendance"):
        for key in ("month", "year"):
            value = parsed.get(key)
            if isinstance(value, int) and not isinstance(value, bool):
                kwargs[key] = value
        if "month" in kwargs and not (1 <= kwargs["month"] <= 12):
            kwargs.pop("month")
    if intent == "who_on_leave":
        kwargs["on_date"] = _parse_leave_date(_fold(question))
    return intent, kwargs


# ---------------------------------------------------------------------------
# Điểm vào duy nhất cho services.ask_question
# ---------------------------------------------------------------------------

def try_answer(user, question: str) -> str | None:
    """Trả câu trả lời từ DỮ LIỆU THẬT (kèm dòng nguồn) hoặc None.

    None = câu hỏi không thuộc tool nào -> tầng trên đi luồng RAG như cũ.
    Lỗi bất ngờ trong tool cũng trả None (đã log) để không làm hỏng chat.
    """
    found = detect_intent(question) or _classify_with_llm(question)
    if not found:
        return None
    name, kwargs = found
    handler = TOOLS.get(name)
    if handler is None:
        return None
    try:
        text = handler(user, question=question, **kwargs)
    except Exception:
        current_app.logger.warning(
            "Chatbot: tool %s lỗi, chuyển sang luồng RAG.", name, exc_info=True)
        return None
    if not text or not str(text).strip():
        return None
    answer = str(text).strip()
    if not answer.endswith(SOURCE_LINE):
        answer = f"{answer}\n\n{SOURCE_LINE}"
    return answer
