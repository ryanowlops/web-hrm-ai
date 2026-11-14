"""Cộng dồn phép năm (carryover): rollover cuối năm, policy, FIFO trừ/hoàn.

Quy ước: test viết theo hành vi ĐÚNG mong muốn; FAIL = bug. Năm dùng động
(Y = năm hiện tại) để test không lỗi thời: rollover năm Y-1, phép cộng dồn
hết hạn 31/03 năm Y theo policy mặc định.
"""

from datetime import date, timedelta

import pytest

from app.blueprints.leave import services as leave
from app.errors import ApiError
from app.models import LeaveBalance, LeaveCarryover, LeaveRequest, LeaveType
from tests.conftest import (
    auth_headers,
    login,
    make_department,
    make_employee,
    make_user,
)


@pytest.fixture()
def leave_type(session):
    lt = LeaveType(name="Phép năm", paid=True, annual_quota_days=12)
    session.add(lt)
    session.commit()
    return lt


@pytest.fixture()
def team(session):
    """Manager + 1 nhân viên trực thuộc + HR (giống test_leave.py)."""
    dept = make_department(session, name="Kỹ thuật")
    manager = make_employee(session, code="NV0001", full_name="Trần Văn Minh",
                            email="nv0001@hrm.local", department_id=dept.id)
    dept.manager_id = manager.id
    session.commit()
    employee = make_employee(session, code="NV0002", full_name="Phạm Thị Lan",
                             email="nv0002@hrm.local", department_id=dept.id,
                             manager_id=manager.id)
    hr_emp = make_employee(session, code="NV0003", full_name="Nguyễn Thu Hà",
                           email="nv0003@hrm.local", department_id=dept.id)
    manager_user = make_user(session, "nv0001@hrm.local", "Manager@123",
                             "manager", employee=manager)
    employee_user = make_user(session, "nv0002@hrm.local", "Employee@123",
                              "employee", employee=employee)
    hr_user = make_user(session, "nv0003@hrm.local", "Hr@12345",
                        "hr", employee=hr_emp)
    admin_user = make_user(session, "admin@hrm.local", "Admin@123", "admin")
    return {
        "dept": dept, "manager": manager, "employee": employee,
        "hr_emp": hr_emp, "manager_user": manager_user,
        "employee_user": employee_user, "hr_user": hr_user,
        "admin_user": admin_user,
    }


def _year():
    return date.today().year


def _set_balance(session, employee, leave_type, year, total=12, used=0):
    balance = leave.get_or_create_balance(employee.id, leave_type, year)
    balance.total_days = total
    balance.used_days = used
    session.commit()
    return balance


def _get_balance(session, employee, leave_type, year):
    return session.query(LeaveBalance).filter_by(
        employee_id=employee.id, leave_type_id=leave_type.id, year=year
    ).first()


def _get_carryover(session, employee, leave_type, from_year):
    return session.query(LeaveCarryover).filter_by(
        employee_id=employee.id, leave_type_id=leave_type.id,
        from_year=from_year,
    ).first()


def _next_monday():
    """Thứ 2 đầu tiên sau hôm nay (để tạo đơn nghỉ tương lai)."""
    day = date.today() + timedelta(days=1)
    while day.weekday() != 0:
        day += timedelta(days=1)
    return day


def _create(session, employee, leave_type, from_day, to_day):
    return leave.create_leave_request(employee, {
        "leave_type_id": leave_type.id,
        "from_date": from_day,
        "to_date": to_day,
        "reason": "Nghi phep",
    })


def _approve(session, team, request):
    leave.manager_decision(team["manager"], request.id,
                           {"decision": "approved", "note": ""})
    return leave.hr_decision(request.id, {"decision": "approved", "note": ""})


# ---------------------------------------------------------------------------
# Rollover
# ---------------------------------------------------------------------------

def test_rollover_basic_capped_at_max(session, team, leave_type):
    """Thừa 7 ngày, max mặc định 5 -> cộng dồn 5, hạn 31/03 năm sau."""
    year = _year()
    _set_balance(session, team["employee"], leave_type, year - 1,
                 total=12, used=5)
    summary = leave.rollover_leave(year - 1)
    assert summary == {
        "fromYear": year - 1,
        "toYear": year,
        "employeesProcessed": 3,
        "employeesCarried": 1,
        "totalCarriedDays": 5,
        "skippedExisting": 0,
    }
    row = _get_carryover(session, team["employee"], leave_type, year - 1)
    assert row is not None
    assert row.initial_days == 5 and row.days_remaining == 5
    assert row.expires_on == date(year, 3, 31)
    # Balance năm sau vẫn = quota (phép cộng dồn không cộng vào total_days).
    nxt = _get_balance(session, team["employee"], leave_type, year)
    assert nxt is not None and nxt.total_days == 12 and nxt.used_days == 0


def test_rollover_default_year_is_last_year(session, team, leave_type):
    _set_balance(session, team["employee"], leave_type, _year() - 1,
                 total=12, used=9)
    summary = leave.rollover_leave()
    assert summary["fromYear"] == _year() - 1
    assert summary["totalCarriedDays"] == 3


def test_rollover_second_run_is_idempotent(session, team, leave_type):
    year = _year()
    _set_balance(session, team["employee"], leave_type, year - 1,
                 total=12, used=5)
    leave.rollover_leave(year - 1)
    summary = leave.rollover_leave(year - 1)
    assert summary["totalCarriedDays"] == 0
    assert summary["skippedExisting"] == 1
    assert summary["employeesCarried"] == 0
    rows = session.query(LeaveCarryover).all()
    assert len(rows) == 1


def test_rollover_no_unused_creates_nothing(session, team, leave_type):
    _set_balance(session, team["employee"], leave_type, _year() - 1,
                 total=12, used=12)
    summary = leave.rollover_leave(_year() - 1)
    assert summary["totalCarriedDays"] == 0
    assert session.query(LeaveCarryover).count() == 0


def test_rollover_respects_policy_max(session, team, leave_type):
    leave.update_carry_policy({"max_days": 3})
    _set_balance(session, team["employee"], leave_type, _year() - 1,
                 total=12, used=5)
    summary = leave.rollover_leave(_year() - 1)
    assert summary["totalCarriedDays"] == 3
    row = _get_carryover(session, team["employee"], leave_type, _year() - 1)
    assert row.initial_days == 3


def test_rollover_skips_resigned_employee(session, team, leave_type):
    dept = team["dept"]
    resigned = make_employee(session, code="NV0009", full_name="Đã nghỉ",
                             email="nv0009@hrm.local", department_id=dept.id,
                             status="resigned")
    _set_balance(session, resigned, leave_type, _year() - 1,
                 total=12, used=2)
    summary = leave.rollover_leave(_year() - 1)
    assert _get_carryover(session, resigned, leave_type, _year() - 1) is None
    assert summary["employeesProcessed"] == 3  # chỉ tính người đang làm việc


def test_rollover_rejects_current_or_future_year(session):
    with pytest.raises(ApiError) as exc:
        leave.rollover_leave(_year())
    assert exc.value.code == "VALIDATION_ERROR"
    assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# available_days / FIFO trừ phép
# ---------------------------------------------------------------------------

def test_available_days_is_quota_plus_carried(session, team, leave_type):
    year = _year()
    leave.update_carry_policy({"expiry_mmdd": "12-31"})
    _set_balance(session, team["employee"], leave_type, year - 1,
                 total=12, used=7)
    leave.rollover_leave(year - 1)  # carried 5, hạn 31/12 năm nay
    _set_balance(session, team["employee"], leave_type, year,
                 total=12, used=2)
    assert leave.available_days(team["employee"].id, leave_type, year) == 15


def test_approve_consumes_carryover_first(session, team, leave_type):
    year = _year()
    leave.update_carry_policy({"expiry_mmdd": "12-31"})
    emp = team["employee"]
    _set_balance(session, emp, leave_type, year - 1, total=12, used=7)
    leave.rollover_leave(year - 1)  # carried 5
    monday = _next_monday()
    req1 = _create(session, emp, leave_type, monday, monday + timedelta(days=2))
    assert req1.days_count == 3
    _approve(session, team, req1)
    row = _get_carryover(session, emp, leave_type, year - 1)
    assert row.days_remaining == 2
    assert _get_balance(session, emp, leave_type, year).used_days == 0
    # Đơn thứ 2 (4 ngày, tuần sau nữa): hết carried (2) rồi mới trừ quota (2).
    monday2 = monday + timedelta(days=7)
    req2 = _create(session, emp, leave_type, monday2, monday2 + timedelta(days=3))
    assert req2.days_count == 4
    _approve(session, team, req2)
    assert _get_carryover(session, emp, leave_type, year - 1).days_remaining == 0
    assert _get_balance(session, emp, leave_type, year).used_days == 2


def test_expired_carryover_not_available_and_not_consumed(session, team, leave_type):
    year = _year()
    emp = team["employee"]
    _set_balance(session, emp, leave_type, year - 1, total=12, used=7)
    leave.rollover_leave(year - 1)  # carried 5, hạn 31/03 năm nay
    # Đúng ngày hết hạn vẫn dùng được; qua ngày đó thì không.
    assert leave.available_days(emp.id, leave_type, year,
                                on_date=date(year, 3, 31)) == 12 + 5
    assert leave.available_days(emp.id, leave_type, year,
                                on_date=date(year, 4, 1)) == 12
    # Trừ phép sau hạn: không động vào carried, chỉ tăng used.
    _set_balance(session, emp, leave_type, year, total=12, used=0)
    leave._consume_days(emp.id, leave_type, year, 3, on_date=date(year, 4, 1))
    assert _get_carryover(session, emp, leave_type, year - 1).days_remaining == 5
    assert _get_balance(session, emp, leave_type, year).used_days == 3


def test_create_uses_available_including_carried(session, team, leave_type):
    """Tạo đơn xin 14 ngày khi quota còn 10 nhưng có carried 5 -> được tạo."""
    year = _year()
    leave.update_carry_policy({"expiry_mmdd": "12-31"})
    emp = team["employee"]
    _set_balance(session, emp, leave_type, year - 1, total=12, used=7)
    leave.rollover_leave(year - 1)  # carried 5
    _set_balance(session, emp, leave_type, year, total=12, used=2)
    monday = _next_monday()
    # 14 ngày làm việc: 2 tuần + 4 ngày.
    req = _create(session, emp, leave_type, monday, monday + timedelta(days=17))
    assert req.days_count == 14
    # Vượt available (15) thì vẫn 400 như cũ: 16 ngày làm việc.
    with pytest.raises(ApiError) as exc:
        _create(session, emp, leave_type,
                monday + timedelta(days=21), monday + timedelta(days=42))
    assert exc.value.code == "INSUFFICIENT_LEAVE_BALANCE"


# ---------------------------------------------------------------------------
# Hoàn phép khi hủy đơn đã duyệt
# ---------------------------------------------------------------------------

def test_cancel_approved_refunds_quota_first_then_carryover(session, team, leave_type):
    year = _year()
    leave.update_carry_policy({"expiry_mmdd": "12-31"})
    emp = team["employee"]
    _set_balance(session, emp, leave_type, year - 1, total=12, used=7)
    leave.rollover_leave(year - 1)  # carried 5
    monday = _next_monday()
    req = _create(session, emp, leave_type, monday, monday + timedelta(days=8))
    assert req.days_count == 7
    _approve(session, team, req)
    # Duyệt 7 ngày: carried 5 -> 0, quota used 0 -> 2.
    assert _get_carryover(session, emp, leave_type, year - 1).days_remaining == 0
    assert _get_balance(session, emp, leave_type, year).used_days == 2
    leave.cancel_approved_leave(req.id, actor_user=team["hr_user"])
    # Hoàn 7 ngày tương lai: quota 2 -> 0 trước, carried 0 -> 5 sau.
    assert _get_balance(session, emp, leave_type, year).used_days == 0
    assert _get_carryover(session, emp, leave_type, year - 1).days_remaining == 5


def test_refund_does_not_exceed_initial_days(session, team, leave_type):
    year = _year()
    leave.update_carry_policy({"expiry_mmdd": "12-31"})
    emp = team["employee"]
    _set_balance(session, emp, leave_type, year - 1, total=12, used=7)
    leave.rollover_leave(year - 1)  # initial 5
    row = _get_carryover(session, emp, leave_type, year - 1)
    row.days_remaining = 4
    session.commit()
    leave._refund_days(emp.id, leave_type, year, 3)
    assert row.days_remaining == 5  # kẹp ở initial, không thành 7


def test_refund_for_expired_carryover_is_lost(session, team, leave_type):
    year = _year()
    emp = team["employee"]
    _set_balance(session, emp, leave_type, year - 1, total=12, used=7)
    leave.rollover_leave(year - 1)  # carried 5, hạn 31/03 năm nay
    row = _get_carryover(session, emp, leave_type, year - 1)
    row.days_remaining = 0
    _set_balance(session, emp, leave_type, year, total=12, used=2)
    session.commit()
    # Hoàn 3 ngày sau hạn: quota 2 -> 0, 1 ngày còn lại thuộc row đã hết
    # hạn nên mất luôn.
    leave._refund_days(emp.id, leave_type, year, 3, on_date=date(year, 4, 1))
    assert _get_balance(session, emp, leave_type, year).used_days == 0
    assert row.days_remaining == 0


# ---------------------------------------------------------------------------
# Policy + HTTP
# ---------------------------------------------------------------------------

def test_carry_policy_defaults_and_validation(client, team):
    token = login(client, "nv0002@hrm.local", "Employee@123")
    resp = client.get("/api/v1/leave/carry-policy", headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.get_json() == {"max_days": 5, "expiry_mmdd": "03-31"}

    # Employee không được đổi policy.
    resp = client.put("/api/v1/leave/carry-policy",
                      json={"max_days": 10}, headers=auth_headers(token))
    assert resp.status_code == 403

    admin = login(client, "admin@hrm.local", "Admin@123")
    for bad in ({"max_days": 31}, {"max_days": -1}, {"max_days": "abc"},
                {"expiry_mmdd": "13-40"}, {"expiry_mmdd": "02-30"},
                {"expiry_mmdd": "31/03"}):
        resp = client.put("/api/v1/leave/carry-policy", json=bad,
                          headers=auth_headers(admin))
        assert resp.status_code == 400, bad

    resp = client.put("/api/v1/leave/carry-policy",
                      json={"max_days": 7, "expiry_mmdd": "04-30"},
                      headers=auth_headers(admin))
    assert resp.status_code == 200
    assert resp.get_json() == {"max_days": 7, "expiry_mmdd": "04-30"}
    resp = client.get("/api/v1/leave/carry-policy", headers=auth_headers(admin))
    assert resp.get_json() == {"max_days": 7, "expiry_mmdd": "04-30"}


def test_rollover_http_roles_and_year_validation(client, session, team, leave_type):
    year = _year()
    _set_balance(session, team["employee"], leave_type, year - 1,
                 total=12, used=5)
    emp_token = login(client, "nv0002@hrm.local", "Employee@123")
    resp = client.post("/api/v1/leave/rollover", json={},
                       headers=auth_headers(emp_token))
    assert resp.status_code == 403

    admin = login(client, "admin@hrm.local", "Admin@123")
    resp = client.post("/api/v1/leave/rollover", json={"year": year},
                       headers=auth_headers(admin))
    assert resp.status_code == 400
    resp = client.post("/api/v1/leave/rollover", json={},
                       headers=auth_headers(admin))
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["fromYear"] == year - 1 and data["totalCarriedDays"] == 5
    # Chạy lần 2 qua HTTP cũng idempotent.
    resp = client.post("/api/v1/leave/rollover", json={},
                       headers=auth_headers(admin))
    assert resp.get_json()["totalCarriedDays"] == 0


def test_balance_dict_shows_carried(client, session, team, leave_type):
    year = _year()
    leave.update_carry_policy({"expiry_mmdd": "12-31"})
    _set_balance(session, team["employee"], leave_type, year - 1,
                 total=12, used=7)
    leave.rollover_leave(year - 1)  # carried 5
    _set_balance(session, team["employee"], leave_type, year,
                 total=12, used=2)
    token = login(client, "nv0002@hrm.local", "Employee@123")
    resp = client.get(f"/api/v1/leave/balance/me?year={year}",
                      headers=auth_headers(token))
    assert resp.status_code == 200
    row = resp.get_json()["data"][0]
    assert row["remaining_days"] == 10  # nghĩa cũ giữ nguyên: chỉ quota
    assert row["carried_days"] == 5
    assert row["carried_expires_on"] == date(year, 12, 31).isoformat()
    assert row["available_days"] == 15
