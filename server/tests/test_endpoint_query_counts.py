"""Guard test — số câu SQL của các endpoint demo hay chạm.

Mỗi câu SQL là 1 vòng đi-về tới Neon từ Render free tier. Chat đã tối ưu
(f60a12c, test_chat_query_counts.py) nhưng các endpoint trang chính chưa
bao giờ được đo: dashboard, danh sách nhân viên, chấm công tháng, bảng
lương, đơn nghỉ phép, feed, kudos, leaderboard. Test này đo 1 lần/endpoint
trên bộ dữ liệu đại diện (5 phòng, 20 nhân viên, 200 bản ghi chấm công,
20 phiếu lương) và fail nếu vượt giới hạn = số đo sau tối ưu + 1.
"""
from datetime import date, timedelta

from sqlalchemy import event

from app import db
from app.models import (Announcement, Attendance, Employee, FeedPost, Kudo,
                        LeaveRequest, LeaveType, PayrollItem, PayrollPeriod,
                        User)
from tests.conftest import (auth_headers, login, make_department,
                            make_employee, make_user)


class _Counter:
    def __init__(self):
        self.n = 0
        self.statements = []

    def __call__(self, conn, cursor, statement, parameters, context, executemany):
        self.n += 1
        self.statements.append(statement)


def _count(fn):
    counter = _Counter()
    event.listen(db.engine, "before_cursor_execute", counter)
    try:
        return fn(), counter
    finally:
        event.remove(db.engine, "before_cursor_execute", counter)


def _seed(session):
    depts = [make_department(session, name=f"Phòng {i}") for i in range(1, 6)]
    emps = []
    for d in range(5):
        for j in range(4):
            i = d * 4 + j
            emps.append(make_employee(
                session, code=f"NV90{i:02d}", full_name=f"Nhan Vien {i:02d}",
                email=f"nv90{i:02d}@hrm.local", department_id=depts[d].id))
    admin = make_user(session, email="admin@hrm.local", password="Admin@123",
                      role="admin")
    hr = make_user(session, email="hr@hrm.local", password="Hr@12345",
                   role="hr", employee=emps[0])
    manager = make_user(session, email="mgr@hrm.local", password="Manager@123",
                        role="manager", employee=emps[4])
    emp = make_user(session, email="emp@hrm.local", password="Employee@123",
                    role="employee", employee=emps[8])
    period = PayrollPeriod(year=2026, month=11, status="draft",
                           standard_workdays=21.0)
    session.add(period)
    session.flush()
    for i, e in enumerate(emps):
        session.add(PayrollItem(
            period_id=period.id, employee_id=e.id,
            base_salary=10000000 + i * 100000, allowance=1000000,
            total_salary=11000000 + i * 100000, workdays_paid=21.0))
    lt = LeaveType(name="Phép năm", paid=True, annual_quota_days=12)
    session.add(lt)
    session.flush()
    today = date(2026, 11, 15)
    for k, e in enumerate(emps[:8]):
        session.add(LeaveRequest(
            employee_id=e.id, leave_type_id=lt.id,
            status=(LeaveRequest.STATUS_APPROVED if k % 2 == 0
                    else LeaveRequest.STATUS_PENDING),
            from_date=today + timedelta(days=k),
            to_date=today + timedelta(days=k + 1), days_count=2))
    for d in range(3, 13):
        for e in emps:
            session.add(Attendance(
                employee_id=e.id, work_date=date(2026, 11, d),
                status=Attendance.STATUS_PRESENT))
    for k, e in enumerate(emps[:10]):
        session.add(Kudo(from_user_id=hr.id, to_employee_id=e.id,
                         badge="thanks", message=f"Lam tot lam {k}"))
    for k in range(3):
        session.add(Announcement(title=f"Thong bao {k}", content="Noi dung",
                                 category="general", author_id=hr.id))
    for k in range(5):
        session.add(FeedPost(author_id=hr.id, content=f"Bai dang {k}"))
    session.commit()
    return {"admin": admin, "hr": hr, "manager": manager, "emp": emp,
            "period": period}


# (đường dẫn, role, giới hạn) — giới hạn = số đo sau tối ưu + 1.
# Đo 2026-11-15 (20 nhân viên / 200 bản ghi chấm công, đếm lần gọi thứ 2
# sau khi xoá HTTP cache): overview 14, today 8, employees 3,
# departments 3, monthly 6, payroll items 5 (từng 27 — eager-load
# employee/department/period), leave/requests 11, balance/me 7,
# feed/activity 18, announcements 3, kudos 15, kudos/leaderboard 15,
# gamification/leaderboard 8 (từng 208 — sync gộp + tổng gộp +
# department eager-load + commit sau khi dựng items).
ENDPOINTS = [
    ("/api/v1/stats/overview", "admin", 15),
    ("/api/v1/stats/today", "admin", 9),
    ("/api/v1/employees", "admin", 4),
    ("/api/v1/departments", "admin", 4),
    ("/api/v1/attendance/monthly?month=11&year=2026", "admin", 7),
    ("/api/v1/payroll/periods/{period}/items", "admin", 6),
    ("/api/v1/leave/requests", "hr", 12),
    ("/api/v1/leave/balance/me", "emp", 8),
    ("/api/v1/feed/activity", "admin", 19),
    ("/api/v1/announcements", "admin", 4),
    ("/api/v1/engagement/kudos", "admin", 16),
    ("/api/v1/engagement/kudos/leaderboard", "admin", 16),
    ("/api/v1/gamification/leaderboard", "admin", 9),
]


def test_endpoint_query_counts(client, session):
    users = _seed(session)
    tokens = {}
    for role, email, pw in [
            ("admin", "admin@hrm.local", "Admin@123"),
            ("hr", "hr@hrm.local", "Hr@12345"),
            ("manager", "mgr@hrm.local", "Manager@123"),
            ("emp", "emp@hrm.local", "Employee@123")]:
        tokens[role] = login(client, email, pw)
    results = []
    for path, role, limit in ENDPOINTS:
        url = path.format(period=users["period"].id)
        # Gọi 2 lần, chỉ đếm lần 2: lần đầu lấp các dữ liệu lười đồng bộ
        # (ledger điểm, bản ghi absent) — đó là chi phí 1 lần, không phải
        # N+1. Xoá HTTP cache giữa 2 lần để lần 2 chạy lại đúng query
        # (không đo cache hit). Giới hạn guard đo chi phí ổn định của
        # mỗi lần mở trang.
        client.get(url, headers=auth_headers(tokens[role]))
        from app import http_cache

        http_cache.clear()
        (resp, counter) = _count(
            lambda u=url, r=role: client.get(u, headers=auth_headers(tokens[r])))
        assert resp.status_code == 200, (url, resp.status_code, resp.get_json())
        results.append((counter.n, url, limit))
    print("\n--- SQL statements per endpoint (20 emp / 200 attendance) ---")
    for n, url, limit in results:
        print(f"{n:4d}  {url}")
    for n, url, limit in results:
        assert n <= limit, f"{url}: {n} queries > limit {limit}"
