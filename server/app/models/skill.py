"""Bản đồ năng lực (docs/feature-expansion-v5.md mục D):

- Skill: danh mục kỹ năng của công ty (name unique, category thuộc nhóm
  Kỹ thuật / Chuyên môn / Mềm / Ngoại ngữ / Khác).
- EmployeeSkill: mức năng lực 1–5 của 1 nhân viên với 1 kỹ năng;
  UNIQUE(employee_id, skill_id) — mỗi nhân viên tối đa 1 dòng / kỹ năng.
"""
from app.extensions import db
from app.models.users import TimestampMixin


class Skill(TimestampMixin, db.Model):
    __tablename__ = "skills"

    CATEGORY_TECHNICAL = "Kỹ thuật"
    CATEGORY_PROFESSIONAL = "Chuyên môn"
    CATEGORY_SOFT = "Mềm"
    CATEGORY_LANGUAGE = "Ngoại ngữ"
    CATEGORY_OTHER = "Khác"
    CATEGORIES = (
        CATEGORY_TECHNICAL,
        CATEGORY_PROFESSIONAL,
        CATEGORY_SOFT,
        CATEGORY_LANGUAGE,
        CATEGORY_OTHER,
    )

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, unique=True, index=True)
    category = db.Column(db.String(50), nullable=True, index=True)
    description = db.Column(db.Text, nullable=True)

    employee_skills = db.relationship(
        "EmployeeSkill",
        back_populates="skill",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<Skill id={self.id} name={self.name!r}>"


class EmployeeSkill(TimestampMixin, db.Model):
    __tablename__ = "employee_skills"
    __table_args__ = (
        db.UniqueConstraint(
            "employee_id", "skill_id", name="uq_employee_skills_employee_skill"
        ),
        db.Index("ix_employee_skills_employee", "employee_id"),
    )

    LEVEL_MIN = 1
    LEVEL_MAX = 5

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    skill_id = db.Column(
        db.Integer, db.ForeignKey("skills.id"), nullable=False, index=True
    )
    # Mức năng lực tự đánh giá / được xác nhận: 1 (mới bắt đầu) .. 5 (chuyên gia).
    level = db.Column(db.Integer, nullable=False, default=1)

    skill = db.relationship("Skill", back_populates="employee_skills")
    employee = db.relationship(
        "Employee", backref="employee_skills", foreign_keys=[employee_id]
    )

    def __repr__(self):
        return (
            f"<EmployeeSkill id={self.id} employee_id={self.employee_id} "
            f"skill_id={self.skill_id} level={self.level}>"
        )
