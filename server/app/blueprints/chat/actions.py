"""Action layer cho Chatbot HR — ĐỀ XUẤT hành động 2 bước (v5 mục A).

Nguyên tắc an toàn (hợp đồng feature-expansion-v5, mục A.1):
- Chatbot chỉ ĐỀ XUẤT, không tự thực thi. `detect_action()` chạy trong
  luồng `POST /chat/ask`: nhận diện ý định hành động bằng mẫu xác định
  tiếng Việt, trích payload (ngày tháng ICT, loại phép) HOÀN TOÀN bằng
  code tất định — LLM không được trích số liệu — và KHÔNG đụng vào dữ
  liệu. Đủ dữ kiện -> trả action để FE hiển thị thẻ xác nhận; thiếu/mơ
  hồ -> trả câu hỏi làm rõ (không kèm action).
- Thực thi chỉ xảy ra ở `execute_action()` (POST /chat/actions/execute)
  khi người dùng bấm xác nhận, và tầng này KIỂM TRA LẠI toàn bộ quyền +
  điều kiện bằng services của module leave tại thời điểm chạy — payload
  đề xuất không bao giờ được tin cậy (FE có thể đã bị sửa).

Hành động hỗ trợ (mục A.2):
- `create_leave`: mọi nhân viên tạo đơn cho CHÍNH MÌNH.
  Payload: {leave_type (tên loại phép), start_date, end_date, reason}.
- `decide_leave`: chỉ cấp duyệt HIỆN TẠI của đơn (manager với đơn
  pending trong team; hr/admin với đơn manager_approved).
  Payload: {request_id, decision: "approve"|"reject", note?}.

Mở rộng 2026-11-15 (phân quyền đủ 4 role — admin/hr/manager/employee):
- `create_overtime`: mọi nhân viên có hồ sơ tạo đơn tăng ca cho CHÍNH MÌNH.
  Payload: {work_date, hours, reason?}. Trùng ngày -> 409 ở cả detect lẫn execute.
- `create_kudos`: mọi nhân viên tặng kudos cho đồng nghiệp KHÁC mình.
  Payload: {to_employee_id, badge, message}. Tự tặng mình -> từ chối.
- `create_shift_swap`: mọi nhân viên có hồ sơ xin đổi ca với đồng nghiệp.
  Payload: {target_id, work_date, note?}. Ngày quá khứ / trùng đơn chờ -> từ chối.
- `create_announcement`: CHỈ admin/hr đăng thông báo công ty.
  Payload: {title, content, category}. Nhân viên/manager -> từ chối rõ ràng.
- "Duyệt đơn tăng ca / đổi ca" qua chat CHƯA hỗ trợ: detect_action chặn
  trước khi rơi vào decide_leave và hướng dẫn vào đúng trang để duyệt.

Mọi lỗi nghiệp vụ ở bước execute là ApiError nguyên bản của leave
services (403 không phải cấp duyệt, 409 trùng lịch/trạng thái, 400
không đủ phép...) — lớp này không bọc lại.
"""
from __future__ import annotations

import re
from datetime import date, timedelta

from flask import current_app

from app.blueprints.chat.tools import (
    _employee_of, _fmt_date, _fmt_days, _fold, _today,
)
from app.blueprints.leave import schemas as leave_schemas
from app.blueprints.leave import services as leave_services
from app.errors import ApiError
from app.extensions import db
from app.models import (
    Employee,
    Kudo,
    LeaveRequest,
    LeaveType,
    OvertimeRequest,
    ShiftSwapRequest,
)

_NO_PROFILE_TEXT = (
    "Tài khoản của bạn chưa được gắn với hồ sơ nhân viên nên mình chưa "
    "thực hiện được thao tác này. Vui lòng liên hệ HR để được gắn hồ sơ nhé."
)

_WEEKDAY_NAMES = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm",
                  "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]


def _fmt_date_full(d: date) -> str:
    """'Thứ Sáu 23/10/2026' — hiển thị trên thẻ hành động."""
    return f"{_WEEKDAY_NAMES[d.weekday()]} {_fmt_date(d)}"


# ---------------------------------------------------------------------------
# Nhận diện ý định hành động — mẫu từ khoá xác định (bản đã bỏ dấu)
# ---------------------------------------------------------------------------

_CREATE_TRIGGERS = (
    "xin nghi", "dang ky nghi", "muon nghi", "lam don nghi",
    "tao don nghi", "gui don nghi", "viet don nghi",
)
# Câu hỏi về QUY TRÌNH/chính sách ("quy trình xin nghỉ phép...") không
# phải yêu cầu tạo đơn — loại trừ trước để giữ nguyên luồng RAG/tools.
_CREATE_EXCLUDES = (
    "quy trinh", "lam sao", "nhu the nao", "can gi", "can nhung gi",
    "giay to", "chinh sach", "quy dinh", "quy che", "bao nhieu ngay",
    "con bao nhieu", "duoc nghi bao nhieu", "may buoc", "gom nhung buoc",
)


def _is_create_intent(folded: str) -> bool:
    if any(marker in folded for marker in _CREATE_EXCLUDES):
        return False
    return any(trigger in folded for trigger in _CREATE_TRIGGERS)


def _is_decide_intent(folded: str) -> bool:
    if "don" not in folded:
        return False
    return any(k in folded for k in ("duyet", "tu choi", "phe duyet", "dong y"))


# ---------------------------------------------------------------------------
# Trích xuất dữ kiện xác định — ngày tháng ICT, loại phép, lý do
# ---------------------------------------------------------------------------

_DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})(?:/(\d{4}))?")
_WEEKDAY_RE = re.compile(
    r"(thu\s*(?:2|3|4|5|6|7|hai|ba|tu|nam|sau|bay)|chu\s*nhat)")
_WEEKDAY_MAP = {"2": 0, "hai": 0, "3": 1, "ba": 1, "4": 2, "tu": 2,
                "5": 3, "nam": 3, "6": 4, "sau": 4, "7": 5, "bay": 5}
_DURATION_RE = re.compile(r"(\d+)\s*ngay\b")
_REASON_RE = re.compile(
    r"(?:ly\s*do|lý\s*do|vì|vi)\b\s*[:\-]?\s*(.+)$", re.IGNORECASE)


def _extract_dates(folded: str) -> list[date]:
    """Mọi mốc ngày nhắc trong câu (theo thứ tự xuất hiện, đã khử trùng).

    Hỗ trợ: dd/mm[/yyyy], "hôm nay", "ngày mai", "ngày mốt/kia",
    thứ trong tuần ("thứ Sáu này" = thứ Sáu của tuần này — nếu hôm nay
    đúng thứ đó thì là hôm nay; thêm "tuần sau/tuần tới" thì +7 ngày).
    Mọi mốc đều tính theo ngày ICT của tools._today().
    """
    today = _today()
    found: list[tuple[int, date]] = []

    for match in _DATE_RE.finditer(folded):
        try:
            parsed = date(int(match.group(3)) if match.group(3) else today.year,
                          int(match.group(2)), int(match.group(1)))
        except ValueError:
            continue
        found.append((match.start(), parsed))

    for pattern, delta in (("ngay mai", 1), ("ngay mot", 2),
                           ("ngay kia", 2), ("hom nay", 0)):
        for match in re.finditer(pattern, folded):
            found.append((match.start(), today + timedelta(days=delta)))

    for match in _WEEKDAY_RE.finditer(folded):
        token = re.sub(r"\s+", "", match.group(1))
        if token.startswith("chu"):
            target = 6
        else:
            target = _WEEKDAY_MAP.get(token[3:])
            if target is None:
                continue
        parsed = today + timedelta(days=(target - today.weekday()) % 7)
        tail = folded[match.end():match.end() + 14]
        if "tuan sau" in tail or "tuan toi" in tail:
            parsed += timedelta(days=7)
        found.append((match.start(), parsed))

    found.sort(key=lambda item: item[0])
    dates: list[date] = []
    for _, parsed in found:
        if parsed not in dates:
            dates.append(parsed)
    return dates


def _extract_reason(question: str) -> str:
    """Lý do sau 'lý do ...' / 'vì ...' trong câu gốc (giữ nguyên dấu)."""
    match = _REASON_RE.search(question or "")
    if not match:
        return ""
    reason = match.group(1).strip().rstrip("。.!").strip()
    return reason[:200]


def _detect_leave_type(folded: str) -> LeaveType | None:
    """Khớp loại phép theo tên trong DB (bản bỏ dấu); mặc định Phép năm."""
    types = LeaveType.query.order_by(LeaveType.id.asc()).all()
    if not types:
        return None

    def _by(marker: str) -> LeaveType | None:
        for leave_type in types:
            if marker in _fold(leave_type.name):
                return leave_type
        return None

    if "khong luong" in folded:
        return _by("khong luong") or types[0]
    tokens = set(folded.split())
    if "om" in tokens or "nghi om" in folded or "phep om" in folded:
        return _by("om") or types[0]
    return _by("phep nam") or types[0]


# ---------------------------------------------------------------------------
# Đề xuất: tạo đơn nghỉ cho chính mình
# ---------------------------------------------------------------------------

def _detect_create_leave(user, question: str, folded: str) -> dict | None:
    employee = _employee_of(user)
    if employee is None:
        return {"answer": _NO_PROFILE_TEXT, "action": None}

    leave_type = _detect_leave_type(folded)
    if leave_type is None:
        return None  # Chưa cấu hình loại phép -> để luồng thường xử lý.

    dates = _extract_dates(folded)
    reason = _extract_reason(question)
    today = _today()

    if not dates:
        return {
            "answer": (
                f"Mình sẵn sàng soạn đơn {leave_type.name} cho bạn. "
                "Bạn cho mình biết ngày muốn nghỉ nhé — ví dụ: 'thứ Sáu "
                "này', 'ngày mai', 'từ 27/10 đến 29/10' hoặc 'nghỉ 3 ngày "
                "từ thứ Hai tuần sau', kèm lý do nghỉ."
            ),
            "action": None,
        }

    start = dates[0]
    if len(dates) >= 2:
        end = dates[-1]
    else:
        duration = _DURATION_RE.search(folded)
        if duration and int(duration.group(1)) > 0:
            end = start + timedelta(days=int(duration.group(1)) - 1)
        else:
            end = start

    if end < start:
        return {
            "answer": (
                "Mình chưa rõ khoảng ngày bạn muốn nghỉ (ngày kết thúc "
                "đang trước ngày bắt đầu). Bạn nói lại giúp mình theo "
                "dạng 'từ ngày X đến ngày Y' nhé."
            ),
            "action": None,
        }
    if end < today:
        return {
            "answer": (
                f"Ngày bạn nhắc ({_fmt_date_full(start)}) đã qua rồi nên "
                "mình chưa soạn được đơn. Bạn muốn nghỉ vào ngày nào sắp "
                "tới thì cho mình biết nhé."
            ),
            "action": None,
        }

    workdays = leave_services.count_workdays(start, end)
    if workdays <= 0:
        return {
            "answer": (
                f"Khoảng {_fmt_date_full(start)} đến {_fmt_date_full(end)} "
                "toàn là cuối tuần, không có ngày làm việc nào để xin "
                "nghỉ. Bạn chọn lại khoảng ngày khác giúp mình nhé."
            ),
            "action": None,
        }

    if not reason:
        return {
            "answer": (
                f"Mình đã rõ: bạn muốn nghỉ {leave_type.name} từ "
                f"{_fmt_date_full(start)} đến {_fmt_date_full(end)} "
                f"({workdays} ngày công). Bạn cho mình xin thêm lý do "
                "nghỉ nữa nhé (ví dụ: 'lý do việc nhà')."
            ),
            "action": None,
        }

    action = {
        "type": "create_leave",
        "title": "Tạo đơn xin nghỉ phép",
        "summary": (
            f"Xin nghỉ {leave_type.name} từ {_fmt_date(start)} đến "
            f"{_fmt_date(end)} ({workdays} ngày công) — lý do: {reason}."
        ),
        "details": [
            {"label": "Người xin nghỉ", "value": employee.full_name},
            {"label": "Loại phép", "value": leave_type.name},
            {"label": "Từ ngày", "value": _fmt_date_full(start)},
            {"label": "Đến ngày", "value": _fmt_date_full(end)},
            {"label": "Số ngày công", "value": str(workdays)},
            {"label": "Lý do", "value": reason},
        ],
        "payload": {
            "leave_type": leave_type.name,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "reason": reason,
        },
    }
    return {
        "answer": (
            "Mình đã soạn sẵn đơn nghỉ theo thông tin bạn cung cấp. "
            "Bạn kiểm tra lại thẻ bên dưới rồi bấm “Xác nhận thực hiện” "
            "để gửi đơn — đơn sẽ ở trạng thái chờ quản lý duyệt."
        ),
        "action": action,
    }


# ---------------------------------------------------------------------------
# Đề xuất: duyệt / từ chối đơn của người khác (đúng cấp duyệt hiện tại)
# ---------------------------------------------------------------------------

def _pending_for_approver(user, employee) -> list[tuple[str, LeaveRequest]]:
    """(cấp duyệt, đơn) đang chờ ĐÚNG cấp của người gọi.

    manager/admin: đơn pending của nhân viên trong team (theo
    leave._team_employee_ids — cùng phạm vi leave.services dùng).
    hr/admin: đơn manager_approved (đang chờ HR chốt).
    """
    role = getattr(user, "role", "employee")
    pending: list[tuple[str, LeaveRequest]] = []
    if role in ("manager", "admin") and employee is not None:
        team_ids = sorted(leave_services._team_employee_ids(employee))
        if team_ids:
            rows = (LeaveRequest.query
                    .filter(LeaveRequest.employee_id.in_(team_ids),
                            LeaveRequest.status == LeaveRequest.STATUS_PENDING)
                    .order_by(LeaveRequest.created_at)
                    .all())
            pending.extend(("manager", row) for row in rows)
    if role in ("hr", "admin"):
        rows = (LeaveRequest.query
                .filter_by(status=LeaveRequest.STATUS_MANAGER_APPROVED)
                .order_by(LeaveRequest.created_at)
                .all())
        pending.extend(("hr", row) for row in rows)
    return pending


def _employee_mentioned(employee, question: str, folded: str) -> bool:
    """Câu hỏi có nhắc tới nhân viên này (mã NV hoặc tên) hay không."""
    if employee is None:
        return False
    code = (getattr(employee, "code", None) or "").strip()
    if code and code.lower() in (question or "").lower():
        return True
    full_name = _fold(getattr(employee, "full_name", "") or "")
    if full_name and full_name in folded:
        return True
    given_name = full_name.split()[-1] if full_name else ""
    return bool(given_name) and given_name in set(folded.split())


def _request_matches_employee(request: LeaveRequest, question: str,
                              folded: str) -> bool:
    """Khớp đơn theo Mã NV hoặc tên người xin nhắc trong câu hỏi."""
    return _employee_mentioned(
        request.employee if request is not None else None, question, folded)


def _find_mentioned_employee(user, employee, question: str, folded: str):
    """Nhân viên trong phạm vi của người gọi mà câu hỏi nhắc tới.

    Kể cả người KHÔNG có đơn đang chờ duyệt — dùng để phân biệt "không
    nhắc tên ai" (được rơi về đơn duy nhất đang chờ) với "nhắc tên người
    không có đơn" (phải hỏi lại, không được lấy đơn của người khác).
    Trả Employee đầu tiên khớp (theo id) hoặc None.
    """
    role = getattr(user, "role", "employee")
    if role in ("hr", "admin"):
        # HR duyệt đơn đã qua vòng manager trên toàn công ty.
        employees = Employee.query.order_by(Employee.id).all()
    elif role == "manager" and employee is not None:
        team_ids = sorted(leave_services._team_employee_ids(employee))
        if not team_ids:
            return None
        employees = (Employee.query.filter(Employee.id.in_(team_ids))
                     .order_by(Employee.id).all())
    else:
        return None
    for candidate in employees:
        if _employee_mentioned(candidate, question, folded):
            return candidate
    return None


def _request_line(request: LeaveRequest) -> str:
    employee = request.employee
    name = employee.full_name if employee else "—"
    code = f" ({employee.code})" if employee and getattr(employee, "code", None) else ""
    type_name = request.leave_type.name if request.leave_type else "Nghỉ phép"
    return (
        f"- {name}{code} — {type_name}, {_fmt_date(request.from_date)} đến "
        f"{_fmt_date(request.to_date)} ({_fmt_days(request.days_count)} ngày công), "
        f"lý do: {request.reason or '—'}."
    )


def _detect_decide_leave(user, question: str, folded: str) -> dict | None:
    role = getattr(user, "role", "employee")
    if role not in ("manager", "hr", "admin"):
        return None  # Nhân viên thường không phải cấp duyệt đơn của ai.

    employee = _employee_of(user)
    candidates = _pending_for_approver(user, employee)
    if not candidates:
        return {
            "answer": "Hiện không có đơn nghỉ phép nào đang chờ bạn duyệt.",
            "action": None,
        }

    named = [item for item in candidates
             if _request_matches_employee(item[1], question, folded)]
    if not named:
        # Người gọi nhắc tên một người cụ thể nhưng người đó không có đơn
        # đang chờ duyệt: hỏi lại, KHÔNG được rơi về đơn của người khác.
        mentioned = _find_mentioned_employee(user, employee, question, folded)
        if mentioned is not None:
            return {
                "answer": (
                    f"Không có đơn nghỉ phép nào đang chờ bạn duyệt của "
                    f"{mentioned.full_name}. Bạn kiểm tra lại tên người xin "
                    "nghỉ giúp mình nhé."
                ),
                "action": None,
            }
    pool = named or candidates

    if len(pool) > 1:
        lines = [
            f"Có {len(pool)} đơn đang chờ bạn duyệt — bạn muốn xử lý đơn nào?",
        ]
        lines.extend(_request_line(req) for _, req in pool[:10])
        lines.append(
            "Bạn nhắn rõ tên người xin nghỉ (ví dụ: 'duyệt đơn của Lan') "
            "để mình soạn thẻ xác nhận cho đúng đơn nhé."
        )
        return {"answer": "\n".join(lines), "action": None}

    _, request = pool[0]
    is_reject = any(k in folded for k in ("tu choi", "khong duyet", "khong dong y"))
    decision = "reject" if is_reject else "approve"
    note = _extract_reason(question) if is_reject else ""

    if is_reject and not note:
        requester = request.employee.full_name if request.employee else "nhân viên"
        return {
            "answer": (
                f"Bạn muốn từ chối đơn của {requester} — theo quy định, "
                "từ chối bắt buộc phải có lý do. Bạn nhắn thêm lý do giúp "
                "mình nhé (ví dụ: 'từ chối đơn của "
                f"{(requester or '').split()[-1] if requester else ''} "
                "vì đang cao điểm dự án')."
            ),
            "action": None,
        }

    requester = request.employee
    requester_name = requester.full_name if requester else "—"
    requester_code = (getattr(requester, "code", None) or "") if requester else ""
    type_name = request.leave_type.name if request.leave_type else "Nghỉ phép"
    details = [
        {"label": "Người xin nghỉ",
         "value": f"{requester_name} ({requester_code})" if requester_code else requester_name},
        {"label": "Loại phép", "value": type_name},
        {"label": "Từ ngày", "value": _fmt_date_full(request.from_date)},
        {"label": "Đến ngày", "value": _fmt_date_full(request.to_date)},
        {"label": "Số ngày công", "value": _fmt_days(request.days_count)},
        {"label": "Lý do", "value": request.reason or "—"},
        {"label": "Quyết định", "value": "Từ chối" if is_reject else "Duyệt"},
    ]
    if note:
        details.append({"label": "Ghi chú", "value": note})

    action = {
        "type": "decide_leave",
        "title": "Từ chối đơn nghỉ phép" if is_reject else "Duyệt đơn nghỉ phép",
        "summary": (
            f"{'Từ chối' if is_reject else 'Duyệt'} đơn {type_name} của "
            f"{requester_name} ({_fmt_date(request.from_date)} – "
            f"{_fmt_date(request.to_date)})."
        ),
        "details": details,
        "payload": {
            "request_id": request.id,
            "decision": decision,
            "note": note or None,
        },
    }
    return {
        "answer": (
            "Mình đã tìm thấy đơn cần xử lý. Bạn kiểm tra thẻ bên dưới "
            "rồi bấm “Xác nhận thực hiện” để "
            f"{'từ chối' if is_reject else 'duyệt'} đơn nhé."
        ),
        "action": action,
    }


# ---------------------------------------------------------------------------
# Đề xuất tạo mới (mở rộng 2026-11-15) — tăng ca / kudos / đổi ca / thông báo
# ---------------------------------------------------------------------------

def _find_employee_by_mention(question: str):
    """Nhân viên đang làm việc được nhắc (mã NV hoặc họ tên đầy đủ).

    KHÔNG khớp tên riêng ("Minh", "Lan") — cùng lý do như lương: tên riêng
    trùng từ thường nên đoán sai sẽ tạo đơn cho nhầm người. Trả
    (employee|None, ambiguous: bool).
    """
    folded = _fold(question or "")
    q = (question or "").lower()
    pool = (Employee.query
            .filter(Employee.status != Employee.STATUS_RESIGNED)
            .order_by(Employee.id).all())
    matches = []
    for cand in pool:
        code = (getattr(cand, "code", "") or "").strip().lower()
        if code and code in q:
            matches.append(cand)
            continue
        full = _fold(getattr(cand, "full_name", "") or "")
        if full and full in folded:
            matches.append(cand)
    if len(matches) == 1:
        return matches[0], False
    return None, len(matches) > 1


_OT_CREATE_MARKERS = (
    "xin tang ca", "dang ky tang ca", "dang ki tang ca",
    "tao don tang ca", "lam don tang ca", "muon tang ca",
)
# Câu HỎI về tăng ca (thống kê/xem đơn) không phải ý định tạo đơn — loại
# trừ trước để rơi về tool tra cứu thay vì bị chặn ở thẻ tạo đơn.
_OT_QUERY_MARKERS = (
    "thong ke", "tong hop", "bao nhieu", "ai tang ca",
    "danh sach", "xem don", "don tang ca",
)
_KUDOS_TRIGGERS = ("tang kudos", "tang diem ghi nhan", "khen thuong")
_KUDOS_QUERY_MARKERS = (
    "ai duoc tang", "bao nhieu kudos", "nhieu nhat",
    "xem kudos", "danh sach kudos",
)
_SWAP_CREATE_MARKERS = (
    "xin doi ca", "tao don doi ca", "lam don doi ca",
    "muon doi ca", "hoan doi ca",
)
_SWAP_QUERY_MARKERS = ("ai doi ca", "danh sach", "xem don", "don doi ca")
_ANNOUNCE_TRIGGERS = ("dang thong bao", "tao thong bao", "gui thong bao")


def _is_overtime_intent(folded: str) -> bool:
    """Ý định TẠO đơn tăng ca (không phải hỏi thống kê/xem đơn)."""
    if any(m in folded for m in _OT_CREATE_MARKERS):
        return True
    if any(m in folded for m in _OT_QUERY_MARKERS):
        return False
    # "tăng ca 21/11 3 giờ" (có ngày, không có từ hỏi) -> hiểu là muốn tạo đơn.
    return "tang ca" in folded and bool(_extract_dates(folded))


def _is_kudos_intent(folded: str) -> bool:
    if any(m in folded for m in _KUDOS_QUERY_MARKERS):
        return False
    return any(t in folded for t in _KUDOS_TRIGGERS)


def _is_swap_intent(folded: str) -> bool:
    """Ý định TẠO đơn đổi ca (không phải hỏi ai đổi ca/xem đơn)."""
    if any(m in folded for m in _SWAP_CREATE_MARKERS):
        return True
    if any(m in folded for m in _SWAP_QUERY_MARKERS):
        return False
    return "doi ca" in folded and bool(_extract_dates(folded))


def _is_announce_intent(folded: str) -> bool:
    return any(t in folded for t in _ANNOUNCE_TRIGGERS)


_HOURS_HM_RE = re.compile(r"(\d+)\s*h\s*(\d{1,2})\b")
_HOURS_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:gio|h)\b")


def _extract_hours(folded: str):
    """Số giờ tăng ca: '2h30' -> 2.5, '3 giờ'/'3,5 giờ' -> 3.0/3.5."""
    match = _HOURS_HM_RE.search(folded or "")
    if match:
        try:
            return int(match.group(1)) + int(match.group(2)) / 60.0
        except ValueError:
            pass
    match = _HOURS_RE.search(folded or "")
    if not match:
        return None
    try:
        return float(match.group(1).replace(",", "."))
    except ValueError:
        return None


_BADGE_LABELS = {
    "teamwork": "Đồng đội",
    "innovation": "Sáng tạo",
    "dedication": "Tận tâm",
    "leadership": "Lãnh đạo",
    "thanks": "Cảm ơn",
}
_BADGE_MARKERS = (
    ("doi nhom", "teamwork"), ("teamwork", "teamwork"),
    ("sang tao", "innovation"), ("innovation", "innovation"),
    ("tan tam", "dedication"), ("dedication", "dedication"),
    ("lanh dao", "leadership"), ("leadership", "leadership"),
)


def _detect_badge(folded: str) -> str:
    for marker, badge in _BADGE_MARKERS:
        if marker in folded:
            return badge
    return "thanks"


def _detect_create_overtime(user, question: str, folded: str) -> dict | None:
    employee = _employee_of(user)
    if employee is None:
        return {"answer": _NO_PROFILE_TEXT, "action": None}
    dates = _extract_dates(folded)
    hours = _extract_hours(folded)
    reason = _extract_reason(question)

    if not dates:
        return {
            "answer": (
                "Mình sẵn sàng soạn đơn tăng ca cho bạn. Bạn cho mình biết "
                "ngày tăng ca nhé — ví dụ: 'thứ Bảy này', 'ngày mai', '17/11'."
            ),
            "action": None,
        }
    work_date = dates[0]
    if hours is None:
        return {
            "answer": (
                f"Mình đã rõ ngày tăng ca là {_fmt_date_full(work_date)}. "
                "Bạn tăng ca mấy giờ hôm đó? (ví dụ: '2 giờ', '3,5 giờ')."
            ),
            "action": None,
        }
    if hours <= 0 or hours > 16:
        return {
            "answer": (
                "Số giờ tăng ca phải từ 0,5 đến 16 giờ trong một ngày. "
                "Bạn cho mình số giờ đúng nhé."
            ),
            "action": None,
        }
    # Cảnh báo sớm khi đã có đơn cho ngày đó (execute kiểm tra lại).
    existing = (OvertimeRequest.query
                .filter_by(employee_id=employee.id, work_date=work_date)
                .filter(OvertimeRequest.status != OvertimeRequest.STATUS_REJECTED)
                .first())
    if existing is not None:
        return {
            "answer": (
                f"Ngày {_fmt_date_full(work_date)} bạn đã có đơn tăng ca rồi "
                "nên mình chưa soạn đơn mới được. Bạn xem lại ở trang Tăng ca nhé."
            ),
            "action": None,
        }
    action = {
        "type": "create_overtime",
        "title": "Tạo đơn tăng ca",
        "summary": (
            f"Xin tăng ca {_fmt_days(hours)} giờ ngày "
            f"{_fmt_date(work_date)}"
            + (f" — lý do: {reason}." if reason else ".")
        ),
        "details": [
            {"label": "Người xin tăng ca", "value": employee.full_name},
            {"label": "Ngày tăng ca", "value": _fmt_date_full(work_date)},
            {"label": "Số giờ", "value": _fmt_days(hours)},
            {"label": "Lý do", "value": reason or "—"},
        ],
        "payload": {
            "work_date": work_date.isoformat(),
            "hours": hours,
            "reason": reason or None,
        },
    }
    return {
        "answer": (
            "Mình đã soạn sẵn đơn tăng ca theo thông tin bạn cung cấp. "
            "Bạn kiểm tra lại thẻ bên dưới rồi bấm “Xác nhận thực hiện” "
            "để gửi đơn — đơn sẽ ở trạng thái chờ quản lý duyệt."
        ),
        "action": action,
    }


def _detect_create_kudos(user, question: str, folded: str) -> dict | None:
    employee = _employee_of(user)
    if employee is None:
        return {"answer": _NO_PROFILE_TEXT, "action": None}
    target, ambiguous = _find_employee_by_mention(question)
    if ambiguous:
        return {
            "answer": (
                "Mình thấy câu của bạn nhắc tới nhiều người — bạn nói rõ "
                "tặng kudos cho ai giúp mình nhé (mã NV hoặc họ tên đầy đủ)."
            ),
            "action": None,
        }
    if target is None:
        return {
            "answer": (
                "Bạn muốn tặng kudos cho ai? Cho mình mã NV hoặc họ tên "
                "đầy đủ của người đó nhé."
            ),
            "action": None,
        }
    if target.id == employee.id:
        return {
            "answer": (
                "Mình không tặng kudos cho chính mình được — bạn chọn một "
                "đồng nghiệp khác nhé."
            ),
            "action": None,
        }
    badge = _detect_badge(folded)
    message = _extract_reason(question)
    if not message:
        return {
            "answer": (
                f"Mình đã rõ bạn muốn tặng kudos cho {target.full_name}. "
                "Bạn nhắn thêm lời ghi nhận muốn gửi kèm nhé (ví dụ: "
                "'vì đã hỗ trợ dự án rất tốt')."
            ),
            "action": None,
        }
    badge_label = _BADGE_LABELS.get(badge, "Cảm ơn")
    action = {
        "type": "create_kudos",
        "title": "Tặng kudos",
        "summary": (
            f"Tặng kudos ({badge_label}) cho {target.full_name} — {message}"
        ),
        "details": [
            {"label": "Người nhận", "value": f"{target.full_name} ({target.code})"},
            {"label": "Huy hiệu", "value": badge_label},
            {"label": "Lời nhắn", "value": message},
        ],
        "payload": {
            "to_employee_id": target.id,
            "badge": badge,
            "message": message,
        },
    }
    return {
        "answer": (
            "Mình đã soạn sẵn lời ghi nhận cho bạn. Bạn kiểm tra lại thẻ "
            "bên dưới rồi bấm “Xác nhận thực hiện” để gửi kudos nhé."
        ),
        "action": action,
    }


def _detect_create_swap(user, question: str, folded: str) -> dict | None:
    employee = _employee_of(user)
    if employee is None:
        return {"answer": _NO_PROFILE_TEXT, "action": None}
    target, ambiguous = _find_employee_by_mention(question)
    dates = _extract_dates(folded)
    today = _today()

    if ambiguous:
        return {
            "answer": (
                "Mình thấy câu của bạn nhắc tới nhiều người — bạn nói rõ "
                "muốn đổi ca với ai giúp mình nhé (mã NV hoặc họ tên đầy đủ)."
            ),
            "action": None,
        }
    if target is None:
        return {
            "answer": (
                "Bạn muốn đổi ca với ai, vào ngày nào? Cho mình tên đồng "
                "nghiệp và ngày nhé (ví dụ: 'đổi ca ngày 18/11 với Lan')."
            ),
            "action": None,
        }
    if target.id == employee.id:
        return {
            "answer": (
                "Bạn không đổi ca với chính mình được — bạn chọn một đồng "
                "nghiệp khác nhé."
            ),
            "action": None,
        }
    if not dates:
        return {
            "answer": (
                f"Mình đã rõ bạn muốn đổi ca với {target.full_name}. "
                "Bạn cho mình biết ngày đổi ca nhé — ví dụ: '18/11', "
                "'thứ Tư tuần sau'."
            ),
            "action": None,
        }
    work_date = dates[0]
    if work_date < today:
        return {
            "answer": (
                f"Ngày {_fmt_date_full(work_date)} đã qua rồi nên mình chưa "
                "soạn được đơn đổi ca. Bạn chọn ngày từ hôm nay trở đi nhé."
            ),
            "action": None,
        }
    duplicate = (ShiftSwapRequest.query
                 .filter_by(requester_id=employee.id, work_date=work_date,
                            status=ShiftSwapRequest.STATUS_PENDING)
                 .first())
    if duplicate is not None:
        return {
            "answer": (
                f"Ngày {_fmt_date_full(work_date)} bạn đã có một đơn đổi ca "
                "đang chờ duyệt rồi nên mình chưa soạn đơn mới được."
            ),
            "action": None,
        }
    note = _extract_reason(question)
    action = {
        "type": "create_shift_swap",
        "title": "Tạo đơn đổi ca",
        "summary": (
            f"Xin đổi ca ngày {_fmt_date(work_date)} với "
            f"{target.full_name}."
        ),
        "details": [
            {"label": "Người xin đổi ca", "value": employee.full_name},
            {"label": "Đổi ca với", "value": f"{target.full_name} ({target.code})"},
            {"label": "Ngày đổi ca", "value": _fmt_date_full(work_date)},
            {"label": "Ghi chú", "value": note or "—"},
        ],
        "payload": {
            "target_id": target.id,
            "work_date": work_date.isoformat(),
            "note": note or None,
        },
    }
    return {
        "answer": (
            "Mình đã soạn sẵn đơn đổi ca theo thông tin bạn cung cấp. "
            "Bạn kiểm tra lại thẻ bên dưới rồi bấm “Xác nhận thực hiện” "
            "để gửi đơn — đơn sẽ ở trạng thái chờ quản lý/HR duyệt."
        ),
        "action": action,
    }


def _call_service(fn, *args, **kwargs):
    """Gọi service của module khác, đổi ApiError RIÊNG của module đó thành
    ApiError chuẩn của app để route /chat/actions/execute trả đúng status.

    Cùng họ bug với tool lương 2026-11-14: shifts + engagement định nghĩa
    ApiError riêng (status/code/message/details) thay vì dùng app.errors —
    route chat chỉ nhận diện ApiError chuẩn nên lỗi nghiệp vụ (409 trùng
    đơn tăng ca...) sẽ rơi về 500 INTERNAL_ERROR nếu không đổi ở đây.
    Chỉ đổi khi exception mang đủ 3 thuộc tính (status int, code str,
    message str); mọi lỗi khác giữ nguyên.
    """
    try:
        return fn(*args, **kwargs)
    except ApiError:
        raise
    except Exception as exc:
        status = getattr(exc, "status", None)
        code = getattr(exc, "code", None)
        message = getattr(exc, "message", None)
        if (isinstance(status, int) and isinstance(code, str)
                and isinstance(message, str)):
            raise ApiError(status, code, message,
                           getattr(exc, "details", None))
        raise


_ANNOUNCE_RE = re.compile(
    r"(?:đăng|dang|tạo|tao|gửi|gui)?\s*(?:thông báo|thong bao)\s*(.+)$",
    re.IGNORECASE | re.DOTALL)


def _split_announcement_text(question: str, folded: str):
    """Tách tiêu đề/nội dung từ câu đăng thông báo.

    "đăng thông báo: Nghỉ bù 24/11 — toàn công ty nghỉ bù" ->
    title="Nghỉ bù 24/11", content="toàn công ty nghỉ bù". Không có dấu
    ":" thì toàn bộ là nội dung, tiêu đề lấy câu đầu (tối đa 60 ký tự).
    Trả (title, content, category) — content rỗng khi không đủ dữ kiện.
    """
    match = _ANNOUNCE_RE.search(question or "")
    rest = (match.group(1) if match else "").strip()
    # Bỏ dấu phân cách ngay sau trigger (":", "-", "—").
    rest = rest.lstrip(":—- \t").strip()
    if not rest:
        return "", "", "general"
    title = content = ""
    for sep in (":", "—", " - "):
        if sep in rest:
            title, content = (part.strip() for part in rest.split(sep, 1))
            if title and content:
                break
            title = content = ""
    if not content:
        content = rest
        first = rest.split(".")[0].strip()
        title = first[:60] if first else rest[:60]
    if "chinh sach" in folded:
        category = "policy"
    elif "su kien" in folded:
        category = "event"
    else:
        category = "general"
    return title[:240], content, category


def _detect_create_announcement(user, question: str, folded: str) -> dict | None:
    role = getattr(user, "role", "employee")
    if role not in ("admin", "hr"):
        return {
            "answer": (
                "Chỉ HR và Admin mới đăng được thông báo công ty. "
                "Bạn cần đăng thông báo thì nhờ HR giúp nhé."
            ),
            "action": None,
        }
    title, content, category = _split_announcement_text(question, folded)
    if not content or len(content) < 10:
        return {
            "answer": (
                "Bạn muốn đăng thông báo với nội dung gì? Ví dụ: 'đăng thông "
                "báo: Nghỉ bù 24/11 — toàn công ty nghỉ bù ngày Văn hóa "
                "Việt Nam'."
            ),
            "action": None,
        }
    if not title:
        title = content[:60]
    category_label = {"general": "Chung", "policy": "Chính sách",
                      "event": "Sự kiện"}.get(category, "Chung")
    action = {
        "type": "create_announcement",
        "title": "Đăng thông báo công ty",
        "summary": f"Đăng thông báo: {title}",
        "details": [
            {"label": "Tiêu đề", "value": title},
            {"label": "Nội dung", "value": content},
            {"label": "Loại", "value": category_label},
        ],
        "payload": {
            "title": title,
            "content": content,
            "category": category,
        },
    }
    return {
        "answer": (
            "Mình đã soạn sẵn thông báo theo nội dung bạn cung cấp. "
            "Bạn kiểm tra lại thẻ bên dưới rồi bấm “Xác nhận thực hiện” "
            "để đăng lên bảng tin công ty — mọi nhân viên đang làm việc "
            "sẽ nhận được thông báo này."
        ),
        "action": action,
    }


# ---------------------------------------------------------------------------
# Điểm vào duy nhất cho services.ask_question
# ---------------------------------------------------------------------------

def detect_action(user, question: str) -> dict | None:
    """Nhận diện ý định hành động. Trả {"answer", "action"|None} hoặc None.

    None = câu không phải ý định hành động -> tầng trên đi luồng
    tool/RAG như cũ. Mọi lỗi bất ngờ đều rơi về None (đã log) để không
    bao giờ làm hỏng cuộc trò chuyện. Hàm này KHÔNG thay đổi dữ liệu.
    """
    try:
        folded = _fold(question)
        if _is_decide_intent(folded):
            # "Duyệt đơn tăng ca / đổi ca" không phải đơn nghỉ — chặn trước
            # khi rơi vào decide_leave để không duyệt nhầm đơn nghỉ của
            # cùng người. Duyệt tăng ca/đổi ca làm ở đúng trang của nó.
            if "tang ca" in folded or "doi ca" in folded:
                page = "Tăng ca" if "tang ca" in folded else "Đổi ca"
                return {
                    "answer": (
                        f"Duyệt đơn {page.lower()} thì bạn vào trang {page} "
                        "nhé — ở đó có đủ nút duyệt/từ chối theo đúng cấp. "
                        "Qua chat mình mới soạn được đơn, chưa duyệt được "
                        f"đơn {page.lower()}."
                    ),
                    "action": None,
                }
            result = _detect_decide_leave(user, question, folded)
            if result is not None:
                return result
        if _is_create_intent(folded):
            return _detect_create_leave(user, question, folded)
        if _is_overtime_intent(folded):
            return _detect_create_overtime(user, question, folded)
        if _is_kudos_intent(folded):
            return _detect_create_kudos(user, question, folded)
        if _is_swap_intent(folded):
            return _detect_create_swap(user, question, folded)
        if _is_announce_intent(folded):
            return _detect_create_announcement(user, question, folded)
        return None
    except Exception:
        current_app.logger.warning(
            "Chatbot: nhận diện hành động lỗi, chuyển luồng thường.",
            exc_info=True)
        return None


# ---------------------------------------------------------------------------
# Thực thi (POST /chat/actions/execute) — kiểm tra lại toàn bộ ở tầng này
# ---------------------------------------------------------------------------

def _parse_iso_date(value, field: str) -> date:
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        raise ApiError(
            400, "VALIDATION_ERROR",
            f"Ngày {field} không đúng định dạng (cần YYYY-MM-DD).",
            [{"field": field, "message": "Định dạng ngày không hợp lệ."}],
        )


def _execute_create_leave(user, payload: dict) -> dict:
    _, employee = leave_services.get_current_employee()

    type_name = (payload.get("leave_type") or "").strip()
    leave_type = None
    if payload.get("leave_type_id"):
        leave_type = db.session.get(LeaveType, payload["leave_type_id"])
    if leave_type is None and type_name:
        leave_type = LeaveType.query.filter_by(name=type_name).first()
        if leave_type is None:  # thử khớp không dấu cho chắc
            for candidate in LeaveType.query.all():
                if _fold(candidate.name) == _fold(type_name):
                    leave_type = candidate
                    break
    if leave_type is None:
        raise ApiError(400, "VALIDATION_ERROR",
                       "Loại phép trong yêu cầu không hợp lệ.",
                       [{"field": "leave_type", "message": "Loại phép không tồn tại."}])

    from_date = _parse_iso_date(payload.get("start_date"), "start_date")
    to_date = _parse_iso_date(payload.get("end_date"), "end_date")
    reason = (payload.get("reason") or "").strip()

    # Nghiệp vụ (trùng lịch / số dư / ngày công) do leave services chốt.
    created = leave_services.create_leave_request(employee, {
        "leave_type_id": leave_type.id,
        "from_date": from_date,
        "to_date": to_date,
        "reason": reason,
    })
    result_text = (
        f"Đã tạo đơn xin nghỉ {leave_type.name} từ "
        f"{_fmt_date(created.from_date)} đến {_fmt_date(created.to_date)} "
        f"({_fmt_days(created.days_count)} ngày công) cho {employee.full_name}. "
        "Đơn đang ở trạng thái chờ quản lý duyệt — bạn theo dõi tiến độ "
        "ở trang Nghỉ phép nhé."
    )
    return {"result_text": result_text,
            "leave_request": leave_schemas.leave_request_to_dict(created)}


def _execute_decide_leave(user, payload: dict) -> dict:
    try:
        request_id = int(payload.get("request_id"))
    except (TypeError, ValueError):
        raise ApiError(400, "VALIDATION_ERROR",
                       "Thiếu mã đơn nghỉ cần xử lý.",
                       [{"field": "request_id", "message": "request_id không hợp lệ."}])
    decision_word = (payload.get("decision") or "").strip().lower()
    if decision_word in ("approve", "approved"):
        decision = "approved"
    elif decision_word in ("reject", "rejected"):
        decision = "rejected"
    else:
        raise ApiError(400, "VALIDATION_ERROR",
                       "Quyết định phải là duyệt (approve) hoặc từ chối (reject).",
                       [{"field": "decision", "message": "Quyết định không hợp lệ."}])
    data = {"decision": decision, "note": (payload.get("note") or "").strip()}

    request = db.session.get(LeaveRequest, request_id)
    if request is None:
        raise ApiError(404, "NOT_FOUND", "Đơn xin nghỉ không tồn tại.")

    role = getattr(user, "role", "employee")
    if request.status == LeaveRequest.STATUS_PENDING:
        # Cấp quản lý — leave.manager_decision tự kiểm tra đúng quản lý
        # của người xin (không đúng -> 403 của leave services).
        if role not in ("manager", "admin"):
            raise ApiError(403, "FORBIDDEN",
                           "Bạn không có quyền duyệt đơn ở cấp quản lý.")
        _, manager_employee = leave_services.get_current_employee()
        updated = leave_services.manager_decision(
            manager_employee, request_id, data)
        stage_text = ("Đơn đã qua vòng quản lý và chuyển sang chờ HR "
                      "duyệt cuối." if decision == "approved"
                      else "Đơn đã bị từ chối ở cấp quản lý.")
    elif request.status == LeaveRequest.STATUS_MANAGER_APPROVED:
        # Cấp HR — leave.hr_decision chốt + trừ số dư phép khi duyệt.
        if role not in ("hr", "admin"):
            raise ApiError(403, "FORBIDDEN",
                           "Đơn đang chờ HR duyệt — bạn không có quyền ở cấp này.")
        updated = leave_services.hr_decision(request_id, data)
        stage_text = ("Đơn đã được duyệt hoàn tất, số dư phép của nhân "
                      "viên đã được cập nhật." if decision == "approved"
                      else "Đơn đã bị từ chối ở cấp HR.")
    else:
        raise ApiError(409, "INVALID_STATE",
                       "Đơn đã được xử lý trước đó, không thể quyết định lại.")

    requester = updated.employee
    requester_name = requester.full_name if requester else "nhân viên"
    verb = "Duyệt" if decision == "approved" else "Từ chối"
    result_text = (
        f"Đã xử lý xong: {verb.lower()} đơn xin nghỉ của {requester_name} "
        f"({_fmt_date(updated.from_date)} – {_fmt_date(updated.to_date)}). "
        f"{stage_text}"
    )
    return {"result_text": result_text,
            "leave_request": leave_schemas.leave_request_to_dict(updated)}


def _execute_create_overtime(user, payload: dict) -> dict:
    from app.blueprints.shifts import services as shifts_services

    _, employee = leave_services.get_current_employee()
    work_date = _parse_iso_date(payload.get("work_date"), "work_date")
    hours = payload.get("hours")
    if (isinstance(hours, bool) or not isinstance(hours, (int, float))
            or hours <= 0 or hours > 16):
        raise ApiError(
            400, "VALIDATION_ERROR",
            "Số giờ tăng ca phải là số từ 0,5 đến 16 giờ.",
            [{"field": "hours", "message": "Số giờ tăng ca không hợp lệ."}],
        )
    reason = (payload.get("reason") or "").strip() or None
    created = _call_service(shifts_services.create_overtime, user, {
        "work_date": work_date, "hours": hours, "reason": reason,
    })
    result_text = (
        f"Đã tạo đơn tăng ca {_fmt_days(created.hours)} giờ ngày "
        f"{_fmt_date(created.work_date)} cho {employee.full_name}. "
        "Đơn đang ở trạng thái chờ quản lý duyệt — bạn theo dõi tiến độ "
        "ở trang Tăng ca nhé."
    )
    return {"result_text": result_text,
            "overtime_request_id": created.id}


def _execute_create_kudos(user, payload: dict) -> dict:
    from app.blueprints.engagement import services as engagement_services

    try:
        to_employee_id = int(payload.get("to_employee_id"))
    except (TypeError, ValueError):
        raise ApiError(400, "VALIDATION_ERROR",
                       "Thiếu nhân viên nhận kudos.",
                       [{"field": "to_employee_id",
                         "message": "to_employee_id không hợp lệ."}])
    badge = (payload.get("badge") or "thanks").strip()
    if badge not in Kudo.BADGES:
        raise ApiError(400, "VALIDATION_ERROR",
                       "Loại huy hiệu không hợp lệ.",
                       [{"field": "badge",
                         "message": "Huy hiệu không hợp lệ."}])
    message = (payload.get("message") or "").strip()
    if not message or len(message) > 1000:
        raise ApiError(400, "VALIDATION_ERROR",
                       "Lời nhắn kudos là bắt buộc (tối đa 1000 ký tự).",
                       [{"field": "message",
                         "message": "Lời nhắn không hợp lệ."}])
    created = _call_service(engagement_services.create_kudo, user, {
        "to_employee_id": to_employee_id, "badge": badge, "message": message,
    })
    recipient = created.to_employee
    badge_label = _BADGE_LABELS.get(badge, "Cảm ơn")
    result_text = (
        f"Đã tặng kudos ({badge_label}) cho "
        f"{recipient.full_name if recipient else 'đồng nghiệp'} kèm lời nhắn "
        "của bạn. Người nhận sẽ thấy thông báo kudos nhé."
    )
    return {"result_text": result_text, "kudo_id": created.id}


def _execute_create_shift_swap(user, payload: dict) -> dict:
    from app.blueprints.shift_swaps import services as shift_swap_services

    try:
        target_id = int(payload.get("target_id"))
    except (TypeError, ValueError):
        raise ApiError(400, "VALIDATION_ERROR",
                       "Thiếu nhân viên đổi ca cùng.",
                       [{"field": "target_id",
                         "message": "target_id không hợp lệ."}])
    work_date = _parse_iso_date(payload.get("work_date"), "work_date")
    note = (payload.get("note") or "").strip() or None
    created = _call_service(shift_swap_services.create_swap, user, {
        "target_id": target_id, "work_date": work_date, "note": note,
    })
    target = created.target
    result_text = (
        f"Đã tạo đơn đổi ca ngày {_fmt_date(created.work_date)} với "
        f"{target.full_name if target else 'đồng nghiệp'}. Đơn đang ở trạng "
        "thái chờ quản lý/HR duyệt — bạn theo dõi tiến độ ở trang Đổi ca nhé."
    )
    return {"result_text": result_text, "shift_swap_id": created.id}


def _execute_create_announcement(user, payload: dict) -> dict:
    from app.blueprints.announcements import services as announcement_services

    role = getattr(user, "role", "employee")
    if role not in ("admin", "hr"):
        raise ApiError(403, "FORBIDDEN",
                       "Chỉ HR và Admin mới đăng được thông báo công ty.")
    title = (payload.get("title") or "").strip()
    content = (payload.get("content") or "").strip()
    if not title or len(title) > 255 or not content:
        raise ApiError(400, "VALIDATION_ERROR",
                       "Tiêu đề và nội dung thông báo là bắt buộc.",
                       [{"field": "title",
                         "message": "Tiêu đề/nội dung không hợp lệ."}])
    category = (payload.get("category") or "general").strip()
    if category not in ("general", "policy", "event"):
        category = "general"
    author_employee_id = getattr(user, "employee_id", None)
    created = _call_service(announcement_services.create_announcement, {
        "title": title, "content": content, "category": category,
    }, author_employee_id)
    result_text = (
        f"Đã đăng thông báo “{created.title}” lên bảng tin công ty. "
        "Mọi nhân viên đang làm việc sẽ nhận được thông báo này."
    )
    return {"result_text": result_text, "announcement_id": created.id}


def execute_action(user, action_type: str, payload: dict) -> dict:
    """Thực thi 1 hành động đã được người dùng xác nhận trên FE.

    Trả {"result_text", ...}. Lỗi nghiệp vụ giữ nguyên ApiError của
    services (status/code/message) để FE hiển thị đúng như thao tác
    ở trang tương ứng.
    """
    if not isinstance(payload, dict):
        payload = {}
    if action_type == "create_leave":
        return _execute_create_leave(user, payload)
    if action_type == "decide_leave":
        return _execute_decide_leave(user, payload)
    if action_type == "create_overtime":
        return _execute_create_overtime(user, payload)
    if action_type == "create_kudos":
        return _execute_create_kudos(user, payload)
    if action_type == "create_shift_swap":
        return _execute_create_shift_swap(user, payload)
    if action_type == "create_announcement":
        return _execute_create_announcement(user, payload)
    raise ApiError(400, "VALIDATION_ERROR",
                   "Loại hành động không được hỗ trợ.",
                   [{"field": "type", "message": "Hành động không hợp lệ."}])
