"""Service layer cho module Offboarding (docs/feature-expansion-v3.md muc 3).

Logic nghiep vu + transaction:
- Tao process (HR/Admin): 1 nhan vien chi co 1 process in_progress
  (409 neu da co); checklist mac dinh tu sinh trong build_checklist():
  task tong "Thu hoi tai san da cap phat" + 1 task RIENG cho tung tai
  san dang cap phat (AssetAssignment.status = 'active'), task IT thu
  hoi tai khoan, ban giao cong viec, quyet toan tai chinh, 2 task HR.
- Data-scope (giong onboarding/leave): admin/hr toan cuc; manager thay
  nhan vien minh quan ly truc tiep / truong phong / cung phong ban;
  employee chi thay process cua chinh minh. Ngoai scope tra 404.
- Tick task theo assignee_role: hr/admin tick moi task; manager chi
  task assignee_role='manager' cua nhan vien trong scope; employee chi
  task assignee_role='employee' trong process cua chinh minh.
- Complete (HR/Admin): chi khi 100% task xong -> status completed,
  Employee.status = 'resigned' (Employee.STATUS_RESIGNED), khoa tai
  khoan User gan voi nhan vien (is_active = False).
"""

from datetime import datetime, timezone

from app.errors import ApiError
from app.extensions import db
from app.models import Department, Employee, Notification, User
from app.models.assets import AssetAssignment
from app.models.offboarding import OffboardingProcess, OffboardingTask


# ---------------------------------------------------------------------------
# Nguoi dung hien tai & pham vi du lieu (bam khuon onboarding)
# ---------------------------------------------------------------------------

def get_or_404(model, pk, code, message):
    obj = db.session.get(model, pk)
    if obj is None:
        raise ApiError(404, code, message)
    return obj


def current_employee(user):
    """Ho so nhan vien gan voi tai khoan, None neu tai khoan chua gan."""
    if getattr(user, "employee_id", None):
        return db.session.get(Employee, user.employee_id)
    return None


def _manager_visible_employee_ids(me):
    """Tap employee_id ma manager duoc thay (theo scope cua module onboarding)."""
    if me is None:
        return set()
    ids = {me.id}
    managed_dept_ids = {
        d.id for d in Department.query.filter_by(manager_id=me.id).all()
    }
    query = Employee.query.filter(
        db.or_(
            Employee.manager_id == me.id,
            Employee.department_id.in_(managed_dept_ids) if managed_dept_ids
            else db.false(),
            Employee.department_id == me.department_id if me.department_id
            else db.false(),
        )
    )
    ids.update(e.id for e in query.all())
    return ids


def can_view_employee(user, employee_id):
    if user.role in ("admin", "hr"):
        return True
    me = current_employee(user)
    if me is None:
        return False
    if user.role == "employee":
        return employee_id == me.id
    if user.role == "manager":
        return employee_id in _manager_visible_employee_ids(me)
    return False


def get_process_or_404(process_id, user):
    process = get_or_404(
        OffboardingProcess, process_id,
        "OFFBOARDING_NOT_FOUND", "Không tìm thấy quy trình nghỉ việc.",
    )
    if not can_view_employee(user, process.employee_id):
        raise ApiError(
            404, "OFFBOARDING_NOT_FOUND", "Không tìm thấy quy trình nghỉ việc."
        )
    return process


# ---------------------------------------------------------------------------
# Notification helpers (bam khuon onboarding)
# ---------------------------------------------------------------------------

def _user_id_for_employee(employee_id):
    if employee_id is None:
        return None
    user = User.query.filter_by(employee_id=employee_id).first()
    return user.id if user else None


def _notify_employee(employee_id, title, content, related_id):
    user_id = _user_id_for_employee(employee_id)
    if user_id is None:
        return
    db.session.add(
        Notification(
            user_id=user_id,
            type="offboarding",
            title=title,
            content=content,
            is_read=False,
            related_type="offboarding_process",
            related_id=related_id,
        )
    )


# ---------------------------------------------------------------------------
# Checklist mac dinh
# ---------------------------------------------------------------------------

def build_checklist(process):
    """Sinh checklist ban giao mac dinh cho process (chi flush, khong commit).

    Gom: task tong thu hoi tai san + 1 task rieng cho TUNG tai san dang
    cap phat cho nhan vien (AssetAssignment active), thu hoi tai khoan
    (it), ban giao cong viec (employee), quyet toan (hr/finance),
    cham dut hop dong + exit interview (hr).
    Tra ve danh sach OffboardingTask vua tao.
    """
    tasks = []

    def add(title, category, role, note=None):
        task = OffboardingTask(
            process_id=process.id,
            title=title,
            category=category,
            assignee_role=role,
            is_done=False,
            note=note,
            sort_order=len(tasks) + 1,
        )
        db.session.add(task)
        tasks.append(task)
        return task

    add("Thu hồi tài sản đã cấp phát", "assets", "hr")
    active_assignments = (
        AssetAssignment.query
        .filter_by(employee_id=process.employee_id, status=AssetAssignment.STATUS_ACTIVE)
        .order_by(AssetAssignment.id.asc())
        .all()
    )
    for assignment in active_assignments:
        asset = assignment.asset
        asset_name = getattr(asset, "name", None) or "Tài sản"
        asset_code = getattr(asset, "code", None) or f"#{assignment.asset_id}"
        note = f"Lượt cấp phát #{assignment.id}"
        serial = getattr(asset, "serial", None)
        if serial:
            note += f" · Serial: {serial}"
        add(f"Thu hồi tài sản: {asset_name} ({asset_code})", "assets", "hr", note=note)
    add("Thu hồi tài khoản & quyền truy cập", "it", "it")
    add("Bàn giao công việc & tài liệu cho người thay thế", "knowledge", "employee")
    add("Quyết toán lương & các khoản tạm ứng", "finance", "hr")
    add("Chấm dứt hợp đồng & chốt sổ BHXH nội bộ", "hr", "hr")
    add("Phỏng vấn nghỉ việc (exit interview)", "hr", "hr")
    db.session.flush()
    return tasks


# ---------------------------------------------------------------------------
# Tao / huy / hoan tat process
# ---------------------------------------------------------------------------

def create_process(user, data):
    employee = get_or_404(
        Employee, data["employee_id"],
        "EMPLOYEE_NOT_FOUND", "Không tìm thấy nhân viên.",
    )
    if employee.status == Employee.STATUS_RESIGNED:
        raise ApiError(
            409, "EMPLOYEE_ALREADY_RESIGNED",
            "Nhân viên này đã ở trạng thái nghỉ việc.",
        )
    existing = (
        OffboardingProcess.query
        .filter_by(
            employee_id=employee.id,
            status=OffboardingProcess.STATUS_IN_PROGRESS,
        )
        .first()
    )
    if existing is not None:
        raise ApiError(
            409, "OFFBOARDING_ALREADY_IN_PROGRESS",
            "Nhân viên này đã có một quy trình nghỉ việc đang thực hiện.",
        )
    process = OffboardingProcess(
        employee_id=employee.id,
        last_working_day=data["last_working_day"],
        reason=data.get("reason"),
        status=OffboardingProcess.STATUS_IN_PROGRESS,
        initiated_by=user.id,
    )
    db.session.add(process)
    db.session.flush()
    tasks = build_checklist(process)
    _notify_employee(
        employee.id,
        "Quy trình nghỉ việc đã được khởi tạo",
        f"Ngày làm việc cuối cùng của bạn: "
        f"{process.last_working_day.isoformat()}. Checklist bàn giao gồm "
        f"{len(tasks)} đầu việc — hãy phối hợp hoàn thành đúng hạn.",
        process.id,
    )
    if employee.manager_id and employee.manager_id != employee.id:
        _notify_employee(
            employee.manager_id,
            "Nhân viên có quy trình nghỉ việc mới",
            f"{employee.full_name} sẽ nghỉ việc, ngày làm việc cuối: "
            f"{process.last_working_day.isoformat()}.",
            process.id,
        )
    db.session.commit()
    return process


def cancel_process(process_id):
    process = get_or_404(
        OffboardingProcess, process_id,
        "OFFBOARDING_NOT_FOUND", "Không tìm thấy quy trình nghỉ việc.",
    )
    if process.status == OffboardingProcess.STATUS_COMPLETED:
        raise ApiError(
            409, "OFFBOARDING_ALREADY_COMPLETED",
            "Quy trình đã hoàn tất, không thể huỷ.",
        )
    if process.status == OffboardingProcess.STATUS_CANCELLED:
        raise ApiError(
            409, "OFFBOARDING_ALREADY_CANCELLED",
            "Quy trình đã bị huỷ trước đó.",
        )
    process.status = OffboardingProcess.STATUS_CANCELLED
    db.session.commit()
    return process


def complete_process(process_id):
    process = get_or_404(
        OffboardingProcess, process_id,
        "OFFBOARDING_NOT_FOUND", "Không tìm thấy quy trình nghỉ việc.",
    )
    if process.status == OffboardingProcess.STATUS_COMPLETED:
        raise ApiError(
            409, "OFFBOARDING_ALREADY_COMPLETED",
            "Quy trình nghỉ việc này đã hoàn tất.",
        )
    if process.status != OffboardingProcess.STATUS_IN_PROGRESS:
        raise ApiError(
            409, "OFFBOARDING_NOT_IN_PROGRESS",
            "Quy trình không còn ở trạng thái đang thực hiện.",
        )
    tasks = list(process.tasks or [])
    total = len(tasks)
    done = sum(1 for t in tasks if t.is_done)
    if total == 0 or done < total:
        raise ApiError(
            409, "OFFBOARDING_TASKS_INCOMPLETE",
            f"Chưa thể hoàn tất: mới xong {done}/{total} đầu việc bàn giao.",
            details=[{"field": "tasks", "message": f"Còn {total - done} đầu việc chưa hoàn thành."}],
        )
    process.status = OffboardingProcess.STATUS_COMPLETED
    process.completed_at = datetime.now(timezone.utc)
    employee = db.session.get(Employee, process.employee_id)
    if employee is not None:
        # Trang thai nghi viec theo dung enum cua model Employee.
        employee.status = Employee.STATUS_RESIGNED
        # Khoa tai khoan dang nhap gan voi nhan vien (neu co).
        account = User.query.filter_by(employee_id=employee.id).first()
        if account is not None:
            account.is_active = False
    db.session.commit()
    return process


# ---------------------------------------------------------------------------
# Danh sach / chi tiet
# ---------------------------------------------------------------------------

def _parse_pagination(args):
    try:
        page = int(args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    try:
        limit = int(args.get("limit", 50))
    except (TypeError, ValueError):
        limit = 50
    return max(page, 1), min(max(limit, 1), 100)


def list_processes(user, args):
    query = OffboardingProcess.query.join(
        Employee, Employee.id == OffboardingProcess.employee_id
    )
    if user.role == "employee":
        me = current_employee(user)
        query = query.filter(
            OffboardingProcess.employee_id == (me.id if me else -1)
        )
    elif user.role == "manager":
        me = current_employee(user)
        visible = _manager_visible_employee_ids(me)
        query = query.filter(OffboardingProcess.employee_id.in_(visible or {-1}))
    status = (args.get("status") or "").strip()
    if status:
        query = query.filter(OffboardingProcess.status == status)
    department_id = args.get("department_id")
    if department_id:
        try:
            query = query.filter(Employee.department_id == int(department_id))
        except (TypeError, ValueError):
            raise ApiError(
                400, "VALIDATION_ERROR", "department_id phải là số nguyên.",
                details=[{"field": "department_id", "message": "Phải là số nguyên."}],
            )
    query = query.order_by(
        OffboardingProcess.created_at.desc(), OffboardingProcess.id.desc()
    )
    page, limit = _parse_pagination(args)
    total = query.count()
    items = query.offset((page - 1) * limit).limit(limit).all()
    meta = {
        "page": page,
        "limit": limit,
        "totalItems": total,
        "totalPages": (total + limit - 1) // limit if total else 0,
    }
    return items, meta


# ---------------------------------------------------------------------------
# Tasks — tick hoan thanh theo quyen
# ---------------------------------------------------------------------------

def _can_update_task(user, task):
    """Quyen tick task theo assignee_role + scope (hop dong muc 3.2)."""
    if user.role in ("admin", "hr"):
        return True
    process = task.process
    if process is None:
        return False
    me = current_employee(user)
    if me is None:
        return False
    if user.role == "manager":
        return (
            task.assignee_role == OffboardingTask.ROLE_MANAGER
            and process.employee_id in _manager_visible_employee_ids(me)
        )
    if user.role == "employee":
        return (
            task.assignee_role == OffboardingTask.ROLE_EMPLOYEE
            and process.employee_id == me.id
        )
    return False


def update_task(user, task_id, data):
    task = get_or_404(
        OffboardingTask, task_id,
        "OFFBOARDING_TASK_NOT_FOUND", "Không tìm thấy đầu việc bàn giao.",
    )
    if not _can_update_task(user, task):
        raise ApiError(
            403, "FORBIDDEN",
            "Bạn không có quyền cập nhật đầu việc này.",
        )
    process = task.process
    if process is not None and process.status != OffboardingProcess.STATUS_IN_PROGRESS:
        raise ApiError(
            409, "OFFBOARDING_NOT_IN_PROGRESS",
            "Quy trình nghỉ việc đã kết thúc, không thể sửa đầu việc.",
        )
    if "is_done" in data and data["is_done"] is not None:
        if data["is_done"]:
            task.is_done = True
            task.done_by = user.id
            task.done_at = datetime.now(timezone.utc)
        else:
            task.is_done = False
            task.done_by = None
            task.done_at = None
    if "note" in data:
        task.note = data["note"]
    db.session.commit()
    return task
