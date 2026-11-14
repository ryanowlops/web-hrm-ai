"""Guard test — truy vấn của chatbot AI không được phình theo số nhân viên.

Mỗi câu SQL là 1 vòng đi-về tới Neon từ Render free tier: bảng lương
từng tốn 10 câu (nạp nhân viên 2 lần + 5 lazy load), "ai nghỉ phép hôm
nay" từng tốn 9 câu với 5 người và phình theo số người nghỉ (20 người
-> ~40 câu). Sau tối ưu (joinedload/selectinload + bỏ lần quét trùng):
bảng lương 5, phiếu lương 4, ai nghỉ phép 5 — và không tăng theo số
người. Test này fail nếu ai đó viết lại tool theo kiểu lazy load từng
bản ghi. Giới hạn = số đo sau tối ưu + 1 (dư cho thay đổi nhỏ hợp lý).
"""
from datetime import date, timedelta
from sqlalchemy import event
from app import db
from app.blueprints.chat import tools as t
from app.models import LeaveRequest, LeaveType, PayrollItem, PayrollPeriod, User
from tests.conftest import make_department, make_employee, make_user


class _Counter:
    def __init__(self):
        self.n = 0

    def __call__(self, conn, cursor, statement, parameters, context, executemany):
        self.n += 1


def _count(fn):
    counter = _Counter()
    event.listen(db.engine, "before_cursor_execute", counter)
    try:
        return fn(), counter.n
    finally:
        event.remove(db.engine, "before_cursor_execute", counter)


def _setup(session):
    dept = make_department(session, name="Kỹ thuật")
    emps = [make_employee(session, code=f"NV90{i:02d}", full_name=f"Nhan Vien {i:02d}",
                           email=f"nv90{i:02d}@hrm.local", department_id=dept.id)
            for i in range(1, 11)]
    make_user(session, email="hr@hrm.local", password="Test@123", role="hr", employee=emps[0])
    make_user(session, email="emp@hrm.local", password="Test@123", role="employee", employee=emps[2])
    period = PayrollPeriod(year=2026, month=11, status="draft", standard_workdays=21.0)
    session.add(period)
    session.flush()
    for i, e in enumerate(emps):
        session.add(PayrollItem(period_id=period.id, employee_id=e.id,
                                base_salary=10000000 + i * 100000, allowance=1000000,
                                total_salary=1000000 + i * 100000, workdays_paid=10.0))
    lt = LeaveType(name="Phép năm", paid=True, annual_quota_days=12)
    session.add(lt)
    session.flush()
    today = date.today()
    for e in emps[3:8]:
        session.add(LeaveRequest(employee_id=e.id, leave_type_id=lt.id,
                                 status=LeaveRequest.STATUS_APPROVED,
                                 from_date=today - timedelta(days=1),
                                 to_date=today + timedelta(days=1), days_count=3))
    session.commit()
    return {"hr": User.query.filter_by(email="hr@hrm.local").first(),
            "emp": User.query.filter_by(email="emp@hrm.local").first()}


def test_chat_tool_query_counts(session):
    u = _setup(session)
    cases = [
        ("bang luong HR", lambda: t.tool_my_payslip(
            u["hr"], month=11, year=2026,
            question="Cho anh bảng lương tháng 11/2026 của toàn công ty, ai cao nhất?"), 6),
        ("phieu luong cua minh", lambda: t.tool_my_payslip(
            u["emp"], month=11, year=2026,
            question="Lương tháng 11 của tôi là bao nhiêu?"), 5),
        ("phieu luong theo ma NV", lambda: t.tool_my_payslip(
            u["hr"], month=11, year=2026,
            question="Lương tháng 11 của nhân viên NV9005 là bao nhiêu?"), 5),
        ("ai nghi phep hom nay", lambda: t.tool_who_on_leave(u["hr"]), 6),
        ("tong quan cong ty", lambda: t.tool_team_overview(u["hr"]), 5),
        ("don cho duyet HR", lambda: t.tool_my_pending_approvals(u["hr"]), 4),
        ("so ngay phep", lambda: t.tool_my_leave_balance(u["emp"]), 7),
        ("cham cong thang 11", lambda: t.tool_my_attendance(u["emp"], month=11, year=2026), 4),
    ]
    for name, fn, limit in cases:
        answer, count = _count(fn)
        assert "Nguồn" not in str(answer)  # tool trả text thô, SOURCE_LINE do try_answer gắn
        assert count <= limit, f"{name}: {count} câu SQL > giới hạn {limit} (N+1?)"
