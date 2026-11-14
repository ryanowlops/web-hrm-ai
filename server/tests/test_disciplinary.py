"""Kỷ luật nhân viên: tạo, xem theo phạm vi, giải quyết.

Quy ước: test viết theo hành vi ĐÚNG mong muốn; FAIL = bug.
- Chỉ admin/hr được tạo và giải quyết biên bản; không có xóa.
- Phạm vi xem: admin/hr thấy tất cả, manager thấy phòng mình, employee
  chỉ thấy biên bản của chính mình.
- Import model ở đầu file để create_all() tạo bảng disciplinary_records
  trong DB test (model chưa đăng ký trong app.models).
"""

from datetime import date

from app.models.disciplinary import DisciplinaryRecord
from tests.conftest import (
    auth_headers,
    login,
    make_department,
    make_employee,
    make_user,
)

VALID_BODY = {
    "employee_id": None,  # điền ở từng test
    "type": "written",
    "severity": "medium",
    "title": "Đi muộn nhiều lần trong tháng",
    "description": "Đi muộn 5 lần trong tháng 11/2026.",
    "action_taken": "Nhắc nhở bằng văn bản, trừ điểm chuyên cần.",
}


def _admin_token(client, session):
    if make_user_exists(session, "admin@hrm.local") is None:
        make_user(session, "admin@hrm.local", "Admin@123", "admin")
    return login(client, "admin@hrm.local", "Admin@123")


def make_user_exists(session, email):
    from app.models import User

    return User.query.filter_by(email=email).first()


def _setup_scope(session):
    """2 phòng, mỗi phòng 1 nhân viên có biên bản; 1 manager phòng A."""
    dept_a = make_department(session, name="Kỹ thuật")
    dept_b = make_department(session, name="Kinh doanh")
    emp_a = make_employee(session, code="NV0001", full_name="Nguyễn Văn A",
                          email="a@hrm.local", department_id=dept_a.id)
    emp_b = make_employee(session, code="NV0002", full_name="Trần Thị B",
                          email="b@hrm.local", department_id=dept_b.id)
    mgr_emp = make_employee(session, code="NV0090", full_name="Quản lý A",
                            email="mgr@hrm.local", department_id=dept_a.id)
    dept_a.manager_id = mgr_emp.id
    session.commit()
    make_user(session, "mgr@hrm.local", "Manager@123", "manager",
              employee=mgr_emp)
    make_user(session, "a@hrm.local", "Employee@123", "employee",
              employee=emp_a)
    make_user(session, "b@hrm.local", "Employee@123", "employee",
              employee=emp_b)
    rec_a = DisciplinaryRecord(
        employee_id=emp_a.id, type="verbal", severity="low",
        title="Nhắc nhở đi muộn", issued_date=date(2026, 11, 10),
    )
    rec_b = DisciplinaryRecord(
        employee_id=emp_b.id, type="written", severity="high",
        title="Vi phạm quy trình bảo mật", issued_date=date(2026, 11, 11),
    )
    session.add_all([rec_a, rec_b])
    session.commit()
    return dept_a, dept_b, emp_a, emp_b, rec_a, rec_b


def _create_via_api(client, token, body):
    return client.post(
        "/api/v1/disciplinary", json=body, headers=auth_headers(token)
    )


class TestCreate:
    def test_create_ok(self, app, session, client):
        emp = make_employee(session, code="NV0001", full_name="Nguyễn Văn A",
                            email="a@hrm.local")
        token = _admin_token(client, session)
        body = dict(VALID_BODY, employee_id=emp.id)
        resp = _create_via_api(client, token, body)
        assert resp.status_code == 201, resp.get_json()
        data = resp.get_json()["data"]
        assert data["employeeId"] == emp.id
        assert data["employeeCode"] == "NV0001"
        assert data["employeeName"] == "Nguyễn Văn A"
        assert data["type"] == "written"
        assert data["severity"] == "medium"
        assert data["title"] == "Đi muộn nhiều lần trong tháng"
        assert data["status"] == "active"
        assert data["issuedDate"] == date.today().isoformat()
        assert data["issuedByName"] == "admin"

    def test_create_nonexistent_employee_404(self, app, session, client):
        token = _admin_token(client, session)
        resp = _create_via_api(
            client, token, dict(VALID_BODY, employee_id=999999)
        )
        assert resp.status_code == 404, resp.get_json()
        assert resp.get_json()["error"]["code"] == "EMPLOYEE_NOT_FOUND"

    def test_create_bad_type_400(self, app, session, client):
        emp = make_employee(session, code="NV0001", full_name="Nguyễn Văn A",
                            email="a@hrm.local")
        token = _admin_token(client, session)
        resp = _create_via_api(
            client, token, dict(VALID_BODY, employee_id=emp.id, type="fired")
        )
        assert resp.status_code == 400, resp.get_json()

    def test_create_bad_severity_400(self, app, session, client):
        emp = make_employee(session, code="NV0001", full_name="Nguyễn Văn A",
                            email="a@hrm.local")
        token = _admin_token(client, session)
        resp = _create_via_api(
            client, token,
            dict(VALID_BODY, employee_id=emp.id, severity="critical"),
        )
        assert resp.status_code == 400, resp.get_json()

    def test_create_empty_title_400(self, app, session, client):
        emp = make_employee(session, code="NV0001", full_name="Nguyễn Văn A",
                            email="a@hrm.local")
        token = _admin_token(client, session)
        resp = _create_via_api(
            client, token, dict(VALID_BODY, employee_id=emp.id, title="   ")
        )
        assert resp.status_code == 400, resp.get_json()

    def test_create_resigned_employee_400(self, app, session, client):
        emp = make_employee(session, code="NV0001", full_name="Đã Nghỉ",
                            email="a@hrm.local", status="resigned")
        token = _admin_token(client, session)
        resp = _create_via_api(client, token, dict(VALID_BODY, employee_id=emp.id))
        assert resp.status_code == 400, resp.get_json()
        assert resp.get_json()["error"]["code"] == "EMPLOYEE_NOT_ACTIVE"

    def test_employee_create_403(self, app, session, client):
        emp = make_employee(session, code="NV0001", full_name="Nguyễn Văn A",
                            email="a@hrm.local")
        make_user(session, "a@hrm.local", "Employee@123", "employee",
                  employee=emp)
        token = login(client, "a@hrm.local", "Employee@123")
        resp = _create_via_api(client, token, dict(VALID_BODY, employee_id=emp.id))
        assert resp.status_code == 403, resp.get_json()

    def test_hr_can_create(self, app, session, client):
        emp = make_employee(session, code="NV0001", full_name="Nguyễn Văn A",
                            email="a@hrm.local")
        make_user(session, "hr@hrm.local", "Hr@12345", "hr")
        token = login(client, "hr@hrm.local", "Hr@12345")
        resp = _create_via_api(client, token, dict(VALID_BODY, employee_id=emp.id))
        assert resp.status_code == 201, resp.get_json()


class TestListScope:
    def test_admin_sees_all(self, app, session, client):
        _setup_scope(session)
        token = _admin_token(client, session)
        resp = client.get("/api/v1/disciplinary", headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()
        data = resp.get_json()
        assert data["meta"]["totalItems"] == 2
        codes = [row["employeeCode"] for row in data["data"]]
        assert codes == ["NV0002", "NV0001"]  # ngày lập mới nhất trước

    def test_employee_sees_own_only(self, app, session, client):
        _, _, emp_a, _, _, _ = _setup_scope(session)
        token = login(client, "a@hrm.local", "Employee@123")
        resp = client.get("/api/v1/disciplinary", headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()
        data = resp.get_json()
        assert data["meta"]["totalItems"] == 1
        assert data["data"][0]["employeeId"] == emp_a.id

    def test_manager_sees_team_only(self, app, session, client):
        _setup_scope(session)
        token = login(client, "mgr@hrm.local", "Manager@123")
        resp = client.get("/api/v1/disciplinary", headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()
        data = resp.get_json()
        assert data["meta"]["totalItems"] == 1
        assert data["data"][0]["employeeCode"] == "NV0001"

    def test_list_filters(self, app, session, client):
        _, _, _, _, rec_a, rec_b = _setup_scope(session)
        token = _admin_token(client, session)
        resp = client.get("/api/v1/disciplinary?status=active",
                          headers=auth_headers(token))
        assert resp.get_json()["meta"]["totalItems"] == 2
        resp = client.get("/api/v1/disciplinary?severity=high",
                          headers=auth_headers(token))
        data = resp.get_json()
        assert data["meta"]["totalItems"] == 1
        assert data["data"][0]["id"] == rec_b.id
        resp = client.get(
            f"/api/v1/disciplinary?employee_id={rec_a.employee_id}",
            headers=auth_headers(token),
        )
        assert resp.get_json()["meta"]["totalItems"] == 1
        resp = client.get("/api/v1/disciplinary?status=nope",
                          headers=auth_headers(token))
        assert resp.status_code == 400, resp.get_json()


class TestGetOne:
    def test_get_ok(self, app, session, client):
        _, _, _, _, rec_a, _ = _setup_scope(session)
        token = _admin_token(client, session)
        resp = client.get(f"/api/v1/disciplinary/{rec_a.id}",
                          headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()["data"]["title"] == "Nhắc nhở đi muộn"

    def test_get_unknown_404(self, app, session, client):
        token = _admin_token(client, session)
        resp = client.get("/api/v1/disciplinary/999999",
                          headers=auth_headers(token))
        assert resp.status_code == 404, resp.get_json()

    def test_employee_get_other_record_404(self, app, session, client):
        _, _, _, _, _, rec_b = _setup_scope(session)
        token = login(client, "a@hrm.local", "Employee@123")
        resp = client.get(f"/api/v1/disciplinary/{rec_b.id}",
                          headers=auth_headers(token))
        assert resp.status_code == 404, resp.get_json()

    def test_manager_get_other_department_403(self, app, session, client):
        _, _, _, _, _, rec_b = _setup_scope(session)
        token = login(client, "mgr@hrm.local", "Manager@123")
        resp = client.get(f"/api/v1/disciplinary/{rec_b.id}",
                          headers=auth_headers(token))
        assert resp.status_code == 403, resp.get_json()


class TestResolve:
    def test_resolve_ok(self, app, session, client):
        _, _, _, _, rec_a, _ = _setup_scope(session)
        token = _admin_token(client, session)
        resp = client.post(
            f"/api/v1/disciplinary/{rec_a.id}/resolve",
            json={"resolved_note": "Đã cam kết không tái phạm."},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200, resp.get_json()
        data = resp.get_json()["data"]
        assert data["status"] == "resolved"
        assert data["resolvedNote"] == "Đã cam kết không tái phạm."
        session.expire_all()
        assert (
            session.get(DisciplinaryRecord, rec_a.id).status == "resolved"
        )

    def test_resolve_already_resolved_409(self, app, session, client):
        _, _, _, _, rec_a, _ = _setup_scope(session)
        token = _admin_token(client, session)
        url = f"/api/v1/disciplinary/{rec_a.id}/resolve"
        resp = client.post(url, json={"resolved_note": "Lần 1"},
                           headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()
        resp = client.post(url, json={"resolved_note": "Lần 2"},
                           headers=auth_headers(token))
        assert resp.status_code == 409, resp.get_json()
        assert resp.get_json()["error"]["code"] == "RECORD_ALREADY_RESOLVED"

    def test_employee_resolve_403(self, app, session, client):
        _, _, _, _, rec_a, _ = _setup_scope(session)
        token = login(client, "a@hrm.local", "Employee@123")
        resp = client.post(
            f"/api/v1/disciplinary/{rec_a.id}/resolve",
            json={"resolved_note": "Tự giải quyết"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 403, resp.get_json()
