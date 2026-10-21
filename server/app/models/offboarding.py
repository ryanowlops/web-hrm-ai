"""Mo hinh Offboarding (quy trinh nghi viec & ban giao).

Theo docs/feature-expansion-v3.md muc 3.1:
- offboarding_processes: quy trinh nghi viec cua 1 nhan vien; tai mot
  thoi diem chi co TOI DA 1 process dang in_progress cho moi nhan vien
  (rang buoc nay do services dam bao khi tao process).
- offboarding_tasks: checklist ban giao cua process; khi tao process,
  services tu sinh task mac dinh + 1 task rieng cho tung tai san dang
  cap phat (asset_assignments.status = 'active') cho nhan vien do.

Hoan tat process (100% task xong) -> Employee.status = 'resigned'
(Employee.STATUS_RESIGNED) va User.is_active = False cua tai khoan gan
voi nhan vien (neu co).
"""
from app.extensions import db
from app.models.users import TimestampMixin


class OffboardingProcess(TimestampMixin, db.Model):
    __tablename__ = "offboarding_processes"

    STATUS_IN_PROGRESS = "in_progress"
    STATUS_COMPLETED = "completed"
    STATUS_CANCELLED = "cancelled"
    STATUSES = (STATUS_IN_PROGRESS, STATUS_COMPLETED, STATUS_CANCELLED)

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.Integer,
        db.ForeignKey("employees.id"),
        nullable=False,
        index=True,
    )
    last_working_day = db.Column(db.Date, nullable=False)
    reason = db.Column(db.Text, nullable=True)
    status = db.Column(
        db.String(20),
        nullable=False,
        default=STATUS_IN_PROGRESS,
        index=True,
    )
    initiated_by = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True
    )
    completed_at = db.Column(db.DateTime, nullable=True)

    employee = db.relationship("Employee")
    initiator = db.relationship("User", foreign_keys=[initiated_by])
    tasks = db.relationship(
        "OffboardingTask",
        back_populates="process",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return (
            f"<OffboardingProcess id={self.id} "
            f"employee_id={self.employee_id} status={self.status!r}>"
        )


class OffboardingTask(TimestampMixin, db.Model):
    __tablename__ = "offboarding_tasks"

    CATEGORY_ASSETS = "assets"
    CATEGORY_IT = "it"
    CATEGORY_HR = "hr"
    CATEGORY_FINANCE = "finance"
    CATEGORY_KNOWLEDGE = "knowledge"
    CATEGORY_OTHER = "other"
    CATEGORIES = (
        CATEGORY_ASSETS,
        CATEGORY_IT,
        CATEGORY_HR,
        CATEGORY_FINANCE,
        CATEGORY_KNOWLEDGE,
        CATEGORY_OTHER,
    )

    ROLE_HR = "hr"
    ROLE_MANAGER = "manager"
    ROLE_EMPLOYEE = "employee"
    ROLE_IT = "it"
    ASSIGNEE_ROLES = (ROLE_HR, ROLE_MANAGER, ROLE_EMPLOYEE, ROLE_IT)

    id = db.Column(db.Integer, primary_key=True)
    process_id = db.Column(
        db.Integer,
        db.ForeignKey("offboarding_processes.id"),
        nullable=False,
        index=True,
    )
    title = db.Column(db.String(255), nullable=False)
    category = db.Column(
        db.String(20), nullable=False, default=CATEGORY_OTHER, index=True
    )
    assignee_role = db.Column(
        db.String(20), nullable=False, default=ROLE_HR
    )
    is_done = db.Column(db.Boolean, nullable=False, default=False)
    done_by = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True
    )
    done_at = db.Column(db.DateTime, nullable=True)
    note = db.Column(db.Text, nullable=True)
    sort_order = db.Column(db.Integer, nullable=False, default=0)

    process = db.relationship("OffboardingProcess", back_populates="tasks")
    done_by_user = db.relationship("User", foreign_keys=[done_by])

    def __repr__(self):
        return (
            f"<OffboardingTask id={self.id} process_id={self.process_id} "
            f"category={self.category!r} is_done={self.is_done}>"
        )
