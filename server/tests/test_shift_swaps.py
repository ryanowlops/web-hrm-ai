"""Đổi ca làm việc: tạo đơn, duyệt hoán đổi ca gán, từ chối, hủy, phân quyền.

Quy ước: test viết theo hành vi ĐÚNG mong muốn; FAIL = bug.
- Ngày đổi ca phải từ hôm nay trở đi; một người chỉ có tối đa một đơn
  đang chờ duyệt cho cùng một ngày.
- Duyệt đơn hoán đổi ca gán (ShiftAssignment) của hai người ngày hôm đó:
  cả hai có ca -> đổi shift_id; chỉ một người có ca -> chuyển ca sang
  người còn lại; không ai có ca -> chỉ chốt đơn đã duyệt.
- Xem: admin/hr toàn công ty; manager thấy đơn liên quan phòng mình;
  employee thấy đơn mình tạo + đơn chọn mình làm người đổi ca.
"""

from datetime import date, time, timedelta

import pytest

from app.blueprints.shift_swaps import services as swaps
from app.extensions import db
from app.models.shift_swap import ShiftSwapRequest
from app.models.shifts import ShiftAssignment, ShiftDefinition
from tests.conftest import (
    auth_headers,
    login,
    make_department,
    make_employee,
    make_user,
)

FUTURE = date.today() + timedelta(days=5)
PAST = date.today() - timedelta(days=1)


def _shift_def(session, name, start, end):
    definition = ShiftDefinition(
        name=name, start_time=start, end_time=end, break_minutes=60
    )
    session.add(definition)
    session.commit()
    return definition


def _assign(session, employee_id, shift_id, work_date):
    assignment = ShiftAssignment(
        employee_id=employee_id, shift_id=shift_id, work_date=work_date
    )
    session.add(assignment)
    session.commit()
    return assignment


def _setup_pair(session, dept_name="Kỹ thuật"):
    """Hai nhân viên cùng phòng + tài khoản employee + 2 ca định nghĩa."""
    dept = make_department(session, name=dept_name)
    requester = make_employee(
        session, code="NV0001", full_name="Người Xin Đổi",
        email="a@hrm.local", department_id=dept.id,
    )
    target = make_employee(
        session, code="NV0002", full_name="Người Được Đổi",
        email="b@hrm.local", department_id=dept.id,
    )
    make_user(session, "a@hrm.local", "Employee@123", "employee",
              employee=requester)
    make_user(session, "b@hrm.local", "Employee@123", "employee",
              employee=target)
    morning = _shift_def(session, "Ca sáng", time(6, 0), time(14, 0))
    afternoon = _shift_def(session, "Ca chiều", time(14, 0), time(22, 0))
    return dept, requester, target, morning, afternoon


def _admin_token(client, session):
    from app.models import User

    if User.query.filter_by(email="admin@hrm.local").first() is None:
        make_user(session, "admin@hrm.local", "Admin@123", "admin")
    return login(client, "admin@hrm.local", "Admin@123")


def _create_payload(target_id, work_date=FUTURE, note=None):
    payload = {"target_id": target_id, "work_date": work_date.isoformat()}
    if note is not None:
        payload["note"] = note
    return payload


def _create_swap(client, token, target_id, work_date=FUTURE, note=None):
    return client.post(
        "/api/v1/shift-swaps",
        json=_create_payload(target_id, work_date, note),
        headers=auth_headers(token),
    )


# ---------------------------------------------------------------------------
# POST /shift-swaps — tạo đơn
# ---------------------------------------------------------------------------

class TestCreateSwap:
    def test_create_success(self, app, session, client):
        _, requester, target, _, _ = _setup_pair(session)
        token = login(client, "a@hrm.local", "Employee@123")
        resp = _create_swap(client, token, target.id, note="Bận việc gia đình")
        assert resp.status_code == 201, resp.get_json()
        data = resp.get_json()["data"]
        assert data["requesterId"] == requester.id
        assert data["requesterName"] == "Người Xin Đổi"
        assert data["targetId"] == target.id
        assert data["targetName"] == "Người Được Đổi"
        assert data["workDate"] == FUTURE.isoformat()
        assert data["status"] == "pending"
        assert data["note"] == "Bận việc gia đình"
        assert data["decidedBy"] is None

    def test_self_swap_400(self, app, session, client):
        _, requester, _, _, _ = _setup_pair(session)
        token = login(client, "a@hrm.local", "Employee@123")
        resp = _create_swap(client, token, requester.id)
        assert resp.status_code == 400, resp.get_json()

    def test_past_date_400(self, app, session, client):
        _, _, target, _, _ = _setup_pair(session)
        token = login(client, "a@hrm.local", "Employee@123")
        resp = _create_swap(client, token, target.id, work_date=PAST)
        assert resp.status_code == 400, resp.get_json()

    def test_duplicate_pending_409(self, app, session, client):
        _, _, target, _, _ = _setup_pair(session)
        other = make_employee(session, code="NV0003", full_name="Người Thứ Ba",
                              email="c@hrm.local")
        token = login(client, "a@hrm.local", "Employee@123")
        resp = _create_swap(client, token, target.id)
        assert resp.status_code == 201, resp.get_json()
        swap_id = resp.get_json()["data"]["id"]
        # Cùng người tạo, cùng ngày, khác người đổi ca -> vẫn 409.
        resp = _create_swap(client, token, other.id)
        assert resp.status_code == 409, resp.get_json()
        # Sau khi hủy đơn cũ thì tạo lại được.
        resp = client.post(f"/api/v1/shift-swaps/{swap_id}/cancel",
                           headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()
        resp = _create_swap(client, token, other.id)
        assert resp.status_code == 201, resp.get_json()

    def test_nonexistent_target_404(self, app, session, client):
        _setup_pair(session)
        token = login(client, "a@hrm.local", "Employee@123")
        resp = _create_swap(client, token, 999999)
        assert resp.status_code == 404, resp.get_json()

    def test_no_employee_profile_403(self, app, session, client):
        _, _, target, _, _ = _setup_pair(session)
        token = _admin_token(client, session)  # admin thuần hệ thống
        resp = _create_swap(client, token, target.id)
        assert resp.status_code == 403, resp.get_json()

    def test_validation_errors(self, app, session, client):
        _setup_pair(session)
        token = login(client, "a@hrm.local", "Employee@123")
        for body in (
            {"work_date": FUTURE.isoformat()},  # thiếu target_id
            {"target_id": 2},  # thiếu work_date
            {"target_id": 2, "work_date": "30-02-2026"},  # sai định dạng
            {"target_id": "2", "work_date": FUTURE.isoformat()},  # sai kiểu
        ):
            resp = client.post("/api/v1/shift-swaps", json=body,
                               headers=auth_headers(token))
            assert resp.status_code == 400, (body, resp.get_json())


# ---------------------------------------------------------------------------
# POST /shift-swaps/<id>/approve — duyệt + hoán đổi ca gán
# ---------------------------------------------------------------------------

class TestApproveSwap:
    def _pending(self, client, session):
        _, requester, target, morning, afternoon = _setup_pair(session)
        token = login(client, "a@hrm.local", "Employee@123")
        resp = _create_swap(client, token, target.id)
        assert resp.status_code == 201, resp.get_json()
        swap = ShiftSwapRequest.query.filter_by(
            requester_id=requester.id).first()
        return requester, target, morning, afternoon, swap

    def test_approve_swaps_both_assignments(self, app, session, client):
        requester, target, morning, afternoon, swap = self._pending(
            client, session)
        _assign(session, requester.id, morning.id, FUTURE)
        _assign(session, target.id, afternoon.id, FUTURE)
        token = _admin_token(client, session)
        resp = client.post(f"/api/v1/shift-swaps/{swap.id}/approve",
                           headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()["data"]["status"] == "approved"
        session.expire_all()
        req_asg = ShiftAssignment.query.filter_by(
            employee_id=requester.id, work_date=FUTURE).first()
        tgt_asg = ShiftAssignment.query.filter_by(
            employee_id=target.id, work_date=FUTURE).first()
        assert req_asg.shift_id == afternoon.id  # người tạo nhận ca chiều
        assert tgt_asg.shift_id == morning.id  # người đổi nhận ca sáng

    def test_approve_moves_assignment_when_only_requester_has_shift(
            self, app, session, client):
        requester, target, morning, _, swap = self._pending(client, session)
        _assign(session, requester.id, morning.id, FUTURE)
        token = _admin_token(client, session)
        resp = client.post(f"/api/v1/shift-swaps/{swap.id}/approve",
                           headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()
        session.expire_all()
        assert ShiftAssignment.query.filter_by(
            employee_id=requester.id, work_date=FUTURE).first() is None
        moved = ShiftAssignment.query.filter_by(
            employee_id=target.id, work_date=FUTURE).first()
        assert moved is not None and moved.shift_id == morning.id

    def test_approve_moves_assignment_when_only_target_has_shift(
            self, app, session, client):
        requester, target, _, afternoon, swap = self._pending(client, session)
        _assign(session, target.id, afternoon.id, FUTURE)
        token = _admin_token(client, session)
        resp = client.post(f"/api/v1/shift-swaps/{swap.id}/approve",
                           headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()
        session.expire_all()
        assert ShiftAssignment.query.filter_by(
            employee_id=target.id, work_date=FUTURE).first() is None
        moved = ShiftAssignment.query.filter_by(
            employee_id=requester.id, work_date=FUTURE).first()
        assert moved is not None and moved.shift_id == afternoon.id

    def test_approve_with_no_assignments_only_marks_approved(
            self, app, session, client):
        _, _, _, _, swap = self._pending(client, session)
        token = _admin_token(client, session)
        resp = client.post(f"/api/v1/shift-swaps/{swap.id}/approve",
                           headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()["data"]["status"] == "approved"
        assert ShiftAssignment.query.count() == 0

    def test_approve_by_employee_403(self, app, session, client):
        _, _, _, _, swap = self._pending(client, session)
        token = login(client, "b@hrm.local", "Employee@123")
        resp = client.post(f"/api/v1/shift-swaps/{swap.id}/approve",
                           headers=auth_headers(token))
        assert resp.status_code == 403, resp.get_json()

    def test_approve_by_other_department_manager_403(
            self, app, session, client):
        _, _, _, _, swap = self._pending(client, session)
        dept_b = make_department(session, name="Kinh doanh")
        mgr_emp = make_employee(session, code="NV0090", full_name="Quản lý B",
                                email="mgr@hrm.local",
                                department_id=dept_b.id)
        dept_b.manager_id = mgr_emp.id
        session.commit()
        make_user(session, "mgr@hrm.local", "Manager@123", "manager",
                  employee=mgr_emp)
        token = login(client, "mgr@hrm.local", "Manager@123")
        resp = client.post(f"/api/v1/shift-swaps/{swap.id}/approve",
                           headers=auth_headers(token))
        assert resp.status_code == 403, resp.get_json()

    def test_approve_by_own_department_manager_ok(
            self, app, session, client):
        dept, _, _, _, swap = self._pending(client, session)
        mgr_emp = make_employee(session, code="NV0090", full_name="Quản lý A",
                                email="mgr@hrm.local",
                                department_id=dept.id)
        dept.manager_id = mgr_emp.id
        session.commit()
        make_user(session, "mgr@hrm.local", "Manager@123", "manager",
                  employee=mgr_emp)
        token = login(client, "mgr@hrm.local", "Manager@123")
        resp = client.post(f"/api/v1/shift-swaps/{swap.id}/approve",
                           headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()

    def test_approve_non_pending_409(self, app, session, client):
        _, _, _, _, swap = self._pending(client, session)
        token = _admin_token(client, session)
        resp = client.post(f"/api/v1/shift-swaps/{swap.id}/approve",
                           headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()
        resp = client.post(f"/api/v1/shift-swaps/{swap.id}/approve",
                           headers=auth_headers(token))
        assert resp.status_code == 409, resp.get_json()

    def test_approve_unknown_swap_404(self, app, session, client):
        token = _admin_token(client, session)
        resp = client.post("/api/v1/shift-swaps/999999/approve",
                           headers=auth_headers(token))
        assert resp.status_code == 404, resp.get_json()


# ---------------------------------------------------------------------------
# POST /shift-swaps/<id>/reject + /cancel
# ---------------------------------------------------------------------------

class TestRejectCancel:
    def _pending(self, client, session):
        _, _, target, _, _ = _setup_pair(session)
        token = login(client, "a@hrm.local", "Employee@123")
        resp = _create_swap(client, token, target.id)
        assert resp.status_code == 201, resp.get_json()
        return ShiftSwapRequest.query.first()

    def test_reject(self, app, session, client):
        swap = self._pending(client, session)
        token = _admin_token(client, session)
        resp = client.post(
            f"/api/v1/shift-swaps/{swap.id}/reject",
            json={"note": "Không đủ người trực ca hôm đó"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200, resp.get_json()
        data = resp.get_json()["data"]
        assert data["status"] == "rejected"
        assert data["decidedBy"] is not None
        # Ghi chú từ chối không ghi đè ghi chú của người tạo đơn.
        session.expire_all()
        assert db.session.get(ShiftSwapRequest, swap.id).note is None

    def test_reject_non_pending_409(self, app, session, client):
        swap = self._pending(client, session)
        token = _admin_token(client, session)
        client.post(f"/api/v1/shift-swaps/{swap.id}/reject", json={},
                    headers=auth_headers(token))
        resp = client.post(f"/api/v1/shift-swaps/{swap.id}/reject", json={},
                           headers=auth_headers(token))
        assert resp.status_code == 409, resp.get_json()

    def test_cancel_by_requester(self, app, session, client):
        swap = self._pending(client, session)
        token = login(client, "a@hrm.local", "Employee@123")
        resp = client.post(f"/api/v1/shift-swaps/{swap.id}/cancel",
                           headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()["data"]["status"] == "cancelled"

    def test_cancel_by_non_requester_403(self, app, session, client):
        swap = self._pending(client, session)
        token = login(client, "b@hrm.local", "Employee@123")  # người được đổi
        resp = client.post(f"/api/v1/shift-swaps/{swap.id}/cancel",
                           headers=auth_headers(token))
        assert resp.status_code == 403, resp.get_json()

    def test_cancel_non_pending_409(self, app, session, client):
        swap = self._pending(client, session)
        admin = _admin_token(client, session)
        client.post(f"/api/v1/shift-swaps/{swap.id}/approve",
                    headers=auth_headers(admin))
        token = login(client, "a@hrm.local", "Employee@123")
        resp = client.post(f"/api/v1/shift-swaps/{swap.id}/cancel",
                           headers=auth_headers(token))
        assert resp.status_code == 409, resp.get_json()


# ---------------------------------------------------------------------------
# GET /shift-swaps — phân quyền xem + lọc
# ---------------------------------------------------------------------------

class TestListScoping:
    def _setup_three(self, session, client):
        dept = make_department(session, name="Kỹ thuật")
        a = make_employee(session, code="NV0001", full_name="Người A",
                          email="a@hrm.local", department_id=dept.id)
        b = make_employee(session, code="NV0002", full_name="Người B",
                          email="b@hrm.local", department_id=dept.id)
        c = make_employee(session, code="NV0003", full_name="Người C",
                          email="c@hrm.local", department_id=dept.id)
        for emp, email in ((a, "a@hrm.local"), (b, "b@hrm.local"),
                           (c, "c@hrm.local")):
            make_user(session, email, "Employee@123", "employee", employee=emp)
        token_a = login(client, "a@hrm.local", "Employee@123")
        resp = _create_swap(client, token_a, b.id)
        assert resp.status_code == 201, resp.get_json()
        return dept, a, b, c

    def test_employee_sees_own_and_targeted(self, app, session, client):
        self._setup_three(session, client)
        # A (người tạo) thấy đơn.
        token = login(client, "a@hrm.local", "Employee@123")
        resp = client.get("/api/v1/shift-swaps", headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()
        assert len(resp.get_json()["data"]) == 1
        # B (người được chọn đổi ca) cũng thấy đơn.
        token = login(client, "b@hrm.local", "Employee@123")
        resp = client.get("/api/v1/shift-swaps", headers=auth_headers(token))
        assert len(resp.get_json()["data"]) == 1
        # C (không liên quan) không thấy gì.
        token = login(client, "c@hrm.local", "Employee@123")
        resp = client.get("/api/v1/shift-swaps", headers=auth_headers(token))
        assert resp.get_json()["data"] == []

    def test_get_detail_out_of_scope_404(self, app, session, client):
        self._setup_three(session, client)
        swap = ShiftSwapRequest.query.first()
        token = login(client, "c@hrm.local", "Employee@123")
        resp = client.get(f"/api/v1/shift-swaps/{swap.id}",
                          headers=auth_headers(token))
        assert resp.status_code == 404, resp.get_json()
        # Người liên quan xem được chi tiết.
        token = login(client, "b@hrm.local", "Employee@123")
        resp = client.get(f"/api/v1/shift-swaps/{swap.id}",
                          headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()

    def test_status_filter_and_mine(self, app, session, client):
        self._setup_three(session, client)
        token = _admin_token(client, session)
        resp = client.get("/api/v1/shift-swaps?status=pending",
                          headers=auth_headers(token))
        assert len(resp.get_json()["data"]) == 1
        resp = client.get("/api/v1/shift-swaps?status=approved",
                          headers=auth_headers(token))
        assert resp.get_json()["data"] == []
        resp = client.get("/api/v1/shift-swaps?status=bogus",
                          headers=auth_headers(token))
        assert resp.status_code == 400, resp.get_json()
        # ?mine=1 của A chỉ lấy đơn A tạo.
        token = login(client, "a@hrm.local", "Employee@123")
        resp = client.get("/api/v1/shift-swaps?mine=1",
                          headers=auth_headers(token))
        assert len(resp.get_json()["data"]) == 1
        # ?mine=1 của B (chỉ là người được chọn) trả rỗng.
        token = login(client, "b@hrm.local", "Employee@123")
        resp = client.get("/api/v1/shift-swaps?mine=1",
                          headers=auth_headers(token))
        assert resp.get_json()["data"] == []

    def test_manager_sees_team_requests_only(self, app, session, client):
        dept, a, b, _ = self._setup_three(session, client)
        dept_b = make_department(session, name="Kinh doanh")
        d = make_employee(session, code="NV0004", full_name="Người D",
                          email="d@hrm.local", department_id=dept_b.id)
        e = make_employee(session, code="NV0005", full_name="Người E",
                          email="e@hrm.local", department_id=dept_b.id)
        make_user(session, "d@hrm.local", "Employee@123", "employee",
                  employee=d)
        token_d = login(client, "d@hrm.local", "Employee@123")
        _create_swap(client, token_d, e.id)
        mgr_emp = make_employee(session, code="NV0090", full_name="Quản lý A",
                                email="mgr@hrm.local",
                                department_id=dept.id)
        dept.manager_id = mgr_emp.id
        session.commit()
        make_user(session, "mgr@hrm.local", "Manager@123", "manager",
                  employee=mgr_emp)
        token = login(client, "mgr@hrm.local", "Manager@123")
        resp = client.get("/api/v1/shift-swaps", headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()
        codes = [row["requesterCode"] for row in resp.get_json()["data"]]
        assert codes == ["NV0001"]  # chỉ đơn của phòng Kỹ thuật
