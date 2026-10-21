"""Service layer cho module Training (đào tạo nội bộ).

Logic nghiệp vụ + transaction; routes chỉ validate input, gọi service và
trả JSON. Lỗi nghiệp vụ ném ra dưới dạng ApiError (định dạng chuẩn
{"error": {"code", "message", "details"}}).

Quy tắc chính (hợp đồng feature-expansion-v2 mục 1D):
- Employee chỉ nhìn thấy khoá đang active; HR/Admin thấy tất cả.
- Gán học viên là idempotent: nhân viên đã ghi danh thì bỏ qua, không tạo trùng
  (DB cũng có UniqueConstraint course_id + employee_id).
- progress = 100 -> status = completed + completed_at; status = completed ->
  progress = 100. Gán khoá tạo Notification cho học viên có tài khoản.
"""

from app.blueprints.auth.guards import load_current_user
from app.extensions import db
from app.models import Employee, Notification, User
from app.models.training import Course, CourseEnrollment
from app.models.users import utcnow


class ApiError(Exception):
    """Lỗi nghiệp vụ có mã HTTP + code chuẩn để routes trả về."""

    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or []


WRITE_ROLES = ("admin", "hr")


# ---------------------------------------------------------------------------
# Helpers dùng chung
# ---------------------------------------------------------------------------

def get_or_404(model, pk, code, message):
    obj = db.session.get(model, pk)
    if obj is None:
        raise ApiError(404, code, message)
    return obj


def parse_pagination(args):
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


def _current_employee(user):
    """Hồ sơ nhân viên gắn với tài khoản hiện tại (có thể None)."""
    if getattr(user, "employee_id", None):
        return db.session.get(Employee, user.employee_id)
    return None


def _require_current_employee(user):
    employee = _current_employee(user)
    if employee is None:
        raise ApiError(
            400,
            "NO_EMPLOYEE_PROFILE",
            "Tài khoản chưa được gắn với hồ sơ nhân viên.",
        )
    return employee


def _notify_employee(employee_id, title, content, related_id):
    """Tạo Notification cho nhân viên (nếu có tài khoản đăng nhập)."""
    user = User.query.filter_by(employee_id=employee_id).first()
    if user is None:
        return
    db.session.add(
        Notification(
            user_id=user.id,
            type="training",
            title=title,
            content=content,
            is_read=False,
            related_type="course",
            related_id=related_id,
        )
    )


def enrollment_counts(course_id):
    """(tổng ghi danh, số đã hoàn thành) của một khoá học."""
    total = (
        CourseEnrollment.query.filter_by(course_id=course_id).count()
    )
    completed = (
        CourseEnrollment.query.filter_by(
            course_id=course_id, status=CourseEnrollment.STATUS_COMPLETED
        ).count()
    )
    return total, completed


# ---------------------------------------------------------------------------
# Khoá học (Course)
# ---------------------------------------------------------------------------

def list_courses(args, user):
    query = Course.query
    # Nhân viên chỉ thấy khoá đang mở.
    if user.role == "employee":
        query = query.filter(Course.is_active.is_(True))
    else:
        is_active = args.get("is_active")
        if is_active is not None and str(is_active).lower() in ("true", "false", "1", "0"):
            query = query.filter(
                Course.is_active.is_(str(is_active).lower() in ("true", "1"))
            )
    category = (args.get("category") or "").strip()
    if category:
        query = query.filter(Course.category == category)
    search = (args.get("search") or args.get("q") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(
            db.or_(Course.title.ilike(like), Course.category.ilike(like))
        )
    query = query.order_by(Course.created_at.desc(), Course.id.desc())
    page, limit = parse_pagination(args)
    return paginate(query, page, limit)


def get_course(course_id, user):
    course = get_or_404(Course, course_id, "COURSE_NOT_FOUND", "Không tìm thấy khoá học.")
    if user.role == "employee" and not course.is_active:
        # Không lộ khoá đã tắt cho nhân viên.
        raise ApiError(404, "COURSE_NOT_FOUND", "Không tìm thấy khoá học.")
    return course


def create_course(cleaned):
    course = Course(
        title=cleaned["title"],
        description=cleaned.get("description"),
        category=cleaned.get("category"),
        duration_hours=cleaned.get("duration_hours", 0),
        is_mandatory=cleaned.get("is_mandatory", False),
        is_active=cleaned.get("is_active", True),
    )
    db.session.add(course)
    db.session.commit()
    return course


def update_course(course_id, cleaned):
    course = get_or_404(Course, course_id, "COURSE_NOT_FOUND", "Không tìm thấy khoá học.")
    for field, value in cleaned.items():
        setattr(course, field, value)
    db.session.commit()
    return course


def delete_course(course_id):
    course = get_or_404(Course, course_id, "COURSE_NOT_FOUND", "Không tìm thấy khoá học.")
    db.session.delete(course)  # enrollments cascade delete-orphan
    db.session.commit()


# ---------------------------------------------------------------------------
# Ghi danh (CourseEnrollment)
# ---------------------------------------------------------------------------

def list_course_enrollments(course_id):
    get_or_404(Course, course_id, "COURSE_NOT_FOUND", "Không tìm thấy khoá học.")
    return (
        CourseEnrollment.query.filter_by(course_id=course_id)
        .order_by(CourseEnrollment.created_at.asc(), CourseEnrollment.id.asc())
        .all()
    )


def enroll_employees(course_id, employee_ids, actor):
    """Gán danh sách học viên vào khoá. Trả (created[], skipped_ids[])."""
    course = get_or_404(Course, course_id, "COURSE_NOT_FOUND", "Không tìm thấy khoá học.")
    if not course.is_active:
        raise ApiError(
            400, "COURSE_INACTIVE", "Khoá học đang tắt, không thể gán học viên."
        )
    employees = Employee.query.filter(Employee.id.in_(employee_ids)).all()
    found_ids = {e.id for e in employees}
    missing = [eid for eid in employee_ids if eid not in found_ids]
    if missing:
        raise ApiError(
            400,
            "EMPLOYEE_NOT_FOUND",
            "Một số nhân viên không tồn tại.",
            [{"field": "employee_ids", "message": f"Id không tồn tại: {missing}"}],
        )
    existing = {
        row.employee_id
        for row in CourseEnrollment.query.filter_by(course_id=course.id).all()
    }
    actor_employee = _current_employee(actor)
    created, skipped = [], []
    for employee in employees:
        if employee.id in existing:
            skipped.append(employee.id)
            continue
        enrollment = CourseEnrollment(
            course_id=course.id,
            employee_id=employee.id,
            status=CourseEnrollment.STATUS_ASSIGNED,
            progress=0,
            enrolled_by=actor_employee.id if actor_employee else None,
        )
        db.session.add(enrollment)
        created.append(enrollment)
        _notify_employee(
            employee.id,
            "Bạn được gán một khoá học mới",
            f"Khoá học: {course.title}. Vui lòng vào mục Đào tạo để bắt đầu học.",
            course.id,
        )
    db.session.commit()
    return created, skipped


def my_courses(user):
    """Danh sách ghi danh của chính nhân viên đang đăng nhập (kèm khoá học)."""
    employee = _require_current_employee(user)
    return (
        CourseEnrollment.query.filter_by(employee_id=employee.id)
        .order_by(CourseEnrollment.created_at.desc(), CourseEnrollment.id.desc())
        .all()
    )


def update_enrollment(enrollment_id, cleaned, user):
    """Chủ enrollment hoặc HR/Admin mới được cập nhật tiến độ/trạng thái."""
    enrollment = get_or_404(
        CourseEnrollment, enrollment_id, "ENROLLMENT_NOT_FOUND",
        "Không tìm thấy bản ghi ghi danh.",
    )
    is_owner = (
        getattr(user, "employee_id", None) is not None
        and user.employee_id == enrollment.employee_id
    )
    if not is_owner and user.role not in WRITE_ROLES:
        raise ApiError(
            403, "FORBIDDEN", "Bạn không có quyền cập nhật tiến độ của học viên khác."
        )

    new_progress = cleaned.get("progress", enrollment.progress)
    new_status = cleaned.get("status", enrollment.status)
    if "progress" in cleaned:
        if new_progress >= 100:
            new_status = CourseEnrollment.STATUS_COMPLETED
        elif new_progress > 0 and new_status == CourseEnrollment.STATUS_ASSIGNED:
            new_status = CourseEnrollment.STATUS_IN_PROGRESS
    if "status" in cleaned and cleaned["status"] == CourseEnrollment.STATUS_COMPLETED:
        new_progress = 100
        new_status = CourseEnrollment.STATUS_COMPLETED

    enrollment.progress = new_progress
    enrollment.status = new_status
    if new_status == CourseEnrollment.STATUS_COMPLETED:
        if enrollment.completed_at is None:
            enrollment.completed_at = utcnow()
    else:
        enrollment.completed_at = None
    db.session.commit()
    return enrollment


def current_user():
    return load_current_user()
