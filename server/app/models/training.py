"""Dao tao noi bo: Course (khoa hoc) va CourseEnrollment (ghi danh hoc vien).

Theo hop dong feature-expansion-v2 muc 1D:
- Course: title, description, category, duration_hours, is_mandatory, is_active.
  HR/Admin quan ly; nhan vien chi thay khoa dang active.
- CourseEnrollment: 1 hoc vien ghi danh 1 khoa (unique course_id + employee_id),
  status assigned -> in_progress -> completed, progress 0-100; progress dat 100
  thi tu chuyen completed va ghi completed_at (xu ly o service).
"""
from app.extensions import db
from app.models.users import TimestampMixin


class Course(TimestampMixin, db.Model):
    __tablename__ = "courses"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(100), nullable=True, index=True)
    duration_hours = db.Column(db.Float, nullable=False, default=0)  # so gio hoc
    is_mandatory = db.Column(db.Boolean, nullable=False, default=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True, index=True)

    enrollments = db.relationship(
        "CourseEnrollment", back_populates="course", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Course id={self.id} title={self.title!r} active={self.is_active}>"


class CourseEnrollment(TimestampMixin, db.Model):
    __tablename__ = "course_enrollments"
    __table_args__ = (
        db.UniqueConstraint(
            "course_id", "employee_id", name="uq_course_enrollments_course_employee"
        ),
        db.Index("ix_course_enrollments_employee_status", "employee_id", "status"),
    )

    STATUS_ASSIGNED = "assigned"
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_COMPLETED = "completed"
    STATUSES = (STATUS_ASSIGNED, STATUS_IN_PROGRESS, STATUS_COMPLETED)

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(
        db.Integer, db.ForeignKey("courses.id"), nullable=False, index=True
    )
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    status = db.Column(
        db.String(20), nullable=False, default=STATUS_ASSIGNED, index=True
    )
    progress = db.Column(db.Integer, nullable=False, default=0)  # 0..100 (%)
    # Nguoi gan khoa (ho so nhan vien cua HR/Admin; null neu tai khoan khong gan NV).
    enrolled_by = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=True
    )
    completed_at = db.Column(db.DateTime, nullable=True)

    course = db.relationship("Course", back_populates="enrollments")
    employee = db.relationship(
        "Employee", backref="course_enrollments", foreign_keys=[employee_id]
    )
    enroller = db.relationship(
        "Employee", backref="assigned_enrollments", foreign_keys=[enrolled_by]
    )

    def __repr__(self):
        return (
            f"<CourseEnrollment id={self.id} course_id={self.course_id} "
            f"employee_id={self.employee_id} status={self.status!r}>"
        )
