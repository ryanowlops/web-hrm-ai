"""Stats overview + recruitment listing + leave export + JD/kit tests.

Các test gắn [BUG] là hành vi ĐÚNG mong muốn mà code hiện tại chưa làm:
test FAIL = bug đã tìm thấy, không phải test viết sai.
"""

import json
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from app.blueprints.recruitment import jd_service, kit_service
from app.blueprints.recruitment import services as recruitment_services
from app.blueprints.stats import routes as stats_routes
from app.errors import ApiError
from app.models import JobPosting, LeaveRequest, LeaveType
from tests.conftest import (
    auth_headers,
    login,
    make_department,
    make_employee,
    make_user,
)


# ---------------------------------------------------------------------------
# Stats: byStatus phải khớp totalEmployees
# ---------------------------------------------------------------------------

def test_employees_overview_by_status_sums_to_total(session):
    """[BUG] sum(byStatus.values()) phải bằng totalEmployees.

    Hiện tại byStatus đếm cả nhân viên đã nghỉ, còn totalEmployees thì
    loại họ ra -> hai số không bao giờ khớp khi có người nghỉ việc.
    """
    make_employee(session, code="NV0001", full_name="Người Một",
                  email="one@hrm.local")
    make_employee(session, code="NV0002", full_name="Người Hai",
                  email="two@hrm.local")
    make_employee(session, code="NV0003", full_name="Người Nghỉ",
                  email="gone@hrm.local", status="resigned")

    result = stats_routes._employees_overview(None)

    assert result["totalEmployees"] == 2
    assert sum(result["byStatus"].values()) == result["totalEmployees"]


def test_employees_overview_by_department_excludes_resigned(session):
    """byDepartment đã loại người nghỉ (đối chứng: chỗ này đúng)."""
    dept = make_department(session, name="Kỹ thuật")
    make_employee(session, code="NV0001", full_name="Người Một",
                  email="one@hrm.local", department_id=dept.id)
    make_employee(session, code="NV0002", full_name="Người Nghỉ",
                  email="gone@hrm.local", department_id=dept.id,
                  status="resigned")

    result = stats_routes._employees_overview(None)

    assert result["byDepartment"][0]["employeeCount"] == 1


# ---------------------------------------------------------------------------
# Stats: manager quản lý nhiều phòng phải thấy hết các phòng đó
# ---------------------------------------------------------------------------

def test_overview_manager_with_two_departments(session, client):
    """[BUG] Manager làm trưởng 2 phòng thì /overview phải tính cả 2 phòng.

    Hiện tại _manager_department_id chỉ trả phòng đầu tiên (order_by id),
    nên nhân viên phòng thứ hai biến mất khỏi mọi số liệu thống kê.
    """
    dept_a = make_department(session, name="Kỹ thuật")
    dept_b = make_department(session, name="Kinh doanh")
    manager = make_employee(session, code="NV0001", full_name="Trưởng Phòng",
                            email="manager@hrm.local")
    dept_a.manager_id = manager.id
    dept_b.manager_id = manager.id
    session.commit()
    make_employee(session, code="NV0002", full_name="Nhân viên A",
                  email="a@hrm.local", department_id=dept_a.id)
    make_employee(session, code="NV0003", full_name="Nhân viên B",
                  email="b@hrm.local", department_id=dept_b.id)
    manager_user = make_user(session, "manager2@hrm.local", "Manager@123",
                             "manager", employee=manager)
    token = login(client, "manager2@hrm.local", "Manager@123")

    resp = client.get("/api/v1/stats/overview", headers=auth_headers(token))
    assert resp.status_code == 200, resp.get_json()
    data = resp.get_json()

    assert data["totalEmployees"] == 2
    dept_names = {d["departmentName"] for d in data["byDepartment"]}
    assert dept_names == {"Kỹ thuật", "Kinh doanh"}


# ---------------------------------------------------------------------------
# Recruitment: tin hết hạn không được hiện công khai
# ---------------------------------------------------------------------------

def _make_job(session, title, deadline):
    job = JobPosting(
        title=title,
        description="JD",
        requirements="",
        quantity=1,
        deadline=deadline,
        status="open",
    )
    session.add(job)
    session.commit()
    return job


def test_public_list_hides_expired_jobs(session):
    """[BUG] Tin đã quá hạn nộp hồ sơ không được xuất hiện ở list công khai."""
    today = date.today()
    expired = _make_job(session, "Việc đã hết hạn", today - timedelta(days=1))
    live = _make_job(session, "Việc còn hạn", today + timedelta(days=30))

    jobs, _meta = recruitment_services.list_jobs({}, include_closed=False)
    ids = [j.id for j in jobs]

    assert live.id in ids
    assert expired.id not in ids


def test_public_get_expired_job_is_not_found(session):
    """[BUG] Xem chi tiết 1 tin đã hết hạn ở phía công khai -> 404."""
    expired = _make_job(session, "Việc đã hết hạn",
                        date.today() - timedelta(days=1))

    with pytest.raises(ApiError) as exc_info:
        recruitment_services.get_job(expired.id, public_only=True)

    assert exc_info.value.status_code == 404


def test_open_job_without_deadline_still_listed(session):
    """Tin mở không đặt hạn vẫn hiện công khai (đối chứng)."""
    job = _make_job(session, "Việc không hạn", None)

    jobs, _meta = recruitment_services.list_jobs({}, include_closed=False)
    assert job.id in [j.id for j in jobs]


# ---------------------------------------------------------------------------
# Leave CSV export: chỉ đơn đã duyệt mới khớp với báo cáo tổng hợp
# ---------------------------------------------------------------------------

def _make_leave_request(session, employee, leave_type, status,
                        from_day, to_day):
    req = LeaveRequest(
        employee_id=employee.id,
        leave_type_id=leave_type.id,
        from_date=date(2026, 11, from_day),
        to_date=date(2026, 11, to_day),
        days_count=float(to_day - from_day + 1),
        reason="test",
        status=status,
    )
    session.add(req)
    session.commit()
    return req


def test_leave_export_rows_only_approved(session):
    """[BUG] Export CSV nghỉ phép phải chỉ gồm đơn đã duyệt (như
    _approved_leave_in_month dùng cho báo cáo tổng hợp)."""
    emp = make_employee(session, code="NV0001", full_name="Người Một",
                        email="one@hrm.local")
    leave_type = LeaveType(name="Phép năm", paid=True, annual_quota_days=12.0)
    session.add(leave_type)
    session.commit()
    _make_leave_request(session, emp, leave_type,
                        LeaveRequest.STATUS_APPROVED, 10, 11)
    _make_leave_request(session, emp, leave_type,
                        LeaveRequest.STATUS_PENDING, 12, 12)
    _make_leave_request(session, emp, leave_type,
                        LeaveRequest.STATUS_REJECTED, 13, 13)

    rows = stats_routes._leave_export_rows(11, 2026, None)

    data_rows = rows[1:]  # bỏ header
    assert len(data_rows) == 1
    assert data_rows[0][7] == "Đã duyệt"


# ---------------------------------------------------------------------------
# JD prompt + kit level inference (logic thuần, không cần LLM)
# ---------------------------------------------------------------------------

def _extract_json_example(prompt):
    start = prompt.index("{")
    end = prompt.index("}", start) + 1
    return prompt[start:end]


def test_jd_system_prompt_json_example_is_valid():
    """[BUG] Ví dụ JSON trong _SYSTEM_PROMPT phải parse được và mỗi key
    chỉ xuất hiện 1 lần, giá trị là list. Hiện tại key 'responsibilities'
    lặp 2 lần và lần 2 là prose không có dấu ngoặc kép -> JSON sai."""
    snippet = _extract_json_example(jd_service._SYSTEM_PROMPT)

    pairs = []
    parsed = json.loads(
        snippet, object_pairs_hook=lambda p: pairs.extend(p) or dict(p)
    )
    keys = [k for k, _v in pairs]
    assert len(keys) == len(set(keys)), f"key trùng lặp: {keys}"
    assert isinstance(parsed["responsibilities"], list)
    assert isinstance(parsed["requirements"], list)
    assert isinstance(parsed["benefits"], list)
    assert isinstance(parsed["summary"], str)


def test_infer_level_no_substring_match():
    """[BUG] 'International Sales Executive' không được xếp junior chỉ vì
    chuỗi 'intern' nằm trong 'international'."""
    job = SimpleNamespace(
        title="International Sales Executive", requirements=""
    )
    assert kit_service.infer_level(job) != "junior"


def test_infer_level_real_intern_is_junior():
    """Đối chứng: 'Thực tập sinh' vẫn phải ra junior."""
    job = SimpleNamespace(title="Thực tập sinh Backend", requirements="")
    assert kit_service.infer_level(job) == "junior"


def test_infer_level_senior_keyword():
    """Đối chứng: từ khoá senior vẫn nhận diện đúng."""
    job = SimpleNamespace(title="Senior Python Developer", requirements="")
    assert kit_service.infer_level(job) == "senior"
