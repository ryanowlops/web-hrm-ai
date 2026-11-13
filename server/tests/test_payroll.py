"""Lương: calculator thuần + tính kỳ lương + chốt kỳ + phiếu lương.

Quy ước: test viết theo hành vi ĐÚNG mong muốn; FAIL = bug. Các test đánh
dấu [BUG] là những chỗ code hiện tại đã biết sai (audit) — chúng phải FAIL
cho tới khi được sửa, đừng "sửa test cho pass".
"""

from datetime import date, datetime

import pytest

from app.blueprints.payroll import services as pay
from app.blueprints.payroll.calculator import calculate_salary
from app.blueprints.payroll.services import ApiError
from app.extensions import db
from app.models import (
    Attendance,
    Contract,
    LeaveRequest,
    LeaveType,
    PayrollItem,
)
from tests.conftest import login, make_employee, make_user

NOV_2026_WEEKDAYS = [
    2, 3, 4, 5, 6, 9, 10, 11, 12, 13,
    16, 17, 18, 19, 20, 23, 24, 25, 26, 27, 30,
]  # 21 ngày T2-T6 trong tháng 11/2026


def _nov_period(session, actor):
    return pay.create_period({"month": 11, "year": 2026}, actor)


def _present(session, employee_id, day):
    session.add(Attendance(
        employee_id=employee_id, work_date=date(2026, 11, day),
        check_in_at=datetime(2026, 11, day, 8, 0), status="present",
    ))
    session.commit()


def _paid_leave(session, employee_id, from_day, to_day, days_count):
    leave_type = LeaveType(name="Phép năm", paid=True, annual_quota_days=12)
    session.add(leave_type)
    session.commit()
    session.add(LeaveRequest(
        employee_id=employee_id, leave_type_id=leave_type.id,
        from_date=date(2026, 11, from_day), to_date=date(2026, 11, to_day),
        days_count=days_count, reason="Nghi phep", status="approved",
    ))
    session.commit()


# ---------------------------------------------------------------------------
# calculator.calculate_salary (thuần, không cần DB)
# ---------------------------------------------------------------------------

class TestCalculator:
    def test_zero_paid_days_charges_no_insurance(self):
        # NV0024 (case thật 11/2026): lương cơ bản 11,5tr, phụ cấp 1tr,
        # 0 ngày công -> bảo hiểm phải = 0, thực lĩnh = phụ cấp.
        result = calculate_salary(
            base_salary=11_500_000, allowance=1_000_000,
            standard_workdays=21, paid_workdays=0,
        )
        assert result["insurance_deduction"] == 0
        assert result["total_salary"] == 1_000_000
        assert result["total_salary"] >= 0

    def test_full_month_unchanged(self):
        # Làm đủ tháng: bảo hiểm vẫn tính đủ trên lương cơ bản.
        result = calculate_salary(
            base_salary=10_000_000, allowance=500_000,
            standard_workdays=22, paid_workdays=22,
        )
        assert result["breakdown"]["workday_salary"] == 10_000_000
        assert result["insurance_deduction"] == 1_050_000
        assert result["total_salary"] == 9_450_000

    def test_partial_month_prorates_insurance(self):
        # Nghỉ không lương 1 ngày trong tháng 22 ngày công: bảo hiểm tính
        # trên lương theo ngày công (11.454.545 x 10,5%), không phải trên
        # lương cơ bản đủ tháng.
        result = calculate_salary(
            base_salary=12_000_000, allowance=1_000_000,
            standard_workdays=22, paid_workdays=21, unpaid_days=1,
        )
        assert result["breakdown"]["workday_salary"] == 11_454_545
        assert result["insurance_deduction"] == 1_202_727
        assert result["total_salary"] == 11_251_818

    def test_half_month(self):
        result = calculate_salary(
            base_salary=12_000_000, allowance=1_000_000,
            standard_workdays=22, paid_workdays=10,
        )
        assert result["breakdown"]["workday_salary"] == 5_454_545
        assert result["insurance_deduction"] == 572_727
        assert result["total_salary"] == 5_881_818

    def test_other_deduction_subtracted(self):
        result = calculate_salary(
            base_salary=10_000_000, allowance=500_000,
            standard_workdays=22, paid_workdays=22, other_deduction=200_000,
        )
        assert result["total_salary"] == 9_250_000

    def test_invalid_inputs_raise(self):
        with pytest.raises(ValueError):
            calculate_salary(base_salary=-1, allowance=0,
                             standard_workdays=22, paid_workdays=22)
        with pytest.raises(ValueError):
            calculate_salary(base_salary=10_000_000, allowance=0,
                             standard_workdays=0, paid_workdays=0)
        with pytest.raises(ValueError):
            calculate_salary(base_salary=10_000_000, allowance=0,
                             standard_workdays=22, paid_workdays=-1)
        with pytest.raises(ValueError):
            calculate_salary(base_salary=10_000_000, allowance=0,
                             standard_workdays=22, paid_workdays=22,
                             insurance_rate=1.0)


# ---------------------------------------------------------------------------
# calculate_period (cần DB)
# ---------------------------------------------------------------------------

class TestCalculatePeriod:
    def test_worked_and_leave_same_day_counts_once(self, app, session):
        """[BUG] Ngày vừa chấm công present vừa có đơn nghỉ phép đã duyệt
        phải tính 1 ngày hưởng lương, không phải 2."""
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        emp = make_employee(session, code="NV0001")
        _present(session, emp.id, 10)
        _paid_leave(session, emp.id, 10, 10, 1)
        period = _nov_period(session, admin)
        pay.calculate_period(period.id, admin)
        item = session.query(PayrollItem).filter_by(
            period_id=period.id, employee_id=emp.id).one()
        assert item.breakdown["worked_days"] == 1
        assert item.breakdown["paid_leave_days"] == 1
        assert item.workdays_paid == 1.0

    def test_mid_month_contract_change_does_not_apply_to_whole_month(
            self, app, session):
        """[BUG] Tăng lương hiệu lực giữa tháng (15/11) chỉ áp cho các
        ngày làm từ 15/11 trở đi — không được trả lương mới cho cả tháng."""
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        emp = make_employee(session, code="NV0001",
                            base_salary=12_000_000, allowance=1_000_000)
        for day in NOV_2026_WEEKDAYS:
            _present(session, emp.id, day)
        old_contract = session.query(Contract).filter_by(
            employee_id=emp.id).one()
        old_contract.end_date = date(2026, 11, 14)
        old_contract.status = "expired"
        session.add(Contract(
            employee_id=emp.id, contract_type="chinh thuc",
            start_date=date(2026, 11, 15), end_date=None,
            base_salary=24_000_000, allowance=1_000_000, status="active",
        ))
        session.commit()
        period = _nov_period(session, admin)
        pay.calculate_period(period.id, admin)
        item = session.query(PayrollItem).filter_by(
            period_id=period.id, employee_id=emp.id).one()
        # Cả tháng lương cũ: 12.000.000 + 1.000.000 - 1.260.000 = 11.740.000.
        # Cả tháng lương mới: 24.000.000 + 1.000.000 - 2.520.000 = 22.480.000.
        # Trả đúng theo từng đoạn hợp đồng phải nằm GIỮA hai mốc này.
        assert 11_740_000 < item.total_salary < 22_480_000

    def test_employee_without_contract_is_skipped(self, app, session):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        emp = make_employee(session, code="NV0001")
        session.query(Contract).filter_by(employee_id=emp.id).delete()
        session.commit()
        period = _nov_period(session, admin)
        result = pay.calculate_period(period.id, admin)
        assert result["skipped_no_contract"] == 1
        assert session.query(PayrollItem).filter_by(
            period_id=period.id).count() == 0

    def test_duplicate_period_409(self, app, session):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        _nov_period(session, admin)
        with pytest.raises(ApiError) as exc:
            pay.create_period({"month": 11, "year": 2026}, admin)
        assert exc.value.status == 409
        assert exc.value.code == "PAYROLL_PERIOD_EXISTS"


# ---------------------------------------------------------------------------
# lock_period + get_my_payslip
# ---------------------------------------------------------------------------

class TestLockAndPayslip:
    def _calculated_period(self, session):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        emp = make_employee(session, code="NV0001")
        user = make_user(session, "nv0001@hrm.local", "Employee@123",
                         "employee", employee=emp)
        period = _nov_period(session, admin)
        pay.calculate_period(period.id, admin)
        return admin, emp, user, period

    def test_lock_blocks_recalculate(self, app, session):
        admin, _, _, period = self._calculated_period(session)
        pay.lock_period(period.id, admin)
        with pytest.raises(ApiError) as exc:
            pay.calculate_period(period.id, admin)
        assert exc.value.status == 409
        assert exc.value.code == "PERIOD_LOCKED"

    def test_double_lock_409(self, app, session):
        admin, _, _, period = self._calculated_period(session)
        pay.lock_period(period.id, admin)
        with pytest.raises(ApiError) as exc:
            pay.lock_period(period.id, admin)
        assert exc.value.status == 409
        assert exc.value.code == "PERIOD_ALREADY_LOCKED"

    def test_payslip_only_after_lock(self, app, session):
        admin, emp, user, period = self._calculated_period(session)
        # Kỳ còn nháp: chưa xem được phiếu lương.
        with pytest.raises(ApiError) as exc:
            pay.get_my_payslip(user, period.id)
        assert exc.value.status == 404
        pay.lock_period(period.id, admin)
        item = pay.get_my_payslip(user, period.id)
        assert item.employee_id == emp.id
        assert item.period_id == period.id

    def test_payslip_scope_other_employee_and_no_profile(self, app, session):
        admin, _, _, period = self._calculated_period(session)
        other_emp = make_employee(session, code="NV0002",
                                  full_name="Nguyễn Thu Hà",
                                  email="nv0002@hrm.local")
        other_user = make_user(session, "nv0002@hrm.local", "Employee@123",
                               "employee", employee=other_emp)
        pay.lock_period(period.id, admin)
        # Nhân viên khác không có dòng lương trong kỳ này -> 404.
        with pytest.raises(ApiError) as exc:
            pay.get_my_payslip(other_user, period.id)
        assert exc.value.status == 404
        # Tài khoản không gắn hồ sơ nhân viên -> 404.
        admin_user = make_user(session, "root@hrm.local", "Admin@123", "admin")
        with pytest.raises(ApiError) as exc:
            pay.get_my_payslip(admin_user, period.id)
        assert exc.value.status == 404


# ---------------------------------------------------------------------------
# HTTP: lock qua route cũng chặn tính lại
# ---------------------------------------------------------------------------

def test_http_calculate_locked_period_409(app, client, session):
    admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
    make_employee(session, code="NV0001")
    token = login(client, "admin@hrm.local", "Admin@123")
    headers = {"Authorization": f"Bearer {token}"}
    created = client.post("/api/v1/payroll/periods",
                          json={"month": 11, "year": 2026}, headers=headers)
    assert created.status_code == 201, created.get_json()
    period_id = created.get_json()["data"]["id"]
    calc = client.post(f"/api/v1/payroll/periods/{period_id}/calculate",
                       headers=headers)
    assert calc.status_code == 200, calc.get_json()
    locked = client.post(f"/api/v1/payroll/periods/{period_id}/lock",
                         headers=headers)
    assert locked.status_code == 200, locked.get_json()
    again = client.post(f"/api/v1/payroll/periods/{period_id}/calculate",
                        headers=headers)
    assert again.status_code == 409
    assert again.get_json()["error"]["code"] == "PERIOD_LOCKED"
