"""Phân tích CV bằng AI — nghiệp vụ AI-1 (architecture A6.1).

Luồng: nhận text CV + JD -> xây prompt (ép chỉ trả JSON) -> gọi provider ->
trích JSON -> validate NGHIÊM theo schema -> trả dict đã chuẩn hoá.

Schema đầu ra bắt buộc (architecture A6.1):
    match_score                số 0-100
    matched_skills             mảng chuỗi
    missing_skills             mảng chuỗi
    experience_years_estimate  số >= 0 (năm)
    education_summary          chuỗi (có thể rỗng nếu CV không nêu)
    strengths                  mảng chuỗi
    concerns                   mảng chuỗi
    summary                    chuỗi tóm tắt 2-3 câu

Đầu ra sai schema -> raise AIValidationError. Caller (background job) đánh
dấu job failed và KHÔNG ghi kết quả rác vào hồ sơ ứng viên.
"""

from __future__ import annotations

import json
import re

from .provider import AIProvider, get_provider

__all__ = [
    "AIValidationError",
    "MAX_CV_CHARS",
    "build_cv_prompts",
    "parse_analysis_json",
    "validate_analysis",
    "analyze_cv",
]

# Giới hạn độ dài CV cho một lần gọi AI (architecture A6.1).
MAX_CV_CHARS = 12_000

ANALYSIS_FIELDS = (
    "match_score",
    "matched_skills",
    "missing_skills",
    "experience_years_estimate",
    "education_summary",
    "strengths",
    "concerns",
    "summary",
)


class AIValidationError(ValueError):
    """AI trả về nội dung không đúng schema yêu cầu -> HTTP 422 / job failed."""


SYSTEM_PROMPT = """Bạn là trợ lý sàng lọc hồ sơ ứng viên cho phòng nhân sự.
Nhiệm vụ: đánh giá mức độ phù hợp của MỘT CV với MỘT bản mô tả công việc (JD).

Quy tắc bắt buộc:
1. Chỉ đánh giá dựa trên kỹ năng, kinh nghiệm và học vấn LIÊN QUAN tới JD.
   Tuyệt đối không dùng tên, giới tính, năm sinh, ảnh, địa chỉ hay bất kỳ
   yếu tố cá nhân nào khác làm tiêu chí chấm điểm.
2. Chỉ dựa trên nội dung có thật trong CV. Không suy đoán, không bịa thêm
   kỹ năng/kinh nghiệm không xuất hiện trong CV.
3. Chỉ trả về DUY NHẤT một đối tượng JSON hợp lệ theo đúng schema được yêu
   cầu, không kèm giải thích, không markdown, không văn bản nào khác.
4. summary và các nhận xét viết bằng tiếng Việt, ngắn gọn, khách quan.
5. match_score là số nguyên từ 0 đến 100, phản ánh mức đáp ứng yêu cầu của JD.
"""

USER_PROMPT_TEMPLATE = """MÔ TẢ CÔNG VIỆC (JD):
{jd}

---
NỘI DUNG CV ỨNG VIÊN:
{cv_text}
---

Trả về JSON đúng schema sau (không thêm trường nào khác):
{{
  "match_score": <số nguyên 0-100>,
  "matched_skills": [<kỹ năng trong CV khớp với JD>],
  "missing_skills": [<kỹ năng JD yêu cầu nhưng CV chưa thấy>],
  "experience_years_estimate": <số năm kinh nghiệm liên quan, số thập phân được phép>,
  "education_summary": "<tóm tắt học vấn, rỗng nếu CV không nêu>",
  "strengths": [<điểm mạnh liên quan JD>],
  "concerns": [<điểm cần lưu ý / chưa rõ>],
  "summary": "<tóm tắt 2-3 câu về mức phù hợp>"
}}"""


def build_cv_prompts(cv_text: str, jd_text: str) -> tuple[str, str]:
    """Xây (system_prompt, user_prompt); CV được cắt ở MAX_CV_CHARS."""
    truncated_cv = (cv_text or "").strip()[:MAX_CV_CHARS]
    user_prompt = USER_PROMPT_TEMPLATE.format(
        jd=(jd_text or "").strip() or "(Không có mô tả công việc)",
        cv_text=truncated_cv,
    )
    return SYSTEM_PROMPT, user_prompt


def parse_analysis_json(raw: str) -> dict:
    """Trích đối tượng JSON từ câu trả lời của AI.

    Chấp nhận JSON thuần, JSON bọc trong ```json fence, hoặc JSON nằm giữa
    văn bản thừa. Không parse được -> AIValidationError.
    """
    if not raw or not raw.strip():
        raise AIValidationError("AI trả về nội dung rỗng.")
    text = raw.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    elif not text.startswith("{"):
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise AIValidationError("Không tìm thấy JSON trong phản hồi của AI.")
        text = text[start:end + 1]
    try:
        data = json.loads(text)
    except (ValueError, TypeError) as exc:
        raise AIValidationError("Phản hồi của AI không phải JSON hợp lệ.") from exc
    if not isinstance(data, dict):
        raise AIValidationError("JSON của AI phải là một đối tượng.")
    return data


def _require_string_list(data: dict, field: str) -> list[str]:
    value = data.get(field)
    if value is None:
        return []
    if not isinstance(value, list):
        raise AIValidationError(f"Trường '{field}' phải là mảng chuỗi.")
    result = []
    for item in value:
        if not isinstance(item, str):
            raise AIValidationError(f"Trường '{field}' chỉ được chứa chuỗi.")
        if item.strip():
            result.append(item.strip())
    return result


def _require_number(data: dict, field: str):
    value = data.get(field)
    if isinstance(value, bool) or value is None:
        raise AIValidationError(f"Trường '{field}' là bắt buộc và phải là số.")
    if isinstance(value, str):
        try:
            value = float(value.strip())
        except ValueError as exc:
            raise AIValidationError(f"Trường '{field}' phải là số.") from exc
    if not isinstance(value, (int, float)):
        raise AIValidationError(f"Trường '{field}' phải là số.")
    return value


def validate_analysis(data: dict) -> dict:
    """Validate + chuẩn hoá kết quả AI theo schema A6.1.

    Sai bất kỳ trường bắt buộc nào -> AIValidationError (không lưu rác).
    """
    if not isinstance(data, dict):
        raise AIValidationError("Kết quả phân tích phải là một đối tượng JSON.")

    score = _require_number(data, "match_score")
    if not 0 <= float(score) <= 100:
        raise AIValidationError("Trường 'match_score' phải nằm trong khoảng 0-100.")

    years = _require_number(data, "experience_years_estimate")
    if float(years) < 0:
        raise AIValidationError("Trường 'experience_years_estimate' không được âm.")

    summary = data.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        raise AIValidationError("Trường 'summary' là bắt buộc và không được rỗng.")

    education = data.get("education_summary") or ""
    if not isinstance(education, str):
        raise AIValidationError("Trường 'education_summary' phải là chuỗi.")

    return {
        "match_score": int(round(float(score))),
        "matched_skills": _require_string_list(data, "matched_skills"),
        "missing_skills": _require_string_list(data, "missing_skills"),
        "experience_years_estimate": float(years),
        "education_summary": education.strip(),
        "strengths": _require_string_list(data, "strengths"),
        "concerns": _require_string_list(data, "concerns"),
        "summary": summary.strip(),
    }


def analyze_cv(cv_text: str, jd_text: str, provider: AIProvider | None = None) -> dict:
    """Hàm chuẩn analyze_cv(cv_text, jd) theo architecture A6.3.

    Trả về dict đã validate theo schema A6.1.
    Raise:
        AIUnavailableError — chưa cấu hình AI key / provider không khả dụng.
        AIResponseError    — provider lỗi hoặc trả định dạng không đọc được.
        AIValidationError  — AI trả JSON sai schema.
    """
    if not (cv_text or "").strip():
        raise AIValidationError("Nội dung CV rỗng, không thể phân tích.")
    active_provider = provider or get_provider()
    active_provider.ensure_available()
    system_prompt, user_prompt = build_cv_prompts(cv_text, jd_text)
    raw = active_provider.chat_completion(system_prompt, user_prompt)
    return validate_analysis(parse_analysis_json(raw))
