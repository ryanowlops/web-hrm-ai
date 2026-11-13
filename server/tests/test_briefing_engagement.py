"""Briefing number grounding + engagement (milestones, surveys) tests."""

from datetime import date, datetime

import pytest

from app.blueprints.briefing import services as briefing_services
from app.blueprints.engagement import services as engagement_services
from app.blueprints.engagement.services import ApiError as EngagementApiError
from app.models import Survey
from tests.conftest import make_employee, make_user

# Gói số đúng shape mà build_numbers/template_prose dùng.
NUMBERS = {
    "period": "month",
    "period_start": "2026-11-01",
    "period_end": "2026-11-30",
    "ref_date": "2026-11-30",
    "headcount_total": 47,
    "new_hires": 5,
    "departures": 2,
    "attrition_window_days": 30,
    "attrition_high_risk": 3,
    "attendance": {
        "total_records": 100,
        "present": 80,
        "late": 10,
        "absent": 5,
        "on_leave": 5,
        "on_time_rate": 80.0,
    },
    "leave": {"pending_requests": 3, "approved_in_period": 4},
    "recruitment": {"open_job_postings": 2, "new_candidates": 7},
    "engagement": {
        "kudos_in_period": 12,
        "enps": {"score": 42, "responses": 20, "survey_title": "Khảo sát gắn kết Q4"},
    },
}


# ---------------------------------------------------------------------------
# Briefing: số phải đúng metric của nó
# ---------------------------------------------------------------------------

def test_prose_number_swap_is_rejected():
    """'47 người đã nghỉ việc' khi departures=2 (dù headcount=47) -> False."""
    assert briefing_services.prose_numbers_are_grounded(
        "47 người đã nghỉ việc", NUMBERS
    ) is False


def test_prose_true_departures_accepted():
    """'2 trường hợp đã hoàn tất nghỉ việc.' đúng số departures -> True."""
    assert briefing_services.prose_numbers_are_grounded(
        "2 trường hợp đã hoàn tất nghỉ việc.", NUMBERS
    ) is True


def test_prose_headcount_swap_is_rejected():
    """'Tổng nhân sự là 2 người' khi headcount_total=47 -> False."""
    assert briefing_services.prose_numbers_are_grounded(
        "Tổng nhân sự là 2 người", NUMBERS
    ) is False


def test_prose_true_headcount_accepted():
    assert briefing_services.prose_numbers_are_grounded(
        "Tổng nhân sự hiện hành là 47 người.", NUMBERS
    ) is True


def test_prose_invented_number_is_rejected():
    assert briefing_services.prose_numbers_are_grounded(
        "99 nhân viên vào mới", NUMBERS
    ) is False


def test_template_prose_is_grounded():
    """Prose mẫu (dựng từ đúng gói số) phải qua được bộ kiểm tra."""
    prose = briefing_services.template_prose(NUMBERS)
    assert prose
    assert briefing_services.prose_numbers_are_grounded(prose, NUMBERS) is True


# ---------------------------------------------------------------------------
# Milestones: sinh nhật 29/2
# ---------------------------------------------------------------------------

def test_milestones_feb29_non_leap_year(session):
    """Sinh nhật 29/2 ở năm không nhuận -> hiện 28/2, không 500."""
    emp = make_employee(
        session, code="NV0001", full_name="Nguyễn Leap",
        email="leap@hrm.local",
    )
    emp.date_of_birth = date(1996, 2, 29)
    session.commit()

    result = engagement_services.milestones("2026-02")

    assert result["month"] == "2026-02"
    assert len(result["birthdays"]) == 1
    entry = result["birthdays"][0]
    assert entry["day"] == 28
    assert entry["date"] == "2026-02-28"
    assert entry["turning_age"] == 30


def test_milestones_feb29_leap_year_kept(session):
    """Sinh nhật 29/2 ở năm nhuận -> giữ nguyên 29/2."""
    emp = make_employee(
        session, code="NV0001", full_name="Nguyễn Leap",
        email="leap@hrm.local",
    )
    emp.date_of_birth = date(1996, 2, 29)
    session.commit()

    result = engagement_services.milestones("2024-02")

    assert len(result["birthdays"]) == 1
    assert result["birthdays"][0]["day"] == 29
    assert result["birthdays"][0]["date"] == "2024-02-29"


def test_milestones_anniversary_feb29_non_leap(session):
    """Ngày vào làm 29/2 ở năm không nhuận -> kỷ niệm 28/2."""
    emp = make_employee(
        session, code="NV0001", full_name="Nguyễn Leap",
        email="leap@hrm.local", start_date=date(2020, 2, 29),
    )
    session.commit()

    result = engagement_services.milestones("2026-02")

    assert len(result["anniversaries"]) == 1
    assert result["anniversaries"][0]["day"] == 28
    assert result["anniversaries"][0]["date"] == "2026-02-28"
    assert result["anniversaries"][0]["years"] == 6


# ---------------------------------------------------------------------------
# Surveys: ends_at
# ---------------------------------------------------------------------------

QUESTIONS = [{"id": "q1", "type": "text", "text": "Góp ý của bạn"}]


def _make_survey(session, user, ends_at, title="Khảo sát Q4"):
    survey = Survey(
        title=title,
        description="",
        questions=QUESTIONS,
        status=Survey.STATUS_ACTIVE,
        created_by=user.id,
        ends_at=ends_at,
    )
    session.add(survey)
    session.commit()
    return survey


def test_respond_survey_rejects_after_ends_at(session):
    """Khảo sát đã quá ends_at -> 409 SURVEY_ENDED."""
    admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
    emp_user = make_user(session, "emp@hrm.local", "Employee@123", "employee")
    survey = _make_survey(session, admin, ends_at=datetime(2020, 1, 1))

    with pytest.raises(EngagementApiError) as exc_info:
        engagement_services.respond_survey(
            emp_user, survey.id, {"q1": "Rất tốt"}
        )

    assert exc_info.value.status == 409
    assert exc_info.value.code == "SURVEY_ENDED"


def test_respond_survey_accepts_before_ends_at(session):
    """Khảo sát chưa tới ends_at -> trả lời được."""
    admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
    emp_user = make_user(session, "emp@hrm.local", "Employee@123", "employee")
    survey = _make_survey(session, admin, ends_at=datetime(2100, 1, 1))

    response = engagement_services.respond_survey(
        emp_user, survey.id, {"q1": "Rất tốt"}
    )

    assert response is not None
    assert response.survey_id == survey.id


def test_respond_survey_no_ends_at_accepted(session):
    """Khảo sát không đặt ends_at -> trả lời được như thường."""
    admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
    emp_user = make_user(session, "emp@hrm.local", "Employee@123", "employee")
    survey = _make_survey(session, admin, ends_at=None)

    response = engagement_services.respond_survey(
        emp_user, survey.id, {"q1": "Rất tốt"}
    )
    assert response is not None


def test_list_surveys_hides_ended_from_employees(session):
    """Nhân viên không thấy khảo sát đã hết hạn trong danh sách."""
    admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
    emp_user = make_user(session, "emp@hrm.local", "Employee@123", "employee")
    ended = _make_survey(session, admin, ends_at=datetime(2020, 1, 1),
                         title="Đã hết hạn")
    active = _make_survey(session, admin, ends_at=datetime(2100, 1, 1),
                          title="Đang mở")

    visible = engagement_services.list_surveys(emp_user)
    titles = [s["title"] for s in visible]

    assert active.title in titles
    assert ended.title not in titles


def test_list_surveys_admin_still_sees_ended(session):
    """Admin/HR quản lý vẫn thấy khảo sát đã hết hạn."""
    admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
    ended = _make_survey(session, admin, ends_at=datetime(2020, 1, 1),
                         title="Đã hết hạn")

    visible = engagement_services.list_surveys(admin)
    titles = [s["title"] for s in visible]

    assert ended.title in titles
