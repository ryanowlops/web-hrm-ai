"""Check-in GPS validation: tọa độ NaN/Infinity/ngoài khoảng -> 400, không 500.

Kiểm chứng 2 tầng:
- Tầng schema trực tiếp: ScanSchema / CheckinConfigSchema .load(...) với
  NaN, Infinity, lat/lon ngoài khoảng.
- Tầng HTTP thật: POST /api/v1/checkin/scan với body JSON thô chứa
  NaN/Infinity (gửi dạng raw string vì json=... của test client cũng
  encode NaN thành literal NaN — phía server json.loads vẫn đọc ra
  float('nan')). Schema validate chạy TRƯỚC khi service kiểm tra token
  nên test dùng token giả vẫn phân biệt được 400 vs 500.
"""

from datetime import date

import pytest
from marshmallow import ValidationError

from app.blueprints.checkin.schemas import (
    CheckinConfigSchema,
    ScanSchema,
)
from tests.conftest import (
    auth_headers,
    login,
    make_employee,
    make_user,
)


@pytest.fixture()
def employee_user(session):
    emp = make_employee(session, code="NV0001", full_name="Trần Văn Minh",
                        email="nv0001@hrm.local")
    make_user(session, "nv0001@hrm.local", "Employee@123", "employee",
              employee=emp)
    return emp


def _scan_body(**overrides):
    body = {
        "date": date.today().isoformat(),
        "token": "khong-hop-le",
        "lat": 21.0285,
        "lon": 105.8542,
    }
    body.update(overrides)
    return body


# ---------------------------------------------------------------------------
# Tầng schema
# ---------------------------------------------------------------------------

class TestScanSchemaGps:
    def test_nan_lat_rejected(self):
        with pytest.raises(ValidationError):
            ScanSchema().load(_scan_body(lat=float("nan")))

    def test_nan_lon_rejected(self):
        with pytest.raises(ValidationError):
            ScanSchema().load(_scan_body(lon=float("nan")))

    def test_infinity_rejected(self):
        with pytest.raises(ValidationError):
            ScanSchema().load(_scan_body(lat=float("inf")))
        with pytest.raises(ValidationError):
            ScanSchema().load(_scan_body(lon=float("-inf")))

    def test_string_nan_and_infinity_rejected(self):
        with pytest.raises(ValidationError):
            ScanSchema().load(_scan_body(lat="NaN"))
        with pytest.raises(ValidationError):
            ScanSchema().load(_scan_body(lon="Infinity"))

    def test_out_of_range_rejected(self):
        for bad in (91, -91, 999, -999):
            with pytest.raises(ValidationError):
                ScanSchema().load(_scan_body(lat=bad))
        for bad in (181, -181, 999, -999):
            with pytest.raises(ValidationError):
                ScanSchema().load(_scan_body(lon=bad))

    def test_boundary_values_accepted(self):
        assert ScanSchema().load(_scan_body(lat=90, lon=180))["lat"] == 90
        assert ScanSchema().load(_scan_body(lat=-90, lon=-180))["lat"] == -90

    def test_valid_coords_accepted(self):
        data = ScanSchema().load(_scan_body())
        assert data["lat"] == 21.0285
        assert data["lon"] == 105.8542

    def test_missing_coords_accepted(self):
        # Luồng mã dự phòng 6 số không cần GPS.
        data = ScanSchema().load(_scan_body(lat=None, lon=None))
        assert data["lat"] is None
        assert data["lon"] is None


class TestConfigSchemaGps:
    def test_nan_rejected_in_config_too(self):
        # validate.Range trần để NaN lọt qua (mọi so sánh với NaN đều
        # False) nên config cũng phải chặn tường minh.
        with pytest.raises(ValidationError):
            CheckinConfigSchema().load(
                {"lat": float("nan"), "lon": 105.8542})
        with pytest.raises(ValidationError):
            CheckinConfigSchema().load(
                {"lat": 21.0285, "lon": float("inf")})

    def test_out_of_range_rejected_in_config(self):
        with pytest.raises(ValidationError):
            CheckinConfigSchema().load({"lat": 999, "lon": 105.8542})


# ---------------------------------------------------------------------------
# Tầng HTTP thật (POST /checkin/scan)
# ---------------------------------------------------------------------------

def _post_raw_scan(client, token, raw):
    return client.post(
        "/api/v1/checkin/scan",
        data=raw,
        content_type="application/json",
        headers=auth_headers(token),
    )


class TestScanEndpointGps:
    def test_nan_lat_returns_400_not_500(
            self, app, client, session, employee_user):
        token = login(client, "nv0001@hrm.local", "Employee@123")
        raw = ('{"date": "%s", "token": "x", "lat": NaN, "lon": 105.0}'
               % date.today().isoformat())
        resp = _post_raw_scan(client, token, raw)
        assert resp.status_code == 400, resp.get_json()
        assert resp.get_json()["error"]["code"] == "VALIDATION_ERROR"

    def test_infinity_lon_returns_400_not_500(
            self, app, client, session, employee_user):
        token = login(client, "nv0001@hrm.local", "Employee@123")
        raw = ('{"date": "%s", "token": "x", "lat": 21.0, "lon": Infinity}'
               % date.today().isoformat())
        resp = _post_raw_scan(client, token, raw)
        assert resp.status_code == 400, resp.get_json()
        assert resp.get_json()["error"]["code"] == "VALIDATION_ERROR"

    def test_out_of_range_lon_returns_400_not_500(
            self, app, client, session, employee_user):
        token = login(client, "nv0001@hrm.local", "Employee@123")
        resp = client.post(
            "/api/v1/checkin/scan",
            json={"date": date.today().isoformat(), "token": "x",
                  "lat": 21.0, "lon": 999},
            headers=auth_headers(token))
        assert resp.status_code == 400, resp.get_json()
        assert resp.get_json()["error"]["code"] == "VALIDATION_ERROR"

    def test_out_of_range_lat_returns_400_not_500(
            self, app, client, session, employee_user):
        token = login(client, "nv0001@hrm.local", "Employee@123")
        resp = client.post(
            "/api/v1/checkin/scan",
            json={"date": date.today().isoformat(), "token": "x",
                  "lat": 999, "lon": 105.0},
            headers=auth_headers(token))
        assert resp.status_code == 400, resp.get_json()
        assert resp.get_json()["error"]["code"] == "VALIDATION_ERROR"

    def test_valid_coords_pass_validation(
            self, app, client, session, employee_user):
        # Tọa độ hợp lệ phải qua được tầng validate — lỗi trả về là
        # INVALID_QR_CODE (token giả), không phải VALIDATION_ERROR.
        token = login(client, "nv0001@hrm.local", "Employee@123")
        resp = client.post(
            "/api/v1/checkin/scan",
            json={"date": date.today().isoformat(), "token": "x",
                  "lat": 21.0285, "lon": 105.8542},
            headers=auth_headers(token))
        assert resp.status_code != 400, resp.get_json()
        assert resp.get_json()["error"]["code"] == "INVALID_QR_CODE"
