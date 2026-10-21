"""Seed demo cho module Skills — IDEMPOTENT, không tự commit.

Parent (server/seed.py) gọi seed_demo() trong transaction chung, SAU khi
đã có sẵn NV0001–NV0005:
- 10 kỹ năng thuộc 5 nhóm (Kỹ thuật / Chuyên môn / Mềm / Ngoại ngữ / Khác).
  Khóa chống trùng: tên kỹ năng (unique).
- Mức năng lực 1–5 cho NV0001–NV0005 theo đúng vị trí của họ:
  trưởng phòng Kinh doanh mạnh lãnh đạo/giao tiếp, HR mạnh Excel/giao
  tiếp, kinh doanh mạnh thuyết trình, kỹ sư mạnh Python/SQL/kiểm thử.
  Mỗi người 6–7 kỹ năng. Khóa chống trùng: (employee_id, skill_id) —
  đã có thì giữ nguyên, không ghi đè mức người dùng đã sửa.
"""

from app.extensions import db
from app.models import Employee
from app.models.skill import EmployeeSkill, Skill

# (tên, nhóm, mô tả)
SKILLS = [
    ("Python", "Kỹ thuật", "Lập trình Python: cú pháp, thư viện chuẩn, Flask/Django, xử lý dữ liệu."),
    ("React/JavaScript", "Kỹ thuật", "Phát triển giao diện web với JavaScript hiện đại và React."),
    ("SQL & dữ liệu", "Kỹ thuật", "Truy vấn SQL, thiết kế cơ sở dữ liệu, tối ưu hiệu năng truy vấn."),
    ("Excel", "Chuyên môn", "Bảng tính Excel/Google Sheets: hàm, pivot table, báo cáo số liệu."),
    ("Tiếng Anh giao tiếp", "Ngoại ngữ", "Giao tiếp tiếng Anh trong công việc: họp, email, thuyết trình."),
    ("Giao tiếp & thuyết trình", "Mềm", "Truyền đạt ý tưởng, thuyết trình trước đám đông, đàm phán."),
    ("Quản lý dự án", "Chuyên môn", "Lập kế hoạch, điều phối tiến độ, quản trị rủi ro dự án (Agile/Scrum)."),
    ("Phân tích dữ liệu", "Chuyên môn", "Đọc hiểu số liệu, trực quan hoá, rút insight phục vụ quyết định."),
    ("Kiểm thử phần mềm", "Kỹ thuật", "Kiểm thử chức năng, viết test case, kiểm thử tự động."),
    ("Lãnh đạo nhóm", "Mềm", "Dẫn dắt đội nhóm, phân công, kèm cặp và tạo động lực cho thành viên."),
]

# mã NV -> {tên kỹ năng: mức 1–5}
LEVELS = {
    # Trưởng phòng Kinh doanh — mạnh lãnh đạo, giao tiếp, quản lý dự án.
    "NV0001": {
        "Lãnh đạo nhóm": 5,
        "Giao tiếp & thuyết trình": 5,
        "Quản lý dự án": 4,
        "Excel": 4,
        "Phân tích dữ liệu": 3,
        "Tiếng Anh giao tiếp": 3,
        "SQL & dữ liệu": 2,
    },
    # Chuyên viên nhân sự — mạnh Excel, giao tiếp, tiếng Anh.
    "NV0002": {
        "Excel": 5,
        "Giao tiếp & thuyết trình": 4,
        "Tiếng Anh giao tiếp": 4,
        "Quản lý dự án": 3,
        "Phân tích dữ liệu": 3,
        "Lãnh đạo nhóm": 3,
    },
    # Nhân viên kinh doanh — mạnh giao tiếp; dữ liệu/SQL còn yếu (có gợi ý học).
    "NV0003": {
        "Giao tiếp & thuyết trình": 4,
        "Excel": 4,
        "Tiếng Anh giao tiếp": 3,
        "Phân tích dữ liệu": 2,
        "Quản lý dự án": 2,
        "SQL & dữ liệu": 1,
    },
    # Kỹ sư phần mềm — mạnh Python/SQL, kiểm thử khá, giao tiếp còn yếu.
    "NV0004": {
        "Python": 4,
        "SQL & dữ liệu": 4,
        "React/JavaScript": 3,
        "Kiểm thử phần mềm": 3,
        "Tiếng Anh giao tiếp": 3,
        "Giao tiếp & thuyết trình": 2,
    },
    # Nhân viên phòng Kỹ thuật — mạnh kiểm thử, Python khá.
    "NV0005": {
        "Kiểm thử phần mềm": 4,
        "Python": 3,
        "SQL & dữ liệu": 3,
        "Excel": 3,
        "React/JavaScript": 2,
        "Tiếng Anh giao tiếp": 2,
    },
}


def _employee_by_code(code):
    return Employee.query.filter_by(code=code).first()


def _seed_skills():
    skills = {}
    for name, category, description in SKILLS:
        skill = Skill.query.filter_by(name=name).first()
        if skill is None:
            skill = Skill(name=name, category=category, description=description)
            db.session.add(skill)
        skills[name] = skill
    db.session.flush()
    return skills


def _seed_levels(skills):
    for code, levels in LEVELS.items():
        employee = _employee_by_code(code)
        if employee is None:
            continue
        for skill_name, level in levels.items():
            skill = skills.get(skill_name)
            if skill is None:
                continue
            exists = (
                EmployeeSkill.query.filter_by(
                    employee_id=employee.id, skill_id=skill.id
                ).first()
                is not None
            )
            if exists:
                continue
            db.session.add(
                EmployeeSkill(
                    employee_id=employee.id, skill_id=skill.id, level=level
                )
            )
    db.session.flush()


def seed_demo():
    skills = _seed_skills()
    _seed_levels(skills)
