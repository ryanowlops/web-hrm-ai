"""Thư mời nhận việc (Offer Letter): tạo, gửi, phản hồi, thu hồi, hết hạn.

Quy ước: test viết theo hành vi ĐÚNG mong muốn; FAIL = bug.
- Trạng thái lưu trong DB: draft -> sent -> accepted | declined;
  draft | sent -> withdrawn. 'expired' chỉ tính lúc đọc (sent + quá hạn
  trả lời), không đổi trạng thái đã lưu.
- Nội dung thư sinh từ mẫu tiếng Việt, chứa tên ứng viên, tên vị trí,
  lương định dạng "12.000.000 VNĐ/tháng", ngày bắt đầu, hạn trả lời
  (nếu có), tên công ty "HRM AI".
"""

from datetime import date, timedelta

from app.models import Candidate, JobPosting
from app.models.offer_letter import OfferLetter
from tests.conftest import auth_headers, login, make_user


def _make_job(session, title="Lập trình viên Python"):
    job = JobPosting(
        title=title,
        description="JD",
        requirements="",
        quantity=1,
        deadline=date.today() + timedelta(days=30),
        status="open",
    )
    session.add(job)
    session.commit()
    return job


def _make_candidate(session, job, name="Nguyễn Văn Ứng", email="uv@hrm.local"):
    candidate = Candidate(
        job_id=job.id, full_name=name, email=email, status="passed"
    )
    session.add(candidate)
    session.commit()
    return candidate


def _admin_token(client, session):
    from app.models import User

    if User.query.filter_by(email="admin@hrm.local").first() is None:
        make_user(session, "admin@hrm.local", "Admin@123", "admin")
    return login(client, "admin@hrm.local", "Admin@123")


def _payload(candidate_id, job_id=None, salary=12000000,
             start=None, deadline=None):
    body = {
        "candidate_id": candidate_id,
        "salary": salary,
        "start_date": (start or date.today() + timedelta(days=30)).isoformat(),
    }
    if job_id is not None:
        body["job_id"] = job_id
    if deadline is not None:
        body["deadline"] = deadline.isoformat()
    return body


def _create_offer(client, token, **kwargs):
    resp = client.post(
        "/api/v1/offer-letters", json=_payload(**kwargs),
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()["data"]


# ---------------------------------------------------------------------------
# Tạo thư mời — validation
# ---------------------------------------------------------------------------

class TestCreateValidation:
    def test_missing_candidate_404(self, app, session, client):
        job = _make_job(session)
        token = _admin_token(client, session)
        resp = client.post(
            "/api/v1/offer-letters",
            json=_payload(candidate_id=999999, job_id=job.id),
            headers=auth_headers(token),
        )
        assert resp.status_code == 404, resp.get_json()

    def test_missing_job_404(self, app, session, client):
        job = _make_job(session)
        candidate = _make_candidate(session, job)
        token = _admin_token(client, session)
        resp = client.post(
            "/api/v1/offer-letters",
            json=_payload(candidate_id=candidate.id, job_id=999999),
            headers=auth_headers(token),
        )
        assert resp.status_code == 404, resp.get_json()

    def test_salary_must_be_positive(self, app, session, client):
        job = _make_job(session)
        candidate = _make_candidate(session, job)
        token = _admin_token(client, session)
        for bad_salary in (0, -1000):
            resp = client.post(
                "/api/v1/offer-letters",
                json=_payload(candidate_id=candidate.id, job_id=job.id,
                              salary=bad_salary),
                headers=auth_headers(token),
            )
            assert resp.status_code == 400, (bad_salary, resp.get_json())

    def test_past_start_date_400(self, app, session, client):
        job = _make_job(session)
        candidate = _make_candidate(session, job)
        token = _admin_token(client, session)
        resp = client.post(
            "/api/v1/offer-letters",
            json=_payload(candidate_id=candidate.id, job_id=job.id,
                          start=date.today() - timedelta(days=1)),
            headers=auth_headers(token),
        )
        assert resp.status_code == 400, resp.get_json()

    def test_create_returns_draft_with_generated_letter(self, app, session, client):
        job = _make_job(session, title="Lập trình viên Python")
        candidate = _make_candidate(session, job, name="Nguyễn Văn Ứng")
        token = _admin_token(client, session)
        start = date.today() + timedelta(days=30)
        deadline = date.today() + timedelta(days=10)
        data = _create_offer(
            client, token, candidate_id=candidate.id, job_id=job.id,
            salary=12000000, start=start, deadline=deadline,
        )
        assert data["status"] == "draft"
        assert data["candidateName"] == "Nguyễn Văn Ứng"
        assert data["jobTitle"] == "Lập trình viên Python"
        body = data["letterBody"]
        assert "Nguyễn Văn Ứng" in body
        assert "Lập trình viên Python" in body
        assert "12.000.000 VNĐ/tháng" in body
        assert start.strftime("%d/%m/%Y") in body
        assert deadline.strftime("%d/%m/%Y") in body
        assert "HRM AI" in body

    def test_create_without_job_id_uses_candidate_job(
            self, app, session, client):
        job = _make_job(session, title="Kỹ sư kiểm thử")
        candidate = _make_candidate(session, job)
        token = _admin_token(client, session)
        data = _create_offer(client, token, candidate_id=candidate.id)
        assert data["jobId"] is None
        assert data["jobTitle"] == "Kỹ sư kiểm thử"
        assert "Kỹ sư kiểm thử" in data["letterBody"]


# ---------------------------------------------------------------------------
# Gửi / phản hồi / thu hồi
# ---------------------------------------------------------------------------

class TestTransitions:
    def _setup(self, session, client):
        job = _make_job(session)
        candidate = _make_candidate(session, job)
        token = _admin_token(client, session)
        return _create_offer(
            client, token, candidate_id=candidate.id, job_id=job.id
        )

    def test_send_draft_to_sent(self, app, session, client):
        offer = self._setup(session, client)
        token = _admin_token(client, session)
        resp = client.post(
            f"/api/v1/offer-letters/{offer['id']}/send",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()["data"]["status"] == "sent"

    def test_send_non_draft_409(self, app, session, client):
        offer = self._setup(session, client)
        token = _admin_token(client, session)
        client.post(f"/api/v1/offer-letters/{offer['id']}/send",
                    headers=auth_headers(token))
        resp = client.post(
            f"/api/v1/offer-letters/{offer['id']}/send",
            headers=auth_headers(token),
        )
        assert resp.status_code == 409, resp.get_json()

    def test_respond_accepted_from_sent(self, app, session, client):
        offer = self._setup(session, client)
        token = _admin_token(client, session)
        client.post(f"/api/v1/offer-letters/{offer['id']}/send",
                    headers=auth_headers(token))
        resp = client.post(
            f"/api/v1/offer-letters/{offer['id']}/respond",
            json={"decision": "accepted"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()["data"]["status"] == "accepted"

    def test_respond_declined_from_sent(self, app, session, client):
        offer = self._setup(session, client)
        token = _admin_token(client, session)
        client.post(f"/api/v1/offer-letters/{offer['id']}/send",
                    headers=auth_headers(token))
        resp = client.post(
            f"/api/v1/offer-letters/{offer['id']}/respond",
            json={"decision": "declined"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()["data"]["status"] == "declined"

    def test_respond_from_draft_409(self, app, session, client):
        offer = self._setup(session, client)
        token = _admin_token(client, session)
        resp = client.post(
            f"/api/v1/offer-letters/{offer['id']}/respond",
            json={"decision": "accepted"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 409, resp.get_json()

    def test_respond_invalid_decision_400(self, app, session, client):
        offer = self._setup(session, client)
        token = _admin_token(client, session)
        client.post(f"/api/v1/offer-letters/{offer['id']}/send",
                    headers=auth_headers(token))
        resp = client.post(
            f"/api/v1/offer-letters/{offer['id']}/respond",
            json={"decision": "maybe"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 400, resp.get_json()

    def test_withdraw_from_draft(self, app, session, client):
        offer = self._setup(session, client)
        token = _admin_token(client, session)
        resp = client.post(
            f"/api/v1/offer-letters/{offer['id']}/withdraw",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()["data"]["status"] == "withdrawn"

    def test_withdraw_from_sent(self, app, session, client):
        offer = self._setup(session, client)
        token = _admin_token(client, session)
        client.post(f"/api/v1/offer-letters/{offer['id']}/send",
                    headers=auth_headers(token))
        resp = client.post(
            f"/api/v1/offer-letters/{offer['id']}/withdraw",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()["data"]["status"] == "withdrawn"

    def test_withdraw_after_accepted_409(self, app, session, client):
        offer = self._setup(session, client)
        token = _admin_token(client, session)
        client.post(f"/api/v1/offer-letters/{offer['id']}/send",
                    headers=auth_headers(token))
        client.post(
            f"/api/v1/offer-letters/{offer['id']}/respond",
            json={"decision": "accepted"}, headers=auth_headers(token),
        )
        resp = client.post(
            f"/api/v1/offer-letters/{offer['id']}/withdraw",
            headers=auth_headers(token),
        )
        assert resp.status_code == 409, resp.get_json()

    def test_get_unknown_offer_404(self, app, session, client):
        token = _admin_token(client, session)
        resp = client.get("/api/v1/offer-letters/999999",
                          headers=auth_headers(token))
        assert resp.status_code == 404, resp.get_json()


# ---------------------------------------------------------------------------
# Hết hạn (tính lúc đọc) + lọc danh sách + phân quyền
# ---------------------------------------------------------------------------

class TestExpiredAndListAndRoles:
    def test_expired_computed_on_read_without_mutating_db(
            self, app, session, client):
        job = _make_job(session)
        candidate = _make_candidate(session, job)
        token = _admin_token(client, session)
        offer = _create_offer(
            client, token, candidate_id=candidate.id, job_id=job.id,
            deadline=date.today() + timedelta(days=10),
        )
        client.post(f"/api/v1/offer-letters/{offer['id']}/send",
                    headers=auth_headers(token))
        # Dời hạn trả lời về quá khứ trực tiếp trong DB (giả lập thư hết hạn).
        stored = session.get(OfferLetter, offer["id"])
        stored.deadline = date.today() - timedelta(days=1)
        session.commit()
        resp = client.get(f"/api/v1/offer-letters/{offer['id']}",
                          headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()["data"]["status"] == "expired"
        # Trạng thái lưu trong DB vẫn là 'sent' (không bị đổi).
        session.expire_all()
        assert session.get(OfferLetter, offer["id"]).status == "sent"

    def test_list_filter_by_status(self, app, session, client):
        job = _make_job(session)
        candidate = _make_candidate(session, job)
        token = _admin_token(client, session)
        draft = _create_offer(client, token, candidate_id=candidate.id,
                              job_id=job.id)
        sent = _create_offer(client, token, candidate_id=candidate.id,
                             job_id=job.id)
        client.post(f"/api/v1/offer-letters/{sent['id']}/send",
                    headers=auth_headers(token))
        resp = client.get("/api/v1/offer-letters?status=sent",
                          headers=auth_headers(token))
        assert resp.status_code == 200, resp.get_json()
        body = resp.get_json()
        assert body["meta"]["totalItems"] == 1
        assert body["data"][0]["id"] == sent["id"]
        assert body["data"][0]["status"] == "sent"
        resp = client.get("/api/v1/offer-letters?status=draft",
                          headers=auth_headers(token))
        assert resp.get_json()["meta"]["totalItems"] == 1
        assert resp.get_json()["data"][0]["id"] == draft["id"]

    def test_employee_role_403(self, app, session, client):
        from tests.conftest import make_employee

        emp = make_employee(session, code="NV0001", full_name="Nhân Viên",
                            email="nv@hrm.local")
        make_user(session, "nv@hrm.local", "Employee@123", "employee",
                  employee=emp)
        token = login(client, "nv@hrm.local", "Employee@123")
        resp = client.get("/api/v1/offer-letters",
                          headers=auth_headers(token))
        assert resp.status_code == 403, resp.get_json()
        resp = client.post("/api/v1/offer-letters",
                           json=_payload(candidate_id=1),
                           headers=auth_headers(token))
        assert resp.status_code == 403, resp.get_json()

    def test_manager_role_403(self, app, session, client):
        make_user(session, "mgr@hrm.local", "Manager@123", "manager")
        token = login(client, "mgr@hrm.local", "Manager@123")
        resp = client.get("/api/v1/offer-letters",
                          headers=auth_headers(token))
        assert resp.status_code == 403, resp.get_json()
