"""Service layer — logic nghiệp vụ chấm công (docs/architecture.md A5.2).

Quy tắc trạng thái:
- Check-in ghi giờ server, tối đa 1 lần/ngày (unique employee_id + work_date).
- Giờ vào > giờ bắt đầu làm việc cấu hình (Setting/config WORK_START_TIME,
  mặc định 08:30) -> status = "late", ngược lại "present".
- Bản ghi ngày nghỉ đã duyệt (status "on_leave", do module leave tạo) không
  cho check-in đè.
- HR sửa bản ghi: bắt buộc lý do (note), ghi edited_by và AuditLog (nếu có).
"""
import json
from datetime import date, datetime, time, timedelta

from flask import current_app, has_app_context
from flask_jwt_extended import get_jwt, get_jwt_identity

from app.extensions import db
from app.models import Attendance, Employee

# ---------------------------------------------------------------------------
# ApiError: ưu tiên dùng exception dùng chung của app (handler toàn cục),
# nếu app chưa có thì fallback class local — routes.py đăng ký errorhandler
# cho chính class được import ở đây nên định dạng lỗi luôn chuẩn:
# { "error": { "code", "message", "details" } }
# ---------------------------------------------------------------------------
try:  # pragma: no cover - phụ thuộc skeleton của app
    from app.errors import ApiError
except Exception:  # noqa: BLE001
    try:
        from app.common.errors import ApiError
    except Exception:  # noqa: BLE001

        class ApiError(Exception):
            """Lỗi nghiệp vụ mang theo HTTP status + mã lỗi chuẩn."""

            def __init__(self, status_code, code, message, details=None):
                super().__init__(message)
                self.status_code = status_code
                self.code = code
                self.message = message
                self.details = details or []

            def to_dict(self):
                return {
                    "error": {
                        "code": self.code,
                        "message": self.message,
                        "details": self.details,
                    }
                }


DEFAULT_WORK_START_TIME = time(8, 30)
EDITABLE_STATUSES = ("present", "late", "absent", "on_leave")


# ---------------------------------------------------------------------------
# Helpers: thời gian / cấu hình
# ---------------------------------------------------------------------------
def _now():
    """Giờ hiện tại theo múi giờ nghiệp vụ Asia/Ho_Chi_Minh (naive).

    Dùng cố định múi giờ Việt Nam để "hôm nay" khi chấm công không phụ
    thuộc múi giờ của máy chạy server (UTC trên cloud, +07 trên máy cá nhân).
    """
    from zoneinfo import ZoneInfo

    return datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).replace(tzinfo=None)


def _parse_time_value(value):
    """Parse 'HH:MM' / 'HH:MM:SS' / dict JSON {'hour':..,'minute':..} -> time."""
    if value is None:
        return None
    if isinstance(value, time):
        return value
    if isinstance(value, dict):
        try:
            return time(
                int(value.get("hour", 8)),
                int(value.get("minute", 0)),
                int(value.get("second", 0)),
            )
        except (TypeError, ValueError):
            return None
    text = str(value).strip()
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(text, fmt).time()
        except ValueError:
            continue
    return None


def get_work_start_time():
    """Giờ bắt đầu làm việc: Setting (DB) -> Flask config -> mặc định 08:30."""
    # 1) Bảng settings (key/value JSON) nếu model Setting tồn tại.
    try:
        from app.models import Setting

        for key in ("WORK_START_TIME", "work_start_time"):
            row = (
                db.session.query(Setting)
                .filter_by(key=key)
                .first()
            )
            if row is not None:
                value = getattr(row, "value", None)
                if isinstance(value, str):
                    try:
                        value = json.loads(value)
                    except (ValueError, TypeError):
                        pass
                if isinstance(value, dict):
                    value = value.get("value", value)
                parsed = _parse_time_value(value)
                if parsed is not None:
                    return parsed
    except Exception:  # noqa: BLE001 - Setting chưa có/chưa seed -> bỏ qua
        db.session.rollback()

    # 2) Flask config (env WORK_START_TIME).
    if has_app_context():
        parsed = _parse_time_value(current_app.config.get("WORK_START_TIME"))
        if parsed is not None:
            return parsed

    # 3) Mặc định theo đặc tả.
    return DEFAULT_WORK_START_TIME


# ---------------------------------------------------------------------------
# Helpers: người dùng hiện tại / phân trang / tháng
# ---------------------------------------------------------------------------
def get_current_employee():
    """Resolve Employee của user đang đăng nhập từ JWT.

    Thứ tự: claim employee_id -> User.employee_id -> Employee.user_id (nếu có)
    -> fallback identity chính là employee id.
    """
    identity = get_jwt_identity()
    claims = {}
    try:
        claims = get_jwt() or {}
    except Exception:  # noqa: BLE001
        claims = {}

    employee_id = claims.get("employee_id")
    if employee_id is not None:
        employee = db.session.get(Employee, employee_id)
        if employee is not None:
            return employee

    # Qua bảng users (users.employee_id theo A7).
    try:
        from app.models import User

        user = db.session.get(User, identity)
        if user is not None and getattr(user, "employee_id", None) is not None:
            employee = db.session.get(Employee, user.employee_id)
            if employee is not None:
                return employee
    except Exception:  # noqa: BLE001
        db.session.rollback()

    # Nếu Employee có cột user_id thì tra theo đó.
    if "user_id" in Employee.__table__.columns:
        employee = (
            db.session.query(Employee).filter_by(user_id=identity).first()
        )
        if employee is not None:
            return employee

    employee = db.session.get(Employee, identity)
    if employee is not None:
        return employee

    raise ApiError(
        403,
        "EMPLOYEE_NOT_LINKED",
        "Tài khoản chưa được liên kết với hồ sơ nhân viên.",
    )


def parse_month(value):
    """Parse 'YYYY-MM' -> (date đầu tháng, date đầu tháng sau). Mặc định tháng hiện tại."""
    if not value:
        today = _now().date()
        first = today.replace(day=1)
    else:
        try:
            first = datetime.strptime(str(value).strip(), "%Y-%m").date().replace(day=1)
        except (ValueError, TypeError):
            raise ApiError(
                400,
                "VALIDATION_ERROR",
                "Tham số month phải có định dạng YYYY-MM.",
                details=[{"field": "month", "message": "Định dạng YYYY-MM"}],
            )
    if first.month == 12:
        next_first = first.replace(year=first.year + 1, month=1)
    else:
        next_first = first.replace(month=first.month + 1)
    return first, next_first


def parse_pagination(args):
    """page từ 1, limit mặc định 20, tối đa 100 (chuẩn API B6)."""
    try:
        page = int(args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    try:
        limit = int(args.get("limit", 20))
    except (TypeError, ValueError):
        limit = 20
    return max(page, 1), min(max(limit, 1), 100)


def pagination_meta(page, limit, total_items):
    total_pages = (total_items + limit - 1) // limit if limit else 0
    return {
        "page": page,
        "limit": limit,
        "totalItems": total_items,
        "totalPages": total_pages,
    }


def summarize(records):
    """Tổng hợp số đếm theo trạng thái từ danh sách bản ghi chấm công."""
    summary = {
        "total_records": len(records),
        "present": 0,
        "late": 0,
        "absent": 0,
        "on_leave": 0,
        "late_count": 0,
        "days_worked": 0,
        "workdays": 0,  # alias của days_worked cho frontend
        "missing_checkout": 0,
    }
    for record in records:
        status = getattr(record, "status", None)
        if status in summary:
            summary[status] += 1
        if status == "late":
            summary["late_count"] += 1
        if getattr(record, "check_in_at", None) is not None:
            summary["days_worked"] += 1
            summary["workdays"] += 1
            if getattr(record, "check_out_at", None) is None:
                summary["missing_checkout"] += 1
    return summary


def _get_record(employee_id, work_date):
    return (
        db.session.query(Attendance)
        .filter_by(employee_id=employee_id, work_date=work_date)
        .first()
    )


# ---------------------------------------------------------------------------
# Nghiệp vụ: check-in / check-out
# ---------------------------------------------------------------------------
def check_in():
    """Check-in hôm nay. 1 lần/ngày; muộn nếu sau giờ cấu hình."""
    employee = get_current_employee()
    now = _now()
    today = now.date()

    record = _get_record(employee.id, today)
    if record is not None and getattr(record, "check_in_at", None) is not None:
        raise ApiError(409, "ALREADY_CHECKED_IN", "Bạn đã check-in hôm nay rồi.")
    if record is not None and getattr(record, "status", None) == "on_leave":
        raise ApiError(
            409,
            "ON_LEAVE",
            "Hôm nay bạn đang trong ngày nghỉ đã được duyệt, không thể check-in.",
        )

    status = "late" if now.time() > get_work_start_time() else "present"
    if record is None:
        record = Attendance(
            employee_id=employee.id,
            work_date=today,
            check_in_at=now,
            status=status,
        )
        db.session.add(record)
    else:
        # Bản ghi placeholder (vd: absent tạo trước) -> dùng lại, không tạo trùng.
        record.check_in_at = now
        record.status = status

    db.session.commit()
    return record


def check_out():
    """Check-out hôm nay. Phải đã check-in và chưa check-out."""
    employee = get_current_employee()
    today = _now().date()

    record = _get_record(employee.id, today)
    if record is None or getattr(record, "check_in_at", None) is None:
        raise ApiError(
            409, "NOT_CHECKED_IN", "Bạn chưa check-in hôm nay nên không thể check-out."
        )
    if getattr(record, "check_out_at", None) is not None:
        raise ApiError(409, "ALREADY_CHECKED_OUT", "Bạn đã check-out hôm nay rồi.")

    record.check_out_at = _now()
    db.session.commit()
    return record


def get_today():
    """Bản ghi hôm nay của chính mình (None nếu chưa check-in)."""
    employee = get_current_employee()
    return _get_record(employee.id, _now().date())


# ---------------------------------------------------------------------------
# Nghiệp vụ: xem bảng công
# ---------------------------------------------------------------------------
def get_my_month(month_value):
    """Danh sách chấm công của chính mình trong tháng + tổng hợp."""
    employee = get_current_employee()
    first, next_first = parse_month(month_value)
    records = (
        db.session.query(Attendance)
        .filter(
            Attendance.employee_id == employee.id,
            Attendance.work_date >= first,
            Attendance.work_date < next_first,
        )
        .order_by(Attendance.work_date.asc())
        .all()
    )
    return records, summarize(records), first


def parse_year(value):
    """Parse năm 'YYYY' -> int. Mặc định năm hiện tại (giờ Việt Nam)."""
    if value is None or str(value).strip() == "":
        return _now().date().year
    try:
        year = int(str(value).strip())
    except (TypeError, ValueError):
        raise ApiError(
            400,
            "VALIDATION_ERROR",
            "Tham số year phải là năm dạng YYYY.",
            details=[{"field": "year", "message": "Định dạng YYYY"}],
        )
    if year < 2000 or year > 2100:
        raise ApiError(
            400,
            "VALIDATION_ERROR",
            "Tham số year nằm ngoài khoảng hỗ trợ (2000–2100).",
            details=[{"field": "year", "message": "Từ 2000 đến 2100"}],
        )
    return year


def compute_streaks(records):
    """(current_streak, best_streak) từ bản ghi đã sắp xếp theo ngày tăng dần.

    Chuỗi đúng giờ = các bản ghi liên tiếp có status "present" (đi làm đúng
    giờ theo đúng quy ước trạng thái của module: check-in không muộn).
    Bất kỳ trạng thái nào khác (late / absent / on_leave) đều ngắt chuỗi.
    current_streak là chuỗi đang chạy tính tới ngày công gần nhất.
    """
    best = run = 0
    for record in records:
        if getattr(record, "status", None) == "present":
            run += 1
            if run > best:
                best = run
        else:
            run = 0
    return run, best


def get_my_year(year_value):
    """Chấm công cả năm của chính người gọi — cho bản đồ nhiệt "Hành trình".

    Trả { year, days, summary }:
    - days: mọi ngày có bản ghi trong năm [{date, status, check_in, check_out}]
      (check_in/check_out là ISO datetime hoặc null).
    - summary: total_days = số ngày thực công (có check-in), on_time_days =
      số ngày "present", late_days = số ngày "late", current_streak /
      best_streak = chuỗi ngày đúng giờ liên tiếp (hiện tại / dài nhất).
    """
    employee = get_current_employee()
    year = parse_year(year_value)
    first = date(year, 1, 1)
    next_first = date(year + 1, 1, 1)
    records = (
        db.session.query(Attendance)
        .filter(
            Attendance.employee_id == employee.id,
            Attendance.work_date >= first,
            Attendance.work_date < next_first,
        )
        .order_by(Attendance.work_date.asc())
        .all()
    )
    days = [
        {
            "date": record.work_date.isoformat(),
            "status": record.status,
            "check_in": record.check_in_at.isoformat() if record.check_in_at else None,
            "check_out": record.check_out_at.isoformat() if record.check_out_at else None,
        }
        for record in records
    ]
    current_streak, best_streak = compute_streaks(records)
    summary = {
        "total_days": sum(1 for r in records if r.check_in_at is not None),
        "on_time_days": sum(1 for r in records if r.status == "present"),
        "late_days": sum(1 for r in records if r.status == "late"),
        "current_streak": current_streak,
        "best_streak": best_streak,
    }
    return {"year": year, "days": days, "summary": summary}


def _manager_department_ids(employee, user_identity):
    """Phòng ban mà Manager quản lý (departments.manager_id khớp employee/user)."""
    ids = set()
    try:
        from app.models import Department

        columns = Department.__table__.columns
        query = db.session.query(Department)
        conditions = []
        if "manager_id" in columns:
            conditions.append(Department.manager_id == employee.id)
            if user_identity is not None:
                conditions.append(Department.manager_id == user_identity)
        if conditions:
            from sqlalchemy import or_

            for dept in query.filter(or_(*conditions)).all():
                ids.add(dept.id)
    except Exception:  # noqa: BLE001
        db.session.rollback()
    if getattr(employee, "department_id", None) is not None:
        # Trưởng phòng tối thiểu thấy được phòng của chính mình.
        ids.add(employee.department_id)
    return ids


def get_monthly(month_value, args, current_role):
    """Bảng công tháng cho HR/Admin (tất cả), Manager (phòng mình),
    Employee (chỉ bản thân).

    Trả về (body, first):
    - mine=1: body = { data: [bản ghi của người gọi], summary, meta }
    - còn lại: body = { data: [row theo nhân viên {summary, records}], meta }
    Chấp nhận cả month=YYYY-MM lẫn month=&year= riêng lẻ.
    """
    year_arg = args.get("year", type=int)
    month_arg = args.get("month", type=int)
    if year_arg and month_arg:
        month_value = f"{year_arg:04d}-{month_arg:02d}"
    first, next_first = parse_month(month_value)
    page, limit = parse_pagination(args)

    from .schemas import attendance_list_schema

    # --- Chế độ "của tôi": mọi vai trò đều chỉ nhận bản ghi của chính mình ---
    if str(args.get("mine", "")).lower() in ("1", "true", "yes"):
        me = get_current_employee()
        my_records = (
            db.session.query(Attendance)
            .filter(
                Attendance.employee_id == me.id,
                Attendance.work_date >= first,
                Attendance.work_date < next_first,
            )
            .order_by(Attendance.work_date.asc())
            .all()
        )
        body = {
            "data": attendance_list_schema.dump(my_records),
            "summary": summarize(my_records),
            "meta": pagination_meta(1, max(len(my_records), 1), len(my_records)),
        }
        return body, first

    # Employee không có mine vẫn bị ép phạm vi về chính mình ở truy vấn dưới.
    force_self_id = None
    if current_role == "employee":
        force_self_id = get_current_employee().id

    employee_query = db.session.query(Employee)
    # Nhân viên đã nghỉ việc vẫn có bảng công trong tháng nếu có bản ghi;
    # mặc định chỉ lấy nhân viên đang làm/on_leave nếu model có cột status.
    if current_role in ("manager",):
        me = get_current_employee()
        dept_ids = _manager_department_ids(me, get_jwt_identity())
        if "manager_id" in Employee.__table__.columns:
            from sqlalchemy import or_

            employee_query = employee_query.filter(
                or_(
                    Employee.department_id.in_(dept_ids),
                    Employee.manager_id == me.id,
                )
            )
        else:
            employee_query = employee_query.filter(
                Employee.department_id.in_(dept_ids)
            )

    department_id = args.get("department_id", type=int)
    if department_id:
        employee_query = employee_query.filter(
            Employee.department_id == department_id
        )
    employee_id = args.get("employee_id", type=int)
    if force_self_id is not None:
        employee_query = employee_query.filter(Employee.id == force_self_id)
    elif employee_id:
        employee_query = employee_query.filter(Employee.id == employee_id)

    employees = employee_query.order_by(Employee.id.asc()).all()
    employee_ids = [e.id for e in employees]

    records_by_employee = {eid: [] for eid in employee_ids}
    if employee_ids:
        records = (
            db.session.query(Attendance)
            .filter(
                Attendance.employee_id.in_(employee_ids),
                Attendance.work_date >= first,
                Attendance.work_date < next_first,
            )
            .order_by(Attendance.work_date.asc())
            .all()
        )
        for record in records:
            records_by_employee[record.employee_id].append(record)

    from .schemas import attendance_list_schema

    rows = []
    for emp in employees:
        emp_records = records_by_employee.get(emp.id, [])
        rows.append(
            {
                "employee_id": emp.id,
                "employee_code": getattr(emp, "code", None),
                "employee_name": getattr(emp, "full_name", None),
                "department_id": getattr(emp, "department_id", None),
                "summary": summarize(emp_records),
                "records": attendance_list_schema.dump(emp_records),
            }
        )

    total = len(rows)
    start = (page - 1) * limit
    page_rows = rows[start : start + limit]
    body = {"data": page_rows, "meta": pagination_meta(page, limit, total)}
    return body, first


# ---------------------------------------------------------------------------
# Nghiệp vụ: HR sửa bản ghi
# ---------------------------------------------------------------------------
def _write_audit_log(actor_id, record, changes, reason):
    """Ghi AuditLog nếu app có model AuditLog. Lỗi ghi log không làm hỏng thao tác chính."""
    try:
        from app.models import AuditLog
    except Exception:  # noqa: BLE001
        return
    try:
        columns = {c.name for c in AuditLog.__table__.columns}
        candidates = {
            "user_id": actor_id,
            "actor_id": actor_id,
            "action": "attendance.update",
            "entity_type": "attendance",
            "resource_type": "attendance",
            "entity": "attendance",
            "entity_id": record.id,
            "resource_id": record.id,
            "attendance_id": record.id,
            "details": json.dumps(
                {"changes": changes, "reason": reason},
                ensure_ascii=False,
                default=str,
            ),
            "changes": json.dumps(changes, ensure_ascii=False, default=str),
            "description": f"Sửa chấm công #{record.id}: {reason}",
        }
        kwargs = {k: v for k, v in candidates.items() if k in columns}
        if not kwargs:
            return
        with db.session.begin_nested():
            db.session.add(AuditLog(**kwargs))
    except Exception:  # noqa: BLE001 - audit là phụ, không chặn nghiệp vụ
        pass


def update_attendance(attendance_id, data):
    """HR/Admin sửa bản ghi chấm công. Bắt buộc note (lý do) — validate ở schema."""
    record = db.session.get(Attendance, attendance_id)
    if record is None:
        raise ApiError(404, "NOT_FOUND", "Không tìm thấy bản ghi chấm công.")

    actor_id = get_jwt_identity()
    changes = {}

    new_work_date = data.get("work_date")
    if new_work_date is not None and new_work_date != record.work_date:
        conflict = (
            db.session.query(Attendance)
            .filter_by(employee_id=record.employee_id, work_date=new_work_date)
            .first()
        )
        if conflict is not None and conflict.id != record.id:
            raise ApiError(
                409,
                "CONFLICT",
                "Nhân viên đã có bản ghi chấm công ở ngày đích, không thể chuyển.",
            )
        changes["work_date"] = [str(record.work_date), str(new_work_date)]
        record.work_date = new_work_date

    for field in ("check_in_at", "check_out_at"):
        if field in data:
            old = getattr(record, field)
            new = data[field]
            if old != new:
                changes[field] = [str(old) if old else None, str(new) if new else None]
                setattr(record, field, new)

    if "status" in data and data["status"] is not None:
        if data["status"] != record.status:
            changes["status"] = [record.status, data["status"]]
            record.status = data["status"]
    elif "check_in_at" in changes and record.status in ("present", "late"):
        # Không chỉ định status mà sửa giờ vào -> tính lại muộn/đúng giờ.
        if record.check_in_at is not None:
            record.status = (
                "late"
                if record.check_in_at.time() > get_work_start_time()
                else "present"
            )

    if (
        record.check_in_at is not None
        and record.check_out_at is not None
        and record.check_out_at < record.check_in_at
    ):
        raise ApiError(
            400,
            "VALIDATION_ERROR",
            "Giờ check-out không được sớm hơn giờ check-in.",
            details=[{"field": "check_out_at", "message": "Phải >= check_in_at"}],
        )

    reason = (data.get("note") or "").strip()
    record.note = reason
    if "edited_by" in Attendance.__table__.columns:
        try:
            record.edited_by = int(actor_id)
        except (TypeError, ValueError):
            record.edited_by = actor_id

    _write_audit_log(actor_id, record, changes, reason)
    db.session.commit()
    return record
