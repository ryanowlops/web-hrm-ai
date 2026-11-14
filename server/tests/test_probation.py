"""Quản lý thử việc: danh sách, đánh giá pass/fail/extend, lương 85%.

Quy ước: test viết theo hành vi ĐÚNG mong muốn; FAIL = bug.
- Nhận diện "thử việc": chuẩn hóa contract_type (bỏ dấu, lowercase,
  gọn khoảng trắng) rồi so với "thu viec".
- Lương thử việc = 85% lương chính thức (Điều 27 BLLĐ 2019), tính trên
  lương ngày công + lương giờ OT; item.base_salary vẫn là lương chính thức.
- Tháng 11/2026 có 21 ngày công chuẩn; lương giờ hợp đồng 12tr =
  12.000.000/21/8 = 71.428,571đ (thử việc: 60.714,286đ).
"""

from datetime import date, timedelta

import pytest

from app.blueprints.payroll import services as pay
from app.blueprints.probation import services as prob
from app.extensions import db
from app.models import Contract, Employee, Notification, ProbationEvaluation
from tests.conftest import auth_headers, login, make_department, make_employee, make_user
from tests.test_payroll import NOV_2026_WEEKDAYS, _nov_period, _present
from tests.test_payroll_overtime import _item, _ot


def _set_contract(session, employee_id, contract_type="Thử việc",
                  start=date(2026, 10, 1), end=date(2026, 11, 30),
                  base=12000000, allowance=1000000, status="active"):
    """Đổi hợp đồng mặc định mà make_employee tạo thành hợp đồng cần test."""
    contract = Contract.query.filter_by(employee_id=employee_id).first()
    contract.contract_type = contract_type
    contract.start_date = start
    contract.end_date = end
    contract.base_salary = base
    contract.allowance = allowance
    contract.status = status
    session.commit()
    return contract


def _add_contract(session, employee_id, contract_type, start, end,
                  base=12000000, allowance=1000000, status="active"):
    contract = Contract(
        employee_id=employee_id, contract_type=contract_type,
        start_date=start, end_date=end,
        base_salary=base, allowance=allowance, status=status,
    )
    session.add(contract)
    session.commit()
    return contract


def _probation_emp(session, code, name, email, department_id=None, **kwargs):
    emp = make_employee(session, code=code, full_name=name, email=email,
                        department_id=department_id)
    _set_contract(session, emp.id, **kwargs)
    return emp


def _admin_token(client, session):
    from app.models import User

    if User.query.filter_by(email="admin@hrm.local").first() is None:
        make_user(session, "admin@hrm.local", "Admin@123", "admin")
    return login(client, "admin@hrm.local", "Admin@123")


# ---------------------------------------------------------------------------
# Nhận diện hợp đồng thử việc
# ---------------------------------------------------------------------------

class TestIsProbationContract:
    def test_variants(self):
        assert prob.is_probation_contract(Contract(contract_type="Thử việc"))
        assert prob.is_probation_contract(Contract(contract_type="THỬ VIỆC"))
        assert prob.is_probation_contract(Contract(contract_type="thu viec"))
        assert prob.is_probation_contract(Contract(contract_type="  Thử   việc  "))
        assert not prob.is_probation_contract(
            Contract(contract_type="Không xác định thời hạn")
        )
        assert not prob.is_probation_contract(Contract(contract_type="Chính thức"))
        assert not prob.is_probation_contract(Contract(contract_type=""))
        assert not prob.is_probation_contract(Contract(contract_type=None))
        assert not prob.is_probation_contract(None)


# ---------------------------------------------------------------------------
# GET /probation + /probation/summary
# ---------------------------------------------------------------------------

class TestListProbation:
    def _setup_list(self, session):
        dept = make_department(session, name="Kỹ thuật")
        a = _probation_emp(session, "NV0001", "Nguyễn Thử Việc",
                           "a@hrm.local", department_id=dept.id,
                           end=date.today() + timedelta(days=10))
        b = make_employee(session, code="NV0002", full_name="Chính Thức",
                          email="b@hrm.local", department_id=dept.id)
        c = _probation_emp(session, "NV0003", "Đã Chấm Dứt",
                           "c@hrm.local", department_id=dept.id,
                           end=date.today() + timedelta(days=10),
                           status="terminated")
        d = _probation_emp(session, "NV0004", "Đã Nghỉ Việc",
                           "d@hrm.local", department_id=dept.id,
                           end=date.today() + timedelta(days=10))
        d.status = "resigned"
        session.commit()
        e = _probation_emp(session, "NV0005", "Không Thời Hạn",
                           "e@hrm.local", department_id=dept.id, end=None)
        return dept, a, b, c, d, e

    def test_list_only_active_probation(self, app, session, client):
        self._setup_list(session)
        token = _admin_token(client, session)
        resp = client.get("/api/v1/probation", headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()
        data = resp.get_json()["data"]
        codes = [row["employeeCode"] for row in data]
        assert codes == ["NV0001", "NV0005"]  # sắp hết hạn trước, null cuối
        first = data[0]
        assert first["daysRemaining"] == 10
        assert first["contractType"] == "Thử việc"
        assert first["latestEvaluation"] is None
        assert data[1]["daysRemaining"] is None

    def test_summary_counts(self, app, session, client):
        dept = make_department(session, name="Kỹ thuật")
        _probation_emp(session, "NV0001", "Sắp Hết", "a@hrm.local",
                       department_id=dept.id,
                       end=date.today() + timedelta(days=10))
        _probation_emp(session, "NV0002", "Quá Hạn", "b@hrm.local",
                       department_id=dept.id,
                       end=date.today() - timedelta(days=5))
        _probation_emp(session, "NV0003", "Còn Lâu", "c@hrm.local",
                       department_id=dept.id,
                       end=date.today() + timedelta(days=30))
        token = _admin_token(client, session)
        resp = client.get("/api/v1/probation/summary",
                          headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()
        summary = resp.get_json()["data"]
        assert summary["total"] == 3
        assert summary["expiringSoon"] == 1
        assert summary["overdue"] == 1

    def test_manager_sees_only_own_department(self, app, session, client):
        dept_a = make_department(session, name="Kỹ thuật")
        dept_b = make_department(session, name="Kinh doanh")
        mgr_emp = make_employee(session, code="NV0090", full_name="Quản lý",
                                email="mgr@hrm.local",
                                department_id=dept_a.id)
        dept_a.manager_id = mgr_emp.id
        session.commit()
        make_user(session, "mgr@hrm.local", "Manager@123", "manager",
                  employee=mgr_emp)
        _probation_emp(session, "NV0001", "Phòng A", "a@hrm.local",
                       department_id=dept_a.id)
        _probation_emp(session, "NV0002", "Phòng B", "b@hrm.local",
                       department_id=dept_b.id)
        token = login(client, "mgr@hrm.local", "Manager@123")
        resp = client.get("/api/v1/probation", headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()
        codes = [row["employeeCode"] for row in resp.get_json()["data"]]
        assert codes == ["NV0001"]

    def test_manager_without_department_forbidden(self, app, session, client):
        make_user(session, "mgr@hrm.local", "Manager@123", "manager")
        token = login(client, "mgr@hrm.local", "Manager@123")
        resp = client.get("/api/v1/probation", headers=auth_headers(token))
        assert resp.status_code == 403, resp.get_json()

    def test_employee_forbidden(self, app, session, client):
        emp = make_employee(session, code="NV0001", full_name="Nhân Viên",
                            email="nv@hrm.local")
        make_user(session, "nv@hrm.local", "Employee@123", "employee",
                  employee=emp)
        token = login(client, "nv@hrm.local", "Employee@123")
        resp = client.get("/api/v1/probation", headers=auth_headers(token))
        assert resp.status_code == 403, resp.get_json()

    def test_hr_can_list(self, app, session, client):
        self._setup_list(session)
        make_user(session, "hr@hrm.local", "Hr@12345", "hr")
        token = login(client, "hr@hrm.local", "Hr@12345")
        resp = client.get("/api/v1/probation", headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()


# ---------------------------------------------------------------------------
# POST /probation/<id>/evaluate
# ---------------------------------------------------------------------------

class TestEvaluate:
    def _setup_eval(self, session, client):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        hr = make_user(session, "hr@hrm.local", "Hr@12345", "hr")
        dept = make_department(session, name="Kỹ thuật")
        emp = _probation_emp(session, "NV0001", "Nguyễn Thử Việc",
                             "a@hrm.local", department_id=dept.id,
                             end=date.today() + timedelta(days=10))
        contract = Contract.query.filter_by(employee_id=emp.id).first()
        return admin, hr, dept, emp, contract

    def test_pass_creates_official_contract(self, app, session, client):
        _, _, _, emp, contract = self._setup_eval(session, client)
        token = _admin_token(client, session)
        resp = client.post(
            f"/api/v1/probation/{contract.id}/evaluate",
            json={"decision": "pass", "notes": "Làm tốt"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200, resp.get_json()
        data = resp.get_json()["data"]
        today = date.today()
        assert data["contract"]["status"] == "terminated"
        assert data["contract"]["endDate"] == today.isoformat()
        new = data["newContract"]
        assert new is not None
        assert new["contractType"] == "Không xác định thời hạn"
        assert new["startDate"] == (today + timedelta(days=1)).isoformat()
        assert new["endDate"] is None
        assert new["baseSalary"] == 12000000  # giữ nguyên lương chính thức
        assert new["allowance"] == 1000000
        assert new["status"] == "active"
        assert data["evaluation"]["decision"] == "pass"
        # Không còn trong danh sách thử việc.
        resp = client.get("/api/v1/probation", headers=auth_headers(token))
        assert resp.get_json()["data"] == []

    def test_fail_resigns_employee_and_notifies_hr(
            self, app, session, client):
        _, hr, _, emp, contract = self._setup_eval(session, client)
        token = _admin_token(client, session)
        resp = client.post(
            f"/api/v1/probation/{contract.id}/evaluate",
            json={"decision": "fail", "notes": "Không đạt yêu cầu"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()["data"]["newContract"] is None
        # HTTP request chạy trong session khác nên expire cache trước khi đọc.
        session.expire_all()
        assert db.session.get(Contract, contract.id).status == "terminated"
        assert db.session.get(Employee, emp.id).status == "resigned"
        notes = Notification.query.filter_by(
            type="probation", user_id=hr.id).all()
        assert len(notes) == 1
        assert "NV0001" in notes[0].content

    def test_extend_moves_end_date_and_allows_later_decision(
            self, app, session, client):
        _, _, _, _, contract = self._setup_eval(session, client)
        token = _admin_token(client, session)
        old_end = contract.end_date
        resp = client.post(
            f"/api/v1/probation/{contract.id}/evaluate",
            json={"decision": "extend", "extend_days": 30},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()["data"]["contract"]["endDate"] == (
            old_end + timedelta(days=30)
        ).isoformat()
        # Sau extend vẫn được đánh giá tiếp (pass).
        resp = client.post(
            f"/api/v1/probation/{contract.id}/evaluate",
            json={"decision": "pass"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200, resp.get_json()
        evs = ProbationEvaluation.query.filter_by(
            contract_id=contract.id).all()
        assert [e.decision for e in evs] == ["extend", "pass"]

    def test_reevaluate_after_pass_or_fail_conflicts(
            self, app, session, client):
        _, _, _, _, contract = self._setup_eval(session, client)
        token = _admin_token(client, session)
        client.post(f"/api/v1/probation/{contract.id}/evaluate",
                    json={"decision": "pass"}, headers=auth_headers(token))
        resp = client.post(
            f"/api/v1/probation/{contract.id}/evaluate",
            json={"decision": "extend", "extend_days": 30},
            headers=auth_headers(token),
        )
        assert resp.status_code == 409, resp.get_json()

        # Nhân viên thứ hai: đánh fail rồi đánh lại -> 409.
        emp2 = _probation_emp(session, "NV0002", "Người Thứ Hai",
                              "b@hrm.local")
        contract2 = Contract.query.filter_by(employee_id=emp2.id).first()
        resp = client.post(
            f"/api/v1/probation/{contract2.id}/evaluate",
            json={"decision": "fail"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200, resp.get_json()
        resp = client.post(
            f"/api/v1/probation/{contract2.id}/evaluate",
            json={"decision": "pass"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 409, resp.get_json()

    def test_extend_open_ended_contract_400(self, app, session, client):
        _, _, _, _, contract = self._setup_eval(session, client)
        contract.end_date = None
        session.commit()
        token = _admin_token(client, session)
        resp = client.post(
            f"/api/v1/probation/{contract.id}/evaluate",
            json={"decision": "extend", "extend_days": 30},
            headers=auth_headers(token),
        )
        assert resp.status_code == 400, resp.get_json()

    def test_evaluate_non_probation_contract_400(self, app, session, client):
        _, _, _, emp, _ = self._setup_eval(session, client)
        official = Contract.query.filter_by(employee_id=emp.id).first()
        official.contract_type = "Không xác định thời hạn"
        session.commit()
        token = _admin_token(client, session)
        resp = client.post(
            f"/api/v1/probation/{official.id}/evaluate",
            json={"decision": "pass"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 400, resp.get_json()

    def test_evaluate_unknown_contract_404(self, app, session, client):
        token = _admin_token(client, session)
        resp = client.post("/api/v1/probation/999999/evaluate",
                           json={"decision": "pass"},
                           headers=auth_headers(token))
        assert resp.status_code == 404, resp.get_json()

    def test_validation_errors(self, app, session, client):
        _, _, _, _, contract = self._setup_eval(session, client)
        token = _admin_token(client, session)
        url = f"/api/v1/probation/{contract.id}/evaluate"
        for body in (
            {"decision": "maybe"},
            {"decision": "extend"},
            {"decision": "extend", "extend_days": 0},
            {"decision": "extend", "extend_days": 200},
            {"decision": "extend", "extend_days": "30"},
        ):
            resp = client.post(url, json=body, headers=auth_headers(token))
            assert resp.status_code == 400, (body, resp.get_json())

    def test_manager_scope(self, app, session, client):
        _, _, dept_a, emp_a, contract_a = self._setup_eval(session, client)
        dept_b = make_department(session, name="Kinh doanh")
        emp_b = _probation_emp(session, "NV0002", "Phòng B",
                               "b@hrm.local", department_id=dept_b.id)
        contract_b = Contract.query.filter_by(employee_id=emp_b.id).first()
        mgr_emp = make_employee(session, code="NV0090", full_name="Quản lý",
                                email="mgr@hrm.local",
                                department_id=dept_a.id)
        dept_a.manager_id = mgr_emp.id
        session.commit()
        make_user(session, "mgr@hrm.local", "Manager@123", "manager",
                  employee=mgr_emp)
        token = login(client, "mgr@hrm.local", "Manager@123")
        # Phòng mình: được đánh giá.
        resp = client.post(
            f"/api/v1/probation/{contract_a.id}/evaluate",
            json={"decision": "extend", "extend_days": 15},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200, resp.get_json()
        # Phòng khác: 403.
        resp = client.post(
            f"/api/v1/probation/{contract_b.id}/evaluate",
            json={"decision": "pass"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 403, resp.get_json()

    def test_employee_cannot_evaluate(self, app, session, client):
        _, _, _, emp, contract = self._setup_eval(session, client)
        make_user(session, "nv@hrm.local", "Employee@123", "employee",
                  employee=emp)
        token = login(client, "nv@hrm.local", "Employee@123")
        resp = client.post(
            f"/api/v1/probation/{contract.id}/evaluate",
            json={"decision": "pass"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 403, resp.get_json()


# ---------------------------------------------------------------------------
# Lương thử việc 85%
# ---------------------------------------------------------------------------

class TestProbationPayroll:
    def _full_month_probation_emp(self, session):
        emp = make_employee(session, code="NV0001")
        _set_contract(session, emp.id, contract_type="Thử việc",
                      start=date(2026, 10, 1), end=date(2026, 11, 30))
        for day in NOV_2026_WEEKDAYS:
            _present(session, emp.id, day)
        return emp

    def test_full_month_probation_pays_85_percent(
            self, app, session):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        emp = self._full_month_probation_emp(session)
        period = _nov_period(session, admin)
        pay.calculate_period(period.id, admin)
        item = _item(session, period.id, emp.id)
        # Lương ngày công: 12tr x 85% = 10,2tr (đủ 21/21 ngày công).
        # Bảo hiểm: 10,2tr x 10,5% = 1.071.000.
        # Thực lĩnh: 10,2tr + 1tr phụ cấp - 1.071.000 = 10.129.000.
        assert item.base_salary == 12000000  # item giữ lương chính thức
        assert item.breakdown["workday_salary"] == 10200000
        assert item.breakdown["insurance_deduction"] == 1071000
        assert item.total_salary == 10129000
        assert item.breakdown["probation_factor"] == 0.85
        assert item.breakdown["probation_base_salary"] == 10200000
        assert item.breakdown["probation_days"] == 21.0

    def test_mid_month_switch_probation_to_official(self, app, session):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        emp = make_employee(session, code="NV0001")
        _set_contract(session, emp.id, contract_type="Thử việc",
                      start=date(2026, 11, 1), end=date(2026, 11, 15))
        _add_contract(session, emp.id, "Không xác định thời hạn",
                      start=date(2026, 11, 16), end=None)
        for day in NOV_2026_WEEKDAYS:
            _present(session, emp.id, day)
        period = _nov_period(session, admin)
        pay.calculate_period(period.id, admin)
        item = _item(session, period.id, emp.id)
        segments = {s["contract_id"]: s for s in
                    item.breakdown["contract_segments"]}
        prob_contract = Contract.query.filter_by(
            employee_id=emp.id, contract_type="Thử việc").first()
        off_contract = Contract.query.filter_by(
            employee_id=emp.id,
            contract_type="Không xác định thời hạn").first()
        prob_seg = segments[prob_contract.id]
        off_seg = segments[off_contract.id]
        # Đoạn thử việc (10 ngày công): 10,2tr x 10/21 = 4.857.143.
        assert prob_seg["paid_workdays"] == 10.0
        assert prob_seg["workday_salary"] == 4857143
        assert prob_seg["probation_factor"] == 0.85
        assert prob_seg["probation_base_salary"] == 10200000
        # Đoạn chính thức (11 ngày công): 12tr x 11/21 = 6.285.714.
        assert off_seg["paid_workdays"] == 11.0
        assert off_seg["workday_salary"] == 6285714
        assert "probation_factor" not in off_seg
        # Tổng: (4.857.143 + 476.190 - 510.000)
        #     + (6.285.714 + 523.810 - 660.000) = 10.972.857.
        assert item.total_salary == 10972857
        assert item.base_salary == 12000000  # hợp đồng mới nhất

    def test_overtime_during_probation_uses_85_percent_hourly(
            self, app, session):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        emp = self._full_month_probation_emp(session)
        _ot(session, emp.id, 4, 4)  # Thứ 4, 4 giờ x 1.5
        period = _nov_period(session, admin)
        pay.calculate_period(period.id, admin)
        item = _item(session, period.id, emp.id)
        # Lương giờ thử việc: 10,2tr/21/8 = 60.714,286đ.
        # OT: 4 x 60.714,286 x 1,5 = 364.285,714 -> 364.286.
        assert item.breakdown["overtime_pay"] == 364286
        assert item.breakdown["overtime_details"][0]["probation_factor"] == 0.85
        assert item.breakdown["overtime_details"][0]["base_salary"] == 12000000
        assert item.total_salary == 10129000 + 364286

    def test_official_full_month_unchanged(self, app, session):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        emp = make_employee(session, code="NV0001")
        for day in NOV_2026_WEEKDAYS:
            _present(session, emp.id, day)
        period = _nov_period(session, admin)
        pay.calculate_period(period.id, admin)
        item = _item(session, period.id, emp.id)
        assert item.total_salary == 11740000
        assert "probation_factor" not in item.breakdown
