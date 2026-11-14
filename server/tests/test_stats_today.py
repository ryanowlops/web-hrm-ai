"""Thống kê realtime hôm nay — GET /stats/today.

Mọi role đã đăng nhập đều xem được (kể cả nhân viên): ai muộn / ai chưa
chấm / ai nghỉ / ai về sớm trong ngày, realtime theo giờ ICT.
Phạm vi: admin/hr/employee = toàn công ty; manager = chỉ phòng của mình.
"""
from datetime import datetime, time

import pytest

from app.blueprints.stats import routes as stats_routes
from app.models import Attendance, LeaveRequest, LeaveType
from app.models.shifts import ShiftAssignment, ShiftDefinition
from tests.conftest import auth_headers, login, make_department, make_employee, make_user


def _at(today, hour, minute=0):
    return datetime.combine(today, time(hour, minute))


@pytest.fixture()
def roster(session):
    """Dữ liệu hôm nay (ngày thật theo giờ ICT):
    - Kỹ thuật: 1 trưởng phòng (present), 1 present, 1 late 09:00,
      1 nghỉ phép đã duyệt, 1 chưa chấm, 1 đã nghỉ việc.
    - Kinh doanh: 1 về sớm 15:00, 1 late 08:30, 1 chưa chấm.
    """
    today = stats_routes._today()
    dept_kt = make_department(session, name="Kỹ thuật")
    dept_kd = make_department(session, name="Kinh doanh")

    shift = ShiftDefinition(name="Ca hành chính", start_time=time(8, 0),
                            end_time=time(17, 0), is_active=True)
    session.add(shift)
    session.commit()

    def assign(employee_id):
        session.add(ShiftAssignment(employee_id=employee_id,
                                    shift_id=shift.id, work_date=today))
        session.commit()

    def record(employee_id, status, check_in=None, check_out=None):
        session.add(Attendance(
            employee_id=employee_id, work_date=today, status=status,
            check_in_at=_at(today, *check_in) if check_in else None,
            check_out_at=_at(today, *check_out) if check_out else None,
        ))
        session.commit()

    manager = make_employee(session, code="NV0001", full_name="Trưởng Phòng",
                            email="manager@hrm.local", department_id=dept_kt.id)
    dept_kt.manager_id = manager.id
    session.commit()

    present = make_employee(session, code="NV0002", full_name="Trần Văn Minh",
                            email="minh@hrm.local", department_id=dept_kt.id)
    late = make_employee(session, code="NV0003", full_name="Lê Văn Muộn",
                         email="muon@hrm.local", department_id=dept_kt.id)
    on_leave = make_employee(session, code="NV0004", full_name="Phạm Thị Nghỉ",
                             email="nghi@hrm.local", department_id=dept_kt.id)
    missing = make_employee(session, code="NV0005", full_name="Bình Văn B",
                            email="binh@hrm.local", department_id=dept_kt.id)
    make_employee(session, code="NV0006", full_name="Người Nghỉ",
                  email="gone@hrm.local", department_id=dept_kt.id,
                  status="resigned")

    early = make_employee(session, code="NV0007", full_name="Hoàng Văn Sớm",
                          email="som@hrm.local", department_id=dept_kd.id)
    late2 = make_employee(session, code="NV0008", full_name="Vũ Thị Trễ",
                          email="tre@hrm.local", department_id=dept_kd.id)
    missing2 = make_employee(session, code="NV0009", full_name="An Văn A",
                             email="an@hrm.local", department_id=dept_kd.id)

    for emp in (present, late, early, late2):
        assign(emp.id)
    record(manager.id, "present", check_in=(8, 0))
    record(present.id, "present", check_in=(8, 0), check_out=(17, 0))
    record(late.id, "late", check_in=(9, 0))
    record(early.id, "present", check_in=(8, 0), check_out=(15, 0))
    record(late2.id, "late", check_in=(8, 30))

    leave_type = LeaveType(name="Phép năm", paid=True, annual_quota_days=12)
    session.add(leave_type)
    session.commit()
    session.add(LeaveRequest(
        employee_id=on_leave.id, leave_type_id=leave_type.id,
        from_date=today, to_date=today, days_count=1.0, status="approved",
    ))
    session.commit()

    users = {
        "admin": make_user(session, "admin@hrm.local", "Admin@123", "admin"),
        "manager": make_user(session, "manager@hrm.local", "Manager@123",
                             "manager", employee=manager),
        "present": make_user(session, "minh@hrm.local", "Employee@123",
                             "employee", employee=present),
        "missing": make_user(session, "binh@hrm.local", "Employee@123",
                             "employee", employee=missing),
        "on_leave": make_user(session, "nghi@hrm.local", "Employee@123",
                              "employee", employee=on_leave),
    }
    return {"today": today, "dept_kt": dept_kt, "users": users}


def _get_today(client, email, password):
    token = login(client, email, password)
    resp = client.get("/api/v1/stats/today", headers=auth_headers(token))
    assert resp.status_code == 200, resp.get_json()
    return resp.get_json()


def test_employee_sees_company_today(client, roster):
    """Nhân viên gọi được 200, thấy toàn công ty, số liệu khớp."""
    data = _get_today(client, "minh@hrm.local", "Employee@123")

    assert data["date"] == roster["today"].isoformat()
    assert data["generated_at"]
    assert data["scope"] == "company"
    assert data["counts"] == {
        "present": 3, "late": 2, "onLeave": 1,
        "notCheckedIn": 2, "earlyLeave": 1,
    }

    # Đi muộn xếp theo giờ vào; ngưỡng muộn = 08:00 + 15' = 08:15.
    late = data["late"]
    assert [item["name"] for item in late] == ["Vũ Thị Trễ", "Lê Văn Muộn"]
    assert [item["minutesLate"] for item in late] == [15, 45]
    assert late[0]["employeeCode"] == "NV0008"
    assert late[0]["checkInAt"].endswith("T08:30:00")
    assert late[1]["checkInAt"].endswith("T09:00:00")

    # Chưa chấm xếp theo tên; người đã nghỉ việc + người nghỉ phép bị loại.
    assert [item["name"] for item in data["notCheckedIn"]] == [
        "An Văn A", "Bình Văn B"]

    # Nghỉ phép: người có đơn đã duyệt bao hôm nay (dù chưa có bản ghi).
    assert [item["name"] for item in data["onLeave"]] == ["Phạm Thị Nghỉ"]

    # Về sớm: ra lúc 15:00 trong khi ca tới 17:00; ra đúng 17:00 không tính.
    assert [item["name"] for item in data["earlyLeave"]] == ["Hoàng Văn Sớm"]
    assert data["earlyLeave"][0]["checkOutAt"].endswith("T15:00:00")

    # Trạng thái của chính mình.
    assert data["myStatus"]["status"] == "present"
    assert data["myStatus"]["checkInAt"].endswith("T08:00:00")
    assert data["myStatus"]["checkOutAt"].endswith("T17:00:00")


def test_manager_sees_only_own_department(client, roster):
    """Manager chỉ thấy phòng mình quản lý (Kỹ thuật)."""
    data = _get_today(client, "manager@hrm.local", "Manager@123")

    assert data["scope"] == ["Kỹ thuật"]
    assert data["counts"] == {
        "present": 2, "late": 1, "onLeave": 1,
        "notCheckedIn": 1, "earlyLeave": 0,
    }
    assert [item["name"] for item in data["late"]] == ["Lê Văn Muộn"]
    assert [item["name"] for item in data["notCheckedIn"]] == ["Bình Văn B"]
    assert [item["name"] for item in data["onLeave"]] == ["Phạm Thị Nghỉ"]
    assert data["earlyLeave"] == []
    assert data["myStatus"]["status"] == "present"


def test_my_status_missing_and_on_leave(client, roster):
    """Chưa chấm -> myStatus null; nghỉ phép đã duyệt -> on_leave."""
    missing = _get_today(client, "binh@hrm.local", "Employee@123")
    assert missing["myStatus"] is None

    on_leave = _get_today(client, "nghi@hrm.local", "Employee@123")
    assert on_leave["myStatus"] == {
        "status": "on_leave", "checkInAt": None, "checkOutAt": None,
    }


def test_admin_my_status_null_and_unauthenticated_401(client, roster):
    """Admin không gắn nhân viên -> myStatus null; không token -> 401."""
    data = _get_today(client, "admin@hrm.local", "Admin@123")
    assert data["scope"] == "company"
    assert data["myStatus"] is None

    resp = client.get("/api/v1/stats/today")
    assert resp.status_code == 401


def test_overview_still_forbidden_for_employee(client, roster):
    """/overview không đổi: nhân viên vẫn 403 (chỉ /today mở cho mọi role)."""
    token = login(client, "minh@hrm.local", "Employee@123")
    resp = client.get("/api/v1/stats/overview", headers=auth_headers(token))
    assert resp.status_code == 403
