"""Suite kiểm chứng ĐỘC LẬP cho Briefing — báo cáo điều hành AI (v6 mục 4.4).

Chạy:  server/.venv/bin/python server/check_v6_briefing.py
Cơ chế: DB sqlite tạm + test_client + JWT thật (đăng nhập qua API).
Không bọc nhiều request trong một app_context chung — app_context chỉ dùng
cho khâu dựng fixture và các lời gọi service gốc để ĐỐI CHIẾU số.

Bao phủ (mục 4.4):
- Mọi số chính trong `numbers` khớp kết quả tính độc lập từ tầng sở hữu
  (ORM trực tiếp) và khớp lời gọi thẳng services gốc (people_ai attrition,
  engagement eNPS).
- Provider tắt → source=template, template chứa đầy đủ số chính.
- Prose AI (mock) chỉ chứa số thuộc gói số → source=ai; prose AI (mock)
  bịa thêm số → tự rơi xuống template.
- Quyền: employee → 403, không token → 401; period sai → 400;
  ref_date sai định dạng → 400; latest khi chưa có → 404.
- latest/history hoạt động sau khi generate.
"""

import os
import sys
import tempfile
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

# --- Môi trường: DB tạm + bảo đảm provider AI TẮT (chưa có key) -------------
_fd, _DB_PATH = tempfile.mkstemp(prefix="briefing_check_", suffix=".db")
os.close(_fd)
os.remove(_DB_PATH)
os.environ["DATABASE_URL"] = f"sqlite:///{_DB_PATH}"
os.environ.pop("AI_API_KEY", None)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from werkzeug.security import generate_password_hash  # noqa: E402

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402

import app.models.briefing  # noqa: E402,F401  (đăng ký model để create_all có bảng)
from app.blueprints.briefing import bp as briefing_bp  # noqa: E402

app = create_app()
# Parent chưa thêm "briefing" vào _MODULE_BLUEPRINTS tại thời điểm viết suite
# → đăng ký tay cho bản chạy kiểm chứng này (không sửa app/__init__.py).
if "briefing" not in app.blueprints:
    app.register_blueprint(briefing_bp)
client = app.test_client()

ICT = ZoneInfo("Asia/Ho_Chi_Minh")
TODAY = datetime.now(ICT).date()

PASS = []
FAIL = []


def check(name, condition, extra=""):
    (PASS if condition else FAIL).append(name)
    print(f"[{'PASS' if condition else 'FAIL'}] {name} {extra if not condition else ''}")


# ---------------------------------------------------------------------------
# Fixture: 6 nhân viên (5 đang làm + 1 đã nghỉ), dữ liệu các module quanh TODAY
# ---------------------------------------------------------------------------

FIXTURE = {}

with app.app_context():
    from app.models.attendance import Attendance
    from app.models.employees import Employee
    from app.models.engagement import Kudo, Survey, SurveyResponse
    from app.models.leave import LeaveRequest, LeaveType
    from app.models.offboarding import OffboardingProcess
    from app.models.org import Department
    from app.models.recruitment import Candidate, JobPosting
    from app.models.users import User

    db.create_all()

    dept = Department(name="Kỹ thuật")
    db.session.add(dept)
    db.session.flush()

    old_start = TODAY - timedelta(days=400)
    employees = {}
    specs = [
        ("NV01", "Nguyễn Thu Hà", "working", old_start),
        ("NV02", "Phạm Thị Lan", "working", TODAY),
        ("NV03", "Trần Văn Minh", "working", TODAY),
        ("NV04", "Lê Văn Đức", "working", old_start),
        ("NV05", "Đỗ Văn Hùng", "working", old_start),
        ("NV06", "Vũ Thị Mai", "resigned", old_start),
    ]
    for code, name, status, start in specs:
        emp = Employee(code=code, full_name=name, status=status,
                       start_date=start, department_id=dept.id,
                       email=f"{code.lower()}@hrm.local")
        db.session.add(emp)
        employees[code] = emp
    db.session.flush()

    hr_user = User(email="hr@hrm.local", full_name="Nguyễn Thu Hà",
                   password_hash=generate_password_hash("Hr@12345"),
                   role="hr", is_active=True, employee_id=employees["NV01"].id)
    emp_user = User(email="employee@hrm.local", full_name="Phạm Thị Lan",
                    password_hash=generate_password_hash("Employee@123"),
                    role="employee", is_active=True,
                    employee_id=employees["NV02"].id)
    db.session.add_all([hr_user, emp_user])
    db.session.flush()

    # Chấm công hôm nay: 3 đúng giờ, 1 muộn, 1 vắng.
    for code, status in [("NV01", "present"), ("NV02", "present"),
                         ("NV03", "present"), ("NV04", "late"),
                         ("NV05", "absent")]:
        db.session.add(Attendance(employee_id=employees[code].id,
                                  work_date=TODAY, status=status))

    leave_type = LeaveType(name="Phép năm")
    db.session.add(leave_type)
    db.session.flush()
    db.session.add_all([
        LeaveRequest(employee_id=employees["NV02"].id, leave_type_id=leave_type.id,
                     from_date=TODAY + timedelta(days=7),
                     to_date=TODAY + timedelta(days=8),
                     days_count=2.0, status="pending"),
        LeaveRequest(employee_id=employees["NV03"].id, leave_type_id=leave_type.id,
                     from_date=TODAY + timedelta(days=9),
                     to_date=TODAY + timedelta(days=9),
                     days_count=1.0, status="manager_approved"),
        LeaveRequest(employee_id=employees["NV04"].id, leave_type_id=leave_type.id,
                     from_date=TODAY, to_date=TODAY,
                     days_count=1.0, status="approved"),
    ])

    job_open = JobPosting(title="Lập trình viên Python", department_id=dept.id,
                          status="open")
    job_closed = JobPosting(title="Kế toán tổng hợp", department_id=dept.id,
                            status="closed")
    db.session.add_all([job_open, job_closed])
    db.session.flush()
    db.session.add_all([
        Candidate(job_id=job_open.id, full_name="Ứng viên A",
                  email="a@example.com"),
        Candidate(job_id=job_open.id, full_name="Ứng viên B",
                  email="b@example.com"),
    ])

    for idx in range(3):
        db.session.add(Kudo(from_user_id=hr_user.id,
                            to_employee_id=employees["NV02"].id,
                            message=f"Kudos {idx}"))

    survey = Survey(title="Khảo sát gắn kết Q4",
                    questions=[{"id": "q1", "type": "enps",
                                "text": "Bạn có sẵn lòng giới thiệu công ty?"}],
                    status="closed", created_by=hr_user.id)
    db.session.add(survey)
    db.session.flush()
    db.session.add_all([
        SurveyResponse(survey_id=survey.id, answers={"q1": 10}),
        SurveyResponse(survey_id=survey.id, answers={"q1": 9}),
    ])

    db.session.add(OffboardingProcess(
        employee_id=employees["NV06"].id, last_working_day=TODAY,
        status="completed", reason="Chuyển công tác"))

    db.session.commit()
    FIXTURE.update({
        "hr_user_id": hr_user.id,
        "survey_id": survey.id,
        "dept_id": dept.id,
    })


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def login(email, password):
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"login {email} failed: {resp.status_code}"
    return resp.get_json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


HR = login("hr@hrm.local", "Hr@12345")
EMP = login("employee@hrm.local", "Employee@123")
BASE = "/api/v1/briefing"

# --- 1. Phân quyền + validate ------------------------------------------------
resp = client.post(f"{BASE}/generate", json={"period": "month"}, headers=auth(EMP))
check("employee POST generate → 403", resp.status_code == 403, f"got {resp.status_code}")

resp = client.post(f"{BASE}/generate", json={"period": "month"})
check("không token POST generate → 401", resp.status_code == 401, f"got {resp.status_code}")

resp = client.get(f"{BASE}/latest?period=month", headers=auth(EMP))
check("employee GET latest → 403", resp.status_code == 403, f"got {resp.status_code}")

resp = client.post(f"{BASE}/generate", json={"period": "quarter"}, headers=auth(HR))
check("period sai → 400", resp.status_code == 400, f"got {resp.status_code}")

resp = client.post(f"{BASE}/generate",
                   json={"period": "month", "ref_date": "22/10/2026"}, headers=auth(HR))
check("ref_date sai định dạng → 400", resp.status_code == 400, f"got {resp.status_code}")

resp = client.get(f"{BASE}/latest?period=week", headers=auth(HR))
check("latest tuần khi chưa có → 404", resp.status_code == 404, f"got {resp.status_code}")

resp = client.get(f"{BASE}/latest?period=year", headers=auth(HR))
check("latest period sai → 400", resp.status_code == 400, f"got {resp.status_code}")

# --- 2. Generate tháng (provider tắt → template) ------------------------------
resp = client.post(f"{BASE}/generate",
                   json={"period": "month", "ref_date": TODAY.isoformat()},
                   headers=auth(HR))
check("HR generate month → 200", resp.status_code == 200, f"got {resp.status_code}")
briefing = resp.get_json()["data"]
numbers = briefing["numbers"]
check("provider tắt → source=template", briefing["source"] == "template",
      f"got {briefing['source']}")
check("kỳ tháng: period_start là ngày 1", numbers["period_start"].endswith("-01"),
      numbers["period_start"])
start = date.fromisoformat(numbers["period_start"])
end = date.fromisoformat(numbers["period_end"])

# --- 3. Đối chiếu số với tầng sở hữu (tính độc lập trong app_context) ---------
with app.app_context():
    from app.blueprints.engagement import services as engagement_services
    from app.blueprints.people_ai import services as people_ai_services
    from app.extensions import db as _db
    from app.models.attendance import Attendance
    from app.models.employees import Employee
    from app.models.engagement import Kudo
    from app.models.leave import LeaveRequest
    from app.models.offboarding import OffboardingProcess
    from app.models.recruitment import Candidate, JobPosting
    from app.models.users import User

    exp_headcount = Employee.query.filter(
        Employee.status != Employee.STATUS_RESIGNED).count()
    exp_new = Employee.query.filter(
        Employee.start_date >= start, Employee.start_date <= end).count()
    exp_dep = OffboardingProcess.query.filter(
        OffboardingProcess.status == "completed",
        OffboardingProcess.last_working_day >= start,
        OffboardingProcess.last_working_day <= end).count()

    att_rows = dict(_db.session.query(Attendance.status, _db.func.count(Attendance.id))
                    .filter(Attendance.work_date >= start, Attendance.work_date <= end)
                    .group_by(Attendance.status).all())
    exp_att_total = sum(att_rows.values())
    exp_present = att_rows.get("present", 0)
    exp_rate = round(exp_present * 100.0 / exp_att_total, 1) if exp_att_total else None

    exp_pending = LeaveRequest.query.filter(
        LeaveRequest.status.in_(("pending", "manager_approved"))).count()
    exp_approved = LeaveRequest.query.filter(
        LeaveRequest.status == "approved",
        LeaveRequest.from_date >= start, LeaveRequest.from_date <= end).count()

    exp_open = JobPosting.query.filter_by(status="open").count()
    from app.blueprints.briefing.services import _dt_bounds
    dt_start, dt_end = _dt_bounds(start, end)
    exp_candidates = Candidate.query.filter(
        Candidate.created_at >= dt_start, Candidate.created_at < dt_end).count()
    exp_kudos = Kudo.query.filter(
        Kudo.created_at >= dt_start, Kudo.created_at < dt_end).count()

    hr_user_obj = _db.session.get(User, FIXTURE["hr_user_id"])
    exp_attrition_high = people_ai_services.get_attrition_risk(
        hr_user_obj)["summary"]["high"]
    survey_result = engagement_services.survey_results(FIXTURE["survey_id"])
    exp_enps = next(q["enps_score"] for q in survey_result["questions"]
                    if q["type"] == "enps")

check("headcount_total khớp", numbers["headcount_total"] == exp_headcount == 5,
      f"{numbers['headcount_total']} vs {exp_headcount}")
check("new_hires khớp", numbers["new_hires"] == exp_new == 2,
      f"{numbers['new_hires']} vs {exp_new}")
check("departures khớp", numbers["departures"] == exp_dep == 1,
      f"{numbers['departures']} vs {exp_dep}")
check("attendance total/present khớp",
      numbers["attendance"]["total_records"] == exp_att_total == 5
      and numbers["attendance"]["present"] == exp_present == 3,
      f"{numbers['attendance']} vs total={exp_att_total}")
check("on_time_rate khớp", numbers["attendance"]["on_time_rate"] == exp_rate == 60.0,
      f"{numbers['attendance']['on_time_rate']} vs {exp_rate}")
check("late/absent khớp", numbers["attendance"]["late"] == 1
      and numbers["attendance"]["absent"] == 1)
check("leave pending khớp", numbers["leave"]["pending_requests"] == exp_pending == 2,
      f"{numbers['leave']['pending_requests']} vs {exp_pending}")
check("leave approved_in_period khớp",
      numbers["leave"]["approved_in_period"] == exp_approved == 1)
check("open jobs khớp", numbers["recruitment"]["open_job_postings"] == exp_open == 1)
check("new candidates khớp", numbers["recruitment"]["new_candidates"] == exp_candidates == 2,
      f"{numbers['recruitment']['new_candidates']} vs {exp_candidates}")
check("kudos khớp", numbers["engagement"]["kudos_in_period"] == exp_kudos == 3,
      f"{numbers['engagement']['kudos_in_period']} vs {exp_kudos}")
check("eNPS khớp survey_results gốc",
      numbers["engagement"]["enps"]["score"] == exp_enps == 100,
      f"{numbers['engagement']['enps']} vs {exp_enps}")
check("attrition_high_risk khớp people_ai gốc",
      numbers["attrition_high_risk"] == exp_attrition_high,
      f"{numbers['attrition_high_risk']} vs {exp_attrition_high}")

# --- 4. Template chứa đầy đủ số chính ------------------------------------------
prose = briefing["prose"]
check("template chứa tổng nhân sự", str(exp_headcount) in prose)
check("template chứa tỉ lệ đúng giờ", "60" in prose)
check("template chứa eNPS", "100" in prose)
check("template prose tự grounded (regex)",
      __import__("app.blueprints.briefing.services", fromlist=["x"])
      .prose_numbers_are_grounded(prose, numbers))

# --- 5. latest + history -------------------------------------------------------
resp = client.get(f"{BASE}/latest?period=month", headers=auth(HR))
latest = resp.get_json()["data"]
check("latest month → đúng briefing vừa tạo",
      resp.status_code == 200 and latest["id"] == briefing["id"])

resp = client.get(f"{BASE}/history", headers=auth(HR))
history = resp.get_json()["data"]
check("history có briefing vừa tạo",
      resp.status_code == 200 and any(b["id"] == briefing["id"] for b in history))

resp = client.get(f"{BASE}/history?period=week", headers=auth(HR))
check("history lọc period=week → rỗng (chưa tạo tuần)",
      resp.status_code == 200 and resp.get_json()["data"] == [])

# --- 6. Generate tuần -----------------------------------------------------------
resp = client.post(f"{BASE}/generate", json={"period": "week"}, headers=auth(HR))
week_briefing = resp.get_json()["data"]
check("generate week → 200 + period=week",
      resp.status_code == 200 and week_briefing["period"] == "week")
w_start = date.fromisoformat(week_briefing["numbers"]["period_start"])
check("week bắt đầu thứ 2, dài 7 ngày",
      w_start.weekday() == 0 and (date.fromisoformat(
          week_briefing["numbers"]["period_end"]) - w_start).days == 6)

resp = client.get(f"{BASE}/history?limit=1", headers=auth(HR))
check("history limit=1 tôn trọng", len(resp.get_json()["data"]) == 1)

# --- 7. AI mock: prose grounded → ai; prose bịa số → rơi template --------------
import app.ai_service as ai_service_module  # noqa: E402


class _FakeProvider:
    name = "fake"
    model = "fake"
    is_available = True

    def __init__(self, text):
        self._text = text

    def chat_completion(self, system_prompt, user_prompt, **kwargs):
        return self._text

    def ensure_available(self):
        return None

    def create_embeddings(self, inputs):
        return []


_original_get_provider = ai_service_module.get_provider
try:
    grounded_text = (
        f"Tổng nhân sự hiện hành là {exp_headcount} người, với "
        f"{numbers['new_hires']} nhân viên vào mới trong kỳ. "
        "Đội ngũ duy trì nhịp làm việc ổn định."
    )
    ai_service_module.get_provider = lambda: _FakeProvider(grounded_text)
    resp = client.post(f"{BASE}/generate",
                       json={"period": "month", "ref_date": TODAY.isoformat()},
                       headers=auth(HR))
    ai_briefing = resp.get_json()["data"]
    check("AI mock grounded → source=ai + prose nguyên văn",
          ai_briefing["source"] == "ai" and ai_briefing["prose"] == grounded_text,
          f"source={ai_briefing['source']}")

    ai_service_module.get_provider = lambda: _FakeProvider(
        "Công ty hiện có 999 nhân viên và tăng trưởng 45% trong kỳ.")
    resp = client.post(f"{BASE}/generate",
                       json={"period": "month", "ref_date": TODAY.isoformat()},
                       headers=auth(HR))
    fallback = resp.get_json()["data"]
    check("AI mock bịa số → rơi xuống template",
          fallback["source"] == "template" and "999" not in fallback["prose"],
          f"source={fallback['source']}")
finally:
    ai_service_module.get_provider = _original_get_provider

# --- Tổng kết -------------------------------------------------------------------
print(f"\n===== KẾT QUẢ: {len(PASS)} PASS / {len(FAIL)} FAIL =====")
if FAIL:
    print("FAIL:", FAIL)
    sys.exit(1)
print("TẤT CẢ PASS")
