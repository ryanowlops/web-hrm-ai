"""Ca làm / tăng ca / giải trình chấm công.

Quy ước: test viết theo hành vi ĐÚNG mong muốn; FAIL = bug. Các test đánh
dấu [BUG] là những chỗ code hiện tại đã biết sai (audit) — chúng phải FAIL
cho tới khi được sửa, đừng "sửa test cho pass".
"""

from datetime import date, datetime, time

import pytest
from sqlalchemy.exc import IntegrityError

from app.blueprints.shifts import schemas, services as shifts
from app.blueprints.shifts.services import ApiError
from app.extensions import db
from app.models import Attendance
from app.models.shifts import (
    AttendanceCorrection,
    OvertimeRequest,
    ShiftAssignment,
    ShiftDefinition,
)
from tests.conftest import (
    auth_headers,
    login,
    make_department,
    make_employee,
    make_user,
)


@pytest.fixture()
def team(session):
    """Manager + 1 nhân viên trực thuộc + HR."""
    dept = make_department(session, name="Kỹ thuật")
    manager = make_employee(session, code="NV0001", full_name="Trần Văn Minh",
                            email="nv0001@hrm.local", department_id=dept.id)
    dept.manager_id = manager.id
    session.commit()
    employee = make_employee(session, code="NV0002", full_name="Phạm Thị Lan",
                             email="nv0002@hrm.local", department_id=dept.id,
                             manager_id=manager.id)
    hr_emp = make_employee(session, code="NV0003", full_name="Nguyễn Thu Hà",
                           email="nv0003@hrm.local", department_id=dept.id)
    manager_user = make_user(session, "nv0001@hrm.local", "Manager@123",
                             "manager", employee=manager)
    employee_user = make_user(session, "nv0002@hrm.local", "Employee@123",
                              "employee", employee=employee)
    hr_user = make_user(session, "nv0003@hrm.local", "Hr@12345",
                        "hr", employee=hr_emp)
    return {
        "dept": dept, "manager": manager, "employee": employee,
        "hr_emp": hr_emp, "manager_user": manager_user,
        "employee_user": employee_user, "hr_user": hr_user,
    }


def _attendance(session, employee_id, day, status, check_in=None,
                check_out=None):
    row = Attendance(
        employee_id=employee_id, work_date=date(2026, 11, day),
        check_in_at=check_in, check_out_at=check_out, status=status,
    )
    session.add(row)
    session.commit()
    return row


def _correction(team, work_day, check_in=None, check_out=None,
                attendance_id=None):
    cleaned = {
        "work_date": date(2026, 11, work_day),
        "requested_check_in": check_in,
        "requested_check_out": check_out,
        "reason": "Quen cham cong",
    }
    if attendance_id is not None:
        cleaned["attendance_id"] = attendance_id
    return shifts.create_correction(team["employee_user"], cleaned)


def _approve_correction(team, correction_id):
    shifts.correction_manager_decision(
        team["manager_user"], correction_id, "approved", None)
    return shifts.correction_hr_decision(
        team["hr_user"], correction_id, "approved", None)


# ---------------------------------------------------------------------------
# Giải trình: liên kết sai ngày
# ---------------------------------------------------------------------------

class TestCorrectionWrongDate:
    def test_correction_linked_to_other_date_record_rejected(
            self, app, session, team):
        """[BUG] Đơn giải trình ngày 10/11 nhưng gắn bản ghi chấm công của
        ngày 05/11 phải bị từ chối — hiện tại được tạo, và khi duyệt sẽ
        ghi đè giờ của ngày 05/11."""
        att = _attendance(session, team["employee"].id, 5, "present",
                          check_in=datetime(2026, 11, 5, 8, 0))
        with pytest.raises(ApiError) as exc:
            _correction(team, 10, check_in=datetime(2026, 11, 10, 8, 0),
                        attendance_id=att.id)
        assert exc.value.status == 400

    def test_approval_does_not_touch_other_date_record(
            self, app, session, team):
        """[BUG] Dù tạo được đơn sai ngày, duyệt nó cũng không được ghi đè
        bản ghi của ngày khác.

        Đơn sai ngày không tạo được qua create_correction nữa (test anh em
        yêu cầu raise 400), nên test này chèn trực tiếp dòng dữ liệu cũ
        (legacy, tạo trước khi có validate) để kiểm tra lớp phòng thủ
        trong _apply: duyệt phải ghi vào đúng ngày 10/11, không đụng 05/11.
        """
        from app.models.shifts import AttendanceCorrection

        att = _attendance(session, team["employee"].id, 5, "present",
                          check_in=datetime(2026, 11, 5, 8, 0))
        corr = AttendanceCorrection(
            employee_id=team["employee"].id,
            attendance_id=att.id,
            work_date=date(2026, 11, 10),
            requested_check_in=datetime(2026, 11, 10, 8, 0),
            reason="Quen cham cong",
        )
        session.add(corr)
        session.commit()
        _approve_correction(team, corr.id)
        session.refresh(att)
        assert att.check_in_at == datetime(2026, 11, 5, 8, 0)
        assert att.work_date == date(2026, 11, 5)
        # Và giờ giải trình phải được ghi vào đúng ngày 10/11.
        row_10 = session.query(Attendance).filter_by(
            employee_id=team["employee"].id,
            work_date=date(2026, 11, 10)).one()
        assert row_10.check_in_at == datetime(2026, 11, 10, 8, 0)


# ---------------------------------------------------------------------------
# Giải trình: duyệt phải tính lại trạng thái muộn/đúng giờ
# ---------------------------------------------------------------------------

class TestCorrectionStatusRecompute:
    def test_late_corrected_to_on_time_becomes_present(
            self, app, session, team):
        """[BUG] Bản ghi late (vào 09:00) được giải trình thành 08:00 thì
        sau duyệt phải là present, không còn late."""
        _attendance(session, team["employee"].id, 10, "late",
                    check_in=datetime(2026, 11, 10, 9, 0))
        corr = _correction(team, 10, check_in=datetime(2026, 11, 10, 8, 0))
        _approve_correction(team, corr.id)
        row = session.query(Attendance).filter_by(
            employee_id=team["employee"].id,
            work_date=date(2026, 11, 10)).one()
        assert row.check_in_at == datetime(2026, 11, 10, 8, 0)
        assert row.status == "present"

    def test_present_corrected_to_late_becomes_late(
            self, app, session, team):
        """[BUG] Bản ghi present (vào 08:00) được giải trình thành 10:00
        thì sau duyệt phải là late, không còn present."""
        _attendance(session, team["employee"].id, 10, "present",
                    check_in=datetime(2026, 11, 10, 8, 0))
        corr = _correction(team, 10, check_in=datetime(2026, 11, 10, 10, 0))
        _approve_correction(team, corr.id)
        row = session.query(Attendance).filter_by(
            employee_id=team["employee"].id,
            work_date=date(2026, 11, 10)).one()
        assert row.check_in_at == datetime(2026, 11, 10, 10, 0)
        assert row.status == "late"

    def test_absent_corrected_with_times_becomes_present(
            self, app, session, team):
        _attendance(session, team["employee"].id, 10, "absent")
        corr = _correction(team, 10, check_in=datetime(2026, 11, 10, 8, 0),
                           check_out=datetime(2026, 11, 10, 17, 0))
        _approve_correction(team, corr.id)
        row = session.query(Attendance).filter_by(
            employee_id=team["employee"].id,
            work_date=date(2026, 11, 10)).one()
        assert row.status == "present"

    def test_checkout_only_correction_creates_no_present_without_checkin(
            self, app, session, team):
        """[BUG] Đơn chỉ có giờ ra, ngày đó chưa có bản ghi nào: duyệt xong
        không được tạo bản ghi PRESENT mà check_in_at = NULL (lương sẽ
        tính 1 ngày công không có giờ vào)."""
        corr = _correction(team, 11,
                           check_out=datetime(2026, 11, 11, 17, 0))
        _approve_correction(team, corr.id)
        row = session.query(Attendance).filter_by(
            employee_id=team["employee"].id,
            work_date=date(2026, 11, 11)).one()
        assert not (row.status == "present" and row.check_in_at is None)


# ---------------------------------------------------------------------------
# Giải trình: validate đầu vào + máy trạng thái
# ---------------------------------------------------------------------------

class TestCorrectionValidation:
    def test_needs_at_least_one_time(self):
        _, errors = schemas.validate_correction_payload({
            "work_date": "2026-11-10", "reason": "Quen",
        })
        assert errors

    def test_checkout_must_be_after_checkin(self):
        _, errors = schemas.validate_correction_payload({
            "work_date": "2026-11-10",
            "requested_check_in": "2026-11-10T10:00:00",
            "requested_check_out": "2026-11-10T09:00:00",
            "reason": "Sai gio",
        })
        assert errors

    def test_manager_decision_by_non_manager_forbidden(
            self, app, session, team):
        outsider = make_employee(session, code="NV0009",
                                 full_name="Người Ngoài",
                                 email="nv0009@hrm.local")
        outsider_user = make_user(session, "nv0009@hrm.local", "Employee@123",
                                  "employee", employee=outsider)
        corr = _correction(team, 10, check_in=datetime(2026, 11, 10, 8, 0))
        with pytest.raises(ApiError) as exc:
            shifts.correction_manager_decision(
                outsider_user, corr.id, "approved", None)
        assert exc.value.status == 403

    def test_hr_decision_requires_manager_approval_first(
            self, app, session, team):
        corr = _correction(team, 10, check_in=datetime(2026, 11, 10, 8, 0))
        with pytest.raises(ApiError) as exc:
            shifts.correction_hr_decision(
                team["hr_user"], corr.id, "approved", None)
        assert exc.value.status == 409
        assert exc.value.code == "INVALID_STATE"


# ---------------------------------------------------------------------------
# Tăng ca: validate giờ + trùng đơn + máy trạng thái
# ---------------------------------------------------------------------------

class TestOvertime:
    def test_hours_must_be_in_0_16(self):
        for bad in (0, -1, 17, 24, "x", None):
            _, errors = schemas.validate_overtime_payload({
                "work_date": "2026-11-10", "hours": bad,
            })
            assert errors, f"hours={bad!r} phai bi tu choi"
        cleaned, errors = schemas.validate_overtime_payload({
            "work_date": "2026-11-10", "hours": 16,
        })
        assert not errors
        assert cleaned["hours"] == 16.0

    def test_duplicate_overtime_same_day_rejected(self, app, session, team):
        """[BUG] Một nhân viên không được có 2 đơn tăng ca cùng ngày (cả
        hai đều pending) — đơn thứ hai phải bị từ chối."""
        cleaned = {"work_date": date(2026, 11, 10), "hours": 2.0,
                   "reason": "Gap viec"}
        shifts.create_overtime(team["employee_user"], cleaned)
        with pytest.raises(ApiError) as exc:
            shifts.create_overtime(team["employee_user"], cleaned)
        assert exc.value.status == 409

    def test_overtime_state_machine(self, app, session, team):
        cleaned = {"work_date": date(2026, 11, 10), "hours": 2.0,
                   "reason": "Gap viec"}
        obj = shifts.create_overtime(team["employee_user"], cleaned)
        assert obj.status == "pending"
        # HR chưa duyệt được khi chưa qua Manager.
        with pytest.raises(ApiError) as exc:
            shifts.overtime_hr_decision(team["hr_user"], obj.id,
                                        "approved", None)
        assert exc.value.status == 409
        shifts.overtime_manager_decision(team["manager_user"], obj.id,
                                         "approved", None)
        assert obj.status == "manager_approved"
        shifts.overtime_hr_decision(team["hr_user"], obj.id, "approved", None)
        assert obj.status == "approved"
        # Đã duyệt xong thì không duyệt lại được nữa.
        with pytest.raises(ApiError) as exc:
            shifts.overtime_manager_decision(team["manager_user"], obj.id,
                                             "approved", None)
        assert exc.value.status == 409

    def _clear_cached_user(self):
        """Xóa user đã cache trong flask.g (xem test_leave.py).

        conftest giữ MỘT app context cho cả test nên mọi request HTTP
        dùng chung `g`; guards.load_current_user cache user đầu tiên
        vào g.current_user và request sau (dù mang token khác) sẽ bị
        xác thực nhầm thành user đó.
        """
        from flask import g
        g.pop("current_user", None)

    def test_overtime_reject_requires_note_via_http(
            self, app, client, session, team):
        token = login(client, "nv0002@hrm.local", "Employee@123")
        headers = auth_headers(token)
        self._clear_cached_user()
        created = client.post("/api/v1/shifts/overtime", json={
            "work_date": "2026-11-10", "hours": 2, "reason": "Gap viec",
        }, headers=headers)
        assert created.status_code == 201, created.get_json()
        request_id = created.get_json()["data"]["id"]
        mgr_token = login(client, "nv0001@hrm.local", "Manager@123")
        self._clear_cached_user()
        resp = client.post(
            f"/api/v1/shifts/overtime/{request_id}/manager-decision",
            json={"decision": "reject"}, headers=auth_headers(mgr_token))
        assert resp.status_code == 400, resp.get_json()


# ---------------------------------------------------------------------------
# Gán ca: upsert theo (employee, work_date)
# ---------------------------------------------------------------------------

class TestAssignments:
    def _definition(self, session, name="Ca sáng"):
        definition = ShiftDefinition(
            name=name, start_time=time(6, 0), end_time=time(14, 0),
            is_overnight=False, is_active=True,
        )
        session.add(definition)
        session.commit()
        return definition

    def test_reassign_same_day_replaces_not_duplicates(
            self, app, session, team):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        morning = self._definition(session, "Ca sáng")
        afternoon = self._definition(session, "Ca chiều")
        first, created = shifts.upsert_assignment(admin, {
            "employee_id": team["employee"].id, "shift_id": morning.id,
            "work_date": date(2026, 11, 10), "note": None,
        })
        assert created is True
        second, created_again = shifts.upsert_assignment(admin, {
            "employee_id": team["employee"].id, "shift_id": afternoon.id,
            "work_date": date(2026, 11, 10), "note": None,
        })
        assert created_again is False
        assert second.id == first.id
        assert second.shift_id == afternoon.id
        count = session.query(ShiftAssignment).filter_by(
            employee_id=team["employee"].id,
            work_date=date(2026, 11, 10)).count()
        assert count == 1

    def test_duplicate_assignment_row_violates_unique_constraint(
            self, app, session, team):
        morning = self._definition(session, "Ca sáng")
        session.add(ShiftAssignment(
            employee_id=team["employee"].id, shift_id=morning.id,
            work_date=date(2026, 11, 10)))
        session.commit()
        session.add(ShiftAssignment(
            employee_id=team["employee"].id, shift_id=morning.id,
            work_date=date(2026, 11, 10)))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

    def test_inactive_shift_cannot_be_assigned(self, app, session, team):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        definition = self._definition(session, "Ca cũ")
        definition.is_active = False
        session.commit()
        with pytest.raises(ApiError) as exc:
            shifts.upsert_assignment(admin, {
                "employee_id": team["employee"].id,
                "shift_id": definition.id,
                "work_date": date(2026, 11, 10), "note": None,
            })
        assert exc.value.status == 400
        assert exc.value.code == "SHIFT_INACTIVE"

    def test_my_schedule_month_filter(self, app, session, team):
        admin = make_user(session, "admin@hrm.local", "Admin@123", "admin")
        definition = self._definition(session, "Ca sáng")
        shifts.upsert_assignment(admin, {
            "employee_id": team["employee"].id, "shift_id": definition.id,
            "work_date": date(2026, 11, 10), "note": None,
        })
        shifts.upsert_assignment(admin, {
            "employee_id": team["employee"].id, "shift_id": definition.id,
            "work_date": date(2026, 12, 1), "note": None,
        })
        items = shifts.my_schedule(team["employee_user"], "2026-11")
        assert len(items) == 1
        assert items[0].work_date == date(2026, 11, 10)
