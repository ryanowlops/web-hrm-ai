"""Nghỉ phép: đếm ngày, trùng đơn, số dư, máy trạng thái 2 cấp, hủy đơn.

Quy ước: test viết theo hành vi ĐÚNG mong muốn; FAIL = bug. Các test đánh
dấu [BUG] là những chỗ code hiện tại đã biết sai (audit) — chúng phải FAIL
cho tới khi được sửa, đừng "sửa test cho pass".
"""

from datetime import date

import pytest

from app.blueprints.leave import services as leave
from app.errors import ApiError
from app.models import LeaveBalance, LeaveRequest, LeaveType
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

def test_manager_cannot_approve_own_request(
        app, client, session, team, leave_type):
    """[BUG] Manager đang tự duyệt đơn nghỉ của chính mình ở vòng 1."""
    token = login(client, "nv0001@hrm.local", "Manager@123")
    headers = auth_headers(token)
    created = client.post("/api/v1/leave/requests", json={
        "leave_type_id": leave_type.id,
        "from_date": "2026-11-09", "to_date": "2026-11-10",
        "reason": "Nghi phep",
    }, headers=headers)
    assert created.status_code == 201, created.get_json()
    request_id = created.get_json()["id"]
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
    created = client.post("/api/v1/leave/requests", json={
        "leave_type_id": leave_type.id,
        "from_date": "2026-11-09", "to_date": "2026-11-10",
        "reason": "Nghi phep",
    }, headers=hr_headers)
    assert created.status_code == 201, created.get_json()
    request_id = created.get_json()["id"]
    mgr_token = login(client, "nv0001@hrm.local", "Manager@123")
    mgr_headers = auth_headers(mgr_token)
    mgr_resp = client.post(
        f"/api/v1/leave/requests/{request_id}/manager-decision",
        json={"decision": "approved", "note": ""}, headers=mgr_headers)
    assert mgr_resp.status_code == 200, mgr_resp.get_json()
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
