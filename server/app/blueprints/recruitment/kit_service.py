"""Bộ câu hỏi phỏng vấn theo tin tuyển — feature-expansion-v6 mục 3.

Mỗi tin tuyển có TỐI ĐA 1 bộ câu hỏi (InterviewKit.job_posting_id
UNIQUE). Luồng:
- ``generate_kit``  : đọc JD + cấp bậc suy ra từ tin -> AI sinh câu hỏi
  nhóm 3 vòng (hoặc template dự phòng) -> ghi đè bộ cũ, ``version`` +1
  (bản đầu tiên version=1), nhãn ``generated_by`` trung thực.
- ``get_kit``       : đọc bộ hiện tại; chưa tạo -> 404.
- ``update_kit``    : HR sửa tay từng câu (PUT) — validate đủ 3 vòng,
  mỗi câu có rubric + weight; KHÔNG tăng version, KHÔNG đổi nhãn nguồn.

Quy tắc AI (hợp đồng v6): ``provider.chat_completion`` json_mode nghiêm
mặc định; output validate lại ở server; lỗi/thiếu key/sai schema ->
template xác định theo kỹ năng trích từ JD + cấp bậc của tin.
Trọng số (weight) của toàn bộ câu hỏi luôn được chuẩn hoá tổng = 100.
"""
import json
import re

from flask import current_app

from app.ai_service import get_provider
from app.extensions import db

try:  # Model dùng chung ở app/models (kiến trúc B3.3)
    from app.models import JobPosting
except ImportError:  # pragma: no cover - bố cục package dự phòng
    from app.models.recruitment import JobPosting  # noqa: F401

try:
    from app.models.interview_kit import InterviewKit
except ImportError:  # pragma: no cover
    from app.models.interview_kit import InterviewKit  # noqa: F401

from .jd_service import LEVELS, _clean_skills
from .services import get_job, make_error, not_found

ROUNDS = (1, 2, 3)
ROUND_LABELS = {
    1: "Kiến thức nền",
    2: "Tình huống & kỹ năng",
    3: "Văn hoá & động lực",
}
# Tỉ trọng mặc định giữa 3 vòng khi chuẩn hoá (tổng 100).
_ROUND_SHARE = {1: 40, 2: 40, 3: 20}

_LEVEL_KEYWORDS = (
    ("manager", ("manager", "quản lý", "head of", "trưởng phòng", "giám đốc")),
    ("lead", ("lead", "leader", "trưởng nhóm", "team lead")),
    ("senior", ("senior", "cao cấp", "chuyên gia")),
    ("junior", ("junior", "fresher", "mới tốt nghiệp", "thực tập", "intern")),
    ("middle", ("middle", "mid-level", "chuyên viên")),
)


# --------------------------------------------------------------------------- #
# Suy luận ngữ cảnh từ tin tuyển (xác định, không AI)
# --------------------------------------------------------------------------- #
def infer_level(job):
    """Suy cấp bậc từ tiêu đề + yêu cầu của tin (để cá nhân hoá câu hỏi)."""
    text = f"{job.title or ''} {job.requirements or ''}".lower()
    for level, keywords in _LEVEL_KEYWORDS:
        if any(keyword in text for keyword in keywords):
            return level
    return "middle"


def extract_skills(job, limit=6):
    """Trích kỹ năng chính từ requirements/description của tin.

    Tách theo xuống dòng, dấu phẩy, chấm phẩy, gạch đầu dòng; lấy đoạn
    ngắn (<= 60 ký tự) trông giống tên kỹ năng; bổ sung từ tiêu đề khi
    JD quá sơ sài.
    """
    chunks = []
    for source in (job.requirements or "", job.description or ""):
        for piece in re.split(r"[\n,;•·]+", source):
            piece = re.sub(r"^[\s\-*\d.()]+", "", piece).strip()
            if 2 <= len(piece) <= 60:
                chunks.append(piece)
    skills = _clean_skills(chunks)[:limit]
    if not skills and job.title:
        skills = [job.title.strip()]
    return skills


# --------------------------------------------------------------------------- #
# Validate + chuẩn hoá bộ câu hỏi (dùng chung AI / template / PUT của HR)
# --------------------------------------------------------------------------- #
def validate_questions(raw):
    """Validate danh sách câu hỏi; trả list đã làm sạch hoặc raise 400.

    Bắt buộc: không rỗng; mỗi câu có round ∈ {1,2,3}, topic, question,
    rubric (chuỗi không rỗng), weight (số > 0); và phải có đủ cả 3 vòng.
    """
    if not isinstance(raw, list) or not raw:
        raise make_error(
            400, "VALIDATION_ERROR", "Danh sách câu hỏi không được rỗng",
            [{"field": "questions"}],
        )
    cleaned = []
    rounds_seen = set()
    for idx, item in enumerate(raw):
        if not isinstance(item, dict):
            raise make_error(
                400, "VALIDATION_ERROR",
                f"Câu hỏi thứ {idx + 1} không đúng định dạng",
                [{"field": f"questions[{idx}]"}],
            )
        try:
            round_no = int(item.get("round"))
        except (TypeError, ValueError):
            round_no = None
        topic = str(item.get("topic") or "").strip()
        question = str(item.get("question") or "").strip()
        rubric = str(item.get("rubric") or "").strip()
        try:
            weight = float(item.get("weight"))
        except (TypeError, ValueError):
            weight = None
        if round_no not in ROUNDS or not topic or not question or not rubric \
                or weight is None or weight <= 0:
            raise make_error(
                400, "VALIDATION_ERROR",
                f"Câu hỏi thứ {idx + 1} thiếu trường bắt buộc "
                "(round 1–3, topic, question, rubric, weight > 0)",
                [{"field": f"questions[{idx}]"}],
            )
        rounds_seen.add(round_no)
        cleaned.append(
            {
                "round": round_no,
                "topic": topic,
                "question": question,
                "rubric": rubric,
                "weight": weight,
            }
        )
    if rounds_seen != set(ROUNDS):
        raise make_error(
            400, "VALIDATION_ERROR",
            "Bộ câu hỏi phải có đủ 3 vòng phỏng vấn",
            [{"field": "questions"}],
        )
    return cleaned


def normalize_weights(questions):
    """Chuẩn hoá weight theo tỉ trọng vòng (40/40/20), tổng đúng 100.

    Trong mỗi vòng, weight gốc của AI/template chỉ dùng để giữ TỈ LỆ
    tương đối giữa các câu; làm tròn 1 chữ số thập phân, phần dư dồn vào
    câu cuối cùng để tổng khớp tuyệt đối.
    """
    by_round = {r: [q for q in questions if q["round"] == r] for r in ROUNDS}
    normalized = []
    for round_no in ROUNDS:
        items = by_round[round_no]
        if not items:
            continue
        share = _ROUND_SHARE[round_no]
        total = sum(q["weight"] for q in items) or len(items)
        weights = [round(share * q["weight"] / total, 1) for q in items]
        weights[-1] = round(share - sum(weights[:-1]), 1)
        for item, weight in zip(items, weights):
            normalized.append({**item, "weight": weight})
    normalized.sort(key=lambda q: (q["round"],))
    return normalized


# --------------------------------------------------------------------------- #
# Template dự phòng (xác định theo kỹ năng + cấp bậc của tin)
# --------------------------------------------------------------------------- #
def _template_questions(job):
    level_label = LEVELS[infer_level(job)]["label"]
    skills = extract_skills(job)
    title = job.title or "vị trí này"

    questions = []
    # Vòng 1 — kiến thức nền theo từng kỹ năng chính của JD.
    for skill in skills[:4] or [title]:
        questions.append(
            {
                "round": 1,
                "topic": skill,
                "question": (
                    f"Hãy trình bày những kiến thức nền tảng quan trọng nhất về "
                    f"{skill} mà vị trí {title} cần có, kèm một ví dụ thực tế "
                    f"bạn đã áp dụng."
                ),
                "rubric": (
                    "Chấm theo: đúng trọng tâm khái niệm (50%), có ví dụ thực tế "
                    "cụ thể (30%), trình bày mạch lạc (20%)."
                ),
                "weight": 10,
            }
        )
    # Vòng 2 — tình huống/kỹ năng.
    questions += [
        {
            "round": 2,
            "topic": "Xử lý tình huống khó",
            "question": (
                "Kể về một lần bạn gặp sự cố/khó khăn lớn trong công việc liên "
                f"quan tới {title}. Bạn đã phân tích nguyên nhân và xử lý thế nào?"
            ),
            "rubric": (
                "Chấm theo: mô tả rõ bối cảnh và vai trò cá nhân (30%), cách "
                "phân tích nguyên nhân (30%), kết quả đo được và bài học rút ra (40%)."
            ),
            "weight": 14,
        },
        {
            "round": 2,
            "topic": "Ưu tiên công việc",
            "question": (
                "Giả sử bạn nhận cùng lúc hai yêu cầu gấp từ hai phía khác nhau "
                "với nguồn lực không đổi. Bạn sắp xếp thứ tự ưu tiên ra sao và "
                "trao đổi với các bên thế nào?"
            ),
            "rubric": (
                "Chấm theo: có tiêu chí ưu tiên rõ ràng (40%), giao tiếp minh bạch "
                "với các bên liên quan (30%), đề xuất phương án thay thế khi không "
                "đủ nguồn lực (30%)."
            ),
            "weight": 13,
        },
        {
            "round": 2,
            "topic": "Chuyên môn nâng cao",
            "question": (
                f"Vị trí này ở cấp bậc {level_label}. Hãy mô tả một quyết định "
                "chuyên môn khó bạn từng đưa ra: các phương án cân nhắc, tiêu chí "
                "chọn và kết quả sau cùng."
            ),
            "rubric": (
                "Chấm theo: tư duy phân tích và cân nhắc trade-off (40%), tính "
                "thuyết phục của quyết định (30%), kết quả thực tế (30%)."
            ),
            "weight": 13,
        },
    ]
    # Vòng 3 — văn hoá/động lực.
    questions += [
        {
            "round": 3,
            "topic": "Động lực ứng tuyển",
            "question": (
                f"Vì sao bạn ứng tuyển vị trí {title} tại công ty chúng tôi ở "
                "thời điểm này của sự nghiệp?"
            ),
            "rubric": (
                "Chấm theo: mục tiêu rõ ràng và nhất quán với lộ trình cá nhân "
                "(50%), hiểu biết về công ty/vị trí (50%)."
            ),
            "weight": 7,
        },
        {
            "round": 3,
            "topic": "Làm việc nhóm",
            "question": (
                "Kể về một lần bạn bất đồng quan điểm với đồng nghiệp/quản lý "
                "trong công việc. Bạn đã giải quyết thế nào?"
            ),
            "rubric": (
                "Chấm theo: thái độ xây dựng, lắng nghe (50%), kết quả hợp tác "
                "sau bất đồng (50%)."
            ),
            "weight": 7,
        },
        {
            "round": 3,
            "topic": "Định hướng phát triển",
            "question": (
                "Trong 1–2 năm tới, bạn muốn phát triển thêm kỹ năng gì và kỳ "
                "vọng điều gì từ môi trường làm việc?"
            ),
            "rubric": (
                "Chấm theo: kế hoạch phát triển cụ thể (50%), mức độ phù hợp với "
                "lộ trình của vị trí (50%)."
            ),
            "weight": 6,
        },
    ]
    return normalize_weights(questions)


# --------------------------------------------------------------------------- #
# Sinh bằng AI (json_mode nghiêm) + validate
# --------------------------------------------------------------------------- #
_SYSTEM_PROMPT = (
    "Bạn là chuyên gia tuyển dụng thiết kế bộ câu hỏi phỏng vấn bằng tiếng "
    "Việt. Trả về DUY NHẤT một JSON object dạng {\"questions\": [...]}. Mỗi "
    "câu hỏi là object {\"round\": 1|2|3, \"topic\": string, \"question\": "
    "string, \"rubric\": string (tiêu chí chấm ngắn gọn kèm tỉ lệ %), "
    "\"weight\": number (trọng số %)}. Bắt buộc: vòng 1 = kiến thức nền, "
    "vòng 2 = tình huống/kỹ năng, vòng 3 = văn hoá/động lực; mỗi vòng có "
    "3–4 câu bám sát JD và cấp bậc; tổng weight của mọi câu = 100. Câu hỏi "
    "phải cụ thể, tránh câu hỏi đóng có/không."
)


def _ai_questions(job):
    """Sinh câu hỏi bằng AI; trả None khi provider lỗi/không khả dụng/sai schema."""
    payload = {
        "chuc_danh": job.title,
        "cap_bac_suy_ra": LEVELS[infer_level(job)]["label"],
        "mo_ta_cong_viec": (job.description or "")[:3000],
        "yeu_cau": (job.requirements or "")[:3000],
        "ky_nang_trich_tu_jd": extract_skills(job),
    }
    try:
        provider = get_provider()
        raw = provider.chat_completion(
            _SYSTEM_PROMPT, json.dumps(payload, ensure_ascii=False)
        )
        data = json.loads(raw)
        items = data.get("questions") if isinstance(data, dict) else None
        questions = validate_questions(items)
    except Exception as exc:  # noqa: BLE001 - gồm cả ApiError 400 validate
        current_app.logger.warning(
            "Interview kit: AI không khả dụng hoặc output sai schema, dùng template. %s",
            exc,
        )
        return None
    return normalize_weights(questions)


# --------------------------------------------------------------------------- #
# Thao tác nghiệp vụ (điểm vào của routes)
# --------------------------------------------------------------------------- #
def _find_kit(job_id):
    return (
        db.session.query(InterviewKit)
        .filter(InterviewKit.job_posting_id == job_id)
        .one_or_none()
    )


def _require_job(job_id):
    """Lấy tin theo góc nhìn HR (kể cả tin đã đóng); không có -> 404."""
    return get_job(job_id, public_only=False)


def generate_kit(job_id, user_id):
    """Sinh (hoặc tái tạo) bộ câu hỏi cho 1 tin; tăng version mỗi lần."""
    job = _require_job(job_id)
    questions = _ai_questions(job)
    source = InterviewKit.SOURCE_AI
    if questions is None:
        questions = _template_questions(job)
        source = InterviewKit.SOURCE_TEMPLATE

    kit = _find_kit(job_id)
    if kit is None:
        kit = InterviewKit(job_posting_id=job.id, version=1)
        db.session.add(kit)
    else:
        kit.version = (kit.version or 1) + 1
    kit.questions = questions
    kit.generated_by = source
    kit.updated_by = user_id
    db.session.commit()
    return kit


def get_kit(job_id):
    """Đọc bộ câu hỏi hiện tại; tin không có -> 404, chưa tạo kit -> 404."""
    _require_job(job_id)
    kit = _find_kit(job_id)
    if kit is None:
        raise not_found("Tin tuyển dụng này chưa có bộ câu hỏi phỏng vấn")
    return kit


def update_kit(job_id, raw_questions, user_id):
    """HR sửa tay bộ câu hỏi: validate + persist, giữ version + nguồn."""
    _require_job(job_id)
    kit = _find_kit(job_id)
    if kit is None:
        raise not_found("Tin tuyển dụng này chưa có bộ câu hỏi phỏng vấn")
    kit.questions = normalize_weights(validate_questions(raw_questions))
    kit.updated_by = user_id
    db.session.commit()
    return kit

