"""Chatbot: 5 tool tra cuu moi — phan quyen du 4 role.

Si so tung phong / ngay le / thong bao / tong hop tang ca / thu viec.
Quy tac: admin/hr thay toan cong ty; manager thay nhom/phong minh;
employee chi thay cua minh (hoac tong + phong minh voi so lieu tong hop).
Luong nguoi khac van khoa — neo hoi quy o cuoi file.
"""
from datetime import date

from app.models import (
    Announcement,
    Contract,
    Holiday,
    OvertimeRequest,
    PayrollItem,
    PayrollPeriod,
)
from tests.conftest import (
    auth_headers,
    login,
    make_department,
    make_employee,
    make_user,
)


def _setup(session):
    dept_kt = make_department(session, name="Kỹ thuật")
    dept_ns = make_department(session, name="Nhân sự")
    minh = make_employee(session, code="NV0001", full_name="Trần Văn Minh",
                         email="minh@hrm.local", department_id=dept_kt.id)
    dept_kt.manager_id = minh.id
    session.commit()
    lan = make_employee(session, code="NV0002", full_name="Phạm Thị Lan",
                        email="lan@hrm.local", department_id=dept_kt.id,
                        manager_id=minh.id)
    hung = make_employee(session, code="NV0003", full_name="Đỗ Văn Hùng",
                         email="hung@hrm.local", department_id=dept_kt.id,
                         manager_id=minh.id)
    ha = make_employee(session, code="NV0004", full_name="Nguyễn Thu Hà",
                       email="ha@hrm.local", department_id=dept_ns.id)
    mai = make_employee(session, code="NV0005", full_name="Vũ Thị Mai",
                        email="mai@hrm.local", department_id=dept_ns.id)
    # Lan thu viec den 15/12/2026; Hung thu viec da qua han 01/11/2026.
    c_lan = Contract.query.filter_by(employee_id=lan.id).first()
    c_lan.contract_type = "Thử việc"
    c_lan.end_date = date(2026, 12, 15)
    c_hung = Contract.query.filter_by(employee_id=hung.id).first()
    c_hung.contract_type = "Thử việc"
    c_hung.end_date = date(2026, 11, 1)
    session.add(Holiday(date=date(2026, 1, 1), name="Tết Dương lịch",
                        is_national=True))
    session.add(Holiday(date=date(2026, 4, 30),
                        name="Ngày Giải phóng miền Nam", is_national=True))
    session.add(Announcement(
        title="Nghỉ bù 24/11",
        content="Toàn công ty nghỉ bù ngày Văn hóa Việt Nam.",
        category="general", author_id=None))
    session.add(OvertimeRequest(employee_id=lan.id, work_date=date(2026, 11, 7),
                                hours=2.0, reason="Hoàn thiện báo cáo",
                                status=OvertimeRequest.STATUS_APPROVED))
    session.add(OvertimeRequest(employee_id=lan.id, work_date=date(2026, 11, 21),
                                hours=3.0, reason="Hỗ trợ khách hàng",
                                status=OvertimeRequest.STATUS_PENDING))
    session.add(OvertimeRequest(employee_id=hung.id, work_date=date(2026, 11, 8),
                                hours=4.0, reason="Triển khai hệ thống",
                                status=OvertimeRequest.STATUS_APPROVED))
    period = PayrollPeriod(year=2026, month=11, status="draft",
                           standard_workdays=21.0)
    session.add(period)
    session.flush()
    session.add(PayrollItem(period_id=period.id, employee_id=hung.id,
                            base_salary=12000000, allowance=2000000,
                            total_salary=2000000, workdays_paid=0.0))
    session.commit()
    make_user(session, email="admin@hrm.local", password="Test@123",
              role="admin")
    make_user(session, email="hr@hrm.local", password="Test@123",
              role="hr", employee=ha)
    make_user(session, email="manager@hrm.local", password="Test@123",
              role="manager", employee=minh)
    make_user(session, email="lan@hrm.local", password="Test@123",
              role="employee", employee=lan)
    make_user(session, email="mai@hrm.local", password="Test@123",
              role="employee", employee=mai)
    return {"lan": lan, "hung": hung}


def _ask(client, email, password, question):
    tok = login(client, email, password)
    r = client.post("/api/v1/chat/ask", json={"question": question},
                    headers=auth_headers(tok))
    assert r.status_code == 200, r.get_json()
    return r.get_json()


def test_headcount_admin_sees_all_departments(client, session):
    _setup(session)
    data = _ask(client, "admin@hrm.local", "Test@123",
                "Sĩ số từng phòng ban là bao nhiêu?")
    assert data["mode"] == "live_data"
    assert "Kỹ thuật: 3 người" in data["answer"]
    assert "Nhân sự: 2 người" in data["answer"]
    assert "5 nhân viên" in data["answer"]


def test_headcount_employee_sees_only_own_department(client, session):
    _setup(session)
    data = _ask(client, "lan@hrm.local", "Test@123",
                "Sĩ số từng phòng ban là bao nhiêu?")
    assert data["mode"] == "live_data"
    assert "5 nhân viên" in data["answer"]  # tổng công ty vẫn được biết
    assert "Kỹ thuật" in data["answer"]  # phòng của mình
    assert "Nhân sự" not in data["answer"]  # không thấy sĩ số phòng khác


def test_headcount_manager_sees_managed_departments(client, session):
    _setup(session)
    data = _ask(client, "manager@hrm.local", "Test@123",
                "Sĩ số từng phòng ban là bao nhiêu?")
    assert data["mode"] == "live_data"
    assert "Kỹ thuật: 3 người" in data["answer"]
    assert "Nhân sự" not in data["answer"]


def test_holidays_lists_year(client, session):
    _setup(session)
    data = _ask(client, "lan@hrm.local", "Test@123",
                "Ngày lễ năm 2026 có những ngày nào?")
    assert data["mode"] == "live_data"
    assert "01/01/2026" in data["answer"]
    assert "Tết Dương lịch" in data["answer"]
    assert "30/04/2026" in data["answer"]


def test_announcements_latest(client, session):
    _setup(session)
    data = _ask(client, "lan@hrm.local", "Test@123",
                "Xem thông báo mới nhất của công ty")
    assert data["mode"] == "live_data"
    assert "Nghỉ bù 24/11" in data["answer"]
    assert "Văn hóa Việt Nam" in data["answer"]


def test_overtime_summary_employee_own_only(client, session):
    _setup(session)
    data = _ask(client, "lan@hrm.local", "Test@123",
                "Thống kê tăng ca tháng 11")
    assert data["mode"] == "live_data"
    assert "của bạn" in data["answer"]
    assert "1 đơn đã duyệt (2 giờ)" in data["answer"]
    assert "Đỗ Văn Hùng" not in data["answer"]


def test_overtime_summary_admin_sees_company(client, session):
    _setup(session)
    data = _ask(client, "admin@hrm.local", "Test@123",
                "Thống kê tăng ca tháng 11")
    assert data["mode"] == "live_data"
    assert "toàn công ty" in data["answer"]
    assert "2 đơn đã duyệt" in data["answer"]
    assert "Đỗ Văn Hùng: 4 giờ" in data["answer"]


def test_probation_admin_lists_all(client, session):
    _setup(session)
    data = _ask(client, "admin@hrm.local", "Test@123", "Ai đang thử việc?")
    assert data["mode"] == "live_data"
    assert "2 nhân viên đang thử việc" in data["answer"]
    assert "Phạm Thị Lan" in data["answer"]
    assert "Đỗ Văn Hùng" in data["answer"]


def test_probation_employee_sees_only_self(client, session):
    _setup(session)
    data = _ask(client, "lan@hrm.local", "Test@123",
                "Tôi có đang thử việc không?")
    assert data["mode"] == "live_data"
    assert "đang trong thời gian thử việc" in data["answer"]
    assert "kết thúc 15/12/2026" in data["answer"]
    assert "Đỗ Văn Hùng" not in data["answer"]


def test_probation_employee_not_on_probation(client, session):
    _setup(session)
    data = _ask(client, "mai@hrm.local", "Test@123",
                "Tôi có đang thử việc không?")
    assert data["mode"] == "live_data"
    assert "không trong thời gian thử việc" in data["answer"]


def test_payslip_out_of_scope_still_refused(client, session):
    """Neo hồi quy: mở rộng tool không được mở cửa lương người khác."""
    _setup(session)
    data = _ask(client, "lan@hrm.local", "Test@123",
                "Lương tháng 11 của nhân viên NV0003 là bao nhiêu?")
    assert data["mode"] == "live_data"
    assert "chỉ xem được phiếu lương của chính mình" in data["answer"]
    assert "12.000.000" not in data["answer"]
    assert "2.000.000" not in data["answer"]
