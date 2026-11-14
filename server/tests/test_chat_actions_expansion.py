"""Chatbot: 4 action tao moi — tang ca / kudos / doi ca / thong bao.

Moi action deu di qua 2 buoc: detect (POST /chat/ask) tra the xac nhan,
execute (POST /chat/actions/execute) moi thay doi du lieu. Phan quyen:
- Tang ca / doi ca: moi nhan vien co ho so, chi cho chinh minh.
- Kudos: moi nhan vien, tang cho dong nghiep khac minh (khong tu tang).
- Thong bao: CHI admin/hr; employee/manager bi tu choi ro rang.
- "Duyet don tang ca / doi ca": KHONG duoc roi vao decide_leave.
"""
from datetime import date

from app.models import (
    Announcement,
    Kudo,
    OvertimeRequest,
    ShiftSwapRequest,
)
from tests.conftest import (
    auth_headers,
    login,
    make_department,
    make_employee,
    make_user,
)


def _setup(session):
    dept = make_department(session, name="Kỹ thuật")
    minh = make_employee(session, code="NV0001", full_name="Trần Văn Minh",
                         email="minh@hrm.local", department_id=dept.id)
    dept.manager_id = minh.id
    session.commit()
    lan = make_employee(session, code="NV0002", full_name="Phạm Thị Lan",
                        email="lan@hrm.local", department_id=dept.id,
                        manager_id=minh.id)
    hung = make_employee(session, code="NV0003", full_name="Đỗ Văn Hùng",
                         email="hung@hrm.local", department_id=dept.id,
                         manager_id=minh.id)
    ha = make_employee(session, code="NV0004", full_name="Nguyễn Thu Hà",
                       email="ha@hrm.local", department_id=dept.id)
    session.commit()
    make_user(session, email="hr@hrm.local", password="Test@123",
              role="hr", employee=ha)
    make_user(session, email="manager@hrm.local", password="Test@123",
              role="manager", employee=minh)
    make_user(session, email="lan@hrm.local", password="Test@123",
              role="employee", employee=lan)
    make_user(session, email="hung@hrm.local", password="Test@123",
              role="employee", employee=hung)
    return {"lan": lan, "hung": hung, "minh": minh}


def _ask(client, email, password, question):
    tok = login(client, email, password)
    r = client.post("/api/v1/chat/ask", json={"question": question},
                    headers=auth_headers(tok))
    assert r.status_code == 200, r.get_json()
    return r.get_json()


def _execute(client, email, password, action):
    tok = login(client, email, password)
    r = client.post("/api/v1/chat/actions/execute",
                    json={"type": action["type"], "payload": action["payload"]},
                    headers=auth_headers(tok))
    return r


def test_create_overtime_detect_and_execute(client, session):
    users = _setup(session)
    data = _ask(client, "lan@hrm.local", "Test@123",
                "xin tăng ca ngày 21/11 3 giờ vì hoàn thiện báo cáo")
    assert data["mode"] == "action"
    action = data["action"]
    assert action["type"] == "create_overtime"
    assert action["payload"]["work_date"] == "2026-11-21"
    assert action["payload"]["hours"] == 3.0
    assert action["payload"]["reason"] == "hoàn thiện báo cáo"

    r = _execute(client, "lan@hrm.local", "Test@123", action)
    assert r.status_code == 200, r.get_json()
    assert "Đã tạo đơn tăng ca" in r.get_json()["result_text"]
    created = OvertimeRequest.query.filter_by(
        employee_id=users["lan"].id, work_date=date(2026, 11, 21)).first()
    assert created is not None
    assert created.status == OvertimeRequest.STATUS_PENDING
    assert created.hours == 3.0

    # Tạo trùng ngày -> 409 (không tính trùng giờ tăng ca 2 lần).
    r2 = _execute(client, "lan@hrm.local", "Test@123", action)
    assert r2.status_code == 409, r2.get_json()


def test_create_overtime_missing_hours_asks(client, session):
    _setup(session)
    data = _ask(client, "lan@hrm.local", "Test@123",
                "xin tăng ca ngày 21/11 vì hoàn thiện báo cáo")
    assert data["mode"] == "live_data"
    assert data.get("action") is None
    assert "mấy giờ" in data["answer"]


def test_create_kudos_detect_and_execute(client, session):
    users = _setup(session)
    data = _ask(client, "lan@hrm.local", "Test@123",
                "tặng kudos cho Đỗ Văn Hùng vì hỗ trợ dự án rất tốt")
    assert data["mode"] == "action"
    action = data["action"]
    assert action["type"] == "create_kudos"
    assert action["payload"]["to_employee_id"] == users["hung"].id
    assert action["payload"]["badge"] == "thanks"
    assert "hỗ trợ dự án rất tốt" in action["payload"]["message"]

    r = _execute(client, "lan@hrm.local", "Test@123", action)
    assert r.status_code == 200, r.get_json()
    assert "Đã tặng kudos" in r.get_json()["result_text"]
    created = Kudo.query.filter_by(
        to_employee_id=users["hung"].id).first()
    assert created is not None
    assert created.badge == "thanks"


def test_create_kudos_self_refused(client, session):
    _setup(session)
    data = _ask(client, "lan@hrm.local", "Test@123",
                "tặng kudos cho Phạm Thị Lan vì làm tốt")
    assert data.get("action") is None
    assert "không tặng kudos cho chính mình" in data["answer"]


def test_create_kudos_badge_detected(client, session):
    users = _setup(session)
    data = _ask(client, "lan@hrm.local", "Test@123",
                "tặng kudos cho Đỗ Văn Hùng vì sáng tạo ra quy trình mới")
    assert data["mode"] == "action"
    assert data["action"]["payload"]["badge"] == "innovation"
    assert data["action"]["payload"]["to_employee_id"] == users["hung"].id


def test_create_shift_swap_detect_and_execute(client, session):
    users = _setup(session)
    data = _ask(client, "lan@hrm.local", "Test@123",
                "đổi ca ngày 18/11 với Đỗ Văn Hùng")
    assert data["mode"] == "action"
    action = data["action"]
    assert action["type"] == "create_shift_swap"
    assert action["payload"]["target_id"] == users["hung"].id
    assert action["payload"]["work_date"] == "2026-11-18"

    r = _execute(client, "lan@hrm.local", "Test@123", action)
    assert r.status_code == 200, r.get_json()
    assert "Đã tạo đơn đổi ca" in r.get_json()["result_text"]
    created = ShiftSwapRequest.query.filter_by(
        requester_id=users["lan"].id, work_date=date(2026, 11, 18)).first()
    assert created is not None
    assert created.status == ShiftSwapRequest.STATUS_PENDING


def test_create_shift_swap_past_date_asks(client, session):
    _setup(session)
    data = _ask(client, "lan@hrm.local", "Test@123",
                "đổi ca ngày 10/11 với Đỗ Văn Hùng")
    assert data.get("action") is None
    assert "đã qua rồi" in data["answer"]


def test_create_announcement_hr_ok_employee_refused(client, session):
    _setup(session)
    question = ("đăng thông báo: Nghỉ bù 24/11 — "
                "toàn công ty nghỉ bù ngày Văn hóa Việt Nam")
    data = _ask(client, "hr@hrm.local", "Test@123", question)
    assert data["mode"] == "action"
    action = data["action"]
    assert action["type"] == "create_announcement"
    assert action["payload"]["title"] == "Nghỉ bù 24/11"
    assert "Văn hóa Việt Nam" in action["payload"]["content"]

    r = _execute(client, "hr@hrm.local", "Test@123", action)
    assert r.status_code == 200, r.get_json()
    assert "Đã đăng thông báo" in r.get_json()["result_text"]
    created = Announcement.query.filter_by(title="Nghỉ bù 24/11").first()
    assert created is not None

    # Nhân viên thường không được đăng thông báo.
    data2 = _ask(client, "lan@hrm.local", "Test@123", question)
    assert data2.get("action") is None
    assert "Chỉ HR và Admin" in data2["answer"]


def test_decide_overtime_not_routed_to_leave(client, session):
    """[BUG nếu fail] "Duyệt đơn tăng ca của Lan" không được đề xuất
    duyệt đơn NGHỈ PHÉP của Lan."""
    _setup(session)
    data = _ask(client, "manager@hrm.local", "Test@123",
                "duyệt đơn tăng ca của Lan")
    assert data.get("action") is None
    assert "Tăng ca" in data["answer"]
    assert "duyệt đơn nghỉ" not in data["answer"].lower()
