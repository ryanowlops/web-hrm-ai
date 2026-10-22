"""Routes — module Tuyển dụng.

Bảng route (blueprint ``recruitment``, tiền tố ``/api/v1``):

| Method | Path                          | Quyền        | Mô tả |
|--------|-------------------------------|--------------|-------|
| GET    | /jobs                         | Công khai*   | Danh sách tin (công khai: chỉ open; HR/Admin: tất cả) |
| POST   | /jobs                         | Admin, HR    | Tạo tin tuyển dụng |
| GET    | /jobs/<id>                    | Công khai*   | Chi tiết tin (đã đóng chỉ HR/Admin xem được) |
| PATCH  | /jobs/<id>                    | Admin, HR    | Cập nhật tin (đổi status open/closed tại đây) |
| DELETE | /jobs/<id>                    | Admin, HR    | Xóa tin (chặn 409 nếu đã có ứng viên) |
| POST   | /jobs/<id>/apply              | Công khai    | Nộp CV (multipart: full_name, email, phone, cv=PDF) |
| POST   | /public/cv-check              | Công khai**  | AI kiểm tra CV theo JD (KHÔNG lưu DB; rate limit riêng) |
| GET    | /candidates                   | Admin, HR    | Danh sách ứng viên (lọc job_id/status/search, sort) |
| GET    | /candidates/<id>              | Admin, HR    | Chi tiết ứng viên + phân tích AI mới nhất |
| PATCH  | /candidates/<id>/status       | Admin, HR    | Đổi trạng thái + ghi chú HR |
| DELETE | /candidates/<id>              | Admin, HR    | Xóa ứng viên kèm file CV và bản phân tích |

Định dạng trả về: ``{ "data": ... }`` và danh sách kèm
``meta: { page, limit, totalItems, totalPages }`` (B6). Lỗi theo chuẩn
``{ "error": { "code", "message", "details" } }`` (B3.4).
"""
from functools import wraps

from flask import jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from marshmallow import ValidationError

from app.extensions import limiter

from . import bp
from . import cvcheck
from . import jd_service
from . import kit_service
from . import services
from .schemas import (
    CandidateApplySchema,
    CandidateSchema,
    CandidateStatusSchema,
    CvAnalysisSchema,
    InterviewKitSchema,
    JdGenerateSchema,
    JobPostingCreateSchema,
    JobPostingSchema,
    JobPostingUpdateSchema,
)
from .services import HR_ROLES, ApiError

try:  # Decorator phân quyền dùng chung toàn hệ thống (kiểm role theo DB)
    from app.blueprints.auth.guards import require_roles
except Exception:  # pragma: no cover - fallback cùng hành vi
    try:
        from app.common.decorators import require_roles
    except Exception:

        def require_roles(*roles):
            """Kiểm tra role trong JWT claims; sai quyền -> 403 FORBIDDEN."""

            def decorator(fn):
                @wraps(fn)
                @jwt_required()
                def wrapper(*args, **kwargs):
                    role = (get_jwt() or {}).get("role")
                    if role not in roles:
                        raise ApiError(
                            403,
                            "FORBIDDEN",
                            "Bạn không có quyền thực hiện thao tác này",
                        )
                    return fn(*args, **kwargs)

                return wrapper

            return decorator


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _error_response(exc):
    status = getattr(exc, "status_code", None) or getattr(exc, "status", 400)
    body = {
        "error": {
            "code": getattr(exc, "code", "ERROR"),
            "message": getattr(exc, "message", None) or str(exc),
            "details": getattr(exc, "details", None) or [],
        }
    }
    return jsonify(body), status


def handle_errors(fn):
    """Bắt ApiError/ValidationError và trả JSON lỗi chuẩn ở mọi route."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except ValidationError as exc:
            return _error_response(
                ApiError(400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ", exc.messages)
            )
        except ApiError as exc:
            return _error_response(exc)

    return wrapper


def _current_role():
    """Role của người gọi nếu có JWT hợp lệ, ngược lại None (khách).

    Ưu tiên role trong DB (qua guards.load_current_user, khớp cách hệ thống
    kiểm quyền), dự phòng bằng claim ``role`` trong token.
    """
    if not get_jwt_identity():
        return None
    try:
        from app.blueprints.auth.guards import load_current_user

        user = load_current_user()
        if user is not None:
            return getattr(user, "role", None)
    except Exception:
        pass
    return (get_jwt() or {}).get("role")


def _job_payload(job):
    data = JobPostingSchema().dump(job)
    count = getattr(job, "candidates_count", None)
    if count is not None:
        data["candidates_count"] = count
    return data


def _current_user_id():
    """ID user hiện tại (cho cột updated_by); None nếu không xác định được."""
    try:
        from app.blueprints.auth.guards import load_current_user

        user = load_current_user()
        if user is not None:
            return user.id
    except Exception:
        pass
    identity = get_jwt_identity()
    try:
        return int(identity)
    except (TypeError, ValueError):
        return None


def _candidate_payload(candidate, analysis=None, job=None):
    data = CandidateSchema().dump(candidate)
    data["match_score"] = (
        getattr(analysis, "match_score", None) if analysis is not None else None
    )
    data["latest_analysis"] = (
        CvAnalysisSchema().dump(analysis) if analysis is not None else None
    )
    if job is not None:
        data["job"] = {"id": job.id, "title": job.title, "status": job.status}
    return data


# --------------------------------------------------------------------------- #
# Tin tuyển dụng
# --------------------------------------------------------------------------- #
@bp.route("/jobs", methods=["GET"])
@handle_errors
@jwt_required(optional=True)
def list_jobs():
    """Công khai: chỉ tin open. Có JWT Admin/HR: xem tất cả + lọc status."""
    is_hr = _current_role() in HR_ROLES
    jobs, meta = services.list_jobs(request.args, include_closed=is_hr)
    return jsonify({"data": [_job_payload(j) for j in jobs], "meta": meta}), 200


@bp.route("/jobs", methods=["POST"])
@handle_errors
@require_roles("admin", "hr")
def create_job():
    data = JobPostingCreateSchema().load(request.get_json(silent=True) or {})
    job = services.create_job(data)
    return jsonify({"data": _job_payload(job)}), 201


@bp.route("/jobs/<int:job_id>", methods=["GET"])
@handle_errors
@jwt_required(optional=True)
def get_job(job_id):
    """Công khai chỉ xem được tin open; tin đã đóng -> 404 (trừ Admin/HR)."""
    is_hr = _current_role() in HR_ROLES
    job = services.get_job(job_id, public_only=not is_hr)
    return jsonify({"data": _job_payload(job)}), 200


@bp.route("/jobs/<int:job_id>", methods=["PATCH"])
@handle_errors
@require_roles("admin", "hr")
def update_job(job_id):
    data = JobPostingUpdateSchema().load(request.get_json(silent=True) or {})
    job = services.update_job(job_id, data)
    return jsonify({"data": _job_payload(job)}), 200


@bp.route("/jobs/<int:job_id>", methods=["DELETE"])
@handle_errors
@require_roles("admin", "hr")
def delete_job(job_id):
    services.delete_job(job_id)
    return jsonify({"data": {"message": "Đã xóa tin tuyển dụng"}}), 200


@bp.route("/jobs/<int:job_id>/apply", methods=["POST"])
@handle_errors
def apply_to_job(job_id):
    """Ứng viên nộp CV — không cần đăng nhập.

    Multipart form: ``full_name``, ``email``, ``phone`` (tùy chọn) và
    file ``cv`` (PDF, tối đa 5 MB — kiểm tra ở service).
    """
    form_data = CandidateApplySchema().load(request.form)
    file_storage = request.files.get("cv") or request.files.get("file")
    candidate = services.apply_to_job(job_id, form_data, file_storage)
    data = CandidateSchema().dump(candidate)
    return (
        jsonify(
            {
                "data": {
                    "id": data["id"],
                    "job_id": data["job_id"],
                    "full_name": data["full_name"],
                    "email": data["email"],
                    "status": data["status"],
                    "message": "Nộp hồ sơ thành công. HR sẽ liên hệ nếu hồ sơ phù hợp.",
                }
            }
        ),
        201,
    )


@bp.route("/public/cv-check", methods=["POST"])
@limiter.limit("10 per minute")
@limiter.limit("30 per hour")
@handle_errors
def public_cv_check():
    """AI kiểm tra CV theo JD — không cần đăng nhập, KHÔNG lưu vào DB.

    Nhận JSON ``{job_id, cv_text}`` hoặc multipart (field ``job_id`` +
    file ``cv``/``file`` — PDF/TXT). CV chỉ phân tích tức thời trong bộ
    nhớ rồi bỏ. Rate limit riêng chặt hơn mặc định toàn app (600/giờ)
    vì mỗi lần gọi có thể tốn một lượt AI.
    """
    file_storage = request.files.get("cv") or request.files.get("file")
    if file_storage is not None and (file_storage.filename or "").strip():
        result = cvcheck.check_cv(
            request.form.get("job_id"), file_storage=file_storage
        )
    else:
        payload = request.get_json(silent=True) or {}
        result = cvcheck.check_cv(payload.get("job_id"), cv_text=payload.get("cv_text"))
    return jsonify({"data": result}), 200


# --------------------------------------------------------------------------- #
# AI tạo JD (v6 mục 2) — chỉ sinh nội dung, KHÔNG tạo/lưu JobPosting
# --------------------------------------------------------------------------- #
@bp.route("/jd/generate", methods=["POST"])
@handle_errors
@require_roles("admin", "hr")
def generate_jd():
    """Sinh JD có cấu trúc từ chức danh/cấp bậc/kỹ năng.

    Trả ``{summary, responsibilities[], requirements[], benefits[],
    source: "ai"|"template"}`` để FE cho HR xem trước + sửa; JD chỉ được
    lưu khi HR tự tạo/sửa tin tuyển dụng như bình thường.
    """
    data = JdGenerateSchema().load(request.get_json(silent=True) or {})
    result = jd_service.generate_jd(data)
    return jsonify({"data": result}), 200


# --------------------------------------------------------------------------- #
# Bộ câu hỏi phỏng vấn (v6 mục 3) — mỗi tin tối đa 1 bộ, HR/Admin
# --------------------------------------------------------------------------- #
@bp.route("/jobs/<int:job_id>/interview-kit/generate", methods=["POST"])
@handle_errors
@require_roles("admin", "hr")
def generate_interview_kit(job_id):
    """Sinh/tái tạo bộ câu hỏi từ JD của tin; mỗi lần tái tạo version +1."""
    kit = kit_service.generate_kit(job_id, _current_user_id())
    return jsonify({"data": InterviewKitSchema().dump(kit)}), 200


@bp.route("/jobs/<int:job_id>/interview-kit", methods=["GET"])
@handle_errors
@require_roles("admin", "hr")
def get_interview_kit(job_id):
    """Đọc bộ câu hỏi hiện tại; chưa tạo -> 404."""
    kit = kit_service.get_kit(job_id)
    return jsonify({"data": InterviewKitSchema().dump(kit)}), 200


@bp.route("/jobs/<int:job_id>/interview-kit", methods=["PUT"])
@handle_errors
@require_roles("admin", "hr")
def update_interview_kit(job_id):
    """HR sửa tay từng câu: body ``{questions: [...]}`` — giữ nguyên
    version và nhãn nguồn, chỉ cập nhật nội dung + người sửa."""
    payload = request.get_json(silent=True) or {}
    kit = kit_service.update_kit(
        job_id, payload.get("questions"), _current_user_id()
    )
    return jsonify({"data": InterviewKitSchema().dump(kit)}), 200


# --------------------------------------------------------------------------- #
# Ứng viên (HR)
# --------------------------------------------------------------------------- #
@bp.route("/candidates", methods=["GET"])
@handle_errors
@require_roles("admin", "hr")
def list_candidates():
    """Lọc: job_id, status, search. Sort: created_at | match_score."""
    candidates, meta, analyses = services.list_candidates(request.args)
    data = [_candidate_payload(c, analyses.get(c.id)) for c in candidates]
    return jsonify({"data": data, "meta": meta}), 200


@bp.route("/candidates/<int:candidate_id>", methods=["GET"])
@handle_errors
@require_roles("admin", "hr")
def get_candidate(candidate_id):
    candidate, analysis, job = services.get_candidate(candidate_id)
    return jsonify({"data": _candidate_payload(candidate, analysis, job)}), 200


@bp.route("/candidates/<int:candidate_id>/status", methods=["PATCH"])
@handle_errors
@require_roles("admin", "hr")
def update_candidate_status(candidate_id):
    data = CandidateStatusSchema().load(request.get_json(silent=True) or {})
    if not data:
        raise ApiError(
            400, "VALIDATION_ERROR", "Cần truyền status và/hoặc hr_note để cập nhật"
        )
    candidate, analysis = services.update_candidate_status(candidate_id, data)
    return jsonify({"data": _candidate_payload(candidate, analysis)}), 200


@bp.route("/candidates/<int:candidate_id>", methods=["DELETE"])
@handle_errors
@require_roles("admin", "hr")
def delete_candidate(candidate_id):
    services.delete_candidate(candidate_id)
    return jsonify({"data": {"message": "Đã xóa ứng viên và file CV"}}), 200
