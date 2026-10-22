"""AI tạo mô tả công việc (JD) — feature-expansion-v6 mục 2.

Luồng: HR nhập chức danh + phòng ban + cấp bậc + kỹ năng chính + ghi chú
lương (tuỳ chọn) -> service sinh JD có cấu trúc
``{summary, responsibilities[], requirements[], benefits[]}`` kèm nhãn
nguồn ``source: "ai" | "template"``. JD CHỈ được trả về cho FE xem
trước/sửa — module này TUYỆT ĐỐI không tạo/cập nhật JobPosting
(human-in-loop: HR bấm "Dùng JD này" rồi tự đăng tin như bình thường).

Quy tắc AI bắt buộc (hợp đồng v6):
- Có AI key: ``provider.chat_completion`` với json_mode (mặc định nghiêm
  của provider), ép schema 4 trường; validate lại toàn bộ ở server —
  JSON sai schema coi như lỗi provider.
- Không AI key / provider lỗi / JSON sai schema: template XÁC ĐỊNH theo
  cấp bậc + kỹ năng, nhãn ``source="template"``.
- KHÔNG bịa mức lương: input không có ghi chú lương -> phúc lợi ghi
  "Mức lương: thoả thuận theo năng lực"; có ghi chú -> dùng nguyên văn.
"""
import json

from flask import current_app

from app.ai_service import get_provider
from app.extensions import db

try:  # Model dùng chung ở app/models (kiến trúc B3.3)
    from app.models import Department
except ImportError:  # pragma: no cover - bố cục package dự phòng
    from app.models.org import Department  # noqa: F401

from .services import make_error

# --------------------------------------------------------------------------- #
# Cấp bậc — nhãn hiển thị + kỳ vọng kinh nghiệm dùng cho cả prompt AI lẫn
# template dự phòng (xác định, không phụ thuộc provider).
# --------------------------------------------------------------------------- #
LEVELS = {
    "intern": {"label": "Thực tập sinh", "experience": "Không yêu cầu kinh nghiệm, sẽ được đào tạo và hướng dẫn bởi mentor"},
    "fresher": {"label": "Mới tốt nghiệp (Fresher)", "experience": "Dưới 1 năm kinh nghiệm (chấp nhận sinh viên mới tốt nghiệp)"},
    "junior": {"label": "Junior", "experience": "Từ 1–2 năm kinh nghiệm ở vị trí tương đương"},
    "middle": {"label": "Middle", "experience": "Từ 2–4 năm kinh nghiệm ở vị trí tương đương"},
    "senior": {"label": "Senior", "experience": "Từ 4 năm kinh nghiệm trở lên ở vị trí tương đương"},
    "lead": {"label": "Team Lead", "experience": "Từ 5 năm kinh nghiệm, trong đó có kinh nghiệm dẫn dắt nhóm kỹ thuật/chuyên môn"},
    "manager": {"label": "Quản lý (Manager)", "experience": "Từ 5 năm kinh nghiệm, có kinh nghiệm quản lý đội nhóm và lập kế hoạch"},
}
DEFAULT_LEVEL = "middle"

# Trách nhiệm mẫu theo nhóm cấp bậc (template xác định).
_RESPONSIBILITIES_BY_BAND = {
    "junior": [
        "Thực hiện các nhiệm vụ được phân công trong phạm vi chuyên môn của vị trí, bảo đảm đúng tiến độ và chất lượng yêu cầu",
        "Phối hợp với các thành viên trong nhóm và các phòng ban liên quan trong quá trình làm việc",
        "Học hỏi, cập nhật kiến thức chuyên môn và công cụ mới phục vụ công việc",
        "Báo cáo tiến độ, khó khăn và đề xuất hướng xử lý cho quản lý trực tiếp",
    ],
    "middle": [
        "Chủ trì thực hiện các hạng mục công việc chính của vị trí, bảo đảm chất lượng và tiến độ theo kế hoạch",
        "Phân tích yêu cầu, đề xuất giải pháp và ước lượng effort cho các nhiệm vụ được giao",
        "Phối hợp với các phòng ban liên quan để triển khai và nghiệm thu công việc",
        "Hỗ trợ hướng dẫn các thành viên ít kinh nghiệm hơn trong nhóm",
        "Đề xuất cải tiến quy trình/công cụ nhằm nâng cao hiệu quả công việc",
    ],
    "senior": [
        "Thiết kế và chịu trách nhiệm về chất lượng đầu ra của các hạng mục quan trọng trong phạm vi vị trí",
        "Đánh giá, lựa chọn giải pháp và xử lý các vấn đề phức tạp phát sinh",
        "Review/kiểm định kết quả công việc của thành viên trong nhóm, bảo đảm tuân thủ tiêu chuẩn chất lượng",
        "Mentor và phát triển năng lực cho các thành viên trong nhóm",
        "Tham gia xây dựng định hướng chuyên môn và lộ trình cải tiến cho nhóm/phòng ban",
    ],
}

_BENEFITS_BASE = [
    "Bảo hiểm xã hội, bảo hiểm y tế và bảo hiểm thất nghiệp theo quy định của pháp luật",
    "Thưởng hiệu quả công việc và xét tăng lương định kỳ hằng năm",
    "Môi trường làm việc chuyên nghiệp, cơ hội đào tạo và phát triển nghề nghiệp rõ ràng",
    "Các chế độ phúc lợi theo chính sách chung của công ty (du lịch, khám sức khoẻ, hoạt động đội nhóm)",
]


def _normalize_level(raw):
    level = str(raw or "").strip().lower()
    return level if level in LEVELS else DEFAULT_LEVEL


def _band_of(level):
    if level in ("intern", "fresher", "junior"):
        return "junior"
    if level in ("senior", "lead", "manager"):
        return "senior"
    return "middle"


def _clean_skills(raw):
    """Chuẩn hoá danh sách kỹ năng: bỏ rỗng, trùng; tối đa 10 kỹ năng."""
    skills = []
    seen = set()
    for item in raw or []:
        text = str(item or "").strip()
        key = text.lower()
        if text and key not in seen:
            seen.add(key)
            skills.append(text)
        if len(skills) >= 10:
            break
    return skills


def _resolve_department_name(data):
    """Ưu tiên department_name truyền thẳng; có department_id thì tra DB."""
    name = str(data.get("department_name") or "").strip()
    if name:
        return name
    dept_id = data.get("department_id")
    if dept_id:
        dept = db.session.get(Department, dept_id)
        if dept is not None:
            return dept.name
    return ""


# --------------------------------------------------------------------------- #
# Template dự phòng (xác định hoàn toàn)
# --------------------------------------------------------------------------- #
def _template_jd(title, department_name, level, skills, salary_note):
    info = LEVELS[level]
    dept_part = f" thuộc {department_name}" if department_name else ""
    skills_part = (
        f" Vị trí này tập trung vào các kỹ năng: {', '.join(skills)}."
        if skills
        else ""
    )
    summary = (
        f"Chúng tôi đang tìm kiếm ứng viên cho vị trí {title} ({info['label']})"
        f"{dept_part}. Ứng viên sẽ tham gia đội ngũ chuyên môn, đóng góp trực tiếp "
        f"vào các mục tiêu của phòng ban và có lộ trình phát triển rõ ràng.{skills_part}"
    )

    responsibilities = list(_RESPONSIBILITIES_BY_BAND[_band_of(level)])
    if skills:
        responsibilities.insert(
            1,
            "Sử dụng thành thạo các kỹ năng/công cụ trọng tâm của vị trí: "
            + ", ".join(skills[:5]),
        )

    requirements = [f"Kinh nghiệm: {info['experience']}"]
    for skill in skills:
        requirements.append(f"Có kiến thức và kinh nghiệm thực tế về {skill}")
    requirements += [
        "Kỹ năng giao tiếp, làm việc nhóm và quản lý thời gian tốt",
        "Chủ động, có trách nhiệm và cam kết với chất lượng công việc",
    ]

    salary_line = (
        f"Mức lương: {salary_note}"
        if salary_note
        else "Mức lương: thoả thuận theo năng lực và kinh nghiệm"
    )
    benefits = [salary_line, *_BENEFITS_BASE]

    return {
        "summary": summary,
        "responsibilities": responsibilities,
        "requirements": requirements,
        "benefits": benefits,
        "source": "template",
    }


# --------------------------------------------------------------------------- #
# Sinh bằng AI (json_mode nghiêm) + validate schema
# --------------------------------------------------------------------------- #
_SYSTEM_PROMPT = (
    "Bạn là chuyên viên tuyển dụng cấp cao viết mô tả công việc (JD) bằng "
    "tiếng Việt cho doanh nghiệp Việt Nam. Hãy trả về DUY NHẤT một JSON "
    "object đúng cấu trúc: {\"summary\": string, \"responsibilities\": "
    "[string], \"responsibilities\": danh sách trách nhiệm chính cụ thể, "
    "\"requirements\": [string] yêu cầu ứng viên cụ thể và đo được, "
    "\"benefits\": [string] quyền lợi}. Yêu cầu: summary 2-4 câu; mỗi danh "
    "sách có ít nhất 3 mục, viết ngắn gọn, cụ thể. TUYỆT ĐỐI không bịa mức "
    "lương: nếu đầu vào không có ghi chú lương, mục lương trong benefits "
    "phải ghi 'thoả thuận theo năng lực'. Không thêm trường nào khác."
)


def _validate_ai_jd(data):
    """Validate nghiêm output AI; sai schema -> raise ValueError."""
    if not isinstance(data, dict):
        raise ValueError("AI không trả JSON object")
    summary = data.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        raise ValueError("Thiếu summary hợp lệ")
    cleaned = {"summary": summary.strip()}
    minimums = {"responsibilities": 3, "requirements": 3, "benefits": 2}
    for field, minimum in minimums.items():
        items = data.get(field)
        if not isinstance(items, list):
            raise ValueError(f"Trường {field} không phải danh sách")
        texts = [str(x).strip() for x in items if str(x or "").strip()]
        if len(texts) < minimum:
            raise ValueError(f"Trường {field} có ít hơn {minimum} mục")
        cleaned[field] = texts[:12]
    return cleaned


def _ai_jd(title, department_name, level, skills, salary_note):
    """Sinh JD bằng AI; trả None khi provider không khả dụng/lỗi/sai schema."""
    info = LEVELS[level]
    user_prompt = json.dumps(
        {
            "chuc_danh": title,
            "phong_ban": department_name or "(không có)",
            "cap_bac": info["label"],
            "ky_nang_chinh": skills,
            "ghi_chu_luong": salary_note or "(không có — ghi thoả thuận)",
        },
        ensure_ascii=False,
    )
    try:
        provider = get_provider()
        raw = provider.chat_completion(_SYSTEM_PROMPT, user_prompt)
        data = json.loads(raw)
        cleaned = _validate_ai_jd(data)
    except Exception as exc:  # noqa: BLE001 - AIUnavailable/AIResponse/JSON/schema
        current_app.logger.warning(
            "JD generate: AI không khả dụng hoặc output sai schema, dùng template. %s",
            exc,
        )
        return None
    cleaned["source"] = "ai"
    return cleaned


# --------------------------------------------------------------------------- #
# Điểm vào của endpoint
# --------------------------------------------------------------------------- #
def generate_jd(data):
    """Sinh JD từ input của HR. KHÔNG tạo JobPosting — chỉ trả nội dung.

    ``data`` đã qua JdGenerateSchema: {title, department_id?,
    department_name?, level?, skills?, salary_note?}.
    """
    title = str(data.get("title") or "").strip()
    if not title:
        raise make_error(
            400, "VALIDATION_ERROR", "Thiếu chức danh vị trí tuyển dụng",
            [{"field": "title"}],
        )
    level = _normalize_level(data.get("level"))
    skills = _clean_skills(data.get("skills"))
    salary_note = str(data.get("salary_note") or "").strip()
    department_name = _resolve_department_name(data)

    result = _ai_jd(title, department_name, level, skills, salary_note)
    if result is None:
        result = _template_jd(title, department_name, level, skills, salary_note)
    result["title"] = title
    result["level"] = level
    return result
