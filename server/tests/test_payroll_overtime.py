"""Tiền tăng ca (OT) vào lương: hệ số 150%/200%/300% theo luật lao động VN.

Quy ước: test viết theo hành vi ĐÚNG mong muốn; FAIL = bug. Lương giờ OT =
lương cơ bản / ngày công chuẩn / 8; tiền OT làm tròn HALF_UP từng đơn;
bảo hiểm KHÔNG tính trên tiền OT. Tháng 11/2026 có 21 ngày công chuẩn,
lương giờ của hợp đồng 12tr = 12.000.000/21/8 = 71.428,571đ.
"""

from datetime import date

import pytest

from app.blueprints.payroll import services as pay
from app.blueprints.payroll.calculator import calculate_salary
from app.blueprints.payroll.schemas import item_to_dict
from app.blueprints.payroll.services import ApiError
from app.models import Contract, Holiday, OvertimeRequest, PayrollItem
from tests.conftest import login, make_employee, make_user
from tests.test_payroll import NOV_2026_WEEKDAYS, _nov_period, _present


def _ot(session, employee_id, day, hours, status="approved"):
    """Tạo thẳng đơn tăng ca (bỏ qua tầng service — test tầng tính lương)."""
    row = OvertimeRequest(
        employee_id=employee_id, work_date=date(2026, 11, day),
        hours=hours, reason="OT test", status=status,
    )
    session.add(row)
    session.commit()
    return row


def _holiday(session, day, name="Ngày lễ test"):
    row = Holiday(date=date(2026, 11, day), name=name)
    session.add(row)
    session.commit()
    return row


def _full_month_emp(session):
    """Nhân viên làm đủ 21 ngày công tháng 11 (lương 12tr + phụ cấp 1tr)."""
    emp = make_employee(session, code="NV0001")
    for day in NOV_2026_WEEKDAYS:
        _present(session, emp.id, day)
    return emp


def _item(session, period_id, employee_id):
    return session.query(PayrollItem).filter_by(
        period_id=period_id, employee_id=employee_id).one()


# ---------------------------------------------------------------------------
# calculator.calculate_salary — tham số OT
# ---------------------------------------------------------------------------

class TestCalculatorOvertime:
    def test_ot_zero_keeps_old_totals(self):
        # Mặc định overtime_pay=0: total cũ không đổi.
        result = calculate_salary(
            base_salary=10_000_000, allowance=500_000,
            standard_workdays=22, paid_workdays=22,
        )
        assert result["total_salary"] == 9_450_000
        assert result["breakdown"]["overtime_pay"] == 0
        assert result["breakdown"]["overtime_hours"] == 0

    def test_ot_added_to_total_not_to_insurance(self):
        # 4h ngày thường, lương 12tr/22 ngày: OT = 409.091đ (xem doctest 4).
        result = calculate_salary(
            base_salary=12_000_000, allowance=0,
            standard_workdays=22, paid_workdays=22,
            overtime_pay=409091, overtime_hours=4,
        )
        assert result["insurance_deduction"] == 1_260_000  # OT không đóng BHXH
        assert result["total_salary"] == 11_149_091

    def test_ot_negative_raises(self):
        with pytest.raises(ValueError):
            calculate_salary(
                base_salary=12_000_000, allowance=0,
                standard_workdays=22, paid_workdays=22, overtime_pay=-1,
            )
        with pytest.raises(ValueError):
            calculate_salary(
                base_salary=12_000_000, allowance=0,
                standard_workdays=22, paid_workdays=22, overtime_hours=-1,
            )


# ---------------------------------------------------------------------------
# _overtime_pay + calculate_period — hệ số theo ngày
# ---------------------------------------------------------------------------

class TestOvertimePayRates:
    def test_weekday_150_percent(self, app, session):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        emp = _full_month_emp(session)
        _ot(session, emp.id, 4, 4)  # Thứ 4, 4 giờ x 1.5
        period = _nov_period(session, admin)
        pay.calculate_period(period.id, admin)
        item = _item(session, period.id, emp.id)
        # 4 x 71.428,571 x 1,5 = 428.571,428 -> 428.571
        assert item.breakdown["overtime_pay"] == 428571
        assert item.breakdown["overtime_hours"] == 4.0
        assert item.total_salary == 11_740_000 + 428571
        assert item.breakdown["overtime_details"] == [
            {"date": "2026-11-04", "hours": 4, "multiplier": 1.5,
             "pay": 428571, "base_salary": 12_000_000},
        ]

    def test_weekend_200_percent(self, app, session):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        emp = _full_month_emp(session)
        _ot(session, emp.id, 7, 2)  # Thứ 7, 2 giờ x 2.0
        period = _nov_period(session, admin)
        pay.calculate_period(period.id, admin)
        item = _item(session, period.id, emp.id)
        # 2 x 71.428,571 x 2 = 285.714,285 -> 285.714
        assert item.breakdown["overtime_pay"] == 285714
        assert item.breakdown["overtime_details"][0]["multiplier"] == 2.0
        assert item.total_salary == 11_740_000 + 285714

    def test_holiday_300_percent(self, app, session):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        emp = _full_month_emp(session)
        _holiday(session, 9)  # Thứ 2 nhưng là ngày lễ
        _ot(session, emp.id, 9, 3)  # 3 giờ x 3.0
        period = _nov_period(session, admin)
        pay.calculate_period(period.id, admin)
        item = _item(session, period.id, emp.id)
        # 3 x 71.428,571 x 3 = 642.857,142 -> 642.857
        assert item.breakdown["overtime_pay"] == 642857
        assert item.breakdown["overtime_details"][0]["multiplier"] == 3.0
        assert item.total_salary == 11_740_000 + 642857

    def test_holiday_on_weekend_is_300_not_200(self, app, session):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        emp = _full_month_emp(session)
        _holiday(session, 7)  # Thứ 7 nhưng là ngày lễ -> 3.0
        _ot(session, emp.id, 7, 2)
        period = _nov_period(session, admin)
        pay.calculate_period(period.id, admin)
        item = _item(session, period.id, emp.id)
        assert item.breakdown["overtime_details"][0]["multiplier"] == 3.0
        assert item.breakdown["overtime_pay"] == 428571  # 2 x 71.428,571 x 3

    def test_pending_overtime_not_counted(self, app, session):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        emp = _full_month_emp(session)
        _ot(session, emp.id, 4, 4, status="pending")
        _ot(session, emp.id, 5, 4, status="manager_approved")
        period = _nov_period(session, admin)
        pay.calculate_period(period.id, admin)
        item = _item(session, period.id, emp.id)
        assert item.breakdown["overtime_pay"] == 0
        assert item.breakdown["overtime_hours"] == 0
        assert item.total_salary == 11_740_000

    def test_duplicate_date_counted_once(self, app, session):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        emp = _full_month_emp(session)
        _ot(session, emp.id, 4, 2)  # đơn đầu: 2 giờ
        _ot(session, emp.id, 4, 3)  # đơn lạ trùng ngày: 3 giờ, phải bỏ qua
        period = _nov_period(session, admin)
        pay.calculate_period(period.id, admin)
        item = _item(session, period.id, emp.id)
        assert item.breakdown["overtime_pay"] == 214286  # chỉ tính đơn 2 giờ
        assert item.breakdown["overtime_hours"] == 2.0
        assert len(item.breakdown["overtime_details"]) == 1
        assert len(item.breakdown["overtime_skipped"]) == 1
        assert item.breakdown["overtime_skipped"][0]["date"] == "2026-11-04"


# ---------------------------------------------------------------------------
# Đổi hợp đồng giữa tháng + tính lại kỳ nháp + khóa kỳ + schema
# ---------------------------------------------------------------------------

class TestOvertimePeriodIntegration:
    def test_multi_contract_uses_contract_of_the_day(self, app, session):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        emp = make_employee(
            session, code="NV0001", base_salary=12_000_000, allowance=1_000_000)
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
        _ot(session, emp.id, 4, 2)   # hợp đồng cũ 12tr: 2 x 71.428,571 x 1,5
        _ot(session, emp.id, 16, 2)  # hợp đồng mới 24tr: 2 x 142.857,142 x 1,5
        period = _nov_period(session, admin)
        pay.calculate_period(period.id, admin)
        item = _item(session, period.id, emp.id)
        assert item.breakdown["overtime_pay"] == 214286 + 428571
        details = {d["date"]: d for d in item.breakdown["overtime_details"]}
        assert details["2026-11-04"]["base_salary"] == 12_000_000
        assert details["2026-11-16"]["base_salary"] == 24_000_000

    def test_overtime_on_day_without_contract_is_skipped(self, app, session):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        emp = make_employee(session, code="NV0001")
        for day in [2, 3, 4, 5, 6]:
            _present(session, emp.id, day)
        old_contract = session.query(Contract).filter_by(
            employee_id=emp.id).one()
        old_contract.end_date = date(2026, 11, 10)
        old_contract.status = "expired"
        session.commit()
        _ot(session, emp.id, 4, 2)   # còn hợp đồng: tính
        _ot(session, emp.id, 16, 2)  # kẽ hở hợp đồng: bỏ qua, ghi chú
        period = _nov_period(session, admin)
        pay.calculate_period(period.id, admin)
        item = _item(session, period.id, emp.id)
        assert item.breakdown["overtime_pay"] == 214286
        assert len(item.breakdown["overtime_skipped"]) == 1
        assert item.breakdown["overtime_skipped"][0]["date"] == "2026-11-16"

    def test_recalculate_draft_updates_overtime(self, app, session):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        emp = _full_month_emp(session)
        period = _nov_period(session, admin)
        pay.calculate_period(period.id, admin)
        item = _item(session, period.id, emp.id)
        assert item.breakdown["overtime_pay"] == 0
        assert item.total_salary == 11_740_000
        _ot(session, emp.id, 4, 4)  # duyệt thêm OT sau lần tính đầu
        pay.calculate_period(period.id, admin)
        item = _item(session, period.id, emp.id)
        assert item.breakdown["overtime_pay"] == 428571
        assert item.total_salary == 11_740_000 + 428571

    def test_locked_period_still_409(self, app, session):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        emp = _full_month_emp(session)
        _ot(session, emp.id, 4, 4)
        period = _nov_period(session, admin)
        pay.calculate_period(period.id, admin)
        pay.lock_period(period.id, admin)
        with pytest.raises(ApiError) as exc:
            pay.calculate_period(period.id, admin)
        assert exc.value.status == 409
        assert exc.value.code == "PERIOD_LOCKED"

    def test_schema_exposes_overtime_pay(self, app, session):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        emp = _full_month_emp(session)
        _ot(session, emp.id, 4, 4)
        period = _nov_period(session, admin)
        pay.calculate_period(period.id, admin)
        item = _item(session, period.id, emp.id)
        data = item_to_dict(item)
        assert data["overtime_pay"] == 428571
        assert data["total_salary"] == 11_740_000 + 428571


def test_http_calculate_locked_period_still_409(app, client, session):
    admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
    emp = _full_month_emp(session)
    _ot(session, emp.id, 4, 4)
    period = _nov_period(session, admin)
    pay.calculate_period(period.id, admin)
    pay.lock_period(period.id, admin)
    token = login(client, "admin@hrm.local", "Admin@123")
    from tests.conftest import auth_headers
    resp = client.post(
        f"/api/v1/payroll/periods/{period.id}/calculate",
        headers=auth_headers(token))
    assert resp.status_code == 409
    assert resp.get_json()["error"]["code"] == "PERIOD_LOCKED"
