"""Service layer cho module Onboarding (docs/kpi-okr-onboarding.md muc 5).

Logic nghiep vu + transaction:
- Template CRUD (HR/Admin) kem cac dau viec mau.
- Sinh plan tu template: uu tien template theo position > department >
  chung; due_date = start_date + due_offset_days; nguoi phu trach giai
  theo assignee_role (employee -> chinh nhan vien moi, manager -> quan
  ly truc tiep, hr/it/buddy -> de trong, gan nguoi sau qua PATCH task).
- generate_plan_for_employee() la hook duoc goi tu luong tao employee
  moi (employees/services.create_employee) — idempotent, da co plan thi
  tra lai plan cu, khong co template khop thi tra None.
- Data-scope: admin/hr toan cuc; manager thay nhan vien minh quan ly
  (manager_id = minh, phong minh truong phong, hoac cung phong ban);
  employee chi thay plan/task cua chinh minh. Ngoai scope tra 404.
"""

from datetime import date, datetime, timedelta, timezone

from app.errors import ApiError
from app.extensions import db
from app.models import Department, Employee, Notification, User
from app.models.onboarding import (
    OnboardingPlan,
    OnboardingTask,
    OnboardingTemplate,
    OnboardingTemplateTask,
)


# ---------------------------------------------------------------------------
# Nguoi dung hien tai & pham vi du lieu
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
    """Tap employee_id ma manager duoc thay (theo scope cua module employees)."""
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


def get_plan_or_404(plan_id, user):
    plan = get_or_404(
        OnboardingPlan, plan_id,
        "ONBOARDING_PLAN_NOT_FOUND", "Không tìm thấy kế hoạch hội nhập.",
    )
    if not can_view_employee(user, plan.employee_id):
        raise ApiError(
            404, "ONBOARDING_PLAN_NOT_FOUND", "Không tìm thấy kế hoạch hội nhập."
        )
    return plan


# ---------------------------------------------------------------------------
# Notification helpers
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
            type="onboarding",
            title=title,
            content=content,
            is_read=False,
            related_type="onboarding_plan",
            related_id=related_id,
        )
    )


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

TEMPLATE_WRITABLE = ("name", "department_id", "position_id", "is_active")


def list_templates():
    return (
        OnboardingTemplate.query
        .order_by(OnboardingTemplate.id.asc())
        .all()
    )


def get_template(template_id):
    return get_or_404(
        OnboardingTemplate, template_id,
        "ONBOARDING_TEMPLATE_NOT_FOUND", "Không tìm thấy mẫu hội nhập.",
    )


def _replace_template_tasks(template, task_payloads):
    for old in list(template.tasks or []):
        db.session.delete(old)
    db.session.flush()
    for payload in task_payloads:
        db.session.add(OnboardingTemplateTask(template=template, **payload))


def create_template(data):
    template = OnboardingTemplate()
    for field in TEMPLATE_WRITABLE:
        if field in data:
            setattr(template, field, data[field])
    db.session.add(template)
    db.session.flush()
    if data.get("tasks"):
        _replace_template_tasks(template, data["tasks"])
    db.session.commit()
    return template


def update_template(template_id, data):
    template = get_template(template_id)
    for field in TEMPLATE_WRITABLE:
        if field in data:
            setattr(template, field, data[field])
    if "tasks" in data and data["tasks"] is not None:
        _replace_template_tasks(template, data["tasks"])
    db.session.commit()
    return template


def pick_template_for_employee(employee):
    """Chon template active phu hop nhat: position > department > chung.

    Uu tien trong cung muc: template khop ca position + department truoc,
    roi khop tung phan, cuoi cung la template chung (ca hai deu null).
    """
    templates = (
        OnboardingTemplate.query
        .filter_by(is_active=True)
        .order_by(OnboardingTemplate.id.asc())
        .all()
    )
    if not templates:
        return None

    def score(template):
        pos_match = (
            template.position_id is not None
            and template.position_id == employee.position_id
        )
        dept_match = (
            template.department_id is not None
            and template.department_id == employee.department_id
        )
        # Template co dieu kien nhung khong khop -> khong ap dung.
        if template.position_id is not None and not pos_match:
            return -1
        if template.department_id is not None and not dept_match:
            return -1
        return (2 if pos_match else 0) + (1 if dept_match else 0)

    best, best_score = None, -1
    for template in templates:
        current = score(template)
        if current > best_score:
            best, best_score = template, current
    return best


# ---------------------------------------------------------------------------
# Sinh plan
# ---------------------------------------------------------------------------

def _resolve_assignee_id(template_task, employee):
    if template_task.assignee_role == OnboardingTemplateTask.ROLE_EMPLOYEE:
        return employee.id
    if template_task.assignee_role == OnboardingTemplateTask.ROLE_MANAGER:
        return employee.manager_id
    # hr / it / buddy: giao theo vai tro, chua ro nguoi -> de trong.
    return None


def generate_plan_for_employee(employee, template=None, start_date=None):
    """Sinh plan onboarding cho nhan vien tu template (idempotent).

    Tra ve OnboardingPlan, hoac None neu khong co template nao khop.
    Da co plan thi tra lai plan hien co (khong sinh trung).
    Day la hook duoc goi khi tao employee moi — loi o day khong duoc
    lam hong luong tao employee (phia goi co try/except bao ngoai).
    """
    existing = OnboardingPlan.query.filter_by(employee_id=employee.id).first()
    if existing is not None:
        return existing
    if template is None:
        template = pick_template_for_employee(employee)
    if template is None:
        return None
    plan_start = start_date or employee.start_date or date.today()
    plan = OnboardingPlan(
        employee_id=employee.id,
        template_id=template.id,
        start_date=plan_start,
        status=OnboardingPlan.STATUS_IN_PROGRESS,
    )
    db.session.add(plan)
    db.session.flush()
    template_tasks = sorted(
        template.tasks or [], key=lambda t: (t.sort_order or 0, t.id or 0)
    )
    for template_task in template_tasks:
        due_date = None
        if plan_start is not None:
            due_date = plan_start + timedelta(
                days=template_task.due_offset_days or 0
            )
        db.session.add(
            OnboardingTask(
                plan_id=plan.id,
                title=template_task.title,
                description=template_task.description,
                assignee_id=_resolve_assignee_id(template_task, employee),
                assignee_role=template_task.assignee_role,
                due_date=due_date,
                task_type=template_task.task_type,
                status=OnboardingTask.STATUS_PENDING,
            )
        )
    db.session.flush()
    # Thong bao cho nhan vien moi + quan ly truc tiep (neu da co tai khoan).
    _notify_employee(
        employee.id,
        "Chào mừng bạn gia nhập công ty",
        f"Kế hoạch hội nhập của bạn đã sẵn sàng với {len(template_tasks)} đầu việc. "
        "Hãy xem mục Hội nhập để bắt đầu.",
        plan.id,
    )
    if employee.manager_id and employee.manager_id != employee.id:
        _notify_employee(
            employee.manager_id,
            "Nhân viên mới có kế hoạch hội nhập",
            f"{employee.full_name} bắt đầu làm việc ngày "
            f"{plan_start.isoformat() if plan_start else '—'}; kế hoạch hội nhập "
            "đã được tạo từ mẫu.",
            plan.id,
        )
    db.session.commit()
    return plan


def create_plan_manual(data):
    """POST /plans — HR sinh plan thu cong cho 1 nhan vien."""
    employee = get_or_404(
        Employee, data["employee_id"],
        "EMPLOYEE_NOT_FOUND", "Không tìm thấy nhân viên.",
    )
    template = None
    if data.get("template_id") is not None:
        template = get_template(data["template_id"])
    if OnboardingPlan.query.filter_by(employee_id=employee.id).first() is not None:
        raise ApiError(
            409, "ONBOARDING_PLAN_EXISTS",
            "Nhân viên này đã có kế hoạch hội nhập.",
        )
    plan = generate_plan_for_employee(employee, template=template)
    if plan is None:
        raise ApiError(
            400, "ONBOARDING_NO_TEMPLATE",
            "Không có mẫu hội nhập nào đang áp dụng cho nhân viên này.",
        )
    return plan


# ---------------------------------------------------------------------------
# Plans — list / detail / my
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


def list_plans(user, args):
    query = OnboardingPlan.query.join(
        Employee, Employee.id == OnboardingPlan.employee_id
    )
    if user.role == "employee":
        me = current_employee(user)
        query = query.filter(OnboardingPlan.employee_id == (me.id if me else -1))
    elif user.role == "manager":
        me = current_employee(user)
        visible = _manager_visible_employee_ids(me)
        query = query.filter(OnboardingPlan.employee_id.in_(visible or {-1}))
    status = (args.get("status") or "").strip()
    if status:
        query = query.filter(OnboardingPlan.status == status)
    department_id = args.get("department_id")
    if department_id:
        try:
            query = query.filter(Employee.department_id == int(department_id))
        except (TypeError, ValueError):
            raise ApiError(
                400, "VALIDATION_ERROR", "department_id phải là số nguyên.",
                [{"field": "department_id", "message": "Phải là số nguyên."}],
            )
    query = query.order_by(OnboardingPlan.start_date.desc(), OnboardingPlan.id.desc())
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


def get_my_plan(user):
    me = current_employee(user)
    if me is None:
        return None
    return OnboardingPlan.query.filter_by(employee_id=me.id).first()


def list_my_tasks(user):
    """Task duoc giao cho toi (assignee) + task trong plan cua chinh toi."""
    me = current_employee(user)
    if me is None:
        return []
    query = (
        OnboardingTask.query
        .join(OnboardingPlan, OnboardingPlan.id == OnboardingTask.plan_id)
        .filter(
            db.or_(
                OnboardingTask.assignee_id == me.id,
                OnboardingPlan.employee_id == me.id,
            )
        )
        .order_by(OnboardingTask.due_date.asc(), OnboardingTask.id.asc())
    )
    return query.all()


# ---------------------------------------------------------------------------
# Tasks — cap nhat / xac nhan
# ---------------------------------------------------------------------------

def _can_update_task(user, task):
    if user.role in ("admin", "hr"):
        return True
    me = current_employee(user)
    if me is None:
        return False
    plan = task.plan
    if plan is not None and plan.employee_id == me.id:
        return True
    if task.assignee_id is not None and task.assignee_id == me.id:
        return True
    plan_employee = getattr(plan, "employee", None) if plan else None
    is_manager_of = (
        plan_employee is not None and plan_employee.manager_id == me.id
    )
    if is_manager_of:
        # Manager duoc cap nhat task cua nhan vien minh, ke ca task buddy
        # (de gan buddy / tick ho khi can).
        return True
    return False


def _refresh_plan_status(plan):
    """Tu dong hoan thanh plan khi moi task da done/verified/skipped."""
    if plan.status != OnboardingPlan.STATUS_IN_PROGRESS:
        return
    tasks = list(plan.tasks or [])
    if not tasks:
        return
    if all(
        t.status in OnboardingTask.DONE_STATUSES
        or t.status == OnboardingTask.STATUS_SKIPPED
        for t in tasks
    ):
        plan.status = OnboardingPlan.STATUS_COMPLETED


def update_task(user, task_id, data):
    task = get_or_404(
        OnboardingTask, task_id,
        "ONBOARDING_TASK_NOT_FOUND", "Không tìm thấy đầu việc hội nhập.",
    )
    if not _can_update_task(user, task):
        raise ApiError(
            403, "FORBIDDEN",
            "Bạn không có quyền cập nhật đầu việc này.",
        )
    if "assignee_id" in data:
        # Gan nguoi phu trach chi danh cho HR/Admin/Manager cua nhan vien.
        me = current_employee(user)
        plan_employee = task.plan.employee if task.plan else None
        allowed_assign = user.role in ("admin", "hr") or (
            me is not None
            and plan_employee is not None
            and plan_employee.manager_id == me.id
        )
        if not allowed_assign:
            raise ApiError(
                403, "FORBIDDEN",
                "Bạn không có quyền gán người phụ trách cho đầu việc này.",
            )
        if data["assignee_id"] is not None:
            get_or_404(
                Employee, data["assignee_id"],
                "EMPLOYEE_NOT_FOUND", "Không tìm thấy nhân viên được gán.",
            )
        task.assignee_id = data["assignee_id"]
    if "note" in data:
        task.note = data["note"]
    if "status" in data and data["status"] is not None:
        new_status = data["status"]
        if new_status == OnboardingTask.STATUS_DONE:
            me = current_employee(user)
            task.completed_at = datetime.now(timezone.utc)
            task.completed_by = me.id if me else None
        elif new_status in (
            OnboardingTask.STATUS_PENDING,
            OnboardingTask.STATUS_IN_PROGRESS,
            OnboardingTask.STATUS_SKIPPED,
        ):
            task.completed_at = None
            task.completed_by = None
        task.status = new_status
    if task.plan is not None:
        _refresh_plan_status(task.plan)
    db.session.commit()
    return task


def verify_task(user, task_id):
    task = get_or_404(
        OnboardingTask, task_id,
        "ONBOARDING_TASK_NOT_FOUND", "Không tìm thấy đầu việc hội nhập.",
    )
    if task.task_type != "document":
        raise ApiError(
            400, "ONBOARDING_TASK_NOT_DOCUMENT",
            "Chỉ xác nhận được đầu việc loại hồ sơ (document).",
        )
    me = current_employee(user)
    task.status = OnboardingTask.STATUS_VERIFIED
    task.completed_at = datetime.now(timezone.utc)
    task.completed_by = me.id if me else task.completed_by
    if task.plan is not None:
        _refresh_plan_status(task.plan)
    db.session.commit()
    return task
