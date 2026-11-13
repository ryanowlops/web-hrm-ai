"""Đào tạo (ghi danh, tiến độ) + Kỹ năng (mức 1-5, dedup).

Quy ước: test viết theo hành vi ĐÚNG mong muốn; FAIL = bug. Các luật
này được audit xác nhận là đang đúng nên các test phải PASS — nếu FAIL
là bug mới (hồi quy hoặc luật bị hiểu sai).
"""

import pytest

from app.blueprints.skills import services as skill_services
from app.blueprints.training import services as tr_services
from app.extensions import db
from app.models.skill import EmployeeSkill, Skill
from app.models.training import Course, CourseEnrollment
from tests.conftest import (
    auth_headers,
    login,
    make_employee,
    make_user,
)


@pytest.fixture()
def hr_client(client, session):
    hr = make_user(session, "hr@hrm.local", "Hr@12345", "hr")
    token = login(client, "hr@hrm.local", "Hr@12345")
    return client, auth_headers(token), hr


@pytest.fixture()
def course(session):
    row = Course(title="Python nâng cao", category="Kỹ thuật",
                 duration_hours=8, is_active=True)
    session.add(row)
    session.commit()
    return row


@pytest.fixture()
def employee_with_user(client, session):
    emp = make_employee(session, code="NV0001", full_name="Trần Văn Minh")
    user = make_user(session, "nv0001@hrm.local", "Employee@123",
                     "employee", employee=emp)
    return emp, user


def _login_as(client, email, password):
    return auth_headers(login(client, email, password))


# ---------------------------------------------------------------------------
# Training — ghi danh idempotent
# ---------------------------------------------------------------------------

class TestEnrollIdempotent:
    def test_enroll_twice_creates_one_row(
            self, session, hr_client, course, employee_with_user):
        _, _, hr = hr_client
        emp, _ = employee_with_user
        created, skipped = tr_services.enroll_employees(
            course.id, [emp.id], hr)
        assert [e.employee_id for e in created] == [emp.id]
        assert skipped == []
        created2, skipped2 = tr_services.enroll_employees(
            course.id, [emp.id], hr)
        assert created2 == []
        assert skipped2 == [emp.id]
        assert (
            session.query(CourseEnrollment)
            .filter_by(course_id=course.id, employee_id=emp.id)
            .count()
            == 1
        )

    def test_enroll_via_http_twice_second_is_skipped(
            self, client, session, hr_client, course, employee_with_user):
        http_client, headers, _ = hr_client
        emp, _ = employee_with_user
        first = http_client.post(
            f"/api/v1/training/courses/{course.id}/enroll",
            json={"employee_ids": [emp.id]}, headers=headers)
        assert first.status_code in (200, 201), first.get_json()
        second = http_client.post(
            f"/api/v1/training/courses/{course.id}/enroll",
            json={"employee_ids": [emp.id]}, headers=headers)
        assert second.status_code in (200, 201), second.get_json()
        assert (
            session.query(CourseEnrollment)
            .filter_by(course_id=course.id, employee_id=emp.id)
            .count()
            == 1
        )

    def test_enroll_inactive_course_400(
            self, session, hr_client, employee_with_user):
        _, _, hr = hr_client
        emp, _ = employee_with_user
        course = Course(title="Khoá đã tắt", is_active=False)
        session.add(course)
        session.commit()
        with pytest.raises(tr_services.ApiError) as exc:
            tr_services.enroll_employees(course.id, [emp.id], hr)
        assert exc.value.status == 400
        assert exc.value.code == "COURSE_INACTIVE"

    def test_enroll_unknown_employee_400(
            self, hr_client, course):
        _, _, hr = hr_client
        with pytest.raises(tr_services.ApiError) as exc:
            tr_services.enroll_employees(course.id, [9999], hr)
        assert exc.value.status == 400
        assert exc.value.code == "EMPLOYEE_NOT_FOUND"


# ---------------------------------------------------------------------------
# Training — tiến độ kẹp 0-100, học viên tự cập nhật tối đa 99%
# ---------------------------------------------------------------------------

@pytest.fixture()
def enrollment(session, hr_client, course, employee_with_user):
    _, _, hr = hr_client
    emp, _ = employee_with_user
    created, _ = tr_services.enroll_employees(course.id, [emp.id], hr)
    return created[0]


class TestProgressClamp:
    def test_owner_progress_100_clamped_to_99(
            self, client, session, enrollment, employee_with_user):
        """Học viên tự bấm 100% phải bị kẹp 99% + in_progress (chống farm
        điểm hoàn thành — chỉ HR mới được xác nhận hoàn thành)."""
        _, user = employee_with_user
        headers = _login_as(client, "nv0001@hrm.local", "Employee@123")
        resp = client.patch(
            f"/api/v1/training/enrollments/{enrollment.id}",
            json={"progress": 100}, headers=headers)
        assert resp.status_code == 200, resp.get_json()
        data = resp.get_json()["data"]
        assert data["progress"] == 99
        assert data["status"] == "in_progress"

    def test_owner_status_completed_clamped_to_99(
            self, client, enrollment, employee_with_user):
        _, user = employee_with_user
        headers = _login_as(client, "nv0001@hrm.local", "Employee@123")
        resp = client.patch(
            f"/api/v1/training/enrollments/{enrollment.id}",
            json={"status": "completed"}, headers=headers)
        assert resp.status_code == 200, resp.get_json()
        data = resp.get_json()["data"]
        assert data["progress"] == 99
        assert data["status"] == "in_progress"

    def test_hr_progress_100_completes(
            self, hr_client, enrollment):
        client, headers, _ = hr_client
        resp = client.patch(
            f"/api/v1/training/enrollments/{enrollment.id}",
            json={"progress": 100}, headers=headers)
        assert resp.status_code == 200, resp.get_json()
        data = resp.get_json()["data"]
        assert data["progress"] == 100
        assert data["status"] == "completed"
        assert data["completed_at"] is not None

    def test_owner_progress_50_moves_to_in_progress(
            self, client, enrollment, employee_with_user):
        _, user = employee_with_user
        headers = _login_as(client, "nv0001@hrm.local", "Employee@123")
        resp = client.patch(
            f"/api/v1/training/enrollments/{enrollment.id}",
            json={"progress": 50}, headers=headers)
        assert resp.status_code == 200, resp.get_json()
        data = resp.get_json()["data"]
        assert data["progress"] == 50
        assert data["status"] == "in_progress"

    def test_progress_over_100_rejected_400(self, hr_client, enrollment):
        client, headers, _ = hr_client
        resp = client.patch(
            f"/api/v1/training/enrollments/{enrollment.id}",
            json={"progress": 150}, headers=headers)
        assert resp.status_code == 400, resp.get_json()

    def test_progress_negative_rejected_400(self, hr_client, enrollment):
        client, headers, _ = hr_client
        resp = client.patch(
            f"/api/v1/training/enrollments/{enrollment.id}",
            json={"progress": -5}, headers=headers)
        assert resp.status_code == 400, resp.get_json()

    def test_other_employee_cannot_update_progress(
            self, client, session, enrollment):
        """Nhân viên khác (không phải chủ enrollment, không phải HR) -> 403."""
        other = make_employee(session, code="NV0002",
                              email="nv0002@hrm.local")
        make_user(session, "nv0002@hrm.local", "Employee@123",
                  "employee", employee=other)
        headers = _login_as(client, "nv0002@hrm.local", "Employee@123")
        resp = client.patch(
            f"/api/v1/training/enrollments/{enrollment.id}",
            json={"progress": 50}, headers=headers)
        assert resp.status_code == 403, resp.get_json()


# ---------------------------------------------------------------------------
# Skills — mức 1-5, dedup theo skill_id
# ---------------------------------------------------------------------------

@pytest.fixture()
def skill(session):
    row = Skill(name="Python", category="Kỹ thuật")
    session.add(row)
    session.commit()
    return row


class TestSkillLevels:
    def test_level_0_rejected_400(self, hr_client, skill, employee_with_user):
        client, headers, _ = hr_client
        emp, _ = employee_with_user
        resp = client.put(
            f"/api/v1/skills/employees/{emp.id}",
            json={"items": [{"skill_id": skill.id, "level": 0}]},
            headers=headers)
        assert resp.status_code == 400, resp.get_json()

    def test_level_6_rejected_400(self, hr_client, skill, employee_with_user):
        client, headers, _ = hr_client
        emp, _ = employee_with_user
        resp = client.put(
            f"/api/v1/skills/employees/{emp.id}",
            json={"items": [{"skill_id": skill.id, "level": 6}]},
            headers=headers)
        assert resp.status_code == 400, resp.get_json()

    def test_level_boundaries_1_and_5_ok(
            self, hr_client, skill, employee_with_user):
        client, headers, _ = hr_client
        emp, _ = employee_with_user
        for level in (1, 5):
            resp = client.put(
                f"/api/v1/skills/employees/{emp.id}",
                json={"items": [{"skill_id": skill.id, "level": level}]},
                headers=headers)
            assert resp.status_code == 200, resp.get_json()
            assert resp.get_json()["data"]["items"][0]["level"] == level

    def test_level_must_be_int(self, hr_client, skill, employee_with_user):
        client, headers, _ = hr_client
        emp, _ = employee_with_user
        resp = client.put(
            f"/api/v1/skills/employees/{emp.id}",
            json={"items": [{"skill_id": skill.id, "level": 3.5}]},
            headers=headers)
        assert resp.status_code == 400, resp.get_json()

    def test_unknown_skill_id_400(self, hr_client, employee_with_user):
        client, headers, _ = hr_client
        emp, _ = employee_with_user
        resp = client.put(
            f"/api/v1/skills/employees/{emp.id}",
            json={"items": [{"skill_id": 9999, "level": 3}]},
            headers=headers)
        assert resp.status_code == 400, resp.get_json()


class TestSkillDedup:
    def test_duplicate_skill_id_in_one_put_creates_one_row(
            self, hr_client, skill, employee_with_user):
        """Cùng skill_id gửi 2 lần trong 1 request: chỉ 1 dòng, mức sau
        thắng (schema dedup theo skill_id)."""
        client, headers, _ = hr_client
        emp, _ = employee_with_user
        resp = client.put(
            f"/api/v1/skills/employees/{emp.id}",
            json={"items": [{"skill_id": skill.id, "level": 3},
                            {"skill_id": skill.id, "level": 4}]},
            headers=headers)
        assert resp.status_code == 200, resp.get_json()
        rows = (
            db.session.query(EmployeeSkill)
            .filter_by(employee_id=emp.id, skill_id=skill.id)
            .all()
        )
        assert len(rows) == 1
        assert rows[0].level == 4

    def test_repeated_put_upserts_same_row(
            self, hr_client, skill, employee_with_user):
        client, headers, _ = hr_client
        emp, _ = employee_with_user
        for level in (2, 5):
            resp = client.put(
                f"/api/v1/skills/employees/{emp.id}",
                json={"items": [{"skill_id": skill.id, "level": level}]},
                headers=headers)
            assert resp.status_code == 200, resp.get_json()
        rows = (
            db.session.query(EmployeeSkill)
            .filter_by(employee_id=emp.id, skill_id=skill.id)
            .all()
        )
        assert len(rows) == 1
        assert rows[0].level == 5

    def test_employee_can_update_own_skills(
            self, client, skill, employee_with_user):
        emp, _ = employee_with_user
        headers = _login_as(client, "nv0001@hrm.local", "Employee@123")
        resp = client.put(
            f"/api/v1/skills/employees/{emp.id}",
            json={"items": [{"skill_id": skill.id, "level": 3}]},
            headers=headers)
        assert resp.status_code == 200, resp.get_json()
