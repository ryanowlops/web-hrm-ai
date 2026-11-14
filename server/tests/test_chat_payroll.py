"""Chatbot tra cứu lương theo quyền — số thật, kỳ chưa chốt ghi rõ tạm tính.

Hồi quy cho bug 2026-11-14: tool_my_payslip gọi payroll get_my_payslip rồi
bắt app.errors.ApiError trong khi payroll.services ném ApiError RIÊNG của
nó -> except không bắt được -> try_answer nuốt lỗi -> rơi về RAG, AI trả
lời bằng tài liệu quy chế thay vì số lương thật.
"""
from app.models import PayrollItem, PayrollPeriod
from tests.conftest import (
    auth_headers, login, make_department, make_employee, make_user,
)


def _period(session, month=11, year=2026, status="draft"):
    p = PayrollPeriod(year=year, month=month, status=status, standard_workdays=21.0)
    session.add(p)
    session.flush()
    return p


def _item(session, period, employee, base=10000000, allowance=1000000, total=1000000):
    it = PayrollItem(period_id=period.id, employee_id=employee.id,
                     base_salary=base, allowance=allowance,
                     total_salary=total, workdays_paid=0.0)
    session.add(it)
    session.commit()
    return it


def _ask(client, email, password, question):
    tok = login(client, email, password)
    r = client.post("/api/v1/chat/ask", json={"question": question},
                    headers=auth_headers(tok))
    assert r.status_code == 200, r.get_json()
    return r.get_json()


def test_employee_own_draft_payslip_is_live_data(client, session):
    emp = make_employee(session, code="NV9001", full_name="Test Nhan Vien")
    make_user(session, email="nv9001@hrm.local", password="Test@123",
              role="employee", employee=emp)
    p = _period(session)
    _item(session, p, emp, base=10000000, total=1000000)
    data = _ask(client, "nv9001@hrm.local", "Test@123",
                "Lương tháng 11/2026 của tôi là bao nhiêu?")
    assert data["mode"] == "live_data"
    assert "10.000.000" in data["answer"]  # lương cơ bản thật
    assert "1.000.000" in data["answer"]   # thực lĩnh thật (phụ cấp)
    assert "tạm tính" in data["answer"]    # kỳ draft phải ghi rõ
    assert "NV9001" in data["answer"]


def test_hr_lookup_other_employee_by_code(client, session):
    emp1 = make_employee(session, code="NV9001", full_name="Test Nhan Vien",
                         email="nv9001@hrm.local")
    emp2 = make_employee(session, code="NV9002", full_name="Nguoi Khac",
                         email="nv9002@hrm.local")
    make_user(session, email="hr9001@hrm.local", password="Test@123",
              role="hr", employee=emp1)
    p = _period(session)
    _item(session, p, emp2, base=12000000, allowance=2000000, total=2000000)
    data = _ask(client, "hr9001@hrm.local", "Test@123",
                "Lương tháng 11/2026 của nhân viên NV9002 là bao nhiêu?")
    assert data["mode"] == "live_data"
    assert "Nguoi Khac" in data["answer"]
    assert "12.000.000" in data["answer"]
    assert "2.000.000" in data["answer"]


def test_employee_asking_other_gets_refusal_not_numbers(client, session):
    emp1 = make_employee(session, code="NV9001", full_name="Test Nhan Vien",
                         email="nv9001@hrm.local")
    emp2 = make_employee(session, code="NV9002", full_name="Nguoi Khac",
                         email="nv9002@hrm.local")
    make_user(session, email="nv9001@hrm.local", password="Test@123",
              role="employee", employee=emp1)
    p = _period(session)
    _item(session, p, emp2, base=12000000, allowance=2000000, total=2000000)
    data = _ask(client, "nv9001@hrm.local", "Test@123",
                "Lương tháng 11/2026 của nhân viên NV9002 là bao nhiêu?")
    assert data["mode"] == "live_data"
    assert "chỉ xem được phiếu lương của chính mình" in data["answer"]
    assert "12.000.000" not in data["answer"]
    assert "Nguoi Khac" not in data["answer"]


def test_admin_without_profile_can_lookup_by_code(client, session):
    emp = make_employee(session, code="NV9002", full_name="Nguoi Khac",
                        email="nv9002@hrm.local")
    make_user(session, email="admin9001@hrm.local", password="Test@123",
              role="admin", employee=None)
    p = _period(session)
    _item(session, p, emp, base=12000000, allowance=2000000, total=2000000)
    data = _ask(client, "admin9001@hrm.local", "Test@123",
                "Lương tháng 11/2026 của nhân viên NV9002 là bao nhiêu?")
    assert data["mode"] == "live_data"
    assert "12.000.000" in data["answer"]


def test_hr_payroll_table_top_earner(client, session):
    emp1 = make_employee(session, code="NV9001", full_name="Test Nhan Vien",
                         email="nv9001@hrm.local")
    emp2 = make_employee(session, code="NV9002", full_name="Nguoi Khac",
                         email="nv9002@hrm.local")
    make_user(session, email="hr9001@hrm.local", password="Test@123",
              role="hr", employee=emp1)
    p = _period(session)
    _item(session, p, emp1, base=10000000, total=1000000)
    _item(session, p, emp2, base=12000000, total=2000000)
    data = _ask(client, "hr9001@hrm.local", "Test@123",
                "Cho anh bảng lương tháng 11/2026 của toàn công ty, ai cao nhất?")
    assert data["mode"] == "live_data"
    assert "Bảng lương tháng 11/2026" in data["answer"]
    assert "Nguoi Khac" in data["answer"]  # cao nhất đứng đầu
    assert "3.000.000" in data["answer"]   # tổng thực lĩnh 1tr + 2tr


def test_employee_locked_payslip_has_no_provisional_label(client, session):
    emp = make_employee(session, code="NV9001", full_name="Test Nhan Vien")
    make_user(session, email="nv9001@hrm.local", password="Test@123",
              role="employee", employee=emp)
    p = _period(session, month=10, status="locked")
    _item(session, p, emp, base=10000000, total=11000000)
    data = _ask(client, "nv9001@hrm.local", "Test@123",
                "Lương tháng 10/2026 của tôi là bao nhiêu?")
    assert data["mode"] == "live_data"
    assert "11.000.000" in data["answer"]
    assert "tạm tính" not in data["answer"]


def test_manager_lookup_team_member_by_name(client, session):
    mgr = make_employee(session, code="NV9000", full_name="Quan Ly",
                        email="ql9000@hrm.local")
    dept = make_department(session, name="Kinh doanh", manager_id=mgr.id)
    member = make_employee(session, code="NV9001", full_name="Nhan Vien A",
                           email="nv9001@hrm.local", department_id=dept.id)
    make_user(session, email="ql9000@hrm.local", password="Test@123",
              role="manager", employee=mgr)
    p = _period(session)
    _item(session, p, member, base=9000000, total=900000)
    data = _ask(client, "ql9000@hrm.local", "Test@123",
                "Lương tháng 11/2026 của Nhan Vien A là bao nhiêu?")
    assert data["mode"] == "live_data"
    assert "9.000.000" in data["answer"]
    assert "Nhan Vien A" in data["answer"]


def test_cua_minh_does_not_leak_another_minh(client, session):
    """'lương của mình' gõ không dấu thành 'cua minh' — không được nhầm
    sang đồng nghiệp tên Minh rồi lộ lương người ta."""
    minh = make_employee(session, code="NV9000", full_name="Tran Van Minh",
                         email="minh9000@hrm.local")
    lan = make_employee(session, code="NV9001", full_name="Pham Thi Lan",
                        email="lan9001@hrm.local")
    make_user(session, email="lan9001@hrm.local", password="Test@123",
              role="employee", employee=lan)
    p = _period(session)
    _item(session, p, minh, base=25000000, total=2000000)
    _item(session, p, lan, base=8000000, total=800000)
    data = _ask(client, "lan9001@hrm.local", "Test@123",
                "Lương tháng 11 của mình là bao nhiêu?")
    assert data["mode"] == "live_data"
    assert "Pham Thi Lan" in data["answer"]      # phiếu của chính Lan
    assert "8.000.000" in data["answer"]
    assert "25.000.000" not in data["answer"]    # không lộ lương của Minh
    assert "Tran Van Minh" not in data["answer"]
