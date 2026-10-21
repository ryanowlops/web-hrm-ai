"""Service layer cho module Engagement (kudos + cột mốc + khảo sát ẩn danh).

Logic nghiệp vụ + transaction; routes chỉ validate input, gọi service và
trả JSON. Lỗi nghiệp vụ ném ra dưới dạng ApiError (định dạng chuẩn
{"error": {"code", "message", "details"}}) như module training.

Nguyên tắc ẩn danh khảo sát (feature-expansion-v3 mục 4):
- SurveyResponse không lưu user_id → đáp án không thể truy ngược người trả lời.
- SurveyParticipation chỉ chống trả lời trùng; hàm kết quả (survey_results)
  KHÔNG BAO GIỜ đọc/join bảng participation.
"""

import calendar
from datetime import date, datetime, time

from sqlalchemy.exc import IntegrityError

from app.blueprints.auth.guards import load_current_user
from app.extensions import db
from app.models import Employee, Notification, User
from app.models.engagement import (
    Kudo,
    Survey,
    SurveyParticipation,
    SurveyResponse,
)
from app.blueprints.engagement import schemas


class ApiError(Exception):
    """Lỗi nghiệp vụ có mã HTTP + code chuẩn để routes trả về."""

    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or []


MANAGER_ROLES = ("admin", "hr")
ALL_ROLES = ("admin", "hr", "manager", "employee")


def current_user():
    return load_current_user()


def get_or_404(model, pk, code, message):
    obj = db.session.get(model, pk)
    if obj is None:
        raise ApiError(404, code, message)
    return obj


def parse_limit(args, default=20, maximum=100):
    try:
        limit = int(args.get("limit", default))
    except (TypeError, ValueError):
        limit = default
    return min(max(limit, 1), maximum)


def _month_range(month_str):
    """'YYYY-MM' -> (datetime bắt đầu tháng, datetime bắt đầu tháng sau).

    Không truyền hoặc sai định dạng -> tháng hiện tại.
    """
    today = date.today()
    year, month = today.year, today.month
    if month_str:
        try:
            parts = str(month_str).split("-")
            year, month = int(parts[0]), int(parts[1])
            if not (1 <= month <= 12):
                raise ValueError
        except (ValueError, IndexError):
            year, month = today.year, today.month
    start = datetime.combine(date(year, month, 1), time.min)
    if month == 12:
        end = datetime.combine(date(year + 1, 1, 1), time.min)
    else:
        end = datetime.combine(date(year, month + 1, 1), time.min)
    return start, end


# ---------------------------------------------------------------------------
# Kudos
# ---------------------------------------------------------------------------

def create_kudo(user, cleaned):
    recipient = db.session.get(Employee, cleaned["to_employee_id"])
    if recipient is None:
        raise ApiError(
            404, "EMPLOYEE_NOT_FOUND", "Không tìm thấy nhân viên nhận kudos."
        )
    if getattr(user, "employee_id", None) is not None and (
        user.employee_id == recipient.id
    ):
        raise ApiError(
            400, "SELF_KUDO", "Không thể tự tặng kudos cho chính mình."
        )
    kudo = Kudo(
        from_user_id=user.id,
        to_employee_id=recipient.id,
        badge=cleaned["badge"],
        message=cleaned["message"],
    )
    db.session.add(kudo)
    db.session.flush()
    # Thông báo cho người nhận (nếu có tài khoản đăng nhập).
    recipient_user = User.query.filter_by(employee_id=recipient.id).first()
    if recipient_user is not None:
        db.session.add(
            Notification(
                user_id=recipient_user.id,
                type="kudos",
                title=f"{user.full_name} đã tặng bạn kudos",
                content=cleaned["message"][:200],
                is_read=False,
                related_type="kudo",
                related_id=kudo.id,
            )
        )
    db.session.commit()
    return kudo


def list_kudos(args):
    limit = parse_limit(args)
    query = Kudo.query.order_by(Kudo.created_at.desc(), Kudo.id.desc())
    total = query.count()
    items = query.limit(limit).all()
    return items, {"limit": limit, "totalItems": total}


def kudos_leaderboard(month_str):
    start, end = _month_range(month_str)
    in_month = (Kudo.created_at >= start) & (Kudo.created_at < end)

    received_rows = (
        db.session.query(Kudo.to_employee_id, db.func.count(Kudo.id))
        .filter(in_month)
        .group_by(Kudo.to_employee_id)
        .order_by(db.func.count(Kudo.id).desc(), Kudo.to_employee_id.asc())
        .limit(10)
        .all()
    )
    top_received = []
    for employee_id, count in received_rows:
        employee = db.session.get(Employee, employee_id)
        if employee is None:
            continue
        department = getattr(employee, "department", None)
        top_received.append({
            "employee_id": employee_id,
            "name": employee.full_name,
            "code": employee.code,
            "department": getattr(department, "name", None),
            "count": count,
        })

    given_rows = (
        db.session.query(Kudo.from_user_id, db.func.count(Kudo.id))
        .filter(in_month)
        .group_by(Kudo.from_user_id)
        .order_by(db.func.count(Kudo.id).desc(), Kudo.from_user_id.asc())
        .limit(10)
        .all()
    )
    top_givers = []
    for user_id, count in given_rows:
        giver = db.session.get(User, user_id)
        if giver is None:
            continue
        top_givers.append({
            "user_id": user_id,
            "name": giver.full_name,
            "employee_id": giver.employee_id,
            "count": count,
        })

    return {
        "month": start.strftime("%Y-%m"),
        "top_received": top_received,
        "top_givers": top_givers,
    }


def my_kudos(user):
    received = []
    if getattr(user, "employee_id", None):
        received = (
            Kudo.query.filter_by(to_employee_id=user.employee_id)
            .order_by(Kudo.created_at.desc(), Kudo.id.desc())
            .all()
        )
    given = (
        Kudo.query.filter_by(from_user_id=user.id)
        .order_by(Kudo.created_at.desc(), Kudo.id.desc())
        .all()
    )
    return {
        "received": [schemas.kudo_to_dict(k) for k in received],
        "given": [schemas.kudo_to_dict(k) for k in given],
        "received_count": len(received),
        "given_count": len(given),
    }


# ---------------------------------------------------------------------------
# Cột mốc (sinh nhật + kỷ niệm ngày vào làm)
# ---------------------------------------------------------------------------

def milestones(month_str):
    start, _end = _month_range(month_str)
    year, month = start.year, start.month
    employees = (
        Employee.query.filter(Employee.status != Employee.STATUS_RESIGNED)
        .order_by(Employee.full_name.asc())
        .all()
    )
    birthdays, anniversaries = [], []
    for employee in employees:
        department = getattr(employee, "department", None)
        base = {
            "employee_id": employee.id,
            "name": employee.full_name,
            "code": employee.code,
            "department": getattr(department, "name", None),
        }
        dob = getattr(employee, "date_of_birth", None)
        if dob is not None and dob.month == month:
            birthdays.append({
                **base,
                "type": "birthday",
                "day": dob.day,
                "date": date(year, month, dob.day).isoformat(),
                "turning_age": year - dob.year,
            })
        start_date = getattr(employee, "start_date", None)
        if start_date is not None and start_date.month == month:
            years = year - start_date.year
            if years >= 1:
                anniversaries.append({
                    **base,
                    "type": "anniversary",
                    "day": start_date.day,
                    "date": date(year, month, start_date.day).isoformat(),
                    "years": years,
                })
    birthdays.sort(key=lambda item: (item["day"], item["name"]))
    anniversaries.sort(key=lambda item: (item["day"], item["name"]))
    return {
        "month": start.strftime("%Y-%m"),
        "birthdays": birthdays,
        "anniversaries": anniversaries,
    }


# ---------------------------------------------------------------------------
# Khảo sát
# ---------------------------------------------------------------------------

def _responded(survey_id, user_id):
    return (
        SurveyParticipation.query.filter_by(
            survey_id=survey_id, user_id=user_id
        ).first()
        is not None
    )


def _response_count(survey_id):
    return SurveyResponse.query.filter_by(survey_id=survey_id).count()


def list_surveys(user):
    query = Survey.query.order_by(Survey.created_at.desc(), Survey.id.desc())
    if user.role in MANAGER_ROLES:
        surveys = query.all()
        return [
            schemas.survey_to_dict(
                survey,
                responded=_responded(survey.id, user.id),
                response_count=_response_count(survey.id),
            )
            for survey in surveys
        ]
    # employee/manager: chỉ khảo sát đang active.
    surveys = query.filter(Survey.status == Survey.STATUS_ACTIVE).all()
    return [
        schemas.survey_to_dict(survey, responded=_responded(survey.id, user.id))
        for survey in surveys
    ]


def get_survey_for_user(survey_id, user):
    survey = get_or_404(Survey, survey_id, "SURVEY_NOT_FOUND", "Không tìm thấy khảo sát.")
    if user.role not in MANAGER_ROLES and survey.status != Survey.STATUS_ACTIVE:
        raise ApiError(404, "SURVEY_NOT_FOUND", "Không tìm thấy khảo sát.")
    return survey


def create_survey(user, cleaned):
    survey = Survey(
        title=cleaned["title"],
        description=cleaned.get("description"),
        questions=cleaned["questions"],
        status=cleaned.get("status") or Survey.STATUS_ACTIVE,
        created_by=user.id,
        ends_at=cleaned.get("ends_at"),
    )
    db.session.add(survey)
    db.session.commit()
    return survey


def close_survey(survey_id):
    survey = get_or_404(Survey, survey_id, "SURVEY_NOT_FOUND", "Không tìm thấy khảo sát.")
    survey.status = Survey.STATUS_CLOSED
    db.session.commit()
    return survey


def respond_survey(user, survey_id, answers):
    survey = get_or_404(Survey, survey_id, "SURVEY_NOT_FOUND", "Không tìm thấy khảo sát.")
    if survey.status != Survey.STATUS_ACTIVE:
        raise ApiError(
            409, "SURVEY_NOT_ACTIVE", "Khảo sát không còn mở để trả lời."
        )
    if _responded(survey.id, user.id):
        raise ApiError(
            409,
            "ALREADY_RESPONDED",
            "Bạn đã trả lời khảo sát này rồi. Mỗi người chỉ trả lời một lần.",
        )
    errors = schemas.validate_answers(survey.questions or [], answers)
    if errors:
        raise ApiError(400, "VALIDATION_ERROR", "Đáp án không hợp lệ.", errors)
    # Chỉ giữ đáp án đúng các câu hỏi đã định nghĩa.
    known_ids = {q.get("id") for q in survey.questions or []}
    cleaned_answers = {
        key: value for key, value in answers.items() if key in known_ids
    }
    db.session.add(
        SurveyParticipation(survey_id=survey.id, user_id=user.id)
    )
    # Đáp án ẩn danh: KHÔNG gắn user_id.
    response = SurveyResponse(survey_id=survey.id, answers=cleaned_answers)
    db.session.add(response)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        raise ApiError(
            409,
            "ALREADY_RESPONDED",
            "Bạn đã trả lời khảo sát này rồi. Mỗi người chỉ trả lời một lần.",
        )
    return response


def survey_results(survey_id):
    """Tổng hợp kết quả — CHỈ đọc survey_responses, không join participation."""
    survey = get_or_404(Survey, survey_id, "SURVEY_NOT_FOUND", "Không tìm thấy khảo sát.")
    responses = SurveyResponse.query.filter_by(survey_id=survey.id).all()
    total = len(responses)

    question_results = []
    for question in survey.questions or []:
        qid = question.get("id")
        qtype = question.get("type")
        values = [
            r.answers.get(qid)
            for r in responses
            if isinstance(r.answers, dict) and r.answers.get(qid) is not None
        ]
        result = {
            "id": qid,
            "type": qtype,
            "text": question.get("text"),
            "answered": len(values),
        }
        if qtype == "enps":
            numbers = [v for v in values if isinstance(v, int)]
            promoters = sum(1 for v in numbers if v >= 9)
            passives = sum(1 for v in numbers if 7 <= v <= 8)
            detractors = sum(1 for v in numbers if v <= 6)
            base = len(numbers)
            result.update({
                "average": round(sum(numbers) / base, 2) if base else None,
                "enps_score": (
                    round((promoters - detractors) / base * 100)
                    if base
                    else None
                ),
                "promoters": promoters,
                "passives": passives,
                "detractors": detractors,
                "promoter_pct": round(promoters / base * 100, 1) if base else 0,
                "passive_pct": round(passives / base * 100, 1) if base else 0,
                "detractor_pct": round(detractors / base * 100, 1) if base else 0,
            })
        elif qtype == "scale":
            numbers = [v for v in values if isinstance(v, int)]
            distribution = {str(score): 0 for score in range(1, 6)}
            for value in numbers:
                if str(value) in distribution:
                    distribution[str(value)] += 1
            result.update({
                "average": (
                    round(sum(numbers) / len(numbers), 2) if numbers else None
                ),
                "distribution": distribution,
            })
        elif qtype == "single":
            counts = {}
            for option in question.get("options") or []:
                counts[option] = 0
            for value in values:
                counts[value] = counts.get(value, 0) + 1
            result.update({
                "options": question.get("options") or [],
                "counts": counts,
            })
        elif qtype == "text":
            result["answers"] = [
                v for v in values if isinstance(v, str) and v.strip()
            ]
        question_results.append(result)

    return {
        "survey": schemas.survey_to_dict(
            survey, response_count=total
        ),
        "total_responses": total,
        "questions": question_results,
    }
