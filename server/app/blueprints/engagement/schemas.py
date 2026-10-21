"""Schema (serialize + validate) cho module Engagement (kudos + khảo sát).

Serialize thủ công; validate trả (cleaned_data, errors) với errors dạng
[{"field": ..., "message": ...}] — đúng quy ước các module hiện tại.

Riêng phần khảo sát: serialize kết quả KHÔNG chứa bất kỳ định danh nào của
người trả lời (SurveyResponse vốn không lưu user_id).
"""

from datetime import date, datetime

from app.models.engagement import Kudo, Survey

BADGE_LABELS = {
    Kudo.BADGE_TEAMWORK: "Đồng đội",
    Kudo.BADGE_INNOVATION: "Sáng tạo",
    Kudo.BADGE_DEDICATION: "Tận tâm",
    Kudo.BADGE_LEADERSHIP: "Lãnh đạo",
    Kudo.BADGE_THANKS: "Cảm ơn",
}

QUESTION_TYPES = ("enps", "scale", "single", "text")


def _iso(value):
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


# ---------------------------------------------------------------------------
# Kudos
# ---------------------------------------------------------------------------

def kudo_to_dict(kudo):
    giver = getattr(kudo, "from_user", None)
    receiver = getattr(kudo, "to_employee", None)
    department = getattr(receiver, "department", None) if receiver else None
    return {
        "id": kudo.id,
        "from_user_id": kudo.from_user_id,
        "from_name": getattr(giver, "full_name", None),
        "from_employee_id": getattr(giver, "employee_id", None),
        "to_employee_id": kudo.to_employee_id,
        "to_name": getattr(receiver, "full_name", None),
        "to_code": getattr(receiver, "code", None),
        "to_department": getattr(department, "name", None),
        "badge": kudo.badge,
        "badge_label": BADGE_LABELS.get(kudo.badge, kudo.badge),
        "message": kudo.message,
        "created_at": _iso(getattr(kudo, "created_at", None)),
    }


def validate_kudo_payload(data):
    """Body {to_employee_id, badge, message}."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    to_employee_id = data.get("to_employee_id")
    if isinstance(to_employee_id, bool) or not isinstance(to_employee_id, int):
        errors.append(
            {"field": "to_employee_id", "message": "Phải là id nhân viên (số nguyên)."}
        )
    badge = data.get("badge")
    if badge is not None and badge not in Kudo.BADGES:
        errors.append(
            {
                "field": "badge",
                "message": "Loại huy hiệu không hợp lệ "
                "(teamwork|innovation|dedication|leadership|thanks).",
            }
        )
    message = data.get("message")
    if not isinstance(message, str) or not message.strip():
        errors.append({"field": "message", "message": "Lời nhắn là bắt buộc."})
    elif len(message.strip()) > 1000:
        errors.append({"field": "message", "message": "Lời nhắn tối đa 1000 ký tự."})
    if errors:
        return {}, errors
    return {
        "to_employee_id": to_employee_id,
        "badge": badge or Kudo.BADGE_THANKS,
        "message": message.strip(),
    }, errors


# ---------------------------------------------------------------------------
# Khảo sát
# ---------------------------------------------------------------------------

def survey_to_dict(survey, responded=None, response_count=None):
    creator = getattr(survey, "creator", None)
    data = {
        "id": survey.id,
        "title": survey.title,
        "description": getattr(survey, "description", None),
        "questions": survey.questions or [],
        "status": survey.status,
        "created_by": survey.created_by,
        "created_by_name": getattr(creator, "full_name", None),
        "ends_at": _iso(getattr(survey, "ends_at", None)),
        "created_at": _iso(getattr(survey, "created_at", None)),
        "updated_at": _iso(getattr(survey, "updated_at", None)),
    }
    if responded is not None:
        data["responded"] = bool(responded)
    if response_count is not None:
        data["response_count"] = response_count
    return data


def validate_questions(raw_questions):
    """Validate danh sách câu hỏi khi tạo khảo sát. Trả (questions, errors)."""
    errors = []
    if not isinstance(raw_questions, list) or not raw_questions:
        return [], [
            {"field": "questions", "message": "Cần ít nhất 1 câu hỏi."}
        ]
    if len(raw_questions) > 20:
        return [], [
            {"field": "questions", "message": "Tối đa 20 câu hỏi mỗi khảo sát."}
        ]
    questions = []
    seen_ids = set()
    for idx, raw in enumerate(raw_questions):
        prefix = f"questions[{idx}]"
        if not isinstance(raw, dict):
            errors.append({"field": prefix, "message": "Câu hỏi phải là object."})
            continue
        qtype = raw.get("type")
        if qtype not in QUESTION_TYPES:
            errors.append(
                {
                    "field": f"{prefix}.type",
                    "message": "Loại câu hỏi không hợp lệ (enps|scale|single|text).",
                }
            )
            continue
        text = raw.get("text")
        if not isinstance(text, str) or not text.strip():
            errors.append(
                {"field": f"{prefix}.text", "message": "Nội dung câu hỏi là bắt buộc."}
            )
            continue
        qid = raw.get("id")
        if not isinstance(qid, str) or not qid.strip():
            qid = f"q{idx + 1}"
        qid = qid.strip()
        if qid in seen_ids:
            errors.append(
                {"field": f"{prefix}.id", "message": f"id câu hỏi bị trùng: {qid}."}
            )
            continue
        seen_ids.add(qid)
        question = {"id": qid, "type": qtype, "text": text.strip()}
        if qtype == "single":
            options = raw.get("options")
            if (
                not isinstance(options, list)
                or len(options) < 2
                or any(not isinstance(o, str) or not o.strip() for o in options)
            ):
                errors.append(
                    {
                        "field": f"{prefix}.options",
                        "message": "Câu chọn 1 đáp án cần ít nhất 2 lựa chọn không rỗng.",
                    }
                )
                continue
            question["options"] = [o.strip() for o in options]
        questions.append(question)
    if errors:
        return [], errors
    return questions, errors


def validate_survey_payload(data):
    """Body {title, description?, questions, status?, ends_at?}."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        errors.append({"field": "title", "message": "Tiêu đề khảo sát là bắt buộc."})
    elif len(title.strip()) > 200:
        errors.append({"field": "title", "message": "Tiêu đề tối đa 200 ký tự."})
    description = data.get("description")
    if description is not None and not isinstance(description, str):
        errors.append({"field": "description", "message": "Phải là chuỗi."})
    status = data.get("status") or Survey.STATUS_ACTIVE
    if status not in Survey.STATUSES:
        errors.append(
            {"field": "status", "message": "Trạng thái không hợp lệ (draft|active|closed)."}
        )
    ends_at = None
    raw_ends = data.get("ends_at")
    if raw_ends:
        if isinstance(raw_ends, str):
            try:
                ends_at = datetime.fromisoformat(raw_ends.replace("Z", "+00:00"))
            except ValueError:
                errors.append(
                    {"field": "ends_at", "message": "Phải là ngày giờ ISO hợp lệ."}
                )
        else:
            errors.append(
                {"field": "ends_at", "message": "Phải là ngày giờ ISO hợp lệ."}
            )
    questions, q_errors = validate_questions(data.get("questions"))
    errors.extend(q_errors)
    if errors:
        return {}, errors
    return {
        "title": title.strip(),
        "description": description.strip() if isinstance(description, str) else None,
        "questions": questions,
        "status": status,
        "ends_at": ends_at,
    }, errors


def validate_answers(questions, answers):
    """Validate đáp án theo định nghĩa câu hỏi. Trả errors (rỗng = hợp lệ).

    - enps: int 0..10 (bắt buộc)
    - scale: int 1..5 (bắt buộc)
    - single: thuộc options (bắt buộc)
    - text: chuỗi ≤ 1000 ký tự (không bắt buộc)
    """
    errors = []
    if not isinstance(answers, dict):
        return [{"field": "answers", "message": "Đáp án phải là JSON object."}]
    for question in questions or []:
        qid = question.get("id")
        qtype = question.get("type")
        value = answers.get(qid)
        if qtype in ("enps", "scale"):
            low, high = (0, 10) if qtype == "enps" else (1, 5)
            if value is None:
                errors.append(
                    {"field": f"answers.{qid}", "message": "Câu này là bắt buộc."}
                )
            elif isinstance(value, bool) or not isinstance(value, int):
                errors.append(
                    {
                        "field": f"answers.{qid}",
                        "message": f"Phải là số nguyên {low}–{high}.",
                    }
                )
            elif value < low or value > high:
                errors.append(
                    {
                        "field": f"answers.{qid}",
                        "message": f"Phải trong khoảng {low}–{high}.",
                    }
                )
        elif qtype == "single":
            options = question.get("options") or []
            if value is None:
                errors.append(
                    {"field": f"answers.{qid}", "message": "Câu này là bắt buộc."}
                )
            elif value not in options:
                errors.append(
                    {
                        "field": f"answers.{qid}",
                        "message": "Đáp án phải là một trong các lựa chọn của câu hỏi.",
                    }
                )
        elif qtype == "text":
            if value is not None:
                if not isinstance(value, str):
                    errors.append(
                        {"field": f"answers.{qid}", "message": "Phải là chuỗi."}
                    )
                elif len(value) > 1000:
                    errors.append(
                        {
                            "field": f"answers.{qid}",
                            "message": "Tối đa 1000 ký tự.",
                        }
                    )
    return errors
