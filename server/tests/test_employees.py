"""Nhân viên: chuyển trạng thái, xóa mềm, duy nhất mã/email, tham chiếu.

Quy ước: test viết theo hành vi ĐÚNG mong muốn; FAIL = bug. Trạng thái
"resigned" chỉ được đặt qua offboarding / xóa mềm — PATCH thẳng đã được
chặn (fix-high-7) nên các test đó phải PASS; các test khác kiểm tra luật
đã có từ trước (phải PASS, nếu FAIL là bug mới).
"""

import pytest

from app.blueprints.employees import services as emp_services
from app.extensions import db
from app.models import Department, Employee
from tests.conftest import (
    auth_headers,
    login,
    make_department,
    make_employee,
    make_user,
)


@pytest.fixture()
def hr_client(client, session):
    """HR user đã đăng nhập + headers; trả (client, headers)."""
    make_user(session, "hr@hrm.local", "Hr@12345", "hr")
    token = login(client, "hr@hrm.local", "Hr@12345")
    return client, auth_headers(token)


@pytest.fixture()
def employee_row(session):
    return make_employee(session, code="NV0001", full_name="Trần Văn Minh")


# ---------------------------------------------------------------------------
# PATCH status — chặn bypass offboarding (đã sửa, phải PASS)
# ---------------------------------------------------------------------------

class TestPatchStatusGuard:
    def test_patch_to_resigned_is_rejected_409(self, hr_client, employee_row):
        client, headers = hr_client
        resp = client.patch(
            f"/api/v1/employees/{employee_row.id}",
            json={"status": "resigned"}, headers=headers,
        )
        assert resp.status_code == 409, resp.get_json()
        assert (
            resp.get_json()["error"]["code"]
            == "EMPLOYEE_STATUS_TRANSITION_BLOCKED"
        )
        db.session.refresh(employee_row)
        assert employee_row.status == "working"

    def test_patch_resigned_to_working_is_rejected_409(self, hr_client, session):
        client, headers = hr_client
        emp = make_employee(session, code="NV0009", status="resigned")
        resp = client.patch(
            f"/api/v1/employees/{emp.id}",
            json={"status": "working"}, headers=headers,
        )
        assert resp.status_code == 409, resp.get_json()
        assert (
            resp.get_json()["error"]["code"]
            == "EMPLOYEE_STATUS_TRANSITION_BLOCKED"
        )
        db.session.refresh(emp)
        assert emp.status == "resigned"

    def test_patch_working_to_on_leave_stays_allowed(self, hr_client, employee_row):
        client, headers = hr_client
        resp = client.patch(
            f"/api/v1/employees/{employee_row.id}",
            json={"status": "on_leave"}, headers=headers,
        )
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()["data"]["status"] == "on_leave"

    def test_patch_on_leave_to_working_stays_allowed(self, hr_client, session):
        client, headers = hr_client
        emp = make_employee(session, code="NV0009", status="on_leave")
        resp = client.patch(
            f"/api/v1/employees/{emp.id}",
            json={"status": "working"}, headers=headers,
        )
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()["data"]["status"] == "working"

    def test_patch_same_status_is_noop_allowed(self, hr_client, session):
        client, headers = hr_client
        emp = make_employee(session, code="NV0009", status="resigned")
        resp = client.patch(
            f"/api/v1/employees/{emp.id}",
            json={"status": "resigned"}, headers=headers,
        )
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()["data"]["status"] == "resigned"

    def test_service_update_employee_blocks_resigned_too(
            self, session, employee_row):
        with pytest.raises(emp_services.ApiError) as exc:
            emp_services.update_employee(
                employee_row.id, {"status": "resigned"})
        assert exc.value.status == 409
        assert exc.value.code == "EMPLOYEE_STATUS_TRANSITION_BLOCKED"


# ---------------------------------------------------------------------------
# DELETE (xóa mềm) — chặn khi là trưởng phòng
# ---------------------------------------------------------------------------

class TestDeleteEmployee:
    def test_delete_department_manager_is_rejected_409(
            self, hr_client, session, employee_row):
        client, headers = hr_client
        make_department(session, name="Kỹ thuật", manager_id=employee_row.id)
        resp = client.delete(
            f"/api/v1/employees/{employee_row.id}", headers=headers)
        assert resp.status_code == 409, resp.get_json()
        assert (
            resp.get_json()["error"]["code"]
            == "EMPLOYEE_IS_DEPARTMENT_MANAGER"
        )
        db.session.refresh(employee_row)
        assert employee_row.status == "working"

    def test_delete_regular_employee_soft_deletes(
            self, hr_client, employee_row):
        client, headers = hr_client
        resp = client.delete(
            f"/api/v1/employees/{employee_row.id}", headers=headers)
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()["data"]["status"] == "resigned"


# ---------------------------------------------------------------------------
# Duy nhất mã / email
# ---------------------------------------------------------------------------

class TestUniqueness:
    def test_create_duplicate_code_409(self, hr_client, employee_row):
        client, headers = hr_client
        resp = client.post(
            "/api/v1/employees",
            json={"code": "NV0001", "full_name": "Người khác",
                  "email": "khac@hrm.local"},
            headers=headers,
        )
        assert resp.status_code == 409, resp.get_json()
        assert resp.get_json()["error"]["code"] == "EMPLOYEE_CODE_EXISTS"

    def test_create_duplicate_email_409(self, hr_client, employee_row):
        client, headers = hr_client
        resp = client.post(
            "/api/v1/employees",
            json={"code": "NV0002", "full_name": "Người khác",
                  "email": "nv0001@hrm.local"},
            headers=headers,
        )
        assert resp.status_code == 409, resp.get_json()
        assert resp.get_json()["error"]["code"] == "EMPLOYEE_EMAIL_EXISTS"

    def test_update_to_existing_code_409(self, hr_client, session, employee_row):
        client, headers = hr_client
        other = make_employee(session, code="NV0002", email="nv0002@hrm.local")
        resp = client.patch(
            f"/api/v1/employees/{other.id}",
            json={"code": "NV0001"}, headers=headers,
        )
        assert resp.status_code == 409, resp.get_json()
        assert resp.get_json()["error"]["code"] == "EMPLOYEE_CODE_EXISTS"

    def test_update_to_existing_email_409(self, hr_client, session, employee_row):
        client, headers = hr_client
        other = make_employee(session, code="NV0002", email="nv0002@hrm.local")
        resp = client.patch(
            f"/api/v1/employees/{other.id}",
            json={"email": "nv0001@hrm.local"}, headers=headers,
        )
        assert resp.status_code == 409, resp.get_json()
        assert resp.get_json()["error"]["code"] == "EMPLOYEE_EMAIL_EXISTS"

    def test_update_own_code_and_email_stays_allowed(
            self, hr_client, employee_row):
        client, headers = hr_client
        resp = client.patch(
            f"/api/v1/employees/{employee_row.id}",
            json={"code": "NV0001", "email": "nv0001@hrm.local"},
            headers=headers,
        )
        assert resp.status_code == 200, resp.get_json()


# ---------------------------------------------------------------------------
# Tham chiếu phải tồn tại (department / position / manager)
# ---------------------------------------------------------------------------

class TestReferences:
    def test_create_with_unknown_department_400(self, hr_client):
        client, headers = hr_client
        resp = client.post(
            "/api/v1/employees",
            json={"code": "NV0010", "full_name": "Người mới",
                  "email": "moi@hrm.local", "department_id": 9999},
            headers=headers,
        )
        assert resp.status_code == 400, resp.get_json()
        assert resp.get_json()["error"]["code"] == "VALIDATION_ERROR"

    def test_create_with_unknown_manager_400(self, hr_client):
        client, headers = hr_client
        resp = client.post(
            "/api/v1/employees",
            json={"code": "NV0010", "full_name": "Người mới",
                  "email": "moi@hrm.local", "manager_id": 9999},
            headers=headers,
        )
        assert resp.status_code == 400, resp.get_json()
        assert resp.get_json()["error"]["code"] == "VALIDATION_ERROR"

    def test_create_with_unknown_position_400(self, hr_client):
        client, headers = hr_client
        resp = client.post(
            "/api/v1/employees",
            json={"code": "NV0010", "full_name": "Người mới",
                  "email": "moi@hrm.local", "position_id": 9999},
            headers=headers,
        )
        assert resp.status_code == 400, resp.get_json()
        assert resp.get_json()["error"]["code"] == "VALIDATION_ERROR"

    def test_update_to_unknown_department_400(self, hr_client, employee_row):
        client, headers = hr_client
        resp = client.patch(
            f"/api/v1/employees/{employee_row.id}",
            json={"department_id": 9999}, headers=headers,
        )
        assert resp.status_code == 400, resp.get_json()
        assert resp.get_json()["error"]["code"] == "VALIDATION_ERROR"

    def test_update_to_unknown_manager_400(self, hr_client, employee_row):
        client, headers = hr_client
        resp = client.patch(
            f"/api/v1/employees/{employee_row.id}",
            json={"manager_id": 9999}, headers=headers,
        )
        assert resp.status_code == 400, resp.get_json()
        assert resp.get_json()["error"]["code"] == "VALIDATION_ERROR"
