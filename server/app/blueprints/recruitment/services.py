"""Service layer — module Tuyển dụng.

Toàn bộ logic nghiệp vụ nằm ở đây (routes chỉ validate + gọi service):
- CRUD tin tuyển dụng (HR) và xem tin công khai (chỉ tin ``open``).
- Ứng viên nộp CV công khai: validate file PDF (đuôi + magic bytes + dung
  lượng), lưu file tên UUID vào ``UPLOAD_FOLDER/cv``, trích text bằng pypdf.
- HR quản lý ứng viên: lọc/trang/sắp xếp (kể cả theo điểm AI mới nhất),
  chuyển trạng thái, xóa kèm file CV.

Lỗi nghiệp vụ được ném ra dưới dạng ``ApiError`` dùng chung của hệ thống
(``app.errors``) để errorhandler toàn app trả đúng định dạng chuẩn
``{ "error": { "code", "message", "details" } }``. Nếu module dùng chung
chưa sẵn sàng, lớp ``ApiError`` nội bộ bên dưới có cùng giao diện.
"""
import math
import os
import uuid
from datetime import date, datetime

from flask import current_app

from app.extensions import db

try:  # Model dùng chung ở app/models (kiến trúc B3.3)
    from app.models import Candidate, CvAnalysis, JobPosting
except ImportError:  # pragma: no cover - bố cục package dự phòng
    from app.models.recruitment import Candidate, CvAnalysis, JobPosting  # noqa: F401

try:  # ApiError dùng chung toàn hệ thống (errorhandler toàn app xử lý)
    from app.errors import ApiError
except Exception:  # pragma: no cover - fallback cùng giao diện

    class ApiError(Exception):
        """Lỗi nghiệp vụ mang sẵn mã HTTP + mã lỗi chuẩn để trả JSON."""

        def __init__(self, status_code=400, code="BAD_REQUEST", message="", details=None):
            super().__init__(message)
            self.status_code = status_code
            self.code = code
            self.message = message
            self.details = details or []


from .schemas import CANDIDATE_STATUSES, JOB_STATUSES

HR_ROLES = ("admin", "hr")
DEFAULT_MAX_CV_SIZE_MB = 5
PDF_MAGIC = b"%PDF"


# --------------------------------------------------------------------------- #
# Tiện ích
# --------------------------------------------------------------------------- #
def make_error(status_code, code, message, details=None):
    """Tạo ApiError bất kể chữ ký khởi tạo của bản dùng chung."""
    try:
        return ApiError(status_code, code, message, details)
    except TypeError:
        try:
            return ApiError(status_code=status_code, code=code, message=message, details=details)
        except TypeError:
            return ApiError(message)


def not_found(message="Không tìm thấy dữ liệu"):
    return make_error(404, "NOT_FOUND", message)


def pagination_params(args):
    """Đọc page/limit theo quy ước B6: page từ 1, limit mặc định 20, tối đa 100."""
    try:
        page = int(args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    try:
        limit = int(args.get("limit", 20))
    except (TypeError, ValueError):
        limit = 20
    return max(page, 1), min(max(limit, 1), 100)


def paginate(query, page, limit):
    """Phân trang thủ công để kiểm soát đúng meta chuẩn B6."""
    total = query.count()
    items = query.offset((page - 1) * limit).limit(limit).all()
    meta = {
        "page": page,
        "limit": limit,
        "totalItems": total,
        "totalPages": math.ceil(total / limit) if total else 0,
    }
    return items, meta


def _clean_text(value):
    return value.strip() if isinstance(value, str) else value


# --------------------------------------------------------------------------- #
# Tin tuyển dụng
# --------------------------------------------------------------------------- #
def list_jobs(args, include_closed):
    """Danh sách tin tuyển dụng.

    - Công khai (include_closed=False): chỉ tin ``open``.
    - HR/Admin: mọi tin, lọc thêm theo ``status`` và ``search``.
    """
    page, limit = pagination_params(args)
    query = JobPosting.query
    if not include_closed:
        query = query.filter(JobPosting.status == "open")
    elif args.get("status") in JOB_STATUSES:
        query = query.filter(JobPosting.status == args["status"])

    search = (args.get("search") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(
            db.or_(JobPosting.title.ilike(like), JobPosting.description.ilike(like))
        )
    if args.get("department_id"):
        try:
            query = query.filter(JobPosting.department_id == int(args["department_id"]))
        except (TypeError, ValueError):
            pass

    query = query.order_by(JobPosting.created_at.desc(), JobPosting.id.desc())
    jobs, meta = paginate(query, page, limit)

    # Gắn số ứng viên cho từng tin để HR nắm nhanh
    counts = {}
    if jobs:
        rows = (
            db.session.query(Candidate.job_id, db.func.count(Candidate.id))
            .filter(Candidate.job_id.in_([j.id for j in jobs]))
            .group_by(Candidate.job_id)
            .all()
        )
        counts = dict(rows)
    for job in jobs:
        job.candidates_count = counts.get(job.id, 0)
    return jobs, meta


def get_job(job_id, public_only):
    """Lấy 1 tin. Phía công khai: tin đã đóng coi như không tồn tại (404)."""
    job = db.session.get(JobPosting, job_id)
    if job is None or (public_only and job.status != "open"):
        raise not_found("Không tìm thấy tin tuyển dụng")
    job.candidates_count = (
        db.session.query(Candidate.id).filter(Candidate.job_id == job.id).count()
    )
    return job


def create_job(data):
    job = JobPosting(
        title=_clean_text(data.get("title")),
        department_id=data.get("department_id"),
        description=data.get("description"),
        requirements=data.get("requirements"),
        quantity=data.get("quantity") or 1,
        deadline=data.get("deadline"),
        status=data.get("status") or "open",
    )
    db.session.add(job)
    db.session.commit()
    job.candidates_count = 0
    return job


def update_job(job_id, data):
    job = db.session.get(JobPosting, job_id)
    if job is None:
        raise not_found("Không tìm thấy tin tuyển dụng")
    for field in ("title", "department_id", "description", "requirements",
                  "quantity", "deadline", "status"):
        if field in data:
            value = data[field]
            job.__setattr__(field, _clean_text(value) if field == "title" else value)
    db.session.commit()
    return job


def delete_job(job_id):
    job = db.session.get(JobPosting, job_id)
    if job is None:
        raise not_found("Không tìm thấy tin tuyển dụng")
    has_candidates = (
        db.session.query(Candidate.id).filter(Candidate.job_id == job.id).first()
    )
    if has_candidates:
        raise make_error(
            409,
            "CONFLICT",
            "Tin tuyển dụng đã có ứng viên nộp hồ sơ, không thể xóa. "
            "Hãy đóng tin (status=closed) thay vì xóa.",
        )
    db.session.delete(job)
    db.session.commit()


# --------------------------------------------------------------------------- #
# Nộp CV công khai + xử lý file
# --------------------------------------------------------------------------- #
def _max_cv_bytes():
    mb = current_app.config.get("MAX_CV_SIZE_MB", DEFAULT_MAX_CV_SIZE_MB)
    try:
        mb = float(mb)
    except (TypeError, ValueError):
        mb = DEFAULT_MAX_CV_SIZE_MB
    return int(mb * 1024 * 1024)


def _validate_and_read_cv(file_storage):
    """Validate file CV và trả về nội dung bytes.

    Thứ tự kiểm tra: có file → đuôi .pdf → dung lượng ≤ giới hạn (413)
    → magic bytes ``%PDF`` ở đầu file (chống đổi đuôi file giả).
    """
    if file_storage is None or not (file_storage.filename or "").strip():
        raise make_error(400, "VALIDATION_ERROR", "Thiếu file CV đính kèm (trường 'cv')")

    filename = file_storage.filename
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext != "pdf":
        raise make_error(
            400, "INVALID_FILE_TYPE", "Chỉ chấp nhận CV định dạng PDF (.pdf)"
        )

    content = file_storage.read()
    max_bytes = _max_cv_bytes()
    if len(content) > max_bytes:
        raise make_error(
            413,
            "FILE_TOO_LARGE",
            f"File CV vượt quá dung lượng tối đa {max_bytes // (1024 * 1024)} MB",
        )
    if not content.startswith(PDF_MAGIC):
        raise make_error(
            400,
            "INVALID_FILE_TYPE",
            "File không phải PDF hợp lệ (sai định dạng nội dung)",
        )
    return content


def _save_cv_file(content):
    """Lưu CV vào UPLOAD_FOLDER/cv với tên UUID (không dùng tên gốc).

    Trả về đường dẫn tương đối lưu vào DB, dạng ``cv/<uuid>.pdf``.
    """
    upload_root = current_app.config.get("UPLOAD_FOLDER") or os.path.join(
        current_app.instance_path, "uploads"
    )
    cv_dir = os.path.join(upload_root, "cv")
    os.makedirs(cv_dir, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.pdf"
    with open(os.path.join(cv_dir, filename), "wb") as fh:
        fh.write(content)
    return f"cv/{filename}"


def _extract_pdf_text(relative_path):
    """Trích text từ file PDF đã lưu bằng pypdf (hoặc PyPDF2).

    Mọi lỗi (thiếu thư viện, PDF quét dạng ảnh, file hỏng...) đều trả về
    chuỗi rỗng và ghi log — nộp CV vẫn thành công, HR/AI xử lý sau.
    """
    upload_root = current_app.config.get("UPLOAD_FOLDER") or os.path.join(
        current_app.instance_path, "uploads"
    )
    abs_path = os.path.join(upload_root, relative_path)
    try:
        try:
            from pypdf import PdfReader
        except ImportError:
            from PyPDF2 import PdfReader
        reader = PdfReader(abs_path)
        parts = [(page.extract_text() or "") for page in reader.pages]
        return "\n".join(parts).strip()
    except Exception as exc:  # noqa: BLE001 - trích text không được làm hỏng luồng nộp CV
        current_app.logger.warning(
            "Không trích được text từ CV %s: %s", relative_path, exc
        )
        return ""


def apply_to_job(job_id, form_data, file_storage):
    """Ứng viên nộp CV vào 1 tin đang mở và còn hạn."""
    job = db.session.get(JobPosting, job_id)
    if job is None:
        raise not_found("Không tìm thấy tin tuyển dụng")
    if job.status != "open":
        raise make_error(409, "CONFLICT", "Tin tuyển dụng này đã đóng, không nhận thêm hồ sơ")
    deadline = job.deadline
    if deadline is not None:
        deadline_date = deadline.date() if isinstance(deadline, datetime) else deadline
        if deadline_date < date.today():
            raise make_error(409, "CONFLICT", "Tin tuyển dụng đã hết hạn nộp hồ sơ")

    content = _validate_and_read_cv(file_storage)
    relative_path = _save_cv_file(content)
    cv_text = _extract_pdf_text(relative_path)  # rỗng nếu không trích được (đã ghi log)

    candidate = Candidate(
        job_id=job.id,
        full_name=_clean_text(form_data.get("full_name")),
        email=_clean_text(form_data.get("email")),
        phone=_clean_text(form_data.get("phone")) if form_data.get("phone") else None,
        cv_file_url=relative_path,
        cv_text=cv_text,
        status="new",
    )
    try:
        db.session.add(candidate)
        db.session.commit()
    except Exception:
        db.session.rollback()
        _remove_cv_file(relative_path)  # dọn file mồ côi khi ghi DB lỗi
        raise
    return candidate


def _remove_cv_file(relative_path):
    if not relative_path:
        return
    try:
        upload_root = current_app.config.get("UPLOAD_FOLDER") or os.path.join(
            current_app.instance_path, "uploads"
        )
        abs_path = (
            relative_path
            if os.path.isabs(relative_path)
            else os.path.join(upload_root, relative_path)
        )
        if os.path.isfile(abs_path):
            os.remove(abs_path)
    except OSError as exc:
        current_app.logger.warning("Không xóa được file CV %s: %s", relative_path, exc)


# --------------------------------------------------------------------------- #
# Quản lý ứng viên (HR)
# --------------------------------------------------------------------------- #
def _latest_analysis_subquery():
    """Subquery id bản phân tích AI mới nhất của từng ứng viên."""
    return (
        db.session.query(CvAnalysis.id)
        .filter(CvAnalysis.candidate_id == Candidate.id)
        .order_by(CvAnalysis.created_at.desc(), CvAnalysis.id.desc())
        .limit(1)
        .correlate(Candidate)
        .scalar_subquery()
    )


def latest_analyses_map(candidate_ids):
    """Map candidate_id -> bản CvAnalysis mới nhất (để serialize kèm)."""
    if not candidate_ids:
        return {}
    rows = (
        CvAnalysis.query.filter(CvAnalysis.candidate_id.in_(candidate_ids))
        .order_by(
            CvAnalysis.candidate_id,
            CvAnalysis.created_at.desc(),
            CvAnalysis.id.desc(),
        )
        .all()
    )
    result = {}
    for row in rows:
        result.setdefault(row.candidate_id, row)
    return result


def list_candidates(args):
    """Danh sách ứng viên cho HR.

    Lọc: ``job_id``, ``status``, ``search`` (tên/email/số điện thoại).
    Sort: ``sort=created_at`` (mặc định) hoặc ``sort=match_score`` — sắp theo
    điểm của bản phân tích AI MỚI NHẤT, ứng viên chưa có điểm xếp cuối.
    Chiều sắp xếp: ``sortOrder``/``order`` = asc|desc (mặc định desc).
    """
    page, limit = pagination_params(args)
    query = Candidate.query

    if args.get("job_id"):
        try:
            query = query.filter(Candidate.job_id == int(args["job_id"]))
        except (TypeError, ValueError):
            raise make_error(400, "VALIDATION_ERROR", "job_id phải là số nguyên")
    if args.get("status"):
        if args["status"] not in CANDIDATE_STATUSES:
            raise make_error(400, "VALIDATION_ERROR", "Trạng thái ứng viên không hợp lệ")
        query = query.filter(Candidate.status == args["status"])
    search = (args.get("search") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(
            db.or_(
                Candidate.full_name.ilike(like),
                Candidate.email.ilike(like),
                Candidate.phone.ilike(like),
            )
        )

    sort = (args.get("sort") or args.get("sortBy") or "created_at").lower()
    order = (args.get("sortOrder") or args.get("order") or "desc").lower()
    if sort == "match_score":
        latest_id = _latest_analysis_subquery()
        query = query.outerjoin(CvAnalysis, CvAnalysis.id == latest_id)
        if order == "asc":
            query = query.order_by(
                CvAnalysis.match_score.is_(None).asc(),  # chưa có điểm -> cuối
                CvAnalysis.match_score.asc(),
                Candidate.created_at.desc(),
            )
        else:
            query = query.order_by(
                CvAnalysis.match_score.is_(None).asc(),  # chưa có điểm -> cuối
                CvAnalysis.match_score.desc(),
                Candidate.created_at.desc(),
            )
    else:
        query = query.order_by(
            Candidate.created_at.asc() if order == "asc" else Candidate.created_at.desc(),
            Candidate.id.desc(),
        )

    candidates, meta = paginate(query, page, limit)
    analyses = latest_analyses_map([c.id for c in candidates])
    return candidates, meta, analyses


def get_candidate(candidate_id):
    candidate = db.session.get(Candidate, candidate_id)
    if candidate is None:
        raise not_found("Không tìm thấy ứng viên")
    analysis = latest_analyses_map([candidate.id]).get(candidate.id)
    job = db.session.get(JobPosting, candidate.job_id)
    return candidate, analysis, job


def update_candidate_status(candidate_id, data):
    """Chỉ HR mới đổi trạng thái — AI không bao giờ tự đổi (nguyên tắc A6.4)."""
    candidate = db.session.get(Candidate, candidate_id)
    if candidate is None:
        raise not_found("Không tìm thấy ứng viên")
    if "status" in data and data["status"]:
        candidate.status = data["status"]
    if "hr_note" in data:
        candidate.hr_note = data["hr_note"]
    db.session.commit()
    analysis = latest_analyses_map([candidate.id]).get(candidate.id)
    return candidate, analysis


def delete_candidate(candidate_id):
    candidate = db.session.get(Candidate, candidate_id)
    if candidate is None:
        raise not_found("Không tìm thấy ứng viên")
    cv_path = candidate.cv_file_url
    CvAnalysis.query.filter_by(candidate_id=candidate.id).delete(synchronize_session=False)
    db.session.delete(candidate)
    db.session.commit()
    _remove_cv_file(cv_path)  # xóa file sau khi DB đã commit thành công
