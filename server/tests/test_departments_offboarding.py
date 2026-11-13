"""Phòng ban (số nhân viên) + Offboarding (hoàn tất quy trình nghỉ việc).

Quy ước: test viết theo hành vi ĐÚNG mong muốn; FAIL = bug. Các test
đánh dấu [BUG] là những chỗ code hiện tại đã biết sai (audit) — chúng
phải FAIL cho tới khi được sửa, đừng "sửa test cho pass".
"""

from datetime import date

import pytest

from app.blueprints.departments import services as dept_services
from app.blueprints.offboarding import services as off_services
from app.extensions import db
from app.models import Contract, Department, Employee
from tests.conftest import (
    auth_headers,
    login,
    make_department,
    make_employee,
    make_user,
)


@pytest.fixture()
def hr_client(client, session):
    """HR user đã đăng nhập; trả (client, headers, hr_user)."""
    hr = make_user(session, "hr@hrm.local", "Hr@12345", "hr")
    token = login(client, "hr@hrm.local", "Hr@12345")
    return client, auth_headers(token), hr


# ---------------------------------------------------------------------------
# Số nhân viên của phòng ban — chỉ đếm người đang làm / đang nghỉ phép
# ---------------------------------------------------------------------------

class TestDepartmentEmployeeCount:
    def _dept_with_mixed_statuses(self, session):
        dept = make_department(session, name="Kỹ thuật")
        make_employee(session, code="NV0001", email="nv0001@hrm.local",
                      department_id=dept.id, status="working")
        make_employee(session, code="NV0002", email="nv0002@hrm.local",
                      department_id=dept.id, status="working")
        make_employee(session, code="NV0003", email="nv0003@hrm.local",
                      department_id=dept.id, status="on_leave")
        make_employee(session, code="NV0004", email="nv0004@hrm.local",
                      department_id=dept.id, status="resigned")
        return dept

    def test_employee_count_excludes_resigned_service(self, session):
        """[BUG] Số hiển thị phải là 3 (2 working + 1 on_leave), không
        tính người đã nghỉ."""
        dept = self._dept_with_mixed_statuses(session)
        assert dept_services.employee_count(dept.id) == 3

    def test_employee_counts_excludes_resigned_service(self, session):
        """[BUG] Bản GROUP BY dùng cho danh sách phòng ban cũng phải loại
        người đã nghỉ."""
        dept = self._dept_with_mixed_statuses(session)
        assert dept_services.employee_counts() == {dept.id: 3}

    def test_list_departments_shows_active_only(self, hr_client, session):
        """[BUG] GET /departments trả employee_count = 3, không phải 4."""
        client, headers, _ = hr_client
        dept = self._dept_with_mixed_statuses(session)
        resp = client.get("/api/v1/departments", headers=headers)
        assert resp.status_code == 200, resp.get_json()
        row = next(
            d for d in resp.get_json()["data"] if d["id"] == dept.id)
        assert row["employee_count"] == 3

    def test_get_department_shows_active_only(self, hr_client, session):
        """[BUG] GET /departments/<id> cũng phải loại người đã nghỉ."""
        client, headers, _ = hr_client
        dept = self._dept_with_mixed_statuses(session)
        resp = client.get(f"/api/v1/departments/{dept.id}", headers=headers)
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()["data"]["employee_count"] == 3


# ---------------------------------------------------------------------------
# Xóa phòng ban — guard phải chặn khi còn BẤT KỲ hồ sơ nhân viên nào
# (kể cả người đã nghỉ: guard này KHÔNG được đổi theo employee_count)
# ---------------------------------------------------------------------------

class TestDeleteDepartmentGuard:
    def test_delete_blocked_with_only_resigned_employee(
            self, hr_client, session):
        client, headers, _ = hr_client
        dept = make_department(session, name="Kỹ thuật")
        make_employee(session, code="NV0001", department_id=dept.id,
                      status="resigned")
        resp = client.delete(
            f"/api/v1/departments/{dept.id}", headers=headers)
        assert resp.status_code == 409, resp.get_json()
        assert resp.get_json()["error"]["code"] == "DEPARTMENT_HAS_EMPLOYEES"

    def test_delete_blocked_with_working_employee(self, hr_client, session):
        client, headers, _ = hr_client
        dept = make_department(session, name="Kỹ thuật")
        make_employee(session, code="NV0001", department_id=dept.id)
        resp = client.delete(
            f"/api/v1/departments/{dept.id}", headers=headers)
        assert resp.status_code == 409, resp.get_json()
        assert resp.get_json()["error"]["code"] == "DEPARTMENT_HAS_EMPLOYEES"

    def test_delete_empty_department_ok(self, hr_client, session):
        client, headers, _ = hr_client
        dept = make_department(session, name="Kỹ thuật")
        resp = client.delete(
            f"/api/v1/departments/{dept.id}", headers=headers)
        assert resp.status_code == 200, resp.get_json()
        assert db.session.get(Department, dept.id) is None


# ---------------------------------------------------------------------------
# Offboarding — hoàn tất phải dọn sạch liên kết quản lý + hợp đồng
# ---------------------------------------------------------------------------

@pytest.fixture()
def leaving_head(session):
    """Trưởng phòng sắp nghỉ + 1 cấp dưới + tài khoản đăng nhập của trưởng
    phòng. Trả (dept, head, report, head_user)."""
    head = make_employee(session, code="NV0001", full_name="Trưởng Phòng",
                         email="truong@hrm.local")
    dept = make_department(session, name="Kỹ thuật", manager_id=head.id)
    report = make_employee(session, code="NV0002", full_name="Cấp Dưới",
                           email="capduoi@hrm.local",
                           department_id=dept.id, manager_id=head.id)
    head_user = make_user(session, "truong@hrm.local", "Head@123",
                          "manager", employee=head)
    return dept, head, report, head_user


def _start_process(hr_user, head):
    return off_services.create_process(hr_user, {
        "employee_id": head.id,
        "last_working_day": date(2026, 12, 31),
        "reason": "Nghỉ việc",
    })


def _tick_all_tasks(hr_user, process):
    for task in list(process.tasks or []):
        off_services.update_task(hr_user, task.id, {"is_done": True})


class TestCompleteOffboardingCleanup:
    def test_complete_clears_department_manager(
            self, session, hr_client, leaving_head):
        """[BUG] Trưởng phòng nghỉ rồi thì phòng không còn trưởng phòng."""
        _, _, hr_user = hr_client
        dept, head, _, _ = leaving_head
        process = _start_process(hr_user, head)
        _tick_all_tasks(hr_user, process)
        off_services.complete_process(process.id)
        db.session.refresh(dept)
        assert dept.manager_id is None

    def test_complete_nulls_direct_reports_manager(
            self, session, hr_client, leaving_head):
        """[BUG] Cấp dưới không còn trỏ về người đã nghỉ."""
        _, _, hr_user = hr_client
        _, head, report, _ = leaving_head
        process = _start_process(hr_user, head)
        _tick_all_tasks(hr_user, process)
        off_services.complete_process(process.id)
        db.session.refresh(report)
        assert report.manager_id is None

    def test_complete_terminates_active_contract(
            self, session, hr_client, leaving_head):
        """[BUG] Hợp đồng đang active của người đã nghỉ phải chuyển sang
        terminated, không để hiển thị active mãi."""
        _, _, hr_user = hr_client
        _, head, _, _ = leaving_head
        process = _start_process(hr_user, head)
        _tick_all_tasks(hr_user, process)
        off_services.complete_process(process.id)
        contract = (
            session.query(Contract)
            .filter_by(employee_id=head.id)
            .order_by(Contract.id.desc()).first()
        )
        assert contract is not None
        assert contract.status == Contract.STATUS_TERMINATED

    def test_complete_still_resigns_and_locks_account(
            self, session, hr_client, leaving_head):
        """Hành vi đúng đã có: nhân viên -> resigned, tài khoản bị khóa."""
        _, _, hr_user = hr_client
        _, head, _, head_user = leaving_head
        process = _start_process(hr_user, head)
        _tick_all_tasks(hr_user, process)
        off_services.complete_process(process.id)
        db.session.refresh(head)
        db.session.refresh(head_user)
        assert head.status == Employee.STATUS_RESIGNED
        assert head_user.is_active is False

    def test_complete_via_http_cleans_up_too(
            self, session, hr_client, leaving_head):
        """[BUG] Toàn bộ luồng qua HTTP: tạo process -> tick hết task ->
        hoàn tất -> phòng hết trưởng phòng, cấp dưới hết quản lý, hợp
        đồng terminated."""
        client, headers, hr_user = hr_client
        dept, head, report, _ = leaving_head
        created = client.post(
            "/api/v1/offboarding",
            json={"employee_id": head.id,
                  "last_working_day": "2026-12-31"},
            headers=headers,
        )
        assert created.status_code == 201, created.get_json()
        process_id = created.get_json()["data"]["id"]
        for task in created.get_json()["data"]["tasks"]:
            ticked = client.patch(
                f"/api/v1/offboarding/tasks/{task['id']}",
                json={"is_done": True}, headers=headers,
            )
            assert ticked.status_code == 200, ticked.get_json()
        done = client.post(
            f"/api/v1/offboarding/{process_id}/complete", headers=headers)
        assert done.status_code == 200, done.get_json()
        db.session.refresh(dept)
        db.session.refresh(report)
        assert dept.manager_id is None
        assert report.manager_id is None
        contract = (
            session.query(Contract)
            .filter_by(employee_id=head.id)
            .order_by(Contract.id.desc()).first()
        )
        assert contract.status == Contract.STATUS_TERMINATED


# ---------------------------------------------------------------------------
# Hoàn tất khi task chưa xong -> 409
# ---------------------------------------------------------------------------

class TestCompleteOffboardingGuards:
    def test_complete_with_incomplete_tasks_409_service(
            self, session, hr_client, leaving_head):
        _, _, hr_user = hr_client
        _, head, _, _ = leaving_head
        process = _start_process(hr_user, head)
        with pytest.raises(off_services.ApiError) as exc:
            off_services.complete_process(process.id)
        assert exc.value.status_code == 409
        assert exc.value.code == "OFFBOARDING_TASKS_INCOMPLETE"

    def test_complete_with_incomplete_tasks_409_http(
            self, hr_client, leaving_head):
        client, headers, _ = hr_client
        _, head, _, _ = leaving_head
        created = client.post(
            "/api/v1/offboarding",
            json={"employee_id": head.id,
                  "last_working_day": "2026-12-31"},
            headers=headers,
        )
        assert created.status_code == 201, created.get_json()
        process_id = created.get_json()["data"]["id"]
        resp = client.post(
            f"/api/v1/offboarding/{process_id}/complete", headers=headers)
        assert resp.status_code == 409, resp.get_json()
        assert (
            resp.get_json()["error"]["code"]
            == "OFFBOARDING_TASKS_INCOMPLETE"
        )

    def test_complete_twice_409(self, session, hr_client, leaving_head):
        _, _, hr_user = hr_client
        _, head, _, _ = leaving_head
        process = _start_process(hr_user, head)
        _tick_all_tasks(hr_user, process)
        off_services.complete_process(process.id)
        with pytest.raises(off_services.ApiError) as exc:
            off_services.complete_process(process.id)
        assert exc.value.status_code == 409
        assert exc.value.code == "OFFBOARDING_ALREADY_COMPLETED"
