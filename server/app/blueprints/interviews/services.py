"""Service layer cho Interviews — phỏng vấn thử với AI (v5 mục B).

Luồng: start (JWT hoặc khách + access_token) -> sinh 5 câu hỏi từ JD
-> answer từng câu -> finish chấm điểm -> báo cáo.

AI qua app.ai_service (provider.chat_completion, tác vụ cấu trúc giữ
json_mode mặc định). MỌI bước AI đều có đường dự phòng xác định khi
provider không khả dụng/lỗi/trả JSON sai:
- Sinh câu hỏi: ngân hàng 15 câu mẫu theo nhóm từ khoá JD (QUESTION_BANK).
- Chấm điểm: heuristic độ dài + độ phủ keywords của từng câu.
summary.source luôn ghi rõ "ai" | "heuristic" để FE hiển thị trung thực.

Quyền sở hữu phiên: phiên user chỉ mở bằng JWT của đúng user đó; phiên
khách chỉ mở bằng header X-Session-Token khớp access_token (resolve ở
routes qua assert_session_access).
"""

import json
import re
import secrets
import unicodedata
from datetime import datetime

from flask import current_app

from app.extensions import db
from app.models.interview import InterviewQA, InterviewSession
from app.models.recruitment import JobPosting
from app.models.users import utcnow
from app.blueprints.interviews import schemas

TOTAL_QUESTIONS = 5


class ApiError(Exception):
    """Lỗi nghiệp vụ có mã HTTP + code chuẩn để routes trả về."""

    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or []


# ---------------------------------------------------------------------------
# Tiện ích văn bản
# ---------------------------------------------------------------------------

def fold(text):
    """Bỏ dấu tiếng Việt + thường hoá — dùng cho khớp từ khoá xác định."""
    if not text:
        return ""
    normalized = unicodedata.normalize("NFD", str(text))
    stripped = "".join(
        ch for ch in normalized if unicodedata.category(ch) != "Mn"
    )
    return stripped.replace("đ", "d").replace("Đ", "D").lower()


# Từ điển kỹ năng/năng lực thường gặp trong JD — (dạng hiển thị, dạng đã
# bỏ dấu để khớp). Khớp được từ nào thì từ đó thành "JD keyword".
SKILL_LEXICON = [
    ("Python", "python"), ("Flask", "flask"), ("Django", "django"),
    ("React", "react"), ("JavaScript", "javascript"),
    ("TypeScript", "typescript"), ("Vue", "vue"), ("Angular", "angular"),
    ("Node.js", "node"), ("SQL", "sql"), ("MySQL", "mysql"),
    ("PostgreSQL", "postgres"), ("MongoDB", "mongodb"),
    ("Excel", "excel"), ("Power BI", "power bi"), ("Figma", "figma"),
    ("Photoshop", "photoshop"), ("Git", "git"), ("Docker", "docker"),
    ("Linux", "linux"), ("Java", "java"), ("PHP", "php"),
    ("Laravel", "laravel"), ("C#", "c#"), (".NET", ".net"),
    ("Kiểm thử", "kiem thu"), ("Automation test", "automation"),
    ("Phân tích dữ liệu", "phan tich du lieu"), ("SEO", "seo"),
    ("Marketing", "marketing"), ("Bán hàng", "ban hang"),
    ("Chăm sóc khách hàng", "cham soc khach hang"),
    ("Kế toán", "ke toan"), ("Nhân sự", "nhan su"),
    ("Tiếng Anh", "tieng anh"), ("Quản lý dự án", "quan ly du an"),
    ("Agile/Scrum", "scrum"), ("REST API", "rest"),
    ("Kế hoạch sản xuất", "san xuat"), ("Kho vận", "kho van"),
]


def extract_jd_keywords(job):
    """Rút các kỹ năng/năng lực được nhắc trong JD (theo SKILL_LEXICON)."""
    text = fold(" ".join(filter(None, [
        job.title, job.description, job.requirements,
    ])))
    found = []
    for display, token in SKILL_LEXICON:
        if token in text and display not in found:
            found.append(display)
    return found


def _jd_text(job):
    parts = [
        f"Vị trí: {job.title}",
        f"Mô tả công việc:\n{job.description or '(không có mô tả)'}",
        f"Yêu cầu:\n{job.requirements or '(không có yêu cầu cụ thể)'}",
    ]
    return "\n\n".join(parts)[:4000]


# ---------------------------------------------------------------------------
# Ngân hàng câu hỏi mẫu (dự phòng khi không có AI) — 15 mẫu.
# stage: 0 mở đầu, 1 chuyên môn, 2 tình huống, 3 kết buổi.
# tags: token đã bỏ dấu để khớp JD; skill_slot=True: câu gắn với 1 kỹ
# năng cụ thể của JD (thay vào {skill}).
# ---------------------------------------------------------------------------

QUESTION_BANK = [
    {
        "stage": 1, "skill_slot": True, "tags": [],
        "q": "Hãy kể về một dự án hoặc công việc thực tế mà bạn đã sử dụng "
             "{skill}. Bạn đóng vai trò gì trong đó và kết quả cuối cùng ra sao?",
        "kw": ["dự án", "vai trò", "kết quả", "khó khăn"],
    },
    {
        "stage": 1,
        "tags": ["python", "flask", "django", "react", "javascript",
                 "typescript", "java", "php", "node", "vue", "angular"],
        "q": "Khi gặp một lỗi (bug) khó mà chưa rõ nguyên nhân, bạn thường "
             "điều tra và xử lý theo các bước nào? Cho một ví dụ cụ thể.",
        "kw": ["tái hiện", "log", "nguyên nhân", "kiểm tra", "test"],
    },
    {
        "stage": 1,
        "tags": ["python", "flask", "react", "javascript", "java", "php",
                 "node", "sql", "mysql", "postgres"],
        "q": "Bạn đã từng tối ưu hiệu năng cho một tính năng hoặc hệ thống "
             "chưa? Bạn đo lường trước/sau và cải thiện bằng cách nào?",
        "kw": ["đo lường", "hiệu năng", "tối ưu", "cache", "truy vấn"],
    },
    {
        "stage": 1,
        "tags": ["sql", "mysql", "postgres", "mongodb", "du lieu"],
        "q": "Khi thiết kế cơ sở dữ liệu cho một tính năng mới, bạn chú ý "
             "những nguyên tắc nào để dữ liệu nhất quán và truy vấn nhanh?",
        "kw": ["khoá chính", "khoá ngoại", "chuẩn hoá", "chỉ mục", "giao dịch"],
    },
    {
        "stage": 1,
        "tags": ["flask", "django", "node", "java", "php", "laravel",
                 "rest", ".net"],
        "q": "Hãy mô tả cách bạn thiết kế một API mới: cách đặt endpoint, "
             "xử lý lỗi và bảo mật bạn làm như thế nào?",
        "kw": ["endpoint", "mã trạng thái", "xác thực", "token", "kiểm tra dữ liệu"],
    },
    {
        "stage": 1,
        "tags": ["kiem thu", "automation", "python", "javascript", "java"],
        "q": "Bạn kiểm thử phần việc của mình như thế nào trước khi bàn "
             "giao? Khi nào bạn chọn viết kiểm thử tự động?",
        "kw": ["kiểm thử", "trường hợp", "tự động", "hồi quy", "bàn giao"],
    },
    {
        "stage": 1,
        "tags": ["excel", "power bi", "phan tich du lieu", "ke toan"],
        "q": "Bạn thường dùng Excel hoặc công cụ dữ liệu cho những công "
             "việc gì? Hãy kể một lần bạn rút ra được kết luận từ dữ liệu.",
        "kw": ["dữ liệu", "báo cáo", "phân tích", "hàm", "lọc"],
    },
    {
        "stage": 1,
        "tags": ["figma", "photoshop", "thiet ke"],
        "q": "Hãy mô tả quy trình của bạn khi nhận một yêu cầu thiết kế "
             "mới, từ lúc nhận brief đến khi bàn giao sản phẩm cuối.",
        "kw": ["brief", "phác thảo", "phản hồi", "người dùng", "bàn giao"],
    },
    {
        "stage": 1,
        "tags": ["ban hang", "cham soc khach hang", "marketing", "seo"],
        "q": "Hãy kể cách bạn xử lý một khách hàng khó tính hoặc một tình "
             "huống khách hàng phàn nàn về sản phẩm/dịch vụ.",
        "kw": ["lắng nghe", "đồng cảm", "giải pháp", "hài lòng", "theo dõi"],
    },
    {
        "stage": 2, "tags": [],
        "q": "Kể một lần bạn bất đồng ý kiến với đồng nghiệp hoặc quản lý "
             "trong công việc. Bạn đã xử lý thế nào và kết quả ra sao?",
        "kw": ["lắng nghe", "thảo luận", "thống nhất", "tôn trọng", "kết quả"],
    },
    {
        "stage": 2, "tags": [],
        "q": "Khi deadline rất gấp mà khối lượng công việc quá tải, bạn "
             "sắp xếp ưu tiên và trao đổi với quản lý như thế nào?",
        "kw": ["ưu tiên", "kế hoạch", "trao đổi", "chia nhỏ", "deadline"],
    },
    {
        "stage": 2, "tags": [],
        "q": "Lần gần nhất bạn phải học một công nghệ hoặc kỹ năng mới "
             "trong thời gian ngắn là khi nào? Bạn đã học bằng cách nào?",
        "kw": ["tài liệu", "thực hành", "hỏi", "thời gian", "áp dụng"],
    },
    {
        "stage": 2, "tags": [],
        "q": "Hãy kể về một sai lầm hoặc thất bại của bạn trong công việc "
             "trước đây và bài học bạn rút ra được từ đó.",
        "kw": ["sai lầm", "bài học", "cải thiện", "trách nhiệm", "phòng tránh"],
    },
    {
        "stage": 0, "tags": [],
        "q": "Vì sao bạn ứng tuyển vị trí này? Bạn kỳ vọng điều gì ở công "
             "việc và định hướng của mình trong 1–2 năm tới?",
        "kw": ["mục tiêu", "phát triển", "đóng góp", "lý do"],
    },
    {
        "stage": 3, "tags": [],
        "q": "Theo bạn, điểm mạnh lớn nhất giúp bạn làm tốt vị trí này là "
             "gì? Và điểm nào bạn đang muốn cải thiện thêm?",
        "kw": ["điểm mạnh", "ví dụ", "cải thiện", "bằng chứng"],
    },
]


def fallback_questions(job, jd_keywords):
    """Chọn 5 câu từ ngân hàng mẫu theo khớp từ khoá JD.

    Ưu tiên câu chuyên môn khớp JD (tối đa 3), sau đó lấp bằng câu mở
    đầu/tình huống/kết buổi theo đúng vòng cung một buổi phỏng vấn.
    Trả list[{"question", "keywords"}] đã sắp theo stage.
    """
    jd_folded = fold(" ".join(filter(None, [
        job.title, job.description, job.requirements,
    ])))

    def score_of(item):
        if item.get("skill_slot"):
            return 3 if jd_keywords else 0
        return sum(1 for tag in item["tags"] if tag in jd_folded)

    scored = [(score_of(item), idx, item)
              for idx, item in enumerate(QUESTION_BANK)]
    tech = sorted(
        (entry for entry in scored if entry[0] > 0),
        key=lambda entry: (-entry[0], entry[1]),
    )
    picked = [item for _score, _idx, item in tech[:3]]

    def fill_from(stages):
        for _score, _idx, item in sorted(scored, key=lambda entry: entry[1]):
            if len(picked) >= TOTAL_QUESTIONS:
                return
            if item in picked or item.get("skill_slot"):
                continue
            if item["stage"] in stages:
                picked.append(item)

    fill_from({0})        # câu mở đầu (động lực ứng tuyển)
    fill_from({2})        # câu tình huống
    fill_from({3})        # câu kết buổi
    fill_from({0, 1, 2, 3})  # lấp nốt nếu vẫn thiếu

    picked.sort(key=lambda item: item["stage"])
    result = []
    for item in picked[:TOTAL_QUESTIONS]:
        question = item["q"]
        keywords = list(item["kw"])
        if item.get("skill_slot"):
            skill = jd_keywords[0] if jd_keywords else "kỹ năng chuyên môn"
            question = question.replace("{skill}", skill)
            if jd_keywords:
                keywords = keywords + [jd_keywords[0]]
        result.append({"question": question, "keywords": keywords})
    return result


# ---------------------------------------------------------------------------
# Sinh câu hỏi bằng AI (json mode)
# ---------------------------------------------------------------------------

GEN_SYSTEM_PROMPT = (
    "Bạn là chuyên viên tuyển dụng giàu kinh nghiệm. Dựa trên mô tả vị "
    "trí (JD) được cung cấp, hãy tạo đúng 5 câu hỏi phỏng vấn bằng tiếng "
    "Việt: pha trộn câu hỏi chuyên môn/kỹ thuật, câu hỏi tình huống và "
    "câu hỏi về động lực/văn hoá. Mỗi câu kèm 3–6 từ khoá ngắn (tiếng "
    "Việt) mà một câu trả lời tốt nên nhắc tới. Chỉ trả về JSON dạng "
    "{\"questions\": [{\"question\": \"...\", \"keywords\": [\"...\"]}]} "
    "— không thêm bất kỳ chữ nào ngoài JSON."
)

SCORE_SYSTEM_PROMPT = (
    "Bạn là chuyên viên tuyển dụng chấm buổi phỏng vấn thử. Với mỗi câu "
    "hỏi và câu trả lời của ứng viên, chấm điểm 0–10 (số thực, 10 là "
    "xuất sắc) và nhận xét ngắn 1–2 câu bằng tiếng Việt. Sau đó tổng "
    "kết: overall_score thang 100, strengths (điểm mạnh, tối đa 4 ý), "
    "improvements (điểm cần cải thiện, tối đa 4 ý), verdict (1–2 câu). "
    "Câu chưa trả lời chấm 0. Chỉ trả về JSON dạng {\"per_question\": "
    "[{\"score\": 0, \"comment\": \"...\"}], \"overall_score\": 0, "
    "\"strengths\": [], \"improvements\": [], \"verdict\": \"...\"} — "
    "không thêm bất kỳ chữ nào ngoài JSON."
)


def _provider():
    try:
        from app import ai_service

        provider = ai_service.get_provider()
    except Exception:
        return None
    if provider is None or not getattr(provider, "is_available", False):
        return None
    return provider


def _parse_json_object(raw):
    """Trích dict JSON từ phản hồi AI (chấp nhận fence/thừa chữ) — cùng
    cách cv_analysis.parse_analysis_json đang dùng."""
    from app.ai_service.cv_analysis import AIValidationError, parse_analysis_json

    try:
        return parse_analysis_json(raw)
    except AIValidationError:
        return None


def _ai_questions(job):
    """Sinh 5 câu hỏi bằng AI; None nếu provider không dùng được/sai."""
    provider = _provider()
    if provider is None:
        return None
    try:
        raw = provider.chat_completion(GEN_SYSTEM_PROMPT, _jd_text(job))
    except Exception:
        current_app.logger.warning(
            "Interviews: AI sinh câu hỏi thất bại, dùng ngân hàng mẫu.",
            exc_info=True)
        return None
    data = _parse_json_object(raw)
    if not data:
        return None
    items = data.get("questions")
    if not isinstance(items, list) or len(items) < TOTAL_QUESTIONS:
        return None
    result = []
    for item in items[:TOTAL_QUESTIONS]:
        if not isinstance(item, dict):
            return None
        question = str(item.get("question") or "").strip()
        if len(question) < 10:
            return None
        keywords = item.get("keywords") or []
        if not isinstance(keywords, list):
            keywords = []
        keywords = [str(k).strip() for k in keywords if str(k).strip()][:6]
        result.append({"question": question, "keywords": keywords})
    return result


def generate_questions(job):
    """AI trước, ngân hàng mẫu sau — luôn đủ 5 câu."""
    jd_keywords = extract_jd_keywords(job)
    ai_items = _ai_questions(job)
    if ai_items:
        return ai_items
    return fallback_questions(job, jd_keywords)


# ---------------------------------------------------------------------------
# Vòng đời phiên
# ---------------------------------------------------------------------------

def get_job_or_404(job_id):
    job = db.session.get(JobPosting, job_id)
    if job is None:
        raise ApiError(404, "JOB_NOT_FOUND", "Không tìm thấy vị trí tuyển dụng.")
    if job.status != JobPosting.STATUS_OPEN:
        raise ApiError(400, "JOB_CLOSED",
                       "Vị trí này đã đóng tuyển, vui lòng chọn vị trí khác.")
    return job


def get_session_or_404(session_id):
    session = db.session.get(InterviewSession, session_id)
    if session is None:
        raise ApiError(404, "SESSION_NOT_FOUND", "Không tìm thấy phiên phỏng vấn.")
    return session


def assert_session_access(session, user, session_token):
    """Kiểm tra quyền mở phiên (hợp đồng B.2):
    - Phiên của user: chỉ đúng chủ phiên (JWT) mới mở được.
    - Phiên khách: chỉ header X-Session-Token khớp access_token.
    Thiếu cả hai căn cứ -> 401; có căn cứ nhưng sai -> 403.
    """
    if session.user_id is not None:
        if user is not None and user.id == session.user_id:
            return
        if user is None and not session_token:
            raise ApiError(401, "UNAUTHORIZED",
                           "Phiên này thuộc về tài khoản đã đăng nhập, "
                           "vui lòng đăng nhập để tiếp tục.")
        raise ApiError(403, "FORBIDDEN",
                       "Bạn không có quyền truy cập phiên phỏng vấn này.")
    # Phiên khách
    if session_token:
        if session.access_token and secrets.compare_digest(
                session_token, session.access_token):
            # Token khách hết hạn sau 48 giờ: token bị lộ (log/ảnh chụp/link
            # chuyển tiếp) không dùng được vĩnh viễn để đọc báo cáo kèm tên,
            # email và toàn bộ câu trả lời của ứng viên (audit 23/10).
            created = getattr(session, "created_at", None)
            if created is not None:
                from datetime import datetime, timedelta, timezone

                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) - created > timedelta(hours=48):
                    raise ApiError(
                        401, "SESSION_EXPIRED",
                        "Phiên phỏng vấn đã hết hạn sau 48 giờ, vui lòng bắt đầu phiên mới.",
                    )
            return
        raise ApiError(403, "FORBIDDEN",
                       "Mã phiên không đúng, không thể mở phiên phỏng vấn này.")
    if user is not None:
        raise ApiError(403, "FORBIDDEN",
                       "Phiên khách cần mã phiên (X-Session-Token) để mở.")
    raise ApiError(401, "UNAUTHORIZED",
                   "Thiếu mã phiên (X-Session-Token) của phiên phỏng vấn.")


def start_session(user, cleaned):
    """Tạo phiên + 5 câu hỏi. user=None nghĩa là khách."""
    job = get_job_or_404(cleaned["job_id"])
    questions = generate_questions(job)

    session = InterviewSession(
        job_id=job.id,
        user_id=user.id if user is not None else None,
        guest_name=cleaned.get("guest_name") if user is None else None,
        guest_email=cleaned.get("guest_email") if user is None else None,
        access_token=secrets.token_urlsafe(32) if user is None else None,
        status=InterviewSession.STATUS_IN_PROGRESS,
        current_index=0,
    )
    db.session.add(session)
    db.session.flush()
    for index, item in enumerate(questions, start=1):
        db.session.add(InterviewQA(
            session_id=session.id,
            order_no=index,
            question=item["question"],
            keywords=json.dumps(item["keywords"], ensure_ascii=False),
        ))
    db.session.commit()

    first = session.qas[0]
    return {
        "session_id": session.id,
        "access_token": session.access_token,  # None với user đã đăng nhập
        "job": schemas.job_to_dict(job),
        "total_questions": len(questions),
        "first_question": schemas.question_to_dict(first),
    }


def answer_current(session, answer_text):
    """Lưu câu trả lời cho câu hiện tại, tiến current_index."""
    if session.status == InterviewSession.STATUS_FINISHED:
        raise ApiError(409, "SESSION_FINISHED",
                       "Phiên phỏng vấn đã kết thúc và có báo cáo.")
    qas = list(session.qas or [])
    if session.current_index >= len(qas):
        return {"done": True, "answered_count": len(qas),
                "total_questions": len(qas)}
    qa = qas[session.current_index]
    qa.answer = answer_text
    session.current_index += 1
    db.session.commit()

    answered = sum(1 for item in qas if item.answer)
    if session.current_index >= len(qas):
        return {"done": True, "answered_count": answered,
                "total_questions": len(qas)}
    nxt = qas[session.current_index]
    return {
        "done": False,
        "answered_count": answered,
        "total_questions": len(qas),
        "next_question": schemas.question_to_dict(nxt),
    }


# ---------------------------------------------------------------------------
# Chấm điểm
# ---------------------------------------------------------------------------

def _heuristic_for_qa(qa):
    """Điểm 1 câu theo độ dài + độ phủ keywords (xác định, 0–10)."""
    if not qa.answer or not qa.answer.strip():
        return 0.0, "Bạn chưa trả lời câu này nên chưa có điểm."
    folded_answer = fold(qa.answer)
    words = len(folded_answer.split())
    keywords = qa.keywords_list()
    hits = [kw for kw in keywords if fold(kw) and fold(kw) in folded_answer]
    missing = [kw for kw in keywords if kw not in hits]
    coverage = (len(hits) / len(keywords)) if keywords else 0.5
    if words >= 110:
        length_factor = 1.0
    elif words >= 70:
        length_factor = 0.8
    elif words >= 45:
        length_factor = 0.6
    elif words >= 25:
        length_factor = 0.4
    elif words >= 12:
        length_factor = 0.25
    else:
        length_factor = words / 12 * 0.25
    score = round(min(10.0, coverage * 6 + length_factor * 4), 1)

    if score >= 8:
        comment = "Trả lời tốt: ý rõ ràng, bám sát trọng tâm câu hỏi."
    elif score >= 5:
        comment = ("Trả lời ở mức khá, đã chạm tới ý chính; đào sâu thêm "
                   "bằng ví dụ cụ thể sẽ thuyết phục hơn.")
    elif score >= 2.5:
        comment = "Trả lời còn ngắn hoặc chưa chạm đúng ý chính."
    else:
        comment = "Trả lời quá ngắn/chưa đúng trọng tâm câu hỏi."
    if missing and score < 8:
        comment += (" Nên bổ sung các ý: "
                    + ", ".join(missing[:3]) + ".")
    return score, comment


def _score_heuristic(session):
    qas = list(session.qas or [])
    for qa in qas:
        qa.score, qa.comment = _heuristic_for_qa(qa)
    if qas:
        overall = round(sum(qa.score or 0 for qa in qas) / len(qas) * 10, 1)
    else:
        overall = 0.0

    ranked = sorted(qas, key=lambda qa: qa.score or 0, reverse=True)
    strengths = [
        f"Câu {qa.order_no}: trả lời tốt, bám sát ý chính của câu hỏi."
        for qa in ranked if (qa.score or 0) >= 6
    ][:3]
    if not strengths:
        strengths = ["Đã hoàn thành buổi phỏng vấn thử và trả lời các câu hỏi được đặt ra."]
    improvements = []
    for qa in sorted(qas, key=lambda item: item.score or 0):
        if (qa.score or 0) < 5:
            missing = [kw for kw in qa.keywords_list()
                       if fold(kw) not in fold(qa.answer or "")]
            hint = (", ".join(missing[:3]) if missing
                    else "thêm ví dụ thực tế cụ thể")
            improvements.append(f"Câu {qa.order_no}: nên bổ sung {hint}.")
        if len(improvements) >= 4:
            break
    if not improvements:
        improvements = ["Tiếp tục phát huy; hãy chuẩn bị thêm số liệu/ví dụ cụ thể cho mỗi câu trả lời."]

    if overall >= 80:
        verdict = "Bạn đã sẵn sàng cho buổi phỏng vấn thật ở vị trí này."
    elif overall >= 60:
        verdict = "Khá sẵn sàng — ôn thêm vài điểm yếu bên dưới là có thể tự tin phỏng vấn thật."
    elif overall >= 40:
        verdict = "Cần luyện tập thêm: trả lời dài hơn, có ví dụ và bám từ khoá chuyên môn của vị trí."
    else:
        verdict = "Nên luyện tập lại với ngân hàng câu hỏi và chuẩn bị sẵn ví dụ thực tế trước khi phỏng vấn thật."

    return overall, {
        "source": "heuristic",
        "strengths": strengths,
        "improvements": improvements,
        "verdict": verdict,
    }


def _score_with_ai(session):
    """Chấm bằng AI (json mode); None nếu không dùng được/sai định dạng."""
    provider = _provider()
    if provider is None:
        return None
    qas = list(session.qas or [])
    lines = [f"Vị trí ứng tuyển: {session.job.title if session.job else ''}", ""]
    for qa in qas:
        lines.append(f"Câu {qa.order_no}: {qa.question}")
        lines.append(f"Trả lời: {qa.answer or '(chưa trả lời)'}")
        lines.append("")
    try:
        raw = provider.chat_completion(SCORE_SYSTEM_PROMPT, "\n".join(lines))
    except Exception:
        current_app.logger.warning(
            "Interviews: AI chấm điểm thất bại, dùng heuristic.",
            exc_info=True)
        return None
    data = _parse_json_object(raw)
    if not data:
        return None
    per_question = data.get("per_question")
    if not isinstance(per_question, list) or len(per_question) != len(qas):
        return None

    def _clamp(value, low, high, default=0.0):
        try:
            number = float(value)
        except (TypeError, ValueError):
            return default
        return max(low, min(high, number))

    scores = []
    for qa, item in zip(qas, per_question):
        if not isinstance(item, dict):
            return None
        qa.score = round(_clamp(item.get("score"), 0, 10), 1)
        qa.comment = str(item.get("comment") or "").strip() or None
        scores.append(qa.score)
    overall = data.get("overall_score")
    if overall is None:
        overall = round(sum(scores) / len(scores) * 10, 1) if scores else 0.0
    overall = round(_clamp(overall, 0, 100), 1)

    def _str_list(value, cap=4):
        if not isinstance(value, list):
            return []
        return [str(v).strip() for v in value if str(v).strip()][:cap]

    summary = {
        "source": "ai",
        "strengths": _str_list(data.get("strengths")),
        "improvements": _str_list(data.get("improvements")),
        "verdict": str(data.get("verdict") or "").strip(),
    }
    if not summary["verdict"]:
        return None
    return overall, summary


def finish_session(session):
    """Chấm điểm + đóng phiên. Gọi lại khi đã finished -> trả báo cáo cũ
    (idempotent, HTTP 200) — lựa chọn đã ghi trong báo cáo đội."""
    if session.status == InterviewSession.STATUS_FINISHED:
        return schemas.session_to_dict(session, include_report=True)

    result = _score_with_ai(session)
    if result is None:
        result = _score_heuristic(session)
    overall, summary = result
    session.overall_score = overall
    session.summary = json.dumps(summary, ensure_ascii=False)
    session.status = InterviewSession.STATUS_FINISHED
    session.finished_at = utcnow()
    db.session.commit()
    return schemas.session_to_dict(session, include_report=True)


def list_my_sessions(user, limit=20):
    sessions = (
        InterviewSession.query
        .filter_by(user_id=user.id)
        .order_by(InterviewSession.created_at.desc())
        .limit(limit)
        .all()
    )
    items = []
    for session in sessions:
        data = schemas.session_to_dict(session)
        data.pop("questions", None)
        data.pop("summary", None)
        data["overall_score"] = session.overall_score
        items.append(data)
    return items
