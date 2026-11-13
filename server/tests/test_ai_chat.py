"""AI CV batch jobs + chatbot leave-decision tests.

- AiJob payload round-trip: hành vi ĐÚNG sau fix (payload JSON).
- Chatbot _detect_decide_leave: không được đề xuất duyệt đơn của người
  khác khi người được nhắc tên không có đơn chờ duyệt.
"""

from datetime import date

import pytest

from app.blueprints.ai import services as ai_services
from app.blueprints.chat import actions as chat_actions
from app.blueprints.chat.tools import _fold
from app.models import Candidate, JobPosting, LeaveRequest, LeaveType
from tests.conftest import (
    auth_headers,
    login,
    make_department,
    make_employee,
    make_user,
)


class _StubProvider:
    """Provider AI giả: chỉ cần ensure_available() không raise."""

    def ensure_available(self):
        return None


@pytest.fixture()
def _stub_ai(monkeypatch):
    monkeypatch.setattr(ai_services, "get_provider", lambda: _StubProvider())


def _make_job_with_candidates(session, n=2):
    dept = make_department(session)
    job = JobPosting(
        title="Lập trình viên Python",
        department_id=dept.id,
        description="JD",
        requirements="Python",
        quantity=1,
        deadline=date(2026, 12, 31),
        status="open",
    )
    session.add(job)
    session.commit()
    candidates = []
    for i in range(n):
        cand = Candidate(
            job_id=job.id,
            full_name=f"Ứng viên {i + 1}",
            email=f"candidate{i + 1}@example.local",
            status="new",
        )
        session.add(cand)
        candidates.append(cand)
    session.commit()
    return job, candidates


def test_create_cv_analysis_job_stores_payload(session, _stub_ai):
    """AiJob phải lưu candidate_ids/job_id/total vào payload JSON."""
    job, candidates = _make_job_with_candidates(session)
    ids = [c.id for c in candidates]

    ai_job = ai_services.create_cv_analysis_job(
        job.id, ids, created_by=None
    )

    assert ai_job.status == "pending"
    payload = ai_job.payload
    assert isinstance(payload, dict)
    assert payload["candidate_ids"] == ids
    assert payload["job_id"] == job.id
    assert payload["total"] == len(ids)
    assert payload["processed"] == 0
    assert payload["success"] == 0


def test_serialize_job_returns_payload_data(session, _stub_ai):
    """serialize_job phải trả lại candidate_ids/job_id/total từ payload."""
    job, candidates = _make_job_with_candidates(session)
    ids = [c.id for c in candidates]

    ai_job = ai_services.create_cv_analysis_job(job.id, ids, created_by=None)
    data = ai_services.serialize_job(ai_job)

    assert data["job_posting_id"] == job.id
    assert data["candidate_ids"] == ids
    assert data["total"] == len(ids)
    assert data["processed"] == 0


def test_serialize_job_legacy_payload_none(session):
    """Job cũ (payload=None) vẫn serialize an toàn, không nổ."""
    from app.models import AiJob

    ai_job = AiJob(job_type="cv_analysis", status="pending", payload=None)
    session.add(ai_job)
    session.commit()

    data = ai_services.serialize_job(ai_job)
    assert data["candidate_ids"] == []
    assert data["job_posting_id"] is None
    assert data["total"] is None


# ---------------------------------------------------------------------------
# Chatbot: duyệt đơn nghỉ phép
# ---------------------------------------------------------------------------

def _make_leave_setup(session):
    """Manager + 2 nhân viên trong team + 1 đơn pending của Lan."""
    dept = make_department(session, name="Kỹ thuật")
    manager = make_employee(
        session, code="NV0001", full_name="Trần Văn Minh",
        email="minh@hrm.local", department_id=dept.id,
    )
    dept.manager_id = manager.id
    session.commit()
    lan = make_employee(
        session, code="NV0002", full_name="Phạm Thị Lan",
        email="lan@hrm.local", department_id=dept.id,
        manager_id=manager.id,
    )
    hung = make_employee(
        session, code="NV0003", full_name="Đỗ Văn Hùng",
        email="hung@hrm.local", department_id=dept.id,
        manager_id=manager.id,
    )
    manager_user = make_user(
        session, "manager@hrm.local", "Manager@123", "manager",
        employee=manager,
    )
    leave_type = LeaveType(name="Phép năm", paid=True, annual_quota_days=12.0)
    session.add(leave_type)
    session.commit()
    req = LeaveRequest(
        employee_id=lan.id,
        leave_type_id=leave_type.id,
        from_date=date(2026, 11, 20),
        to_date=date(2026, 11, 21),
        days_count=2.0,
        reason="Việc gia đình",
        status=LeaveRequest.STATUS_PENDING,
    )
    session.add(req)
    session.commit()
    return manager_user, lan, hung, req


def test_detect_decide_leave_named_person_without_request(session):
    """[BUG nếu fail] Nhắc tên Hùng (không có đơn chờ) trong khi chỉ Lan
    có đơn chờ -> phải hỏi lại (action None), KHÔNG được đề xuất đơn của Lan."""
    manager_user, _lan, _hung, _req = _make_leave_setup(session)
    question = "duyệt đơn của Hùng"
    result = chat_actions._detect_decide_leave(
        manager_user, question, _fold(question)
    )

    assert result is not None
    assert result["action"] is None
    assert "Hùng" in result["answer"]


def test_detect_decide_leave_named_right_person(session):
    """Nhắc đúng tên Lan (có đơn chờ) -> đề xuất duyệt đúng đơn của Lan."""
    manager_user, lan, _hung, req = _make_leave_setup(session)
    question = "duyệt đơn của Lan"
    result = chat_actions._detect_decide_leave(
        manager_user, question, _fold(question)
    )

    assert result is not None
    action = result["action"]
    assert action is not None
    assert action["type"] == "decide_leave"
    assert action["payload"]["request_id"] == req.id
    assert action["payload"]["decision"] == "approve"
    assert lan.full_name in action["summary"]


def test_detect_decide_leave_no_name_falls_back_to_single_pending(session):
    """Không nhắc tên ai, chỉ 1 đơn chờ -> được rơi về đơn đó."""
    manager_user, _lan, _hung, req = _make_leave_setup(session)
    question = "duyệt đơn đi"
    result = chat_actions._detect_decide_leave(
        manager_user, question, _fold(question)
    )

    assert result is not None
    action = result["action"]
    assert action is not None
    assert action["type"] == "decide_leave"
    assert action["payload"]["request_id"] == req.id


def test_detect_decide_leave_reject_named_person(session):
    """Từ chối đơn của Lan (có lý do) -> action reject đúng đơn."""
    manager_user, _lan, _hung, req = _make_leave_setup(session)
    question = "từ chối đơn của Lan vì đang cao điểm dự án"
    result = chat_actions._detect_decide_leave(
        manager_user, question, _fold(question)
    )

    assert result is not None
    action = result["action"]
    assert action is not None
    assert action["payload"]["request_id"] == req.id
    assert action["payload"]["decision"] == "reject"
