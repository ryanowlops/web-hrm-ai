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
from app.models import LeaveRequest, LeaveType

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


def _request_matches_employee(request: LeaveRequest, question: str,
                              folded: str) -> bool:
    """Khớp đơn theo Mã NV hoặc tên người xin nhắc trong câu hỏi."""
    employee = request.employee
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
            result = _detect_decide_leave(user, question, folded)
            if result is not None:
                return result
        if _is_create_intent(folded):
            return _detect_create_leave(user, question, folded)
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


def execute_action(user, action_type: str, payload: dict) -> dict:
    """Thực thi 1 hành động đã được người dùng xác nhận trên FE.

    Trả {"result_text", "leave_request"}. Lỗi nghiệp vụ giữ nguyên
    ApiError của leave services (status/code/message) để FE hiển thị
    đúng như thao tác ở trang Nghỉ phép.
    """
    if not isinstance(payload, dict):
        payload = {}
    if action_type == "create_leave":
        return _execute_create_leave(user, payload)
    if action_type == "decide_leave":
        return _execute_decide_leave(user, payload)
    raise ApiError(400, "VALIDATION_ERROR",
                   "Loại hành động không được hỗ trợ.",
                   [{"field": "type", "message": "Hành động không hợp lệ."}])
