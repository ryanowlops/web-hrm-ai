"""Suite kiểm chứng: endpoint nghỉ phép theo VAI TRÒ không đòi hồ sơ nhân viên.

Chạy:  server/.venv/bin/python server/check_leave_noprofile.py
Cơ chế: DB sqlite tạm + test_client + JWT thật (đăng nhập qua API).

Bối cảnh: tài khoản admin thuần hệ thống (không gắn hồ sơ nhân viên) mở trang
Nghỉ phép thì 2 khối theo vai trò — "Đơn chờ tôi duyệt (cấp HR)" và "Lịch nghỉ
đã duyệt trong tháng" — trả 400 NO_EMPLOYEE_PROFILE, frontend hiện banner đỏ
xấu. Quy tắc: màn hình của role nào thì hiện của role đó, khối nào không thuộc
về tài khoản thì ẩn hẳn, không hiện lỗi đỏ.

Bao phủ:
- Admin không hồ sơ: GET /leave/requests?status=manager_approved → 200 (thấy
  đơn chờ duyệt cuối); GET /leave/calendar → 200 (thấy lịch toàn công ty);
  POST hr-decision → 200 (duyệt cuối được, đúng quyền đã có).
- Admin không hồ sơ: GET /leave/requests?scope=mine → 400 NO_EMPLOYEE_PROFILE
  (phạm vi cá nhân vẫn bắt buộc có hồ sơ).
- Manager không hồ sơ: GET /leave/requests → 400 NO_EMPLOYEE_PROFILE (phạm vi
  team cần hồ sơ); GET /leave/calendar → 400 NO_EMPLOYEE_PROFILE.
- HR có hồ sơ / employee có hồ sơ: các endpoint trên vẫn 200 như cũ.
"""

import os
import sys
import tempfile
from datetime import date, timedelta

_fd, _DB_PATH = tempfile.mkstemp(prefix="leave_noprofile_check_", suffix=".db")
os.close(_fd)
os.remove(_DB_PATH)
os.environ["DATABASE_URL"] = f"sqlite:///{_DB_PATH}"
os.environ.pop("AI_API_KEY", None)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from werkzeug.security import generate_password_hash  # noqa: E402

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models import Department, Employee, User  # noqa: E402
from app.models.leave import LeaveRequest, LeaveType  # noqa: E402

app = create_app()
client = app.test_client()

PASSWORD = "Test@1234"
LOGIN_PATH = next(
    r.rule for r in app.url_map.iter_rules() if r.rule.endswith("/auth/login")
)

PASS = []
FAIL = []


def check(name, condition, extra=""):
    (PASS if condition else FAIL).append(name)
    print(f"[{'PASS' if condition else 'FAIL'}] {name} {extra if not condition else ''}")


def make_user(email, role, employee=None):
    user = User(
        email=email,
        password_hash=generate_password_hash(PASSWORD),
        full_name=email.split("@")[0],
        role=role,
        is_active=True,
        employee_id=employee.id if employee else None,
    )
    db.session.add(user)
    db.session.flush()
    return user


def login(email):
    resp = client.post(LOGIN_PATH, json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200, f"login {email} -> {resp.status_code}"
    body = resp.get_json()
    token = body.get("access_token") or body.get("data", {}).get("access_token")
    assert token, f"login {email}: không có access_token"
    return {"Authorization": f"Bearer {token}"}


TODAY = date.today()
with app.app_context():
    db.create_all()
    dept = Department(name="Kỹ thuật")
    db.session.add(dept)
    db.session.flush()
    emp_hr = Employee(code="NV9101", full_name="Nhân viên HR", email="hr1@hrm.local",
                      department_id=dept.id, status="working")
    emp_mgr = Employee(code="NV9102", full_name="Trưởng phòng", email="mgr@hrm.local",
                       department_id=dept.id, status="working")
    emp_staff = Employee(code="NV9103", full_name="Nhân viên A", email="staff@hrm.local",
                         department_id=dept.id, status="working",
                         manager_id=None)
    for e in (emp_hr, emp_mgr, emp_staff):
        db.session.add(e)
    db.session.flush()
    # Nhân viên A thuộc team của trưởng phòng (manager_id trực tiếp).
    emp_staff.manager_id = emp_mgr.id
    dept.manager_id = emp_mgr.id
    lt = LeaveType(name="Phép năm", paid=True, annual_quota_days=12)
    db.session.add(lt)
    db.session.flush()
    # Đơn đã qua cấp manager → chờ HR duyệt cuối.
    req_final = LeaveRequest(
        employee_id=emp_staff.id, leave_type_id=lt.id,
        from_date=TODAY + timedelta(days=5), to_date=TODAY + timedelta(days=6),
        days_count=2, reason="Nghỉ phép", status="manager_approved",
    )
    # Đơn đã duyệt hẳn → hiện trên lịch tháng.
    req_ok = LeaveRequest(
        employee_id=emp_staff.id, leave_type_id=lt.id,
        from_date=TODAY + timedelta(days=10), to_date=TODAY + timedelta(days=10),
        days_count=1, reason="Nghỉ phép", status="approved",
    )
    db.session.add_all([req_final, req_ok])
    make_user("admin@hrm.local", "admin")  # KHÔNG gắn hồ sơ
    make_user("hr1@hrm.local", "hr", emp_hr)
    make_user("mgr@hrm.local", "manager", emp_mgr)
    make_user("staff@hrm.local", "employee", emp_staff)
    make_user("mgr-noprofile@hrm.local", "manager")  # manager KHÔNG gắn hồ sơ
    db.session.commit()
    REQ_FINAL_ID = req_final.id

ADMIN = login("admin@hrm.local")
HR = login("hr1@hrm.local")
MGR = login("mgr@hrm.local")
STAFF = login("staff@hrm.local")
MGR_NOPROFILE = login("mgr-noprofile@hrm.local")

MONTH = TODAY.strftime("%Y-%m")

# --- Admin không hồ sơ: khối theo vai trò phải mở được ---
r = client.get("/api/v1/leave/requests?status=manager_approved", headers=ADMIN)
check("admin noprofile: pending cấp cuối 200",
      r.status_code == 200, f"-> {r.status_code} {r.get_json()}")
if r.status_code == 200:
    ids = [x["id"] for x in (r.get_json().get("data") or [])]
    check("admin noprofile: thấy đơn chờ duyệt cuối", REQ_FINAL_ID in ids, f"ids={ids}")

r = client.get(f"/api/v1/leave/calendar?month={MONTH}", headers=ADMIN)
check("admin noprofile: calendar toàn công ty 200",
      r.status_code == 200, f"-> {r.status_code} {r.get_json()}")
if r.status_code == 200:
    names = [x.get("employee_name") for x in (r.get_json().get("data") or [])]
    check("admin noprofile: lịch có đơn đã duyệt", "Nhân viên A" in names, f"names={names}")

r = client.post(f"/api/v1/leave/requests/{REQ_FINAL_ID}/hr-decision",
                json={"decision": "approved"}, headers=ADMIN)
check("admin noprofile: duyệt cuối (hr-decision) 200",
      r.status_code == 200, f"-> {r.status_code} {r.get_json()}")

# --- Admin không hồ sơ: phạm vi cá nhân vẫn bắt buộc có hồ sơ ---
r = client.get("/api/v1/leave/requests?scope=mine", headers=ADMIN)
body = r.get_json() or {}
check("admin noprofile: scope=mine vẫn 400 NO_EMPLOYEE_PROFILE",
      r.status_code == 400 and body.get("error", {}).get("code") == "NO_EMPLOYEE_PROFILE",
      f"-> {r.status_code} {body}")

r = client.get("/api/v1/leave/balance/me", headers=ADMIN)
check("admin noprofile: balance/me vẫn 400 NO_EMPLOYEE_PROFILE",
      r.status_code == 400, f"-> {r.status_code}")

# --- Manager không hồ sơ: phạm vi team bắt buộc có hồ sơ ---
r = client.get("/api/v1/leave/requests?status=pending", headers=MGR_NOPROFILE)
body = r.get_json() or {}
check("manager noprofile: pending 400 NO_EMPLOYEE_PROFILE",
      r.status_code == 400 and body.get("error", {}).get("code") == "NO_EMPLOYEE_PROFILE",
      f"-> {r.status_code} {body}")

r = client.get(f"/api/v1/leave/calendar?month={MONTH}", headers=MGR_NOPROFILE)
check("manager noprofile: calendar 400 NO_EMPLOYEE_PROFILE",
      r.status_code == 400, f"-> {r.status_code}")

# --- Tài khoản có hồ sơ: không đổi hành vi ---
r = client.get("/api/v1/leave/requests?status=manager_approved", headers=HR)
check("hr có hồ sơ: pending cấp cuối 200", r.status_code == 200, f"-> {r.status_code}")

r = client.get(f"/api/v1/leave/calendar?month={MONTH}", headers=HR)
check("hr có hồ sơ: calendar 200", r.status_code == 200, f"-> {r.status_code}")

r = client.get("/api/v1/leave/requests?status=pending", headers=MGR)
check("manager có hồ sơ: pending team 200", r.status_code == 200, f"-> {r.status_code}")

r = client.get(f"/api/v1/leave/calendar?month={MONTH}", headers=STAFF)
check("employee có hồ sơ: calendar 200", r.status_code == 200, f"-> {r.status_code}")

print(f"\n{len(PASS)} PASS, {len(FAIL)} FAIL")
if FAIL:
    print("FAILED:", FAIL)
    sys.exit(1)
