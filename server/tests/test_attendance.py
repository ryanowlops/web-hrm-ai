"""Chấm công: streak, lấp ngày vắng, check-in/out, ca làm.

Quy ước: test viết theo hành vi ĐÚNG mong muốn; FAIL = bug. Các test đánh
dấu [BUG] là những chỗ code hiện tại đã biết sai (audit) — chúng phải FAIL
cho tới khi được sửa, đừng "sửa test cho pass".
"""

from datetime import date, datetime, time, timedelta
from types import SimpleNamespace as NS

import pytest

from app.blueprints.attendance import services as att
from app.extensions import db
from app.models import Attendance, LeaveRequest, LeaveType
from app.models.shifts import ShiftAssignment, ShiftDefinition
from tests.conftest import auth_headers, login, make_employee, make_user


def _rec(day, status="present"):
    return NS(work_date=day, status=status)


# ---------------------------------------------------------------------------
# compute_streaks (thuần, không cần DB)
# ---------------------------------------------------------------------------

class TestStreaks:
    def test_gap_breaks_streak(self):
        # T2 present, T3 vắng (không có bản ghi), T4 present -> chuỗi = 1.
        records = [_rec(date(2026, 11, 2)), _rec(date(2026, 11, 4))]
        assert att.compute_streaks(records) == (1, 1)

    def test_friday_to_monday_connects(self):
        records = [_rec(date(2026, 11, 6)), _rec(date(2026, 11, 9))]
        assert att.compute_streaks(records) == (2, 2)

    def test_late_breaks_streak(self):
        records = [
            _rec(date(2026, 11, 2)),
            _rec(date(2026, 11, 3), "late"),
            _rec(date(2026, 11, 4)),
        ]
        assert att.compute_streaks(records) == (1, 1)

    def test_on_leave_breaks_streak(self):
        records = [
            _rec(date(2026, 11, 2)),
            _rec(date(2026, 11, 3), "on_leave"),
            _rec(date(2026, 11, 4)),
        ]
        assert att.compute_streaks(records) == (1, 1)

    def test_stale_streak_is_not_current(self):
        # Chuỗi 4 ngày tới T5, hôm nay là T4 tuần sau (T2+T3 đã vắng).
        records = [_rec(date(2026, 11, d)) for d in (2, 3, 4, 5)]
        assert att.compute_streaks(records, today=date(2026, 11, 11)) == (0, 4)

    def test_streak_alive_before_today(self):
        # Chuỗi tới T5, hôm nay T6 -> vẫn đang chạy (T6 chưa hết ngày).
        records = [_rec(date(2026, 11, d)) for d in (2, 3, 4, 5)]
        assert att.compute_streaks(records, today=date(2026, 11, 6)) == (4, 4)


# ---------------------------------------------------------------------------
# materialize_absences (cần DB)
# ---------------------------------------------------------------------------

def _october():
    first = date(2026, 10, 1)
    next_first = date(2026, 11, 1)
    return first, next_first


class TestMaterialize:
    def test_fills_missing_workdays_as_absent(self, app, session):
        emp = make_employee(session, code="NV0001")
        first, next_first = _october()
        result = att.materialize_absences(first, next_first)
        # Tháng 10/2026 có 22 ngày T2-T6; nhân viên chưa có bản ghi nào.
        assert result["created_absent"] == 22
        assert result["created_on_leave"] == 0
        assert (
            session.query(Attendance)
            .filter_by(employee_id=emp.id, status="absent")
            .count()
            == 22
        )

    def test_approved_leave_days_become_on_leave(self, app, session):
        emp = make_employee(session, code="NV0001")
        leave_type = LeaveType(name="Phép năm", paid=True, annual_quota_days=12)
        session.add(leave_type)
        session.commit()
        session.add(LeaveRequest(
            employee_id=emp.id, leave_type_id=leave_type.id,
            from_date=date(2026, 10, 5), to_date=date(2026, 10, 6),
            days_count=2, reason="Nghi phep", status="approved",
        ))
        session.commit()
        first, next_first = _october()
        result = att.materialize_absences(first, next_first)
        assert result["created_on_leave"] == 2
        assert result["created_absent"] == 20

    def test_skips_existing_records_and_is_idempotent(self, app, session):
        emp = make_employee(session, code="NV0001")
        session.add(Attendance(
            employee_id=emp.id, work_date=date(2026, 10, 1),
            check_in_at=datetime(2026, 10, 1, 8, 0), status="present",
        ))
        session.commit()
        first, next_first = _october()
        first_run = att.materialize_absences(first, next_first)
        assert first_run["created_absent"] == 21
        second_run = att.materialize_absences(first, next_first)
        assert second_run == {"created_absent": 0, "created_on_leave": 0}

    def test_skips_resigned_and_weekends(self, app, session):
        make_employee(session, code="NV0001", status="resigned")
        first, next_first = _october()
        result = att.materialize_absences(first, next_first)
        assert result == {"created_absent": 0, "created_on_leave": 0}
        # Không có bản ghi nào rơi vào T7/CN.
        weekend_rows = (
            session.query(Attendance)
            .filter(Attendance.work_date.in_(
                [date(2026, 10, 3), date(2026, 10, 4)]))
            .count()
        )
        assert weekend_rows == 0


# ---------------------------------------------------------------------------
# check-in / check-out qua HTTP
# ---------------------------------------------------------------------------

@pytest.fixture()
def employee_user(app, session):
    emp = make_employee(session, code="NV0001", full_name="Trần Văn Minh")
    user = make_user(session, "nv0001@hrm.local", "Employee@123",
                     "employee", employee=emp)
    return emp, user


def test_check_in_then_double_check_in_409(client, employee_user):
    _, user = employee_user
    token = login(client, "nv0001@hrm.local", "Employee@123")
    headers = auth_headers(token)
    first = client.post("/api/v1/attendance/check-in", headers=headers)
    assert first.status_code == 201, first.get_json()
    second = client.post("/api/v1/attendance/check-in", headers=headers)
    assert second.status_code == 409
    assert second.get_json()["error"]["code"] == "ALREADY_CHECKED_IN"


def test_check_out_without_check_in_409(client, employee_user):
    _, user = employee_user
    token = login(client, "nv0001@hrm.local", "Employee@123")
    resp = client.post("/api/v1/attendance/check-out",
                       headers=auth_headers(token))
    assert resp.status_code == 409
    assert resp.get_json()["error"]["code"] == "NOT_CHECKED_IN"


def test_check_in_on_leave_day_409(app, client, session, employee_user):
    emp, user = employee_user
    session.add(Attendance(
        employee_id=emp.id, work_date=att._now().date(), status="on_leave",
    ))
    session.commit()
    token = login(client, "nv0001@hrm.local", "Employee@123")
    resp = client.post("/api/v1/attendance/check-in",
                       headers=auth_headers(token))
    assert resp.status_code == 409
    assert resp.get_json()["error"]["code"] == "ON_LEAVE"


# ---------------------------------------------------------------------------
# Ca làm [BUG] — các test này FAIL cho tới khi check-in biết tới ca làm.
# Dùng monkeypatch để cố định "giờ hiện tại" (giờ ICT) cho deterministic.
# ---------------------------------------------------------------------------

def _assign_shift(session, employee_id, work_date, name, start, end,
                  overnight=False):
    definition = ShiftDefinition(
        name=name, start_time=start, end_time=end,
        is_overnight=overnight, is_active=True,
    )
    session.add(definition)
    session.commit()
    session.add(ShiftAssignment(
        employee_id=employee_id, shift_id=definition.id,
        work_date=work_date,
    ))
    session.commit()
    return definition


def test_afternoon_shift_check_in_at_1405_is_present(
        app, client, session, employee_user, monkeypatch):
    """[BUG] Ca chiều 14:00–22:00, chấm lúc 14:05 phải là đúng giờ."""
    emp, user = employee_user
    today = date(2026, 11, 9)  # Thứ 2
    _assign_shift(session, emp.id, today, "Ca chiều",
                  time(14, 0), time(22, 0))
    monkeypatch.setattr(att, "_now", lambda: datetime(2026, 11, 9, 14, 5))
    token = login(client, "nv0001@hrm.local", "Employee@123")
    resp = client.post("/api/v1/attendance/check-in",
                       headers=auth_headers(token))
    assert resp.status_code == 201, resp.get_json()
    assert resp.get_json()["data"]["status"] == "present"


def test_morning_shift_check_in_at_0800_is_late(
        app, client, session, employee_user, monkeypatch):
    """[BUG] Ca sáng 06:00–14:00, chấm lúc 08:00 phải là đi muộn."""
    emp, user = employee_user
    today = date(2026, 11, 9)
    _assign_shift(session, emp.id, today, "Ca sáng",
                  time(6, 0), time(14, 0))
    monkeypatch.setattr(att, "_now", lambda: datetime(2026, 11, 9, 8, 0))
    token = login(client, "nv0001@hrm.local", "Employee@123")
    resp = client.post("/api/v1/attendance/check-in",
                       headers=auth_headers(token))
    assert resp.status_code == 201, resp.get_json()
    assert resp.get_json()["data"]["status"] == "late"


def test_overnight_shift_checkout_after_midnight(
        app, client, session, employee_user, monkeypatch):
    """[BUG] Ca đêm 22:00–06:00, check-out lúc 02:00 hôm sau phải được."""
    emp, user = employee_user
    _assign_shift(session, emp.id, date(2026, 11, 9), "Ca đêm",
                  time(22, 0), time(6, 0), overnight=True)
    monkeypatch.setattr(att, "_now", lambda: datetime(2026, 11, 9, 22, 0))
    token = login(client, "nv0001@hrm.local", "Employee@123")
    headers = auth_headers(token)
    check_in = client.post("/api/v1/attendance/check-in", headers=headers)
    assert check_in.status_code == 201, check_in.get_json()
    monkeypatch.setattr(att, "_now", lambda: datetime(2026, 11, 10, 2, 0))
    check_out = client.post("/api/v1/attendance/check-out", headers=headers)
    assert check_out.status_code == 200, check_out.get_json()
