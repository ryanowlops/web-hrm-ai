"""Chấm điểm nguy cơ nghỉ việc (attrition risk) theo luật — mục 5.3.

Tính TẠI CHỖ mỗi lần gọi (không bảng lưu trữ), cửa sổ 60 ngày gần nhất
theo múi giờ nghiệp vụ Asia/Ho_Chi_Minh. Chỉ cộng điểm từ tín hiệu ĐO
ĐƯỢC, mỗi tín hiệu kèm câu giải thích tiếng Việt trong `factors`:

    Đi muộn >= 4 lần / 60 ngày ............................ +15
    Vắng không phép (Attendance.status = absent) >= 2 ngày  +20
    Ngày phép 30 ngày gần nhất >= 2 lần 30 ngày trước đó
      và >= 3 ngày ........................................ +10
    Điểm hiệu suất kỳ gần nhất giảm >= 15 so với kỳ trước . +15
    Điểm hiệu suất kỳ gần nhất < 50 ....................... +10
    Thâm niên < 1 năm ..................................... +10
    Thâm niên 1–2 năm ..................................... +5

Trần 100 điểm. Mức: < 30 "low" (Thấp), 30–59 "medium" (Trung bình),
>= 60 "high" (Cao). KHÔNG suy diễn từ tín hiệu không đo được (vd không
tăng ca / không học đào tạo thì không cộng điểm).

Phạm vi dữ liệu (mục 0.2): admin/hr = toàn công ty; manager = nhóm của
mình theo đúng cách module leave xác định (_team_employee_ids: nhân
viên báo cáo trực tiếp + nhân viên thuộc phòng mình làm trưởng phòng);
employee bị chặn ở route (403).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.errors import ApiError
from app.extensions import db
from app.models import Attendance, Employee, LeaveRequest
from app.models.performance import PerformanceCycle, PerformanceReview

WINDOW_DAYS = 60
LEVEL_LOW = "low"
LEVEL_MEDIUM = "medium"
LEVEL_HIGH = "high"
LEVELS = (LEVEL_LOW, LEVEL_MEDIUM, LEVEL_HIGH)
LEVEL_LABELS = {
    LEVEL_LOW: "Thấp",
    LEVEL_MEDIUM: "Trung bình",
    LEVEL_HIGH: "Cao",
}
_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def _today() -> date:
    return datetime.now(_TZ).date()


def _fmt_days(value) -> str:
    """10.0 -> '10', 10.5 -> '10,5' (thập phân kiểu Việt)."""
    number = float(value or 0)
    if number == int(number):
        return str(int(number))
    return f"{number:.1f}".rstrip("0").rstrip(".").replace(".", ",")


def _fmt_score(value) -> str:
    """Điểm hiệu suất: 72.5 -> '72,5', 80.0 -> '80'."""
    return _fmt_days(value)


def _scoped_employee_ids(user) -> list[int] | None:
    """None = toàn công ty (admin/hr); list = phạm vi của manager."""
    if user.role in ("admin", "hr"):
        return None
    # manager — bám đúng cách module leave xác định phạm vi nhóm.
    from app.blueprints.leave import services as leave_services

    employee = getattr(user, "employee", None)
    if employee is None and getattr(user, "employee_id", None):
        employee = db.session.get(Employee, user.employee_id)
    if employee is None:
        raise ApiError(403, "FORBIDDEN",
                       "Tài khoản quản lý chưa gắn với hồ sơ nhân viên.")
    return sorted(leave_services._team_employee_ids(employee))


def _attendance_counts(employee_ids, window_start, today):
    """Đếm (đi muộn, vắng không phép) theo nhân viên trong cửa sổ 60 ngày."""
    late_counts: dict[int, int] = {}
    absent_counts: dict[int, int] = {}
    if not employee_ids:
        return late_counts, absent_counts
    rows = (
        db.session.query(Attendance.employee_id, Attendance.status,
                         db.func.count(Attendance.id))
        .filter(Attendance.employee_id.in_(employee_ids),
                Attendance.work_date >= window_start,
                Attendance.work_date <= today,
                Attendance.status.in_([Attendance.STATUS_LATE,
                                       Attendance.STATUS_ABSENT]))
        .group_by(Attendance.employee_id, Attendance.status)
        .all()
    )
    for employee_id, status, count in rows:
        if status == Attendance.STATUS_LATE:
            late_counts[employee_id] = count
        elif status == Attendance.STATUS_ABSENT:
            absent_counts[employee_id] = count
    return late_counts, absent_counts


def _leave_days_by_window(employee_ids, start, end):
    """Tổng ngày phép ĐÃ DUYỆT có ngày bắt đầu trong [start, end] theo nhân viên."""
    if not employee_ids:
        return {}
    rows = (
        db.session.query(LeaveRequest.employee_id,
                         db.func.coalesce(db.func.sum(LeaveRequest.days_count), 0))
        .filter(LeaveRequest.employee_id.in_(employee_ids),
                LeaveRequest.status == LeaveRequest.STATUS_APPROVED,
                LeaveRequest.from_date >= start,
                LeaveRequest.from_date <= end)
        .group_by(LeaveRequest.employee_id)
        .all()
    )
    return {employee_id: float(total) for employee_id, total in rows}


def _cycle_scores(employee_ids):
    """{employee_id: [(cycle_end_date, cycle_id, score), ...] mới nhất trước}.

    Mỗi (nhân viên, kỳ) lấy 1 điểm: ưu tiên bài đánh giá của quản lý
    (review_type = manager — điểm chính thức), nếu không có thì lấy bài
    mới nhất trong kỳ.
    """
    result: dict[int, list] = {}
    if not employee_ids:
        return result
    reviews = (PerformanceReview.query
               .filter(PerformanceReview.employee_id.in_(employee_ids),
                       PerformanceReview.score.isnot(None))
               .all())
    per_cycle: dict[tuple, PerformanceReview] = {}
    for review in reviews:
        key = (review.employee_id, review.cycle_id)
        current = per_cycle.get(key)
        if current is None:
            per_cycle[key] = review
            continue
        current_is_manager = current.review_type == PerformanceReview.TYPE_MANAGER
        new_is_manager = review.review_type == PerformanceReview.TYPE_MANAGER
        if (new_is_manager and not current_is_manager) or (
            new_is_manager == current_is_manager
            and (review.id or 0) > (current.id or 0)
        ):
            per_cycle[key] = review
    cycles = {cycle.id: cycle for cycle in PerformanceCycle.query.all()}
    for (employee_id, cycle_id), review in per_cycle.items():
        cycle = cycles.get(cycle_id)
        end_date = cycle.end_date if cycle is not None else date.min
        result.setdefault(employee_id, []).append(
            (end_date, cycle_id, float(review.score)))
    for scores in result.values():
        scores.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return result


def _employee_brief(employee: Employee) -> dict:
    return {
        "id": employee.id,
        "code": employee.code,
        "full_name": employee.full_name,
        "department_id": employee.department_id,
        "department_name": (employee.department.name
                            if employee.department is not None else None),
        "position_name": (employee.position.title
                          if employee.position is not None else None),
    }


def get_attrition_risk(user, department_id=None, level=None) -> dict:
    """Chấm điểm nguy cơ nghỉ việc cho mọi nhân viên trong phạm vi.

    Trả {generated_at, window_days, items, summary} — summary luôn đếm
    trên TOÀN BỘ phạm vi (trước lọc `level`) để FE hiện thẻ tổng hợp đúng.
    """
    if level is not None and level not in LEVELS:
        raise ApiError(400, "VALIDATION_ERROR",
                       f"Mức lọc không hợp lệ: {level}.",
                       [{"field": "level",
                         "message": "Chỉ nhận low | medium | high."}])

    today = _today()
    window_start = today - timedelta(days=WINDOW_DAYS - 1)
    last30_start = today - timedelta(days=29)
    prev30_start = today - timedelta(days=59)
    prev30_end = today - timedelta(days=30)

    query = Employee.query.filter(Employee.status != Employee.STATUS_RESIGNED)
    scope_ids = _scoped_employee_ids(user)
    if scope_ids is not None:
        query = query.filter(Employee.id.in_(scope_ids or [-1]))
    if department_id:
        query = query.filter(Employee.department_id == department_id)
    employees = query.order_by(Employee.full_name).all()
    employee_ids = [emp.id for emp in employees]

    late_counts, absent_counts = _attendance_counts(
        employee_ids, window_start, today)
    leave_last30 = _leave_days_by_window(employee_ids, last30_start, today)
    leave_prev30 = _leave_days_by_window(employee_ids, prev30_start, prev30_end)
    cycle_scores = _cycle_scores(employee_ids)

    items = []
    summary = {LEVEL_HIGH: 0, LEVEL_MEDIUM: 0, LEVEL_LOW: 0}
    for employee in employees:
        score = 0
        factors: list[str] = []

        late = late_counts.get(employee.id, 0)
        if late >= 4:
            score += 15
            factors.append(f"Đi muộn {late} lần trong 60 ngày (+15)")

        absent = absent_counts.get(employee.id, 0)
        if absent >= 2:
            score += 20
            factors.append(f"Vắng không phép {absent} ngày trong 60 ngày (+20)")

        days_last = leave_last30.get(employee.id, 0.0)
        days_prev = leave_prev30.get(employee.id, 0.0)
        if days_last >= 3 and days_last >= 2 * days_prev:
            score += 10
            factors.append(
                "Ngày nghỉ phép tăng đột biến: "
                f"{_fmt_days(days_last)} ngày trong 30 ngày gần nhất (+10)")

        scores = cycle_scores.get(employee.id, [])
        if scores:
            latest_score = scores[0][2]
            if latest_score < 50:
                score += 10
                factors.append(
                    "Điểm hiệu suất kỳ gần nhất thấp: "
                    f"{_fmt_score(latest_score)}/100 (+10)")
            if len(scores) >= 2:
                previous_score = scores[1][2]
                drop = previous_score - latest_score
                if drop >= 15:
                    score += 15
                    factors.append(
                        f"Điểm hiệu suất giảm {_fmt_score(drop)} điểm so với "
                        f"kỳ trước ({_fmt_score(previous_score)} → "
                        f"{_fmt_score(latest_score)}) (+15)")

        if employee.start_date:
            tenure_days = (today - employee.start_date).days
            if tenure_days < 365:
                score += 10
                factors.append("Thâm niên dưới 1 năm — giai đoạn dễ rời đi (+10)")
            elif tenure_days < 730:
                score += 5
                factors.append("Thâm niên 1–2 năm (+5)")

        score = min(score, 100)
        if score >= 60:
            level_value = LEVEL_HIGH
        elif score >= 30:
            level_value = LEVEL_MEDIUM
        else:
            level_value = LEVEL_LOW
        summary[level_value] += 1
        items.append({
            "employee": _employee_brief(employee),
            "score": score,
            "level": level_value,
            "level_label": LEVEL_LABELS[level_value],
            "factors": factors,
        })

    items.sort(key=lambda item: (-item["score"], item["employee"]["full_name"]))
    if level is not None:
        items = [item for item in items if item["level"] == level]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "window_days": WINDOW_DAYS,
        "items": items,
        "summary": summary,
    }
