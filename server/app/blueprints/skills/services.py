"""Service layer cho module Skills (bản đồ năng lực — v5 mục D).

Logic nghiệp vụ + transaction; routes chỉ validate input, gọi service và
trả JSON. Lỗi nghiệp vụ ném ApiError theo envelope chuẩn
{"error": {"code", "message", "details"}}.

Phạm vi dữ liệu BÁM module employees (không tự chế):
- Đọc hồ sơ kỹ năng: `get_employee_in_scope` của employees.services —
  admin/hr toàn công ty; manager = phòng ban mình quản lý + người có
  manager_id là mình + chính mình; employee = chỉ chính mình. Ngoài
  phạm vi trả 404 (không lộ tồn tại).
- Ghi (PUT mức): chính mình / hr-admin bất kỳ ai / manager trong scope
  quản lý — chính là tập `can_read_employee`; nhân viên tồn tại nhưng
  ngoài quyền ghi trả 403 (theo kiểm chứng D.5).

Gợi ý khoá học: kỹ năng có level < 3 là "khoảng trống". Khớp khoá học
training đang active theo từ khoá (bảng SKILL_KEYWORDS + tên kỹ năng,
so khớp sau khi bỏ dấu tiếng Việt). Khi AI khả dụng, AI xếp hạng lại +
viết lý do (json mode qua app.ai_service); mọi lỗi AI → dự phòng khớp
từ khoá thuần + lý do mẫu, đáp án ghi rõ nguồn qua meta.source.
"""

import json
import unicodedata

from sqlalchemy import func

from app.blueprints.auth.guards import load_current_user
from app.blueprints.employees.services import (
    ApiError as _ScopeApiError,
    can_read_employee,
    get_employee_in_scope,
)
from app.extensions import db
from app.models import Department, Employee
from app.models.skill import EmployeeSkill, Skill
from app.models.training import Course


class ApiError(Exception):
    """Lỗi nghiệp vụ có mã HTTP + code chuẩn để routes trả về."""

    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or []


WRITE_ROLES = ("admin", "hr")
GAP_THRESHOLD = 3  # level < 3 được coi là khoảng trống cần bồi dưỡng
MAX_SUGGESTIONS = 10

# Từ khoá khoá học cho từng kỹ năng trong danh mục seed. Kỹ năng ngoài
# bảng này dùng chính tên kỹ năng (đã bỏ dấu) làm từ khoá cụm.
SKILL_KEYWORDS = {
    "Python": ["python", "flask", "django", "lập trình python"],
    "React/JavaScript": ["react", "javascript", "typescript", "frontend", "front-end"],
    "SQL & dữ liệu": ["sql", "cơ sở dữ liệu", "database", "mysql", "postgresql"],
    "Excel": ["excel", "bảng tính", "spreadsheet", "google sheets"],
    "Tiếng Anh giao tiếp": ["tiếng anh", "english", "ielts", "toeic"],
    "Giao tiếp & thuyết trình": [
        "giao tiếp", "thuyết trình", "trình bày", "communication", "presentation",
    ],
    "Quản lý dự án": ["quản lý dự án", "project management", "agile", "scrum", "pmp"],
    "Phân tích dữ liệu": ["phân tích dữ liệu", "data analysis", "power bi", "tableau", "analytics"],
    "Kiểm thử phần mềm": ["kiểm thử", "testing", "qa", "qc", "automation test"],
    "Lãnh đạo nhóm": ["lãnh đạo", "leadership", "quản lý nhóm", "team lead"],
}


def current_user():
    return load_current_user()


def _employee_in_scope(user, employee_id):
    """get_employee_in_scope của module employees nhưng chuyển ApiError
    của module đó sang ApiError của skills để routes bắt đúng 1 loại lỗi."""
    try:
        return get_employee_in_scope(user, employee_id)
    except _ScopeApiError as exc:
        raise ApiError(exc.status, exc.code, exc.message, exc.details) from exc


def _get_or_404(model, pk, code, message):
    obj = db.session.get(model, pk)
    if obj is None:
        raise ApiError(404, code, message)
    return obj


def _fold(text):
    """Bỏ dấu tiếng Việt + hạ chữ thường để so khớp từ khoá bền vững."""
    if not text:
        return ""
    normalized = unicodedata.normalize("NFD", str(text))
    stripped = "".join(
        ch for ch in normalized if unicodedata.category(ch) != "Mn"
    )
    stripped = stripped.replace("đ", "d").replace("Đ", "D")
    return stripped.lower()


def skill_keywords(skill):
    """Từ khoá tìm khoá học cho 1 kỹ năng: bảng ánh xạ + tên kỹ năng."""
    keywords = list(SKILL_KEYWORDS.get(skill.name, []))
    name = (skill.name or "").strip()
    if name and name not in keywords:
        keywords.append(name)
    # Bỏ trùng sau khi fold, giữ thứ tự.
    seen, result = set(), []
    for keyword in keywords:
        folded = _fold(keyword)
        if folded and folded not in seen:
            seen.add(folded)
            result.append(keyword)
    return result


# ---------------------------------------------------------------------------
# Danh mục kỹ năng (catalog)
# ---------------------------------------------------------------------------

def list_skills():
    skills = (
        Skill.query.order_by(Skill.category.asc(), Skill.name.asc()).all()
    )
    counts = dict(
        db.session.query(EmployeeSkill.skill_id, func.count(EmployeeSkill.id))
        .group_by(EmployeeSkill.skill_id)
        .all()
    )
    return skills, counts


def create_skill(cleaned):
    name = cleaned["name"]
    if Skill.query.filter(func.lower(Skill.name) == name.lower()).first():
        raise ApiError(409, "SKILL_NAME_EXISTS", "Tên kỹ năng đã tồn tại.")
    skill = Skill(
        name=name,
        category=cleaned.get("category"),
        description=cleaned.get("description"),
    )
    db.session.add(skill)
    db.session.commit()
    return skill


def update_skill(skill_id, cleaned):
    skill = _get_or_404(Skill, skill_id, "SKILL_NOT_FOUND", "Không tìm thấy kỹ năng.")
    if "name" in cleaned:
        clash = (
            Skill.query.filter(func.lower(Skill.name) == cleaned["name"].lower())
            .filter(Skill.id != skill.id)
            .first()
        )
        if clash is not None:
            raise ApiError(409, "SKILL_NAME_EXISTS", "Tên kỹ năng đã tồn tại.")
    for field, value in cleaned.items():
        setattr(skill, field, value)
    db.session.commit()
    return skill


def delete_skill(skill_id):
    skill = _get_or_404(Skill, skill_id, "SKILL_NOT_FOUND", "Không tìm thấy kỹ năng.")
    db.session.delete(skill)  # employee_skills cascade delete-orphan
    db.session.commit()


# ---------------------------------------------------------------------------
# Ma trận kỹ năng × phòng ban
# ---------------------------------------------------------------------------

def skills_matrix():
    """avg_level (làm tròn 1 số lẻ) + headcount cho mỗi kỹ năng × phòng ban.

    Ô không có nhân viên nào của phòng ban sở hữu kỹ năng → None (ô trống),
    KHÔNG tính là 0 — phân biệt "chưa ai có" với "có nhưng yếu".
    """
    departments = Department.query.order_by(Department.name.asc()).all()
    skills = Skill.query.order_by(Skill.category.asc(), Skill.name.asc()).all()
    rows = (
        db.session.query(
            EmployeeSkill.skill_id,
            Employee.department_id,
            func.avg(EmployeeSkill.level),
            func.count(EmployeeSkill.id),
        )
        .join(Employee, Employee.id == EmployeeSkill.employee_id)
        .filter(Employee.department_id.isnot(None))
        .group_by(EmployeeSkill.skill_id, Employee.department_id)
        .all()
    )
    cells = {}
    for skill_id, department_id, avg_level, headcount in rows:
        cells[(skill_id, department_id)] = {
            "avg_level": round(float(avg_level), 1),
            "headcount": int(headcount),
        }
    result_rows = []
    for skill in skills:
        cell_map = {}
        for department in departments:
            cell_map[str(department.id)] = cells.get((skill.id, department.id))
        result_rows.append({"skill": skill, "cells": cell_map})
    return {
        "departments": [
            {"id": d.id, "name": d.name} for d in departments
        ],
        "rows": result_rows,
    }


def matrix_cell(skill_id, department_id):
    """Chi tiết 1 ô ma trận: nhân viên của phòng ban có kỹ năng, kèm mức."""
    skill = _get_or_404(Skill, skill_id, "SKILL_NOT_FOUND", "Không tìm thấy kỹ năng.")
    department = _get_or_404(
        Department, department_id, "DEPARTMENT_NOT_FOUND", "Không tìm thấy phòng ban."
    )
    rows = (
        EmployeeSkill.query.join(Employee, Employee.id == EmployeeSkill.employee_id)
        .filter(
            EmployeeSkill.skill_id == skill.id,
            Employee.department_id == department.id,
        )
        .order_by(EmployeeSkill.level.desc(), Employee.full_name.asc())
        .all()
    )
    return skill, department, rows


# ---------------------------------------------------------------------------
# Hồ sơ kỹ năng theo nhân viên
# ---------------------------------------------------------------------------

def get_employee_skills(user, employee_id):
    employee = _employee_in_scope(user, employee_id)
    rows = (
        EmployeeSkill.query.filter_by(employee_id=employee.id)
        .join(Skill, Skill.id == EmployeeSkill.skill_id)
        .order_by(Skill.category.asc(), Skill.name.asc())
        .all()
    )
    return employee, rows


def update_employee_skills(user, employee_id, items):
    """Upsert mức kỹ năng. Quyền ghi = can_read_employee (mình/manager scope/hr-admin).

    Nhân viên không tồn tại → 404; tồn tại nhưng ngoài quyền ghi → 403.
    UNIQUE(employee_id, skill_id) ở DB + upsert theo dòng hiện có nên
    không bao giờ tạo 2 dòng cho cùng 1 cặp.
    """
    employee = db.session.get(Employee, employee_id)
    if employee is None:
        raise ApiError(404, "EMPLOYEE_NOT_FOUND", "Không tìm thấy nhân viên.")
    if not can_read_employee(user, employee):
        raise ApiError(
            403, "FORBIDDEN",
            "Bạn không có quyền cập nhật kỹ năng cho nhân viên này.",
        )
    skill_ids = [item["skill_id"] for item in items]
    skills = {
        s.id: s for s in Skill.query.filter(Skill.id.in_(skill_ids)).all()
    }
    missing = [sid for sid in skill_ids if sid not in skills]
    if missing:
        raise ApiError(
            400, "VALIDATION_ERROR", "Một số kỹ năng không tồn tại.",
            [{"field": "items", "message": f"skill_id không tồn tại: {missing}"}],
        )
    existing = {
        row.skill_id: row
        for row in EmployeeSkill.query.filter_by(employee_id=employee.id).all()
    }
    updated = []
    for item in items:
        row = existing.get(item["skill_id"])
        if row is None:
            row = EmployeeSkill(
                employee_id=employee.id,
                skill_id=item["skill_id"],
                level=item["level"],
            )
            db.session.add(row)
            existing[item["skill_id"]] = row
        else:
            row.level = item["level"]
        updated.append(row)
    db.session.commit()
    return employee, updated


# ---------------------------------------------------------------------------
# Gợi ý khoá học lấp khoảng trống kỹ năng
# ---------------------------------------------------------------------------

def _match_candidates(employee):
    """Ứng viên gợi ý từ khớp từ khoá: [{skill, current_level, course, matched}]."""
    gaps = (
        EmployeeSkill.query.filter_by(employee_id=employee.id)
        .filter(EmployeeSkill.level < GAP_THRESHOLD)
        .order_by(EmployeeSkill.level.asc())
        .all()
    )
    if not gaps:
        return []
    courses = Course.query.filter(Course.is_active.is_(True)).all()
    haystacks = {
        course.id: _fold(
            f"{course.title} {course.description or ''} {course.category or ''}"
        )
        for course in courses
    }
    candidates = []
    for gap in gaps:
        skill = gap.skill
        if skill is None:
            continue
        keywords = skill_keywords(skill)
        for course in courses:
            haystack = haystacks[course.id]
            matched = [kw for kw in keywords if _fold(kw) in haystack]
            if matched:
                candidates.append({
                    "skill": skill.name,
                    "current_level": gap.level,
                    "course": {"id": course.id, "title": course.title},
                    "matched_keywords": matched,
                })
    # Ưu tiên: khoảng trống sâu nhất (level thấp nhất), rồi khớp nhiều từ khoá nhất.
    candidates.sort(
        key=lambda c: (c["current_level"], -len(c["matched_keywords"]), c["course"]["title"])
    )
    return candidates[:MAX_SUGGESTIONS]


def _template_reason(candidate):
    matched = ", ".join(candidate["matched_keywords"][:3])
    return (
        f"Kỹ năng {candidate['skill']} đang ở mức {candidate['current_level']}/5 "
        f"(dưới ngưỡng {GAP_THRESHOLD}). Khoá học khớp từ khoá: {matched}."
    )


_AI_RANK_SYSTEM = (
    "Bạn là chuyên viên đào tạo nhân sự. Nhiệm vụ: xếp hạng các khoá học "
    "được gợi ý cho một nhân viên dựa trên khoảng trống kỹ năng của họ, "
    "ưu tiên kỹ năng yếu nhất và khoá học liên quan trực tiếp nhất. "
    "Chỉ trả về JSON đúng định dạng yêu cầu, không giải thích thêm."
)


def _rank_with_ai(employee, candidates):
    """Nhờ AI xếp hạng + viết lý do. Trả list gợi ý hoặc None nếu AI lỗi."""
    try:
        from app.ai_service import get_provider

        provider = get_provider()
        listing = [
            {
                "index": idx,
                "skill": c["skill"],
                "current_level": c["current_level"],
                "course_title": c["course"]["title"],
                "matched_keywords": c["matched_keywords"],
            }
            for idx, c in enumerate(candidates)
        ]
        user_prompt = (
            f"Nhân viên: {employee.full_name} (mã {employee.code}).\n"
            "Danh sách khoá học ứng viên (đã khớp từ khoá với kỹ năng yếu):\n"
            + json.dumps(listing, ensure_ascii=False)
            + "\nHãy trả JSON: {\"ranked\": [{\"index\": <số thứ tự>, "
              "\"reason\": \"<lý do ngắn 1 câu tiếng Việt vì sao khoá này "
              "phù hợp>\"}, ...]} — xếp hạng TẤT CẢ ứng viên, quan trọng "
              "nhất đứng đầu."
        )
        raw = provider.chat_completion(_AI_RANK_SYSTEM, user_prompt)
        parsed = json.loads(raw)
        ranked = parsed.get("ranked")
        if not isinstance(ranked, list) or not ranked:
            return None
        suggestions, used = [], set()
        for entry in ranked:
            if not isinstance(entry, dict):
                continue
            index = entry.get("index")
            if (
                isinstance(index, bool)
                or not isinstance(index, int)
                or index < 0
                or index >= len(candidates)
                or index in used
            ):
                continue
            used.add(index)
            candidate = candidates[index]
            reason = entry.get("reason")
            suggestions.append({
                "skill": candidate["skill"],
                "current_level": candidate["current_level"],
                "course": candidate["course"],
                "reason": (
                    reason.strip()
                    if isinstance(reason, str) and reason.strip()
                    else _template_reason(candidate)
                ),
            })
        # Ứng viên AI bỏ sót: nối tiếp ở cuối với lý do mẫu (không làm mất gợi ý).
        for idx, candidate in enumerate(candidates):
            if idx not in used:
                suggestions.append({
                    "skill": candidate["skill"],
                    "current_level": candidate["current_level"],
                    "course": candidate["course"],
                    "reason": _template_reason(candidate),
                })
        return suggestions or None
    except Exception:
        # AI chưa cấu hình / lỗi provider / JSON hỏng → dự phòng từ khoá.
        return None


def suggest_courses(user, employee_id):
    """Trả (suggestions, source) — source: "ai" | "keyword"."""
    employee = _employee_in_scope(user, employee_id)
    candidates = _match_candidates(employee)
    if not candidates:
        return [], "keyword"
    ranked = _rank_with_ai(employee, candidates)
    if ranked is not None:
        return ranked, "ai"
    suggestions = [
        {
            "skill": c["skill"],
            "current_level": c["current_level"],
            "course": c["course"],
            "reason": _template_reason(c),
        }
        for c in candidates
    ]
    return suggestions, "keyword"
