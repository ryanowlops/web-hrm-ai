"""Suite kiểm chứng v6 — Đội RECRUITMENT-AI (JD generator + Interview kit).

Chạy:  cd server && .venv/bin/python check_v6_recruitment_ai.py

Môi trường: SQLite tạm (file riêng), KHÔNG AI_API_KEY (đường template
mặc định), JWT thật cấp cho user seed (admin/hr/employee). Các request
đi qua test_client độc lập — không bọc nhiều request trong một
app_context chung. AI được mô phỏng bằng cách thay ``get_provider``
trong jd_service/kit_service (đúng điểm tích hợp duy nhất).

Phạm vi: hợp đồng docs/feature-expansion-v6.md mục 2 (JD) + mục 3 (kit).
"""
import json
import os
import sys
import tempfile

# --- Môi trường tách biệt TRƯỚC khi import app ----------------------------- #
_TMP = tempfile.mkdtemp(prefix="hrm_v6_recruit_")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ["JWT_SECRET_KEY"] = "check-v6-recruitment-secret"
os.environ.pop("AI_API_KEY", None)  # mặc định: provider không khả dụng
os.environ.pop("AUTO_SEED", None)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask_jwt_extended import create_access_token  # noqa: E402

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
import app.models.interview_kit as kit_model_module  # noqa: E402,F401  (đăng ký bảng mới)
from app.models import Department, JobPosting, User  # noqa: E402
from app.blueprints.recruitment import jd_service, kit_service  # noqa: E402

RESULTS = []


def check(name, condition, detail=""):
    RESULTS.append((name, bool(condition), detail))
    print(f"{'PASS' if condition else 'FAIL'}  {name}" + (f"  — {detail}" if detail and not condition else ""))


def make_user(email, role):
    user = User(email=email, password_hash="x", full_name=email.split("@")[0], role=role)
    db.session.add(user)
    db.session.commit()
    return user


def token_for(user):
    return create_access_token(
        identity=str(user.id), additional_claims={"role": user.role, "email": user.email}
    )


class FakeProvider:
    """Provider mô phỏng: trả nội dung cấu hình sẵn hoặc ném lỗi."""

    def __init__(self, content=None, exc=None):
        self._content = content
        self._exc = exc

    @property
    def is_available(self):
        return True

    def chat_completion(self, system_prompt, user_prompt, **kwargs):
        if self._exc is not None:
            raise self._exc
        return self._content


def main():
    app = create_app("development")

    # --- Seed tối thiểu (app_context RIÊNG cho việc seed/token) ------------ #
    with app.app_context():
        db.create_all()
        dept = Department(name="Kỹ thuật")
        db.session.add(dept)
        db.session.commit()
        admin = make_user("admin@check.local", "admin")
        hr = make_user("hr@check.local", "hr")
        employee = make_user("emp@check.local", "employee")
        job = JobPosting(
            title="Lập trình viên Python Senior",
            department_id=dept.id,
            description="Phát triển API cho hệ thống HRM bằng Flask.",
            requirements="Python, Flask, PostgreSQL, Docker",
            quantity=2,
            status="open",
        )
        db.session.add(job)
        db.session.commit()
        job_id = job.id
        dept_id = dept.id
        tokens = {"admin": token_for(admin), "hr": token_for(hr), "employee": token_for(employee)}
        job_count_before = db.session.query(JobPosting).count()

    client = app.test_client()

    def auth(role):
        return {"Authorization": f"Bearer {tokens[role]}"}

    # ===================================================================== #
    # MỤC 2 — AI TẠO JD
    # ===================================================================== #
    # JD-1: template khi không có AI key — đủ 4 trường + source=template.
    r = client.post(
        "/api/v1/jd/generate",
        json={"title": "Kế toán tổng hợp", "level": "middle", "skills": ["Excel", "MISA"]},
        headers=auth("hr"),
    )
    d = (r.get_json() or {}).get("data") or {}
    check("JD-1 template đủ 4 trường", r.status_code == 200
          and all(d.get(k) for k in ("summary", "responsibilities", "requirements", "benefits")),
          f"status={r.status_code} body={r.get_json()}")
    check("JD-1 source=template", d.get("source") == "template")

    # JD-2: không có ghi chú lương -> benefits ghi "thoả thuận" (không bịa).
    benefits_text = " ".join(d.get("benefits") or [])
    check("JD-2 không bịa lương (thoả thuận)", "thoả thuận" in benefits_text, benefits_text)

    # JD-3: có salary_note -> dùng nguyên văn ghi chú.
    r = client.post(
        "/api/v1/jd/generate",
        json={"title": "Kế toán tổng hợp", "salary_note": "15–20 triệu/tháng + thưởng quý"},
        headers=auth("hr"),
    )
    d = (r.get_json() or {}).get("data") or {}
    check("JD-3 dùng nguyên văn salary_note",
          "15–20 triệu/tháng + thưởng quý" in " ".join(d.get("benefits") or []))

    # JD-4: department_id tra được tên phòng ban vào summary.
    r = client.post(
        "/api/v1/jd/generate",
        json={"title": "Kỹ sư Backend", "department_id": dept_id, "level": "senior"},
        headers=auth("hr"),
    )
    d = (r.get_json() or {}).get("data") or {}
    check("JD-4 summary có tên phòng ban từ department_id", "Kỹ thuật" in (d.get("summary") or ""))

    # JD-5: mock AI trả JSON hợp lệ -> source=ai, nội dung theo AI.
    ai_jd = {
        "summary": "JD do AI viết cho vị trí kiểm thử.",
        "responsibilities": ["Việc A1", "Việc A2", "Việc A3"],
        "requirements": ["Yêu cầu B1", "Yêu cầu B2", "Yêu cầu B3"],
        "benefits": ["Lương thoả thuận theo năng lực", "Phúc lợi C2"],
    }
    original_jd_provider = jd_service.get_provider
    jd_service.get_provider = lambda: FakeProvider(content=json.dumps(ai_jd, ensure_ascii=False))
    try:
        r = client.post("/api/v1/jd/generate", json={"title": "Tester"}, headers=auth("hr"))
        d = (r.get_json() or {}).get("data") or {}
        check("JD-5 mock AI -> source=ai + đúng nội dung",
              r.status_code == 200 and d.get("source") == "ai"
              and d.get("summary") == ai_jd["summary"]
              and d.get("responsibilities") == ai_jd["responsibilities"],
              f"body={r.get_json()}")
    finally:
        jd_service.get_provider = original_jd_provider

    # JD-6: mock AI trả JSON SAI schema -> fallback template.
    jd_service.get_provider = lambda: FakeProvider(content=json.dumps({"summary": "thiếu hết"}))
    try:
        r = client.post("/api/v1/jd/generate", json={"title": "Tester"}, headers=auth("hr"))
        d = (r.get_json() or {}).get("data") or {}
        check("JD-6 AI sai schema -> template",
              r.status_code == 200 and d.get("source") == "template"
              and len(d.get("responsibilities") or []) >= 3)
    finally:
        jd_service.get_provider = original_jd_provider

    # JD-7: provider ném lỗi -> fallback template (không 5xx).
    from app.ai_service import AIResponseError
    jd_service.get_provider = lambda: FakeProvider(exc=AIResponseError("boom"))
    try:
        r = client.post("/api/v1/jd/generate", json={"title": "Tester"}, headers=auth("hr"))
        d = (r.get_json() or {}).get("data") or {}
        check("JD-7 provider lỗi -> template, HTTP 200",
              r.status_code == 200 and d.get("source") == "template")
    finally:
        jd_service.get_provider = original_jd_provider

    # JD-8: generate KHÔNG tạo JobPosting.
    with app.app_context():
        job_count_after = db.session.query(JobPosting).count()
    check("JD-8 generate không tạo JobPosting", job_count_after == job_count_before,
          f"before={job_count_before} after={job_count_after}")

    # JD-9: phân quyền — employee bị 403, khách không token bị 401.
    r_emp = client.post("/api/v1/jd/generate", json={"title": "X"}, headers=auth("employee"))
    r_anon = client.post("/api/v1/jd/generate", json={"title": "X"})
    check("JD-9 employee 403 + ẩn danh 401",
          r_emp.status_code == 403 and r_anon.status_code == 401,
          f"emp={r_emp.status_code} anon={r_anon.status_code}")

    # JD-10: thiếu title -> 400 VALIDATION_ERROR.
    r = client.post("/api/v1/jd/generate", json={"level": "senior"}, headers=auth("hr"))
    err = (r.get_json() or {}).get("error") or {}
    check("JD-10 thiếu title -> 400",
          r.status_code == 400 and err.get("code") == "VALIDATION_ERROR",
          f"status={r.status_code} err={err}")

    # JD-11: cấp bậc ảnh hưởng template (senior khác junior ở dòng kinh nghiệm).
    r_senior = client.post("/api/v1/jd/generate", json={"title": "Dev", "level": "senior"}, headers=auth("hr"))
    r_junior = client.post("/api/v1/jd/generate", json={"title": "Dev", "level": "junior"}, headers=auth("hr"))
    req_s = " ".join((r_senior.get_json() or {})["data"]["requirements"])
    req_j = " ".join((r_junior.get_json() or {})["data"]["requirements"])
    check("JD-11 template khác nhau theo cấp bậc", req_s != req_j and "4 năm" in req_s)

    # ===================================================================== #
    # MỤC 3 — BỘ CÂU HỎI PHỎNG VẤN
    # ===================================================================== #
    kit_url = f"/api/v1/jobs/{job_id}/interview-kit"

    # KIT-1: GET trước khi tạo -> 404.
    r = client.get(kit_url, headers=auth("hr"))
    check("KIT-1 GET chưa tạo -> 404", r.status_code == 404, f"status={r.status_code}")

    # KIT-2: generate (template) -> 200, version=1, generated_by=template.
    r = client.post(kit_url + "/generate", headers=auth("hr"))
    kit = (r.get_json() or {}).get("data") or {}
    questions = kit.get("questions") or []
    check("KIT-2 generate tạo kit v1 template",
          r.status_code == 200 and kit.get("version") == 1
          and kit.get("generated_by") == "template",
          f"status={r.status_code} body={r.get_json()}")

    # KIT-3: đủ 3 vòng, mỗi vòng >= 2 câu.
    rounds = {}
    for q in questions:
        rounds[q["round"]] = rounds.get(q["round"], 0) + 1
    check("KIT-3 đủ 3 vòng", set(rounds) == {1, 2, 3} and all(v >= 2 for v in rounds.values()),
          f"rounds={rounds}")

    # KIT-4: mọi câu có rubric + weight > 0.
    check("KIT-4 mọi câu có rubric + weight",
          all(q.get("rubric") and isinstance(q.get("weight"), (int, float)) and q["weight"] > 0
              for q in questions))

    # KIT-5: tổng weight chuẩn hoá = 100.
    total_weight = round(sum(q["weight"] for q in questions), 1)
    check("KIT-5 tổng weight = 100", total_weight == 100, f"total={total_weight}")

    # KIT-6: câu hỏi vòng 1 bám kỹ năng trích từ JD của tin (Python/Flask...).
    round1_topics = " ".join(q.get("topic", "") for q in questions if q["round"] == 1)
    check("KIT-6 vòng 1 bám kỹ năng JD", any(
        skill in round1_topics for skill in ("Python", "Flask", "PostgreSQL", "Docker")),
        round1_topics)

    # KIT-7: GET sau generate -> khớp version + số câu.
    r = client.get(kit_url, headers=auth("hr"))
    kit_get = (r.get_json() or {}).get("data") or {}
    check("KIT-7 GET đọc lại được kit",
          r.status_code == 200 and kit_get.get("version") == 1
          and len(kit_get.get("questions") or []) == len(questions))

    # KIT-8: regenerate -> version tăng lên 2.
    r = client.post(kit_url + "/generate", headers=auth("hr"))
    kit2 = (r.get_json() or {}).get("data") or {}
    check("KIT-8 regenerate tăng version", kit2.get("version") == 2,
          f"version={kit2.get('version')}")

    # KIT-9: PUT sửa tay -> persist + giữ version + updated_by đúng HR.
    edited = [dict(q) for q in questions]
    edited[0]["question"] = "Câu hỏi đã sửa bởi HR trong bài kiểm chứng."
    r = client.put(kit_url, json={"questions": edited}, headers=auth("hr"))
    kit_put = (r.get_json() or {}).get("data") or {}
    r = client.get(kit_url, headers=auth("hr"))
    kit_re = (r.get_json() or {}).get("data") or {}
    saved_q = (kit_re.get("questions") or [{}])[0].get("question")
    with app.app_context():
        hr_id = db.session.query(User).filter_by(email="hr@check.local").one().id
    check("KIT-9 PUT persist + giữ version + updated_by",
          kit_put.get("version") == 2 and saved_q == "Câu hỏi đã sửa bởi HR trong bài kiểm chứng."
          and kit_re.get("updated_by") == hr_id,
          f"saved={saved_q!r} updated_by={kit_re.get('updated_by')} hr_id={hr_id}")

    # KIT-10: PUT thiếu vòng -> 400; PUT questions rỗng -> 400.
    only_round1 = [q for q in edited if q["round"] == 1]
    r_bad1 = client.put(kit_url, json={"questions": only_round1}, headers=auth("hr"))
    r_bad2 = client.put(kit_url, json={"questions": []}, headers=auth("hr"))
    check("KIT-10 PUT sai cấu trúc -> 400",
          r_bad1.status_code == 400 and r_bad2.status_code == 400,
          f"bad1={r_bad1.status_code} bad2={r_bad2.status_code}")

    # KIT-11: job không tồn tại -> 404 ở cả 3 thao tác.
    missing = "/api/v1/jobs/999999/interview-kit"
    r_g = client.post(missing + "/generate", headers=auth("hr"))
    r_r = client.get(missing, headers=auth("hr"))
    r_u = client.put(missing, json={"questions": edited}, headers=auth("hr"))
    check("KIT-11 job không tồn tại -> 404 (generate/get/put)",
          (r_g.status_code, r_r.status_code, r_u.status_code) == (404, 404, 404),
          f"{r_g.status_code}/{r_r.status_code}/{r_u.status_code}")

    # KIT-12: phân quyền — employee bị 403 ở cả 3 thao tác.
    r_g = client.post(kit_url + "/generate", headers=auth("employee"))
    r_r = client.get(kit_url, headers=auth("employee"))
    r_u = client.put(kit_url, json={"questions": edited}, headers=auth("employee"))
    check("KIT-12 employee -> 403 (generate/get/put)",
          (r_g.status_code, r_r.status_code, r_u.status_code) == (403, 403, 403),
          f"{r_g.status_code}/{r_r.status_code}/{r_u.status_code}")

    # KIT-13: admin cũng dùng được generate.
    r = client.post(kit_url + "/generate", headers=auth("admin"))
    check("KIT-13 admin generate OK", r.status_code == 200
          and ((r.get_json() or {}).get("data") or {}).get("version") == 3)

    # KIT-14: mock AI hợp lệ -> generated_by=ai, vẫn đủ 3 vòng sau validate.
    ai_questions = []
    for rnd in (1, 2, 3):
        for i in range(3):
            ai_questions.append({
                "round": rnd, "topic": f"Chủ đề AI {rnd}.{i}",
                "question": f"Câu hỏi AI vòng {rnd} số {i}?",
                "rubric": "Rubric AI: đúng ý 60%, ví dụ 40%.", "weight": 10,
            })
    original_kit_provider = kit_service.get_provider
    kit_service.get_provider = lambda: FakeProvider(
        content=json.dumps({"questions": ai_questions}, ensure_ascii=False))
    try:
        r = client.post(kit_url + "/generate", headers=auth("hr"))
        kit_ai = (r.get_json() or {}).get("data") or {}
        ai_rounds = {q["round"] for q in kit_ai.get("questions") or []}
        check("KIT-14 mock AI -> generated_by=ai + đủ 3 vòng",
              r.status_code == 200 and kit_ai.get("generated_by") == "ai"
              and ai_rounds == {1, 2, 3} and kit_ai.get("version") == 4,
              f"body={r.get_json()}")
    finally:
        kit_service.get_provider = original_kit_provider

    # KIT-15: mock AI sai schema -> fallback template, version vẫn tăng.
    kit_service.get_provider = lambda: FakeProvider(content=json.dumps({"questions": [{"round": 9}]}))
    try:
        r = client.post(kit_url + "/generate", headers=auth("hr"))
        kit_fb = (r.get_json() or {}).get("data") or {}
        check("KIT-15 AI sai schema -> template",
              r.status_code == 200 and kit_fb.get("generated_by") == "template"
              and kit_fb.get("version") == 5,
              f"body={r.get_json()}")
    finally:
        kit_service.get_provider = original_kit_provider

    # ===================================================================== #
    failed = [name for name, ok, _ in RESULTS if not ok]
    print()
    print(f"=== TỔNG: {len(RESULTS) - len(failed)}/{len(RESULTS)} PASS ===")
    if failed:
        print("FAIL:", ", ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
