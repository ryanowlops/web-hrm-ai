"""Hieu suat (KPI/OKR): PerformanceCycle, Objective, KeyResult, GoalCheckin,
PerformanceReview.

Theo docs/kpi-okr-onboarding.md muc 4.3:
- performance_cycles: chu ky danh gia theo quy/nam, may trang thai
  draft -> active -> in_review -> closed.
- objectives: muc tieu ca nhan (employee_id) hoac phong ban (department_id,
  employee_id = NULL); trang thai draft/pending/active/completed/cancelled.
- key_results: ket qua then chot do duoc; gia tri dung Numeric (khong dung
  float cho so lieu cham diem), direction increase/decrease.
- goal_checkins: lich su cap nhat tien do cua tung Key Result.
- performance_reviews: tu danh gia (self) va danh gia cua Manager (manager)
  cho mot nhan vien trong mot chu ky.

Quan he voi Employee chi khai bao mot chieu tu cac bang nay (khong dung
back_populates ve phia Employee de tranh sua model dung chung).
"""
from app.extensions import db
from app.models.users import TimestampMixin


class PerformanceCycle(TimestampMixin, db.Model):
    __tablename__ = "performance_cycles"

    STATUS_DRAFT = "draft"
    STATUS_ACTIVE = "active"
    STATUS_IN_REVIEW = "in_review"
    STATUS_CLOSED = "closed"
    STATUSES = (
        STATUS_DRAFT,
        STATUS_ACTIVE,
        STATUS_IN_REVIEW,
        STATUS_CLOSED,
    )

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)  # vd: "Q1/2027"
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    status = db.Column(
        db.String(20), nullable=False, default=STATUS_DRAFT, index=True
    )

    objectives = db.relationship(
        "Objective", back_populates="cycle", cascade="all, delete-orphan"
    )
    reviews = db.relationship("PerformanceReview", back_populates="cycle")

    def __repr__(self):
        return f"<PerformanceCycle id={self.id} name={self.name!r} status={self.status!r}>"


class Objective(TimestampMixin, db.Model):
    __tablename__ = "objectives"
    __table_args__ = (
        db.Index("ix_objectives_cycle_employee", "cycle_id", "employee_id"),
    )

    STATUS_DRAFT = "draft"
    STATUS_PENDING = "pending"
    STATUS_ACTIVE = "active"
    STATUS_COMPLETED = "completed"
    STATUS_CANCELLED = "cancelled"
    STATUSES = (
        STATUS_DRAFT,
        STATUS_PENDING,
        STATUS_ACTIVE,
        STATUS_COMPLETED,
        STATUS_CANCELLED,
    )

    id = db.Column(db.Integer, primary_key=True)
    cycle_id = db.Column(
        db.Integer, db.ForeignKey("performance_cycles.id"), nullable=False, index=True
    )
    # Chu muc tieu; NULL = muc tieu cap phong ban (gan voi department_id).
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=True, index=True
    )
    department_id = db.Column(
        db.Integer, db.ForeignKey("departments.id"), nullable=True, index=True
    )
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    weight = db.Column(db.Numeric(6, 2), nullable=False, default=1)
    status = db.Column(
        db.String(20), nullable=False, default=STATUS_DRAFT, index=True
    )
    created_by = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=True, index=True
    )

    cycle = db.relationship("PerformanceCycle", back_populates="objectives")
    employee = db.relationship("Employee", foreign_keys=[employee_id])
    department = db.relationship("Department", foreign_keys=[department_id])
    creator = db.relationship("Employee", foreign_keys=[created_by])
    key_results = db.relationship(
        "KeyResult", back_populates="objective", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return (
            f"<Objective id={self.id} cycle_id={self.cycle_id} "
            f"employee_id={self.employee_id} status={self.status!r}>"
        )


class KeyResult(TimestampMixin, db.Model):
    __tablename__ = "key_results"

    DIRECTION_INCREASE = "increase"
    DIRECTION_DECREASE = "decrease"
    DIRECTIONS = (DIRECTION_INCREASE, DIRECTION_DECREASE)

    id = db.Column(db.Integer, primary_key=True)
    objective_id = db.Column(
        db.Integer, db.ForeignKey("objectives.id"), nullable=False, index=True
    )
    title = db.Column(db.String(200), nullable=False)
    unit = db.Column(db.String(30), nullable=True)  # don vi do: %, story point...
    target_value = db.Column(db.Numeric(14, 2), nullable=False)
    current_value = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    weight = db.Column(db.Numeric(6, 2), nullable=False, default=1)
    direction = db.Column(
        db.String(10), nullable=False, default=DIRECTION_INCREASE
    )

    objective = db.relationship("Objective", back_populates="key_results")
    checkins = db.relationship(
        "GoalCheckin", back_populates="key_result", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return (
            f"<KeyResult id={self.id} objective_id={self.objective_id} "
            f"current={self.current_value}/{self.target_value}>"
        )


class GoalCheckin(TimestampMixin, db.Model):
    """Lich su check-in tien do cua mot Key Result (created_at tu TimestampMixin)."""

    __tablename__ = "goal_checkins"

    id = db.Column(db.Integer, primary_key=True)
    key_result_id = db.Column(
        db.Integer, db.ForeignKey("key_results.id"), nullable=False, index=True
    )
    author_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    old_value = db.Column(db.Numeric(14, 2), nullable=True)
    new_value = db.Column(db.Numeric(14, 2), nullable=False)
    note = db.Column(db.Text, nullable=True)

    key_result = db.relationship("KeyResult", back_populates="checkins")
    author = db.relationship("Employee", foreign_keys=[author_id])

    def __repr__(self):
        return (
            f"<GoalCheckin id={self.id} key_result_id={self.key_result_id} "
            f"new_value={self.new_value}>"
        )


class PerformanceReview(TimestampMixin, db.Model):
    __tablename__ = "performance_reviews"
    __table_args__ = (
        db.Index("ix_reviews_cycle_employee", "cycle_id", "employee_id"),
    )

    TYPE_SELF = "self"
    TYPE_MANAGER = "manager"
    TYPES = (TYPE_SELF, TYPE_MANAGER)

    STATUS_DRAFT = "draft"
    STATUS_SUBMITTED = "submitted"
    STATUSES = (STATUS_DRAFT, STATUS_SUBMITTED)

    id = db.Column(db.Integer, primary_key=True)
    cycle_id = db.Column(
        db.Integer, db.ForeignKey("performance_cycles.id"), nullable=False, index=True
    )
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    reviewer_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=True, index=True
    )
    review_type = db.Column(db.String(10), nullable=False)  # self / manager
    score = db.Column(db.Numeric(5, 2), nullable=True)  # thang 0-100
    comment = db.Column(db.Text, nullable=True)
    status = db.Column(
        db.String(20), nullable=False, default=STATUS_SUBMITTED, index=True
    )

    cycle = db.relationship("PerformanceCycle", back_populates="reviews")
    employee = db.relationship("Employee", foreign_keys=[employee_id])
    reviewer = db.relationship("Employee", foreign_keys=[reviewer_id])

    def __repr__(self):
        return (
            f"<PerformanceReview id={self.id} cycle_id={self.cycle_id} "
            f"employee_id={self.employee_id} type={self.review_type!r} "
            f"score={self.score}>"
        )
