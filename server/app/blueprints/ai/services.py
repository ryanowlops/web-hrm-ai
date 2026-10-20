"""Service layer — AI sàng lọc CV (blueprint ai).

Trách nhiệm (đúng phân lớp architecture B3.3):
- Tạo AiJob cho một đợt phân tích CV và chạy nền bằng threading, request HTTP
  không chờ AI (trả 202 ngay).
- Trong luồng nền: lấy text CV (cv_text có sẵn, hoặc trích từ file PDF bằng
  pypdf) -> ai_service.analyze_cv kèm JD -> lưu CvAnalysis.
- Cập nhật trạng thái AiJob: pending -> processing -> done / failed (+ error).
- AI chỉ tạo bản phân tích GỢI Ý: service này KHÔNG bao giờ thay đổi trạng
  thái ứng viên — HR là người quyết định (architecture A6.4).
- Lỗi AI/quota chỉ làm job failed, không ảnh hưởng chức năng HRM lõi (A6.1).
"""

from __future__ import annotations

import os
import threading

from flask import current_app

from app.ai_service import analyze_cv, get_provider
from app.ai_service.provider import AIError
from app.extensions import db
from app.models import AiJob, Candidate, CvAnalysis, JobPosting

# Giới hạn mặc định số CV trong một lượt phân tích (architecture A6.1).
DEFAULT_BATCH_LIMIT = 20

JOB_PENDING = "pending"
JOB_PROCESSING = "processing"
JOB_DONE = "done"
JOB_FAILED = "failed"


class ServiceError(Exception):
    """Lỗi nghiệp vụ có mã HTTP + error code chuẩn để routes trả về."""

    def __init__(self, message: str, status: int = 400, code: str = "VALIDATION_ERROR"):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


# ---------------------------------------------------------------------------
# Tiện ích nội bộ
# ---------------------------------------------------------------------------

def _set_first(obj, field_names, value) -> bool:
    """Gán value vào thuộc tính đầu tiên tồn tại trên model.

    Giúp service bền vững trước khác biệt nhỏ về tên cột giữa các bản model
    (ví dụ error / error_message, job_id / job_posting_id).
    """
    for name in field_names:
        if hasattr(obj, name):
            setattr(obj, name, value)
            return True
    return False


def _get_first(obj, field_names, default=None):
    for name in field_names:
        if hasattr(obj, name):
            value = getattr(obj, name)
            if value is not None:
                return value
    return default


def batch_limit() -> int:
    """Giới hạn CV/lượt: config AI_CV_BATCH_LIMIT, mặc định 20."""
    try:
        value = current_app.config.get("AI_CV_BATCH_LIMIT") if current_app else None
    except RuntimeError:
        value = None
    if value is None:
        value = os.environ.get("AI_CV_BATCH_LIMIT")
    try:
        limit = int(value) if value is not None else DEFAULT_BATCH_LIMIT
    except (TypeError, ValueError):
        limit = DEFAULT_BATCH_LIMIT
    return limit if limit > 0 else DEFAULT_BATCH_LIMIT


def build_jd_text(job: JobPosting) -> str:
    """Ghép JD của vị trí từ các trường có sẵn trên JobPosting."""
    parts = []
    title = getattr(job, "title", None)
    if title:
        parts.append(f"Vị trí tuyển dụng: {title}")
    for attr, label in (("description", "Mô tả công việc"),
                        ("requirements", "Yêu cầu ứng viên")):
        value = getattr(job, attr, None)
        if value:
            parts.append(f"{label}:\n{value}")
    return "\n\n".join(parts).strip()


def extract_cv_text(candidate: Candidate) -> str:
    """Lấy text CV: ưu tiên cv_text đã trích sẵn, nếu chưa có thì đọc file PDF.

    Không trích được -> ServiceError 422 (job xử lý CV đó sẽ failed, không lưu rác).
    """
    existing = (getattr(candidate, "cv_text", None) or "").strip()
    if existing:
        return existing

    file_ref = _get_first(candidate, ("cv_file_path", "cv_file_url", "cv_path"))
    if not file_ref:
        raise ServiceError(
            f"Ứng viên #{candidate.id} chưa có nội dung CV để phân tích.",
            status=422, code="CV_TEXT_UNAVAILABLE",
        )
    path = _resolve_cv_file_path(str(file_ref))
    if not path or not os.path.isfile(path):
        raise ServiceError(
            f"Không tìm thấy file CV của ứng viên #{candidate.id}.",
            status=422, code="CV_FILE_NOT_FOUND",
        )
    text = _extract_pdf_text(path)
    if not text.strip():
        raise ServiceError(
            f"Không trích xuất được text từ CV của ứng viên #{candidate.id} "
            "(PDF có thể là bản scan ảnh — chưa hỗ trợ OCR ở bản này).",
            status=422, code="CV_TEXT_UNAVAILABLE",
        )
    # Lưu lại text đã trích để các lần phân tích sau không phải đọc lại file.
    if hasattr(candidate, "cv_text"):
        candidate.cv_text = text
    return text


def _resolve_cv_file_path(file_ref: str) -> str | None:
    if os.path.isabs(file_ref):
        return file_ref
    candidates = [file_ref, os.path.join(os.getcwd(), file_ref)]
    try:
        upload_folder = current_app.config.get("UPLOAD_FOLDER")
        if upload_folder:
            candidates.append(os.path.join(upload_folder, os.path.basename(file_ref)))
            candidates.append(os.path.join(upload_folder, file_ref))
        candidates.append(os.path.join(current_app.instance_path, file_ref))
    except RuntimeError:
        pass
    for path in candidates:
        if path and os.path.isfile(path):
            return path
    return candidates[0] if candidates else None


def _extract_pdf_text(path: str) -> str:
    """Trích text PDF bằng pypdf (fallback PyPDF2). Lỗi -> ServiceError 422."""
    reader_cls = None
    try:
        from pypdf import PdfReader

        reader_cls = PdfReader
    except ImportError:
        try:
            from PyPDF2 import PdfReader

            reader_cls = PdfReader
        except ImportError as exc:
            raise ServiceError(
                "Server chưa cài thư viện đọc PDF (pypdf).",
                status=422, code="CV_TEXT_UNAVAILABLE",
            ) from exc
    try:
        reader = reader_cls(path)
        pages = [(page.extract_text() or "") for page in reader.pages]
    except Exception as exc:  # file hỏng / mã hoá / không phải PDF
        raise ServiceError(
            "File CV không đọc được (PDF hỏng hoặc không hợp lệ).",
            status=422, code="CV_FILE_INVALID",
        ) from exc
    # Làm sạch: gộp khoảng trắng thừa theo từng trang, nối các trang.
    return "\n".join(" ".join(page.split()) for page in pages).strip()


# ---------------------------------------------------------------------------
# Tạo & chạy job phân tích
# ---------------------------------------------------------------------------

def create_cv_analysis_job(job_id, candidate_ids, created_by=None) -> AiJob:
    """Validate đầu vào, kiểm tra AI khả dụng, tạo AiJob (status=pending).

    Raise ServiceError / AIUnavailableError — routes chuyển thành lỗi chuẩn.
    """
    # 1) Vị trí tuyển dụng phải tồn tại.
    job = db.session.get(JobPosting, job_id) if job_id is not None else None
    if job is None:
        raise ServiceError("Không tìm thấy vị trí tuyển dụng (job_id).",
                           status=404, code="JOB_POSTING_NOT_FOUND")

    # 2) candidate_ids: danh sách id nguyên, không rỗng, khử trùng lặp.
    if not isinstance(candidate_ids, list) or not candidate_ids:
        raise ServiceError("candidate_ids phải là danh sách không rỗng.",
                           status=400, code="VALIDATION_ERROR")
    unique_ids: list[int] = []
    for raw_id in candidate_ids:
        if isinstance(raw_id, bool) or not isinstance(raw_id, int):
            raise ServiceError("candidate_ids chỉ được chứa số nguyên.",
                               status=400, code="VALIDATION_ERROR")
        if raw_id not in unique_ids:
            unique_ids.append(raw_id)

    # 3) Giới hạn số CV/lượt (chống tốn quota/chi phí AI — A6.1).
    limit = batch_limit()
    if len(unique_ids) > limit:
        raise ServiceError(
            f"Mỗi lượt chỉ phân tích tối đa {limit} CV (đang yêu cầu {len(unique_ids)}). "
            "Vui lòng chia thành nhiều lượt.",
            status=400, code="CV_BATCH_LIMIT_EXCEEDED",
        )

    # 4) Mọi ứng viên phải tồn tại và thuộc đúng vị trí tuyển dụng này.
    candidates = (
        db.session.query(Candidate)
        .filter(Candidate.id.in_(unique_ids))
        .all()
    )
    found = {c.id: c for c in candidates}
    missing = [cid for cid in unique_ids if cid not in found]
    if missing:
        raise ServiceError(
            f"Không tìm thấy ứng viên: {', '.join(map(str, missing))}.",
            status=404, code="CANDIDATE_NOT_FOUND",
        )
    wrong_job = [c.id for c in candidates
                 if _get_first(c, ("job_id", "job_posting_id")) != job_id]
    if wrong_job:
        raise ServiceError(
            f"Ứng viên {', '.join(map(str, wrong_job))} không thuộc vị trí tuyển dụng này.",
            status=400, code="CANDIDATE_JOB_MISMATCH",
        )

    # 5) AI chưa cấu hình -> báo 503 NGAY, không tạo job chết (không bịa kết quả).
    get_provider().ensure_available()

    # 6) Tạo bản ghi job.
    ai_job = AiJob()
    _set_first(ai_job, ("type", "job_type", "kind"), "cv_analysis")
    _set_first(ai_job, ("status",), JOB_PENDING)
    _set_first(ai_job, ("job_posting_id", "job_id"), job_id)
    _set_first(ai_job, ("candidate_ids",), unique_ids)
    _set_first(ai_job, ("total_count", "total"), len(unique_ids))
    _set_first(ai_job, ("processed_count", "processed"), 0)
    _set_first(ai_job, ("success_count",), 0)
    _set_first(ai_job, ("error", "error_message"), None)
    if created_by is not None:
        _set_first(ai_job, ("created_by", "requested_by", "user_id"), created_by)
    db.session.add(ai_job)
    db.session.commit()
    return ai_job


def start_cv_analysis_job(ai_job_id: int) -> threading.Thread:
    """Chạy job trong thread nền (daemon). Trả về thread đã khởi động."""
    app = current_app._get_current_object()
    thread = threading.Thread(
        target=_run_cv_analysis_job,
        args=(app, ai_job_id),
        name=f"cv-analysis-job-{ai_job_id}",
        daemon=True,
    )
    thread.start()
    return thread


def _run_cv_analysis_job(app, ai_job_id: int) -> None:
    """Vòng đời job: pending -> processing -> done/failed. Chạy ngoài request."""
    with app.app_context():
        ai_job = db.session.get(AiJob, ai_job_id)
        if ai_job is None:
            return
        candidate_ids = list(_get_first(ai_job, ("candidate_ids",), []) or [])
        job_id = _get_first(ai_job, ("job_posting_id", "job_id"))
        job = db.session.get(JobPosting, job_id) if job_id is not None else None
        jd_text = build_jd_text(job) if job is not None else ""

        _set_first(ai_job, ("status",), JOB_PROCESSING)
        _set_first(ai_job, ("error", "error_message"), None)
        db.session.commit()

        provider = get_provider()
        model_name = getattr(provider, "model", "") or ""
        successes, failures = 0, []

        for candidate_id in candidate_ids:
            candidate = db.session.get(Candidate, candidate_id)
            if candidate is None:
                failures.append(f"#{candidate_id}: ứng viên không còn tồn tại")
                continue
            try:
                cv_text = extract_cv_text(candidate)
                result = analyze_cv(cv_text, jd_text, provider=provider)
                _save_analysis(candidate, result, model_name)
                successes += 1
            except (ServiceError, AIError, ValueError) as exc:
                # AIValidationError là subclass của ValueError; ServiceError/AIError
                # mang thông điệp đã an toàn để hiển thị (không chứa dữ liệu nhạy cảm).
                db.session.rollback()
                failures.append(f"#{candidate_id}: {exc}")
            except Exception:  # lỗi bất ngờ: rollback, ghi nhận, không làm sập thread
                db.session.rollback()
                failures.append(f"#{candidate_id}: lỗi không xác định khi phân tích")
            _set_first(ai_job, ("processed_count", "processed"),
                       successes + len(failures))
            _set_first(ai_job, ("success_count",), successes)
            db.session.commit()

        if successes == 0:
            _set_first(ai_job, ("status",), JOB_FAILED)
            _set_first(ai_job, ("error", "error_message"),
                       "; ".join(failures) or "Không phân tích được CV nào.")
        else:
            _set_first(ai_job, ("status",), JOB_DONE)
            if failures:
                _set_first(ai_job, ("error", "error_message"),
                           "Một số CV không phân tích được: " + "; ".join(failures))
        _set_first(ai_job, ("processed_count", "processed"),
                   successes + len(failures))
        db.session.commit()


def _save_analysis(candidate: Candidate, result: dict, model_name: str) -> CvAnalysis:
    """Lưu một CvAnalysis từ dict đã validate. KHÔNG đổi trạng thái ứng viên."""
    analysis = CvAnalysis()
    _set_first(analysis, ("candidate_id",), candidate.id)
    for field in ("match_score", "matched_skills", "missing_skills",
                  "experience_years_estimate", "education_summary",
                  "strengths", "concerns", "summary"):
        _set_first(analysis, (field,), result.get(field))
    _set_first(analysis, ("model_name", "model"), model_name)
    _set_first(analysis, ("status",), "done")
    db.session.add(analysis)
    db.session.commit()
    return analysis


# ---------------------------------------------------------------------------
# Truy vấn
# ---------------------------------------------------------------------------

def get_ai_job(job_pk) -> AiJob:
    ai_job = db.session.get(AiJob, job_pk)
    if ai_job is None:
        raise ServiceError("Không tìm thấy job phân tích AI.",
                           status=404, code="AI_JOB_NOT_FOUND")
    return ai_job


def get_latest_analysis(candidate_id) -> CvAnalysis:
    candidate = db.session.get(Candidate, candidate_id)
    if candidate is None:
        raise ServiceError("Không tìm thấy ứng viên.",
                           status=404, code="CANDIDATE_NOT_FOUND")
    query = db.session.query(CvAnalysis).filter_by(candidate_id=candidate_id)
    if hasattr(CvAnalysis, "created_at"):
        query = query.order_by(CvAnalysis.created_at.desc(), CvAnalysis.id.desc())
    else:
        query = query.order_by(CvAnalysis.id.desc())
    analysis = query.first()
    if analysis is None:
        raise ServiceError("Ứng viên này chưa có kết quả phân tích AI.",
                           status=404, code="ANALYSIS_NOT_FOUND")
    return analysis


# ---------------------------------------------------------------------------
# Serialize
# ---------------------------------------------------------------------------

def _iso(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


def serialize_job(ai_job: AiJob) -> dict:
    return {
        "job_id": ai_job.id,
        "id": ai_job.id,
        "type": _get_first(ai_job, ("type", "job_type", "kind"), "cv_analysis"),
        "status": getattr(ai_job, "status", None),
        "job_posting_id": _get_first(ai_job, ("job_posting_id", "job_id")),
        "candidate_ids": list(_get_first(ai_job, ("candidate_ids",), []) or []),
        "total": _get_first(ai_job, ("total_count", "total")),
        "processed": _get_first(ai_job, ("processed_count", "processed")),
        "error": _get_first(ai_job, ("error", "error_message")),
        "created_at": _iso(getattr(ai_job, "created_at", None)),
        "updated_at": _iso(getattr(ai_job, "updated_at", None)),
    }


def serialize_analysis(analysis: CvAnalysis) -> dict:
    """Kết quả AI kèm nhãn rõ ràng: điểm CHỈ là gợi ý, HR quyết định (A6.4)."""
    return {
        "id": analysis.id,
        "candidate_id": getattr(analysis, "candidate_id", None),
        "match_score": getattr(analysis, "match_score", None),
        "matched_skills": getattr(analysis, "matched_skills", None) or [],
        "missing_skills": getattr(analysis, "missing_skills", None) or [],
        "experience_years_estimate": getattr(
            analysis, "experience_years_estimate", None),
        "education_summary": getattr(analysis, "education_summary", None) or "",
        "strengths": getattr(analysis, "strengths", None) or [],
        "concerns": getattr(analysis, "concerns", None) or [],
        "summary": getattr(analysis, "summary", None) or "",
        "model_name": _get_first(analysis, ("model_name", "model")),
        "status": getattr(analysis, "status", None),
        "ai_generated": True,
        "note": "Điểm và nhận xét do AI gợi ý — quyết định cuối cùng thuộc về HR.",
        "created_at": _iso(getattr(analysis, "created_at", None)),
    }
