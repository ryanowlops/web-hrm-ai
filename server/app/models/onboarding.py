"""Mo hinh Onboarding (hoi nhap nhan vien moi).

Theo docs/kpi-okr-onboarding.md muc 5.3:
- onboarding_templates: mau ke hoach theo phong ban/chuc vu (nullable =
  ap dung chung cho toan cong ty).
- onboarding_template_tasks: dau viec mau cua template; han hoan thanh
  tinh bang due_offset_days so voi ngay bat dau lam viec cua nhan vien.
- onboarding_plans: ke hoach hoi nhap cua tung nhan vien (1 nhan vien
  toi da 1 plan — employee_id unique).
- onboarding_tasks: dau viec cu the cua mot plan, sinh tu template task;
  assignee_id nullable khi moi giao theo vai tro (assignee_role) ma
  chua ro nguoi cu the (vd buddy do Manager chi dinh sau).
"""
from app.extensions import db
from app.models.users import TimestampMixin


class OnboardingTemplate(TimestampMixin, db.Model):
    __tablename__ = "onboarding_templates"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    department_id = db.Column(
        db.Integer, db.ForeignKey("departments.id"), nullable=True, index=True
    )
    position_id = db.Column(
        db.Integer, db.ForeignKey("positions.id"), nullable=True, index=True
    )
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    department = db.relationship("Department")
    position = db.relationship("Position")
    tasks = db.relationship(
        "OnboardingTemplateTask",
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="OnboardingTemplateTask.sort_order",
    )
    plans = db.relationship("OnboardingPlan", back_populates="template")

    def __repr__(self):
        return f"<OnboardingTemplate id={self.id} name={self.name!r}>"


class OnboardingTemplateTask(TimestampMixin, db.Model):
    __tablename__ = "onboarding_template_tasks"

    ROLE_HR = "hr"
    ROLE_MANAGER = "manager"
    ROLE_IT = "it"
    ROLE_BUDDY = "buddy"
    ROLE_EMPLOYEE = "employee"
    ASSIGNEE_ROLES = (ROLE_HR, ROLE_MANAGER, ROLE_IT, ROLE_BUDDY, ROLE_EMPLOYEE)

    TYPE_TASK = "task"
    TYPE_DOCUMENT = "document"
    TYPE_TRAINING = "training"
    TYPE_MEETING = "meeting"
    TASK_TYPES = (TYPE_TASK, TYPE_DOCUMENT, TYPE_TRAINING, TYPE_MEETING)

    id = db.Column(db.Integer, primary_key=True)
    template_id = db.Column(
        db.Integer,
        db.ForeignKey("onboarding_templates.id"),
        nullable=False,
        index=True,
    )
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    assignee_role = db.Column(
        db.String(20), nullable=False, default=ROLE_EMPLOYEE
    )
    # So ngay cong/tru vao start_date cua nhan vien (am = truoc ngay dau).
    due_offset_days = db.Column(db.Integer, nullable=False, default=0)
    task_type = db.Column(db.String(20), nullable=False, default=TYPE_TASK)
    sort_order = db.Column(db.Integer, nullable=False, default=0)

    template = db.relationship("OnboardingTemplate", back_populates="tasks")

    def __repr__(self):
        return f"<OnboardingTemplateTask id={self.id} template_id={self.template_id}>"


class OnboardingPlan(TimestampMixin, db.Model):
    __tablename__ = "onboarding_plans"

    STATUS_IN_PROGRESS = "in_progress"
    STATUS_COMPLETED = "completed"
    STATUS_CANCELLED = "cancelled"
    STATUSES = (STATUS_IN_PROGRESS, STATUS_COMPLETED, STATUS_CANCELLED)

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.Integer,
        db.ForeignKey("employees.id"),
        nullable=False,
        unique=True,
        index=True,
    )
    template_id = db.Column(
        db.Integer, db.ForeignKey("onboarding_templates.id"), nullable=True
    )
    start_date = db.Column(db.Date, nullable=True)
    status = db.Column(
        db.String(20), nullable=False, default=STATUS_IN_PROGRESS, index=True
    )

    employee = db.relationship("Employee")
    template = db.relationship("OnboardingTemplate", back_populates="plans")
    tasks = db.relationship(
        "OnboardingTask",
        back_populates="plan",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<OnboardingPlan id={self.id} employee_id={self.employee_id} status={self.status!r}>"


class OnboardingTask(TimestampMixin, db.Model):
    __tablename__ = "onboarding_tasks"

    STATUS_PENDING = "pending"
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_DONE = "done"
    STATUS_VERIFIED = "verified"
    STATUS_OVERDUE = "overdue"
    STATUS_SKIPPED = "skipped"
    STATUSES = (
        STATUS_PENDING,
        STATUS_IN_PROGRESS,
        STATUS_DONE,
        STATUS_VERIFIED,
        STATUS_OVERDUE,
        STATUS_SKIPPED,
    )
    # Trang thai nguoi dung duoc tu dat qua PATCH (overdue la trang thai
    # he thong tinh dong, verified chi qua endpoint verify cua HR).
    SETTABLE_STATUSES = (
        STATUS_PENDING,
        STATUS_IN_PROGRESS,
        STATUS_DONE,
        STATUS_SKIPPED,
    )
    DONE_STATUSES = (STATUS_DONE, STATUS_VERIFIED)

    id = db.Column(db.Integer, primary_key=True)
    plan_id = db.Column(
        db.Integer,
        db.ForeignKey("onboarding_plans.id"),
        nullable=False,
        index=True,
    )
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    assignee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=True, index=True
    )
    assignee_role = db.Column(db.String(20), nullable=True)
    due_date = db.Column(db.Date, nullable=True)
    task_type = db.Column(db.String(20), nullable=False, default="task")
    status = db.Column(
        db.String(20), nullable=False, default=STATUS_PENDING, index=True
    )
    completed_at = db.Column(db.DateTime, nullable=True)
    completed_by = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=True
    )
    note = db.Column(db.Text, nullable=True)

    plan = db.relationship("OnboardingPlan", back_populates="tasks")
    assignee = db.relationship("Employee", foreign_keys=[assignee_id])
    completer = db.relationship("Employee", foreign_keys=[completed_by])

    def __repr__(self):
        return f"<OnboardingTask id={self.id} plan_id={self.plan_id} status={self.status!r}>"
