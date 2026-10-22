"""AI kiểm tra CV CÔNG KHAI (mở rộng v5, mục E) — phân tích tức thời.

Endpoint dùng module này: ``POST /api/v1/public/cv-check`` (routes.py).

Nguyên tắc bắt buộc:
- KHÔNG lưu CV hay kết quả vào DB: phân tích xong là bỏ; hàm trong file
  này chỉ ĐỌC JobPosting, tuyệt đối không add/commit bất kỳ bản ghi nào.
- Có AI key (production): chấm qua ``app.ai_service.analyze_cv`` (JSON
  mode, schema A6.1 đã validate nghiêm) -> ``source="ai"``.
- Không có key / AI lỗi: chấm HEURISTIC xác định theo độ phủ từ khoá JD
  (công thức ghi rõ ở ``_heuristic_analysis``) -> ``source="heuristic"``
  để frontend hiển thị trung thực nguồn phân tích.
"""
import io
import re
import unicodedata
from collections import Counter
from datetime import date, datetime

from flask import current_app

from app.extensions import db

try:  # Model dùng chung ở app/models (kiến trúc B3.3)
    from app.models import JobPosting
except ImportError:  # pragma: no cover - bố cục package dự phòng
    from app.models.recruitment import JobPosting  # noqa: F401

from .services import _max_cv_bytes, make_error, not_found

# Giới hạn độ dài CV cho 1 lần kiểm tra (khớp ai_service.MAX_CV_CHARS).
MAX_CV_TEXT_CHARS = 12_000
MAX_KEYWORDS = 15          # số từ khoá khớp/thiếu tối đa trả về
MAX_FEEDBACK_ITEMS = 5     # số điểm mạnh / cần cải thiện tối đa

PDF_MAGIC = b"%PDF"

# Từ dừng (đã bỏ dấu) — bỏ khi trích từ khoá JD để các từ nối/câu chữ
# hành chính không làm nhiễu độ phủ.
STOPWORDS = {
    # tiếng Việt (dạng đã gấp dấu)
    "va", "cua", "cho", "cac", "co", "duoc", "trong", "la", "voi", "theo",
    "khi", "tu", "den", "nay", "se", "da", "dang", "mot", "nhung", "de",
    "ve", "tren", "duoi", "sau", "truoc", "neu", "thi", "bi", "bo", "cung",
    "rat", "nhieu", "hon", "nua", "roi", "can", "phai", "lam", "viec",
    "cong", "ty", "chung", "toi", "ban", "anh", "chi", "em", "minh", "uu",
    "tien", "moi", "truong", "dong", "doi", "tinh", "than", "chu", "khong",
    "cung", "se", "hay", "hoac", "nhu", "vay", "do", "ay", "ra", "vao",
    "len", "xuong", "qua", "theo", "phuc", "loi", "che", "do", "quy",
    "dinh", "noi", "quy", "tuyen", "dung", "ung", "vien", "nhan", "su",
    "phong", "ban", "yeu", "cau", "mo", "ta", "trach", "nhiem", "tham",
    "gia", "phoi", "hop", "ho", "tro", "dam", "bao", "thuc", "hien",
    # tiếng Anh
    "the", "and", "or", "of", "to", "in", "a", "an", "for", "with", "on",
    "at", "is", "are", "will", "you", "we", "our", "your", "have", "has",
    "be", "as", "by", "this", "that",
}


# --------------------------------------------------------------------------- #
# Chuẩn hoá text / từ khoá
# --------------------------------------------------------------------------- #
def _fold(text):
    """Gấp dấu tiếng Việt + hạ chữ thường để so khớp bền vững.

    "Kế toán" và "ke toan" gấp về cùng dạng "ke toan".
    """
    if not text:
        return ""
    decomposed = unicodedata.normalize("NFD", text)
    stripped = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    return stripped.replace("đ", "d").replace("Đ", "D").lower()


_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9+#.]*")


def _tokens(text):
    """Tách token từ text đã gấp dấu; bỏ token toàn số và token quá ngắn."""
    folded = _fold(text)
    result = []
    for raw in _TOKEN_RE.findall(folded):
        token = raw.strip(".")
        if len(token) < 2 or token.isdigit():
            continue
        result.append(token)
    return result


def _original_forms(text):
    """Ánh xạ token đã gấp -> dạng gốc xuất hiện đầu tiên (để hiển thị)."""
    forms = {}
    folded_parts = _fold(text).split()
    raw_parts = (text or "").split()
    # Căn theo vị trí tương đối: gấp dấu không đổi số token khi tách bằng
    # khoảng trắng ở mức từ; đủ tốt cho mục đích hiển thị từ khoá.
    for idx, folded in enumerate(folded_parts):
        token = folded.strip(".,;:()[]{}\"'")
        if token and token not in forms and idx < len(raw_parts):
            forms[token] = raw_parts[idx].strip(".,;:()[]{}\"'")
    return forms


def _extract_jd_keywords(jd_text):
    """Trích từ khoá JD: unigram theo tần suất + bigram nội dung.

    Trả về (keywords, forms): keywords là list dict
    {key, display, weight} — unigram weight=1, bigram weight=2 —
    sắp xếp theo (tần suất trong JD giảm dần).
    """
    tokens = _tokens(jd_text)
    forms = _original_forms(jd_text)

    unigram_freq = Counter(t for t in tokens if t not in STOPWORDS)
    keywords = []
    seen = set()
    for token, _freq in unigram_freq.most_common(30):
        keywords.append({"key": token, "display": forms.get(token, token), "weight": 1})
        seen.add(token)

    bigram_freq = Counter()
    for first, second in zip(tokens, tokens[1:]):
        if first in STOPWORDS and second in STOPWORDS:
            continue
        bigram_freq[f"{first} {second}"] += 1
    for bigram, _freq in bigram_freq.most_common(20):
        if bigram in seen:
            continue
        first, second = bigram.split(" ", 1)
        display = f"{forms.get(first, first)} {forms.get(second, second)}"
        keywords.append({"key": bigram, "display": display, "weight": 2})
        seen.add(bigram)
    return keywords, forms


# --------------------------------------------------------------------------- #
# Chấm heuristic (dự phòng xác định — ghi rõ công thức)
# --------------------------------------------------------------------------- #
def _heuristic_analysis(cv_text, jd_text):
    """Chấm theo độ phủ từ khoá JD trong CV.

    Công thức (xác định hoàn toàn, không AI):
      coverage = Σ weight(từ khoá JD xuất hiện trong CV) / Σ weight(toàn bộ
                 từ khoá JD)          (unigram weight 1, bigram weight 2)
      bonus cấu trúc (tối đa +10):
                 +4 nếu CV dài ≥ 1000 ký tự;
                 +3 nếu CV chứa mục "kinh nghiệm" (đã gấp dấu);
                 +3 nếu CV chứa "học vấn" hoặc "kỹ năng".
      score = min(100, round(90 * coverage) + bonus)
    strengths/improvements sinh mẫu từ chính từ khoá khớp/thiếu.
    """
    keywords, _forms = _extract_jd_keywords(jd_text)
    cv_folded = _fold(cv_text)
    cv_tokens = set(_tokens(cv_text))
    cv_bigrams = {
        f"{a} {b}" for a, b in zip(_tokens(cv_text), _tokens(cv_text)[1:])
    }

    matched, missing = [], []
    total_weight = 0
    matched_weight = 0
    for kw in keywords:
        total_weight += kw["weight"]
        hit = kw["key"] in cv_bigrams if " " in kw["key"] else kw["key"] in cv_tokens
        if hit:
            matched.append(kw)
            matched_weight += kw["weight"]
        else:
            missing.append(kw)

    coverage = (matched_weight / total_weight) if total_weight else 0.0

    bonus = 0
    if len(cv_text) >= 1000:
        bonus += 4
    if "kinh nghiem" in cv_folded:
        bonus += 3
    if "hoc van" in cv_folded or "ky nang" in cv_folded:
        bonus += 3
    score = min(100, round(90 * coverage) + bonus)

    matched_display = [kw["display"] for kw in matched]
    missing_display = [kw["display"] for kw in missing]

    strengths = []
    if matched_display:
        strengths.append(
            "CV thể hiện được các yêu cầu nổi bật của JD: "
            + ", ".join(matched_display[:4])
            + "."
        )
    if len(matched_display) > 4:
        strengths.append(
            "Độ phủ yêu cầu khá rộng, thêm các từ khoá khớp như: "
            + ", ".join(matched_display[4:8])
            + "."
        )
    if "kinh nghiem" in cv_folded:
        strengths.append("Có mục kinh nghiệm làm việc rõ ràng để HR đánh giá.")
    if len(cv_text) >= 1000:
        strengths.append("CV có độ dài đầy đủ, thông tin trình bày tương đối chi tiết.")
    if not strengths:
        strengths.append("CV đã có nội dung để hệ thống đối chiếu với JD.")
    strengths = strengths[:MAX_FEEDBACK_ITEMS]

    improvements = []
    for kw in missing[:4]:
        improvements.append(
            f"JD nhắc tới “{kw['display']}” nhưng CV chưa thể hiện rõ — "
            "nên bổ sung nếu bạn có kinh nghiệm này."
        )
    if len(cv_text) < 600:
        improvements.append(
            "CV khá ngắn — nên bổ sung chi tiết về dự án và kết quả công việc."
        )
    if "ky nang" not in cv_folded:
        improvements.append(
            "Nên thêm mục Kỹ năng liệt kê rõ các công nghệ/công cụ bạn sử dụng."
        )
    if not improvements:
        improvements.append(
            "Tiếp tục bổ sung minh chứng cụ thể (dự án, số liệu kết quả) "
            "để CV thuyết phục hơn."
        )
    improvements = improvements[:MAX_FEEDBACK_ITEMS]

    if score >= 75:
        verdict = "CV của bạn khớp rất tốt với yêu cầu của vị trí này."
    elif score >= 55:
        verdict = "CV của bạn khá phù hợp với vị trí này, bổ sung thêm vài ý nữa sẽ mạnh hơn."
    elif score >= 35:
        verdict = "CV của bạn mới đáp ứng một phần yêu cầu của vị trí này."
    else:
        verdict = "CV của bạn chưa thể hiện nhiều yêu cầu của vị trí này."

    return {
        "score": score,
        "verdict": verdict,
        "strengths": strengths,
        "improvements": improvements,
        "matched_keywords": matched_display[:MAX_KEYWORDS],
        "missing_keywords": missing_display[:MAX_KEYWORDS],
        "source": "heuristic",
    }


# --------------------------------------------------------------------------- #
# Chấm bằng AI (khi có key) qua ai_service.analyze_cv
# --------------------------------------------------------------------------- #
def _ai_analysis(cv_text, jd_text):
    """Chấm bằng AI; trả None khi provider không khả dụng/lỗi để dự phòng."""
    try:
        from app.ai_service import analyze_cv
    except Exception:  # noqa: BLE001 - ai_service chưa sẵn sàng
        return None
    try:
        result = analyze_cv(cv_text, jd_text)
    except Exception as exc:  # noqa: BLE001 - AIUnavailable/AIResponse/AIValidation
        current_app.logger.warning(
            "CV check: AI không khả dụng hoặc lỗi, dùng heuristic. %s", exc
        )
        return None

    summary = (result.get("summary") or "").strip()
    verdict = summary
    # verdict theo hợp đồng là 1 câu: lấy câu đầu của summary nếu dài.
    if ". " in summary:
        verdict = summary.split(". ", 1)[0].rstrip(".") + "."
    return {
        "score": int(result.get("match_score") or 0),
        "verdict": verdict or "AI đã phân tích CV của bạn theo JD của vị trí.",
        "strengths": list(result.get("strengths") or [])[:MAX_FEEDBACK_ITEMS],
        "improvements": list(result.get("concerns") or [])[:MAX_FEEDBACK_ITEMS],
        "matched_keywords": list(result.get("matched_skills") or [])[:MAX_KEYWORDS],
        "missing_keywords": list(result.get("missing_skills") or [])[:MAX_KEYWORDS],
        "source": "ai",
    }


# --------------------------------------------------------------------------- #
# Trích text CV từ file tải lên (KHÔNG lưu file — đọc trong bộ nhớ)
# --------------------------------------------------------------------------- #
def extract_cv_text_from_upload(file_storage):
    """Trích text từ file PDF/TXT tải lên cho cv-check.

    Khác luồng nộp CV (apply): file chỉ đọc trong bộ nhớ rồi bỏ, KHÔNG
    ghi xuống đĩa và KHÔNG tạo bản ghi nào. Quy tắc validate bám bộ
    trích text hiện có của recruitment (đuôi file + magic bytes %PDF +
    dung lượng qua ``_max_cv_bytes`` + pypdf); riêng endpoint này trả
    422 cho file sai định dạng theo hợp đồng v5 mục E.
    """
    if file_storage is None or not (file_storage.filename or "").strip():
        raise make_error(
            422, "VALIDATION_ERROR", "Thiếu file CV đính kèm (trường 'cv')"
        )
    filename = file_storage.filename
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "txt":
        content = file_storage.read()
        if len(content) > _max_cv_bytes():
            raise make_error(413, "FILE_TOO_LARGE", "File CV vượt quá dung lượng tối đa")
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise make_error(
                422, "INVALID_FILE_TYPE", "File .txt phải ở định dạng UTF-8"
            )
        return text

    if ext != "pdf":
        raise make_error(
            422, "INVALID_FILE_TYPE", "Chỉ chấp nhận CV định dạng PDF hoặc TXT"
        )

    content = file_storage.read()
    if len(content) > _max_cv_bytes():
        raise make_error(413, "FILE_TOO_LARGE", "File CV vượt quá dung lượng tối đa")
    if not content.startswith(PDF_MAGIC):
        raise make_error(
            422, "INVALID_FILE_TYPE", "File không phải PDF hợp lệ (sai định dạng nội dung)"
        )
    try:
        try:
            from pypdf import PdfReader
        except ImportError:
            from PyPDF2 import PdfReader
        reader = PdfReader(io.BytesIO(content))
        # Cùng giới hạn 30 trang như luồng nộp CV: endpoint công khai, PDF
        # nghìn trang sẽ giữ CPU rất lâu (kiểm toán bảo mật 23/10).
        parts = [(page.extract_text() or "") for page in reader.pages[:30]]
        return "\n".join(parts).strip()
    except Exception as exc:  # noqa: BLE001
        current_app.logger.warning("CV check: không trích được text PDF: %s", exc)
        return ""


# --------------------------------------------------------------------------- #
# Điểm vào duy nhất của endpoint
# --------------------------------------------------------------------------- #
def _parse_job_id(raw):
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise make_error(
            422, "VALIDATION_ERROR", "job_id không hợp lệ", [{"field": "job_id"}]
        )


def _get_open_job(job_id):
    job = db.session.get(JobPosting, job_id)
    if job is None:
        raise not_found("Không tìm thấy tin tuyển dụng")
    if job.status != "open":
        raise make_error(
            400, "JOB_CLOSED", "Tin tuyển dụng này đã đóng, không còn kiểm tra CV"
        )
    deadline = job.deadline
    if deadline is not None:
        deadline_date = deadline.date() if isinstance(deadline, datetime) else deadline
        if deadline_date < date.today():
            raise make_error(
                400, "JOB_CLOSED", "Tin tuyển dụng này đã hết hạn nộp hồ sơ"
            )
    return job


def check_cv(job_id_raw, cv_text=None, file_storage=None):
    """Phân tích CV theo JD của 1 vị trí đang mở — KHÔNG lưu gì vào DB.

    Nguồn text: file tải lên (PDF/TXT) được ưu tiên; nếu không có file
    thì dùng ``cv_text`` dán trực tiếp. Trả dict kết quả theo hợp đồng
    v5 mục E kèm ``source`` trung thực ("ai" | "heuristic").
    """
    job = _get_open_job(_parse_job_id(job_id_raw))

    if file_storage is not None and (file_storage.filename or "").strip():
        text = extract_cv_text_from_upload(file_storage)
    else:
        text = cv_text if isinstance(cv_text, str) else ""

    text = (text or "").strip()
    if not text:
        raise make_error(
            422,
            "VALIDATION_ERROR",
            "Nội dung CV rỗng hoặc không đọc được — vui lòng dán nội dung "
            "CV hoặc tải file PDF/TXT có text.",
            [{"field": "cv_text"}],
        )
    if len(text) > MAX_CV_TEXT_CHARS:
        raise make_error(
            422,
            "VALIDATION_ERROR",
            f"CV quá dài (tối đa {MAX_CV_TEXT_CHARS} ký tự).",
            [{"field": "cv_text"}],
        )

    jd_text = "\n".join(
        part for part in [job.title, job.description, job.requirements] if part
    )
    result = _ai_analysis(text, jd_text)
    if result is None:
        result = _heuristic_analysis(text, jd_text)
    result["job_id"] = job.id
    result["job_title"] = job.title
    return result
