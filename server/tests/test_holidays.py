"""Lịch nghỉ lễ (Holiday Calendar) — CRUD + phân quyền + lọc theo năm.

Bảng holidays là bảng MỚI: conftest dùng db.create_all() trên DB test
trống — các test này đồng thời chứng minh bảng tự tạo được mà không cần
migration (nếu model không đăng ký vào metadata, test sẽ lỗi vì
"no such table: holidays").
"""

import pytest

from app.extensions import db
from app.models import Holiday
from tests.conftest import auth_headers, login, make_user


@pytest.fixture()
def admin_client(client, session):
    """Admin đã đăng nhập; trả (client, headers, admin_user)."""
    admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
    token = login(client, "admin@hrm.local", "Admin@123")
    return client, auth_headers(token), admin


@pytest.fixture()
def hr_client(client, session):
    """HR đã đăng nhập; trả (client, headers, hr_user)."""
    hr = make_user(session, "hr@hrm.local", "Hr@12345", "hr")
    token = login(client, "hr@hrm.local", "Hr@12345")
    return client, auth_headers(token), hr


@pytest.fixture()
def employee_client(client, session):
    """Nhân viên đã đăng nhập; trả (client, headers, employee_user)."""
    emp = make_user(session, "emp@hrm.local", "Employee@123", "employee")
    token = login(client, "emp@hrm.local", "Employee@123")
    return client, auth_headers(token), emp


def _create(client, headers, date="2026-01-01", name="Tết Dương lịch",
            **extra):
    payload = {"date": date, "name": name}
    payload.update(extra)
    return client.post("/api/v1/holidays", json=payload, headers=headers)


class TestHolidayTableAutoCreated:
    def test_table_exists_in_fresh_db(self, session):
        """Bảng mới phải được create_all tạo ra mà không cần migration."""
        assert Holiday.__table__.name == "holidays"
        row = Holiday(date=__import__("datetime").date(2026, 1, 1),
                      name="Tết Dương lịch")
        session.add(row)
        session.commit()
        assert db.session.query(Holiday).count() == 1

    def test_list_empty_on_fresh_db(self, admin_client):
        client, headers, _ = admin_client
        resp = client.get("/api/v1/holidays", headers=headers)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["data"] == []
        assert body["meta"]["totalItems"] == 0


class TestHolidayCreate:
    def test_admin_can_create(self, admin_client):
        client, headers, admin = admin_client
        resp = _create(client, headers)
        assert resp.status_code == 201, resp.get_json()
        data = resp.get_json()["data"]
        assert data["date"] == "2026-01-01"
        assert data["name"] == "Tết Dương lịch"
        assert data["isNational"] is True
        assert data["createdBy"] == admin.id

    def test_hr_can_create(self, hr_client):
        client, headers, _ = hr_client
        resp = _create(client, headers, date="2026-04-30",
                       name="Ngày Giải phóng miền Nam")
        assert resp.status_code == 201, resp.get_json()
        assert resp.get_json()["data"]["name"] == "Ngày Giải phóng miền Nam"

    def test_create_company_holiday_not_national(self, admin_client):
        client, headers, _ = admin_client
        resp = _create(client, headers, date="2026-11-14",
                       name="Sinh nhật công ty", is_national=False,
                       description="Kỷ niệm thành lập công ty.")
        assert resp.status_code == 201, resp.get_json()
        data = resp.get_json()["data"]
        assert data["isNational"] is False
        assert data["description"] == "Kỷ niệm thành lập công ty."

    def test_employee_create_forbidden(self, employee_client):
        client, headers, _ = employee_client
        resp = _create(client, headers)
        assert resp.status_code == 403

    def test_unauthenticated_create_unauthorized(self, client):
        resp = client.post("/api/v1/holidays",
                           json={"date": "2026-01-01", "name": "Tết"})
        assert resp.status_code == 401

    def test_duplicate_date_conflict(self, admin_client):
        client, headers, _ = admin_client
        assert _create(client, headers).status_code == 201
        resp = _create(client, headers, name="Tên khác cùng ngày")
        assert resp.status_code == 409
        assert resp.get_json()["error"]["code"] == "HOLIDAY_DATE_EXISTS"

    def test_invalid_date_rejected(self, admin_client):
        client, headers, _ = admin_client
        # 30/02 không tồn tại theo lịch.
        resp = _create(client, headers, date="2026-02-30")
        assert resp.status_code == 400
        # Sai định dạng.
        resp = _create(client, headers, date="01/01/2026")
        assert resp.status_code == 400

    def test_empty_name_rejected(self, admin_client):
        client, headers, _ = admin_client
        resp = _create(client, headers, name="   ")
        assert resp.status_code == 400
        resp = client.post("/api/v1/holidays", json={"date": "2026-01-01"},
                           headers=headers)
        assert resp.status_code == 400


class TestHolidayList:
    def _seed(self, admin_client):
        client, headers, _ = admin_client
        assert _create(client, headers, date="2026-01-01",
                       name="Tết Dương lịch").status_code == 201
        assert _create(client, headers, date="2026-04-30",
                       name="Giải phóng miền Nam").status_code == 201
        assert _create(client, headers, date="2027-01-01",
                       name="Tết Dương lịch 2027").status_code == 201
        return client, headers

    def test_filter_by_year(self, admin_client):
        client, headers = self._seed(admin_client)
        resp = client.get("/api/v1/holidays?year=2026", headers=headers)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["meta"]["totalItems"] == 2
        dates = [row["date"] for row in body["data"]]
        # Sắp xếp theo ngày tăng dần.
        assert dates == ["2026-01-01", "2026-04-30"]

    def test_filter_by_year_excludes_other_year(self, admin_client):
        client, headers = self._seed(admin_client)
        resp = client.get("/api/v1/holidays?year=2027", headers=headers)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["meta"]["totalItems"] == 1
        assert body["data"][0]["date"] == "2027-01-01"

    def test_no_year_returns_all(self, admin_client):
        client, headers = self._seed(admin_client)
        resp = client.get("/api/v1/holidays", headers=headers)
        assert resp.status_code == 200
        assert resp.get_json()["meta"]["totalItems"] == 3

    def test_invalid_year_rejected(self, admin_client):
        client, headers, _ = admin_client
        resp = client.get("/api/v1/holidays?year=abc", headers=headers)
        assert resp.status_code == 400

    def test_employee_can_view(self, admin_client, employee_client):
        self._seed(admin_client)
        client, headers, _ = employee_client
        resp = client.get("/api/v1/holidays?year=2026", headers=headers)
        assert resp.status_code == 200
        assert resp.get_json()["meta"]["totalItems"] == 2

    def test_unauthenticated_list_unauthorized(self, client):
        resp = client.get("/api/v1/holidays")
        assert resp.status_code == 401


class TestHolidayDelete:
    def test_admin_can_delete(self, admin_client):
        client, headers, _ = admin_client
        created = _create(client, headers)
        holiday_id = created.get_json()["data"]["id"]
        resp = client.delete(f"/api/v1/holidays/{holiday_id}", headers=headers)
        assert resp.status_code == 200
        assert resp.get_json()["data"]["deleted"] is True
        # Không còn trong danh sách.
        listed = client.get("/api/v1/holidays", headers=headers)
        assert listed.get_json()["meta"]["totalItems"] == 0

    def test_hr_can_delete(self, admin_client, hr_client):
        client_a, headers_a, _ = admin_client
        holiday_id = _create(client_a, headers_a).get_json()["data"]["id"]
        client, headers, _ = hr_client
        resp = client.delete(f"/api/v1/holidays/{holiday_id}", headers=headers)
        assert resp.status_code == 200

    def test_employee_delete_forbidden(self, admin_client, employee_client):
        client_a, headers_a, _ = admin_client
        holiday_id = _create(client_a, headers_a).get_json()["data"]["id"]
        client, headers, _ = employee_client
        resp = client.delete(f"/api/v1/holidays/{holiday_id}", headers=headers)
        assert resp.status_code == 403

    def test_delete_missing_returns_404(self, admin_client):
        client, headers, _ = admin_client
        resp = client.delete("/api/v1/holidays/9999", headers=headers)
        assert resp.status_code == 404
        assert resp.get_json()["error"]["code"] == "HOLIDAY_NOT_FOUND"
