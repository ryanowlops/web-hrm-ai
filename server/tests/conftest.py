"""Test harness cho HRM backend.

Chạy: cd server && .venv/bin/python -m pytest tests/ -q

Quy ước (xem docs cho chi tiết):
- App chạy với TestingConfig: SQLite in-memory, RATELIMIT tắt, JWT secret
  cố định cho test. Mỗi test function có DB trống riêng (create_all/drop_all
  theo function scope) — test không bao giờ chạm tới DB dev/prod.
- Test viết theo hành vi ĐÚNG mong muốn; test FAIL = bug (đúng mục đích của
  đợt rà soát này: tìm bug bằng test case), không phải test viết sai.
- Ưu tiên test ở tầng service trực tiếp (nhanh, không cần HTTP) cho logic
  thuần; dùng HTTP client cho luật phân quyền / validation / mã lỗi.
"""

import os

os.environ.setdefault("TEST_DATABASE_URL", "sqlite:///:memory:")

import pytest  # noqa: E402
from werkzeug.security import generate_password_hash  # noqa: E402

# Config gốc đặt pool_size/max_overflow cho Neon/Postgres; SQLite
# in-memory dùng StaticPool nên create_app("testing") sẽ nổ ngay ở
# db.init_app nếu không gỡ — gỡ ở class trước khi app được tạo.
from app.config import TestingConfig  # noqa: E402

TestingConfig.SQLALCHEMY_ENGINE_OPTIONS = {}

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models import Department, Employee, User  # noqa: E402
from flask.testing import FlaskClient  # noqa: E402


class _ClearingClient(FlaskClient):
    """Test client: mỗi request xóa user đã cache trong flask.g.

    guards.load_current_user cache user đầu tiên vào g.current_user; conftest
    giữ một app context cho cả test nên các request HTTP sau (dù mang token
    khác) bị xác thực nhầm thành user đó — từng làm test HR tự duyệt pass
    giả. Production không bị vì mỗi request có app context riêng. Xóa cache
    trước mỗi request để test đa-user luôn đúng.
    """

    def open(self, *args, **kwargs):
        from flask import g

        g.pop("current_user", None)
        return super().open(*args, **kwargs)


@pytest.fixture()
def app():
    application = create_app("testing")
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    app.test_client_class = _ClearingClient
    return app.test_client()


@pytest.fixture()
def session(app):
    return db.session


# ---------------------------------------------------------------------------
# Factories
# ---------------------------------------------------------------------------

def make_department(session, name="Kỹ thuật", manager_id=None):
    dept = Department(name=name, manager_id=manager_id)
    session.add(dept)
    session.commit()
    return dept


def make_employee(session, code="NV0001", full_name="Trần Văn Minh",
                  email="nv0001@hrm.local", department_id=None,
                  manager_id=None, status="working",
                  start_date=None, base_salary=12000000, allowance=1000000):
    from datetime import date

    employee = Employee(
        code=code,
        full_name=full_name,
        email=email,
        department_id=department_id,
        manager_id=manager_id,
        status=status,
        start_date=start_date or date(2024, 1, 15),
    )
    session.add(employee)
    session.commit()
    # Hợp đồng hiện hành (payroll cần contract để tính lương).
    from app.models import Contract

    contract = Contract(
        employee_id=employee.id,
        contract_type="chinh thuc",
        start_date=employee.start_date,
        end_date=None,
        base_salary=base_salary,
        allowance=allowance,
        status="active",
    )
    session.add(contract)
    session.commit()
    return employee


def make_user(session, email, password, role, employee=None, full_name=None):
    user = User(
        email=email,
        password_hash=generate_password_hash(password),
        role=role,
        full_name=full_name or (employee.full_name if employee is not None else email.split("@")[0]),
        employee_id=employee.id if employee is not None else None,
        is_active=True,
    )
    session.add(user)
    session.commit()
    return user


def login(client, email, password):
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 200, resp.get_json()
    return resp.get_json()["access_token"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}
