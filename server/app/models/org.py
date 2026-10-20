"""Mo hinh to chuc: Department (phong ban), Position (chuc vu).

Theo A7: departments 1-N employees; positions 1-N employees;
departments.manager_id tro toi truong phong (mot Employee).
"""
from app.extensions import db
from app.models.users import TimestampMixin


class Department(TimestampMixin, db.Model):
    __tablename__ = "departments"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, unique=True)
    description = db.Column(db.String(255), nullable=True)

    # Truong phong. use_alter vi employees.department_id cung tro nguoc lai.
    manager_id = db.Column(
        db.Integer,
        db.ForeignKey("employees.id", name="fk_department_manager", use_alter=True),
        nullable=True,
    )

    manager = db.relationship(
        "Employee",
        foreign_keys=[manager_id],
        back_populates="managed_departments",
    )
    employees = db.relationship(
        "Employee", back_populates="department", foreign_keys="Employee.department_id"
    )
    positions = db.relationship(
        "Position", back_populates="department", cascade="all, delete-orphan"
    )
    job_postings = db.relationship("JobPosting", back_populates="department")

    def __repr__(self):
        return f"<Department id={self.id} name={self.name!r}>"


class Position(TimestampMixin, db.Model):
    __tablename__ = "positions"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(120), nullable=False)
    department_id = db.Column(
        db.Integer, db.ForeignKey("departments.id"), nullable=True, index=True
    )

    department = db.relationship("Department", back_populates="positions")
    employees = db.relationship("Employee", back_populates="position")

    def __repr__(self):
        return f"<Position id={self.id} title={self.title!r}>"
