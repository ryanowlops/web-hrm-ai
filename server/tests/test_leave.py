"""Nghỉ phép: đếm ngày, trùng đơn, số dư, máy trạng thái 2 cấp, hủy đơn.

Quy ước: test viết theo hành vi ĐÚNG mong muốn; FAIL = bug. Các test đánh
dấu [BUG] là những chỗ code hiện tại đã biết sai (audit) — chúng phải FAIL
cho tới khi được sửa, đừng "sửa test cho pass".
"""

from datetime import date, timedelta

import pytest

from app.blueprints.leave import services as leave
from app.errors import ApiError
from app.models import Attendance, LeaveBalance, LeaveRequest, LeaveType
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
    """Manager + 1 nhân viên trực thuộc + HR."""
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
    return {
        "dept": dept, "manager": manager, "employee": employee,
        "hr_emp": hr_emp, "manager_user": manager_user,
        "employee_user": employee_user, "hr_user": hr_user,
    }


def _create(session, employee, leave_type, from_day, to_day):
    return leave.create_leave_request(employee, {
        "leave_type_id": leave_type.id,
        "from_date": date(2026, 11, from_day),
        "to_date": date(2026, 11, to_day),
        "reason": "Nghi phep",
    })


def _approve_full(session, team, request):
    leave.manager_decision(team["manager"], request.id,
                           {"decision": "approved", "note": ""})
    return leave.hr_decision(request.id, {"decision": "approved", "note": ""})


def _balance(session, employee_id, leave_type_id, year=2026):
    return session.query(LeaveBalance).filter_by(
        employee_id=employee_id, leave_type_id=leave_type_id,
        year=year).first()


# ---------------------------------------------------------------------------
# count_workdays (thuần)
# ---------------------------------------------------------------------------

class TestCountWorkdays:
    def test_weekend_to_monday(self):
        # T6 6/11 -> T2 9/11: chỉ T6 + T2.
        assert leave.count_workdays(date(2026, 11, 6), date(2026, 11, 9)) == 2

    def test_weekend_only_is_zero(self):
        assert leave.count_workdays(date(2026, 11, 7), date(2026, 11, 8)) == 0

    def test_single_weekday(self):
        assert leave.count_workdays(date(2026, 11, 9), date(2026, 11, 9)) == 1

    def test_full_work_week(self):
        assert leave.count_workdays(date(2026, 11, 2), date(2026, 11, 6)) == 5


# ---------------------------------------------------------------------------
# Tạo đơn: validate + trùng + số dư
# ---------------------------------------------------------------------------

class TestCreateRequest:
    def test_overlap_rejected(self, app, session, team, leave_type):
        _create(session, team["employee"], leave_type, 9, 10)
        with pytest.raises(ApiError) as exc:
            _create(session, team["employee"], leave_type, 10, 11)
        assert exc.value.status_code == 409
        assert exc.value.code == "LEAVE_OVERLAP"

    def test_non_overlapping_ok(self, app, session, team, leave_type):
        _create(session, team["employee"], leave_type, 9, 10)
        second = _create(session, team["employee"], leave_type, 11, 12)
        assert second.status == "pending"
        assert second.days_count == 2

    def test_rejected_request_does_not_block(self, app, session, team,
                                             leave_type):
        req = _create(session, team["employee"], leave_type, 9, 10)
        leave.manager_decision(team["manager"], req.id,
                               {"decision": "rejected", "note": "Khong duyet"})
        second = _create(session, team["employee"], leave_type, 10, 11)
        assert second.status == "pending"

    def test_cancelled_request_does_not_block(self, app, session, team,
                                              leave_type):
        req = _create(session, team["employee"], leave_type, 9, 10)
        leave.cancel_request(team["employee"], req.id)
        second = _create(session, team["employee"], leave_type, 10, 11)
        assert second.status == "pending"

    def test_weekend_only_rejected(self, app, session, team, leave_type):
        with pytest.raises(ApiError) as exc:
            _create(session, team["employee"], leave_type, 7, 8)
        assert exc.value.status_code == 400
        assert exc.value.code == "VALIDATION_ERROR"

    def test_end_before_start_rejected(self, app, session, team, leave_type):
        with pytest.raises(ApiError) as exc:
            leave.create_leave_request(team["employee"], {
                "leave_type_id": leave_type.id,
                "from_date": date(2026, 11, 10),
                "to_date": date(2026, 11, 9),
                "reason": "Sai ngay",
            })
        assert exc.value.status_code == 400

    def test_insufficient_balance_at_creation(self, app, session, team,
                                              leave_type):
        # Hạn mức 12 ngày, xin 13 ngày làm việc (2-18/11) -> từ chối ngay.
        with pytest.raises(ApiError) as exc:
            _create(session, team["employee"], leave_type, 2, 18)
        assert exc.value.status_code == 400
        assert exc.value.code == "INSUFFICIENT_LEAVE_BALANCE"

    def test_days_count_is_workdays_only(self, app, session, team, leave_type):
        # T6 6/11 -> T2 9/11: 2 ngày làm việc, cuối tuần không tính.
        req = _create(session, team["employee"], leave_type, 6, 9)
        assert req.days_count == 2


# ---------------------------------------------------------------------------
# Máy trạng thái duyệt 2 cấp
# ---------------------------------------------------------------------------

class TestApprovalStateMachine:
    def test_pending_to_manager_approved_to_approved(
            self, app, session, team, leave_type):
        req = _create(session, team["employee"], leave_type, 9, 10)
        assert req.status == "pending"
        leave.manager_decision(team["manager"], req.id,
                               {"decision": "approved", "note": ""})
        assert req.status == "manager_approved"
        leave.hr_decision(req.id, {"decision": "approved", "note": ""})
        assert req.status == "approved"

    def test_hr_cannot_decide_pending(self, app, session, team, leave_type):
        req = _create(session, team["employee"], leave_type, 9, 10)
        with pytest.raises(ApiError) as exc:
            leave.hr_decision(req.id, {"decision": "approved", "note": ""})
        assert exc.value.status_code == 409
        assert exc.value.code == "INVALID_STATE"

    def test_manager_cannot_decide_twice(self, app, session, team, leave_type):
        req = _create(session, team["employee"], leave_type, 9, 10)
        leave.manager_decision(team["manager"], req.id,
                               {"decision": "approved", "note": ""})
        with pytest.raises(ApiError) as exc:
            leave.manager_decision(team["manager"], req.id,
                                   {"decision": "approved", "note": ""})
        assert exc.value.status_code == 409

    def test_manager_reject_is_terminal(self, app, session, team, leave_type):
        req = _create(session, team["employee"], leave_type, 9, 10)
        leave.manager_decision(team["manager"], req.id,
                               {"decision": "rejected", "note": "Khong duyet"})
        assert req.status == "rejected"
        with pytest.raises(ApiError) as exc:
            leave.hr_decision(req.id, {"decision": "approved", "note": ""})
        assert exc.value.status_code == 409

    def test_hr_reject_after_manager_approved(self, app, session, team,
                                              leave_type):
        req = _create(session, team["employee"], leave_type, 9, 10)
        leave.manager_decision(team["manager"], req.id,
                               {"decision": "approved", "note": ""})
        leave.hr_decision(req.id, {"decision": "rejected",
                                   "note": "Het phep dot nay"})
        assert req.status == "rejected"

    def test_reject_requires_note(self, app, session, team, leave_type):
        req = _create(session, team["employee"], leave_type, 9, 10)
        with pytest.raises(ApiError) as exc:
            leave.manager_decision(team["manager"], req.id,
                                   {"decision": "rejected", "note": ""})
        assert exc.value.status_code == 400

    def test_non_manager_cannot_decide(self, app, session, team, leave_type):
        outsider = make_employee(session, code="NV0009",
                                 full_name="Người Ngoài",
                                 email="nv0009@hrm.local")
        req = _create(session, team["employee"], leave_type, 9, 10)
        with pytest.raises(ApiError) as exc:
            leave.manager_decision(outsider, req.id,
                                   {"decision": "approved", "note": ""})
        assert exc.value.status_code == 403
        assert exc.value.code == "FORBIDDEN"


# ---------------------------------------------------------------------------
# Số dư phép
# ---------------------------------------------------------------------------

class TestBalance:
    def test_manager_approval_does_not_deduct(self, app, session, team,
                                              leave_type):
        req = _create(session, team["employee"], leave_type, 9, 10)
        leave.manager_decision(team["manager"], req.id,
                               {"decision": "approved", "note": ""})
        balance = _balance(session, team["employee"].id, leave_type.id)
        assert balance.used_days == 0

    def test_hr_approval_deducts(self, app, session, team, leave_type):
        req = _create(session, team["employee"], leave_type, 9, 10)
        _approve_full(session, team, req)
        balance = _balance(session, team["employee"].id, leave_type.id)
        assert balance.total_days == 12
        assert balance.used_days == 2

    def test_two_approvals_must_not_drive_balance_negative(
            self, app, session, team, leave_type):
        """[BUG] Hai đơn 8 ngày đều tạo được khi số dư còn 12 (trừ chỉ xảy
        ra lúc duyệt), nhưng duyệt cả hai sẽ làm số dư âm (16 > 12).
        Duyệt HR phải kiểm tra lại số dư trước khi trừ."""
        req1 = _create(session, team["employee"], leave_type, 2, 11)   # 8 ngày
        req2 = _create(session, team["employee"], leave_type, 16, 25)  # 8 ngày
        _approve_full(session, team, req1)
        with pytest.raises(ApiError) as exc:
            _approve_full(session, team, req2)
        assert exc.value.code == "INSUFFICIENT_LEAVE_BALANCE"
        balance = _balance(session, team["employee"].id, leave_type.id)
        assert balance.used_days <= balance.total_days


# ---------------------------------------------------------------------------
# Hủy đơn
# ---------------------------------------------------------------------------

class TestCancel:
    def test_cancel_pending_ok(self, app, session, team, leave_type):
        req = _create(session, team["employee"], leave_type, 9, 10)
        cancelled = leave.cancel_request(team["employee"], req.id)
        assert cancelled.status == "cancelled"

    def test_cancel_after_manager_approved_rejected(
            self, app, session, team, leave_type):
        req = _create(session, team["employee"], leave_type, 9, 10)
        leave.manager_decision(team["manager"], req.id,
                               {"decision": "approved", "note": ""})
        with pytest.raises(ApiError) as exc:
            leave.cancel_request(team["employee"], req.id)
        assert exc.value.status_code == 409
        assert exc.value.code == "INVALID_STATE"

    def test_cancel_by_non_owner_forbidden(self, app, session, team,
                                           leave_type):
        req = _create(session, team["employee"], leave_type, 9, 10)
        with pytest.raises(ApiError) as exc:
            leave.cancel_request(team["manager"], req.id)
        assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# Tự duyệt đơn của chính mình (HTTP — cần JWT identity)
# ---------------------------------------------------------------------------

def _clear_cached_user():
    """Xóa user đã cache trong flask.g.

    conftest giữ MỘT app context cho cả test nên mọi request HTTP của
    test đều dùng chung `g`; guards.load_current_user cache user đầu
    tiên vào g.current_user và các request sau (dù mang token khác)
    sẽ bị xác thực nhầm thành user đó. Phải xóa cache trước mỗi
    request làm với một user khác.
    """
    from flask import g
    g.pop("current_user", None)


def test_manager_cannot_approve_own_request(
        app, client, session, team, leave_type):
    """[BUG] Manager đang tự duyệt đơn nghỉ của chính mình ở vòng 1."""
    token = login(client, "nv0001@hrm.local", "Manager@123")
    headers = auth_headers(token)
    _clear_cached_user()
    created = client.post("/api/v1/leave/requests", json={
        "leave_type_id": leave_type.id,
        "from_date": "2026-11-09", "to_date": "2026-11-10",
        "reason": "Nghi phep",
    }, headers=headers)
    assert created.status_code == 201, created.get_json()
    request_id = created.get_json()["id"]
    _clear_cached_user()
    resp = client.post(
        f"/api/v1/leave/requests/{request_id}/manager-decision",
        json={"decision": "approved", "note": ""}, headers=headers)
    assert resp.status_code in (403, 409), resp.get_json()


def test_hr_cannot_approve_own_request(app, client, session, team, leave_type):
    """[BUG] HR đang tự duyệt đơn nghỉ của chính mình ở vòng cuối
    (hr_decision không nhận actor nên không có kiểm tra nào)."""
    # HR (NV0003) xin nghỉ; manager của HR là NV0001 (trưởng phòng).
    team["hr_emp"].manager_id = team["manager"].id
    session.commit()
    hr_token = login(client, "nv0003@hrm.local", "Hr@12345")
    hr_headers = auth_headers(hr_token)
    _clear_cached_user()
    created = client.post("/api/v1/leave/requests", json={
        "leave_type_id": leave_type.id,
        "from_date": "2026-11-09", "to_date": "2026-11-10",
        "reason": "Nghi phep",
    }, headers=hr_headers)
    assert created.status_code == 201, created.get_json()
    request_id = created.get_json()["id"]
    mgr_token = login(client, "nv0001@hrm.local", "Manager@123")
    mgr_headers = auth_headers(mgr_token)
    _clear_cached_user()
    mgr_resp = client.post(
        f"/api/v1/leave/requests/{request_id}/manager-decision",
        json={"decision": "approved", "note": ""}, headers=mgr_headers)
    assert mgr_resp.status_code == 200, mgr_resp.get_json()
    _clear_cached_user()
    resp = client.post(
        f"/api/v1/leave/requests/{request_id}/hr-decision",
        json={"decision": "approved", "note": ""}, headers=hr_headers)
    assert resp.status_code in (403, 409), resp.get_json()


# ---------------------------------------------------------------------------
# Lịch nghỉ đã duyệt
# ---------------------------------------------------------------------------

def test_calendar_only_approved(app, session, team, leave_type):
    pending = _create(session, team["employee"], leave_type, 9, 10)
    approved = _create(session, team["employee"], leave_type, 16, 17)
    _approve_full(session, team, approved)
    hr_user = team["hr_user"]
    items = leave.get_calendar(hr_user, team["hr_emp"], "2026-11")
    ids = [r.id for r in items]
    assert approved.id in ids
    assert pending.id not in ids


# ---------------------------------------------------------------------------
# Duyệt đơn -> đồng bộ bảng chấm công
# ---------------------------------------------------------------------------

def _attendance(session, employee_id, work_date):
    return session.query(Attendance).filter_by(
        employee_id=employee_id, work_date=work_date).first()


def _set_attendance(session, employee_id, work_date, status):
    record = Attendance(employee_id=employee_id, work_date=work_date,
                        status=status)
    session.add(record)
    session.commit()
    return record


class TestApprovalSyncsAttendance:
    def test_approval_creates_on_leave_records(
            self, app, session, team, leave_type):
        req = _create(session, team["employee"], leave_type, 16, 17)
        _approve_full(session, team, req)
        assert _attendance(session, team["employee"].id,
                           date(2026, 11, 16)).status == "on_leave"
        assert _attendance(session, team["employee"].id,
                           date(2026, 11, 17)).status == "on_leave"

    def test_approval_converts_absent_to_on_leave(
            self, app, session, team, leave_type):
        _set_attendance(session, team["employee"].id, date(2026, 11, 16),
                        "absent")
        req = _create(session, team["employee"], leave_type, 16, 17)
        _approve_full(session, team, req)
        assert _attendance(session, team["employee"].id,
                           date(2026, 11, 16)).status == "on_leave"
        assert _attendance(session, team["employee"].id,
                           date(2026, 11, 17)).status == "on_leave"

    def test_approval_keeps_present_record(
            self, app, session, team, leave_type):
        _set_attendance(session, team["employee"].id, date(2026, 11, 16),
                        "present")
        req = _create(session, team["employee"], leave_type, 16, 17)
        _approve_full(session, team, req)
        assert _attendance(session, team["employee"].id,
                           date(2026, 11, 16)).status == "present"
        assert _attendance(session, team["employee"].id,
                           date(2026, 11, 17)).status == "on_leave"

    def test_approval_skips_weekend(
            self, app, session, team, leave_type):
        # T6 6/11 -> T2 9/11: chỉ T6 + T2 thành on_leave, cuối tuần
        # không tạo record.
        req = _create(session, team["employee"], leave_type, 6, 9)
        _approve_full(session, team, req)
        assert _attendance(session, team["employee"].id,
                           date(2026, 11, 6)).status == "on_leave"
        assert _attendance(session, team["employee"].id,
                           date(2026, 11, 9)).status == "on_leave"
        assert _attendance(session, team["employee"].id,
                           date(2026, 11, 7)) is None
        assert _attendance(session, team["employee"].id,
                           date(2026, 11, 8)) is None


# ---------------------------------------------------------------------------
# Hủy đơn đã duyệt (chỉ HR/Admin)
# ---------------------------------------------------------------------------

def _future_workweek():
    """Thứ 2 -> Thứ 6 của tuần tới (luôn toàn ngày tương lai)."""
    d = date.today() + timedelta(days=1)
    while d.weekday() != 0:
        d += timedelta(days=1)
    return d, d + timedelta(days=4)


def _past_workweek():
    """Thứ 2 -> Thứ 6 của tuần trước (luôn toàn ngày quá khứ)."""
    d = date.today() - timedelta(days=1)
    while d.weekday() != 0:
        d -= timedelta(days=1)
    return d, d + timedelta(days=4)


def _create_range(session, employee, leave_type, from_date, to_date):
    return leave.create_leave_request(employee, {
        "leave_type_id": leave_type.id,
        "from_date": from_date,
        "to_date": to_date,
        "reason": "Nghi phep",
    })


def _on_leave_days(session, employee_id, from_date, to_date):
    return [
        r.work_date for r in session.query(Attendance).filter(
            Attendance.employee_id == employee_id,
            Attendance.work_date >= from_date,
            Attendance.work_date <= to_date,
            Attendance.status == "on_leave",
        ).all()
    ]


class TestCancelApproved:
    def test_cancel_future_only_refunds_all_and_deletes_on_leave(
            self, app, session, team, leave_type):
        mon, fri = _future_workweek()
        req = _create_range(session, team["employee"], leave_type, mon, fri)
        assert req.days_count == 5
        _approve_full(session, team, req)
        assert _balance(session, team["employee"].id,
                        leave_type.id).used_days == 5
        assert len(_on_leave_days(session, team["employee"].id,
                                  mon, fri)) == 5
        cancelled = leave.cancel_approved_leave(req.id)
        assert cancelled.status == "cancelled"
        assert _balance(session, team["employee"].id,
                        leave_type.id).used_days == 0
        assert _on_leave_days(session, team["employee"].id, mon, fri) == []

    def test_cancel_mixed_keeps_past_refunds_future(
            self, app, session, team, leave_type):
        past_mon, _ = _past_workweek()
        fut_mon, _ = _future_workweek()
        from_date = past_mon + timedelta(days=3)   # Thứ 5 tuần trước
        to_date = fut_mon + timedelta(days=2)      # Thứ 4 tuần tới
        req = _create_range(session, team["employee"], leave_type,
                            from_date, to_date)
        # Ngày làm việc: T5+T6 tuần trước (2, quá khứ)
        # + T2+T3+T4 tuần tới (3, tương lai).
        assert req.days_count == 5
        _approve_full(session, team, req)
        assert _balance(session, team["employee"].id,
                        leave_type.id).used_days == 5
        cancelled = leave.cancel_approved_leave(req.id)
        assert cancelled.status == "cancelled"
        # Chỉ hoàn 3 ngày tương lai; 2 ngày quá khứ vẫn trừ phép.
        assert _balance(session, team["employee"].id,
                        leave_type.id).used_days == 2
        # on_leave tương lai bị xóa, on_leave quá khứ giữ nguyên.
        past_days = _on_leave_days(session, team["employee"].id,
                                   from_date, past_mon + timedelta(days=4))
        future_days = _on_leave_days(session, team["employee"].id,
                                     fut_mon, to_date)
        assert len(past_days) == 2
        assert future_days == []

    def test_cancel_approved_requires_approved_status(
            self, app, session, team, leave_type):
        req = _create(session, team["employee"], leave_type, 9, 10)
        with pytest.raises(ApiError) as exc:
            leave.cancel_approved_leave(req.id)
        assert exc.value.status_code == 409
        assert exc.value.code == "INVALID_STATE"

    def test_cancel_approved_by_non_hr_forbidden_at_service(
            self, app, session, team, leave_type):
        mon, fri = _future_workweek()
        req = _create_range(session, team["employee"], leave_type, mon, fri)
        _approve_full(session, team, req)
        with pytest.raises(ApiError) as exc:
            leave.cancel_approved_leave(req.id,
                                        actor_user=team["employee_user"])
        assert exc.value.status_code == 403
        assert exc.value.code == "FORBIDDEN"


def test_employee_cannot_cancel_approved_via_http(
        app, client, session, team, leave_type):
    mon, fri = _future_workweek()
    req = _create_range(session, team["employee"], leave_type, mon, fri)
    _approve_full(session, team, req)
    token = login(client, "nv0002@hrm.local", "Employee@123")
    resp = client.post(
        f"/api/v1/leave/requests/{req.id}/cancel-approved",
        headers=auth_headers(token))
    assert resp.status_code == 403, resp.get_json()


def test_hr_can_cancel_approved_via_http(
        app, client, session, team, leave_type):
    mon, fri = _future_workweek()
    req = _create_range(session, team["employee"], leave_type, mon, fri)
    _approve_full(session, team, req)
    token = login(client, "nv0003@hrm.local", "Hr@12345")
    resp = client.post(
        f"/api/v1/leave/requests/{req.id}/cancel-approved",
        headers=auth_headers(token))
    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()["status"] == "cancelled"
    assert _balance(session, team["employee"].id,
                    leave_type.id).used_days == 0


def test_employee_cancel_approved_via_old_route_still_blocked(
        app, client, session, team, leave_type):
    """Đơn đã duyệt vẫn không hủy được qua route /cancel cũ của nhân viên."""
    mon, fri = _future_workweek()
    req = _create_range(session, team["employee"], leave_type, mon, fri)
    _approve_full(session, team, req)
    token = login(client, "nv0002@hrm.local", "Employee@123")
    resp = client.post(
        f"/api/v1/leave/requests/{req.id}/cancel",
        headers=auth_headers(token))
    assert resp.status_code == 409, resp.get_json()
    assert resp.get_json()["error"]["code"] == "INVALID_STATE"


# ---------------------------------------------------------------------------
# Lịch nghỉ lễ nối vào tính ngày phép (count_workdays / _workdays)
# ---------------------------------------------------------------------------

def _add_holiday(session, day, name="Tết Dương lịch"):
    from app.models import Holiday
    holiday = Holiday(date=day, name=name)
    session.add(holiday)
    session.commit()
    return holiday


def test_count_workdays_excludes_holiday(session):
    # Thứ 2 05/01/2026 - Thứ 6 09/01/2026 = 5 ngày làm việc; đặt lễ vào Thứ 4.
    assert leave.count_workdays(date(2026, 1, 5), date(2026, 1, 9)) == 5
    _add_holiday(session, date(2026, 1, 7))
    assert leave.count_workdays(date(2026, 1, 5), date(2026, 1, 9)) == 4
    assert list(leave._workdays(date(2026, 1, 5), date(2026, 1, 9))) == [
        date(2026, 1, 5), date(2026, 1, 6),
        date(2026, 1, 8), date(2026, 1, 9),
    ]


def test_approve_over_holiday_skips_on_leave_for_holiday(session, team, leave_type):
    _add_holiday(session, date(2026, 1, 7))
    # Đơn nghỉ Thứ 2 05/01 - Thứ 6 09/01/2026: 5 ngày làm việc trừ 1 ngày lễ = 4.
    req = leave.create_leave_request(team["employee"], {
        "leave_type_id": leave_type.id,
        "from_date": date(2026, 1, 5), "to_date": date(2026, 1, 9),
        "reason": "Nghỉ Tết",
    })
    assert req.days_count == 4
    _approve_full(session, team, req)
    rows = (Attendance.query.filter_by(employee_id=team["employee"].id)
            .order_by(Attendance.work_date).all())
    assert [(r.work_date, r.status) for r in rows] == [
        (date(2026, 1, 5), "on_leave"),
        (date(2026, 1, 6), "on_leave"),
        (date(2026, 1, 8), "on_leave"),
        (date(2026, 1, 9), "on_leave"),
    ], "ngày lễ 07/01 không được tạo bản ghi on_leave"
