"""Validate payload + serializer cho Interviews (feature-expansion-v5 B).

Validator thủ công theo khuôn gamification: trả (cleaned, errors) với
errors là list[{"field", "message"}]. Serializer KHÔNG lộ access_token
ra ngoài (token chỉ trả đúng 1 lần ở response start cho khách).
"""

import re

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")

MAX_ANSWER_CHARS = 5000


def _iso(value):
    return value.isoformat() if value is not None else None


# ---------------------------------------------------------------------------
# Validate
# ---------------------------------------------------------------------------

def validate_start_payload(data, is_guest):
    """Body POST /interviews/start.

    Mọi phiên: job_id (int, bắt buộc).
    Khách (chưa đăng nhập): thêm guest_name (2–120 ký tự) + guest_email
    đúng định dạng. User đã đăng nhập bỏ qua 2 trường khách.
    """
    errors = []
    cleaned = {}

    job_id = data.get("job_id")
    if job_id is None or (isinstance(job_id, str) and not job_id.strip()):
        errors.append({"field": "job_id", "message": "Vui lòng chọn vị trí phỏng vấn."})
    else:
        try:
            cleaned["job_id"] = int(job_id)
        except (TypeError, ValueError):
            errors.append({"field": "job_id", "message": "job_id phải là số nguyên."})

    if is_guest:
        name = (data.get("guest_name") or "").strip()
        if len(name) < 2:
            errors.append({"field": "guest_name", "message": "Vui lòng nhập họ tên (ít nhất 2 ký tự)."})
        elif len(name) > 120:
            errors.append({"field": "guest_name", "message": "Họ tên tối đa 120 ký tự."})
        else:
            cleaned["guest_name"] = name

        email = (data.get("guest_email") or "").strip()
        if not email:
            errors.append({"field": "guest_email", "message": "Vui lòng nhập email liên hệ."})
        elif len(email) > 255 or not EMAIL_RE.match(email):
            errors.append({"field": "guest_email", "message": "Email chưa đúng định dạng."})
        else:
            cleaned["guest_email"] = email.lower()

    return cleaned, errors


def validate_answer_payload(data):
    """Body POST /interviews/<id>/answer: {answer} 1..5000 ký tự."""
    errors = []
    cleaned = {}
    answer = data.get("answer")
    if answer is None or not str(answer).strip():
        errors.append({"field": "answer", "message": "Câu trả lời không được để trống."})
    else:
        answer = str(answer).strip()
        if len(answer) > MAX_ANSWER_CHARS:
            errors.append({
                "field": "answer",
                "message": f"Câu trả lời tối đa {MAX_ANSWER_CHARS} ký tự.",
            })
        else:
            cleaned["answer"] = answer
    return cleaned, errors


# ---------------------------------------------------------------------------
# Serializer
# ---------------------------------------------------------------------------

def job_to_dict(job):
    if job is None:
        return None
    data = {"id": job.id, "title": job.title}
    department = getattr(job, "department", None)
    if department is not None:
        data["department"] = {"id": department.id, "name": department.name}
    return data


def question_to_dict(qa):
    """Câu hỏi đang chờ trả lời — không kèm keywords/đáp án mẫu."""
    return {"order_no": qa.order_no, "question": qa.question}


def qa_report_to_dict(qa):
    return {
        "order_no": qa.order_no,
        "question": qa.question,
        "answer": qa.answer,
        "score": qa.score,
        "comment": qa.comment,
    }


def session_to_dict(session, include_report=False):
    """Trạng thái phiên. include_report=True (hoặc phiên đã finished)
    thì kèm toàn bộ câu hỏi + điểm + summary."""
    qas = list(session.qas or [])
    data = {
        "id": session.id,
        "job": job_to_dict(session.job),
        "is_guest": session.user_id is None,
        "guest_name": session.guest_name,
        "status": session.status,
        "current_index": session.current_index,
        "total_questions": len(qas),
        "answered_count": sum(1 for qa in qas if qa.answer),
        "created_at": _iso(session.created_at),
        "finished_at": _iso(session.finished_at),
    }
    if session.status == session.STATUS_FINISHED or include_report:
        data["overall_score"] = session.overall_score
        data["summary"] = session.summary_dict()
        data["questions"] = [qa_report_to_dict(qa) for qa in qas]
    return data
