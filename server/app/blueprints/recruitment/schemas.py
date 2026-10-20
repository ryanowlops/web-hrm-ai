"""Marshmallow schemas cho module Tuyển dụng.

- Schema ``*Create/*Update/*Apply/*Status``: validate dữ liệu vào.
- Schema thường (JobPostingSchema, CandidateSchema, CvAnalysisSchema):
  serialize dữ liệu ra — không bao giờ chứa trường nội bộ như ``cv_text``
  trong danh sách (chi tiết ứng viên mới kèm qua ``latest_analysis``).
"""
from marshmallow import EXCLUDE, Schema, fields, validate

JOB_STATUSES = ("open", "closed")
CANDIDATE_STATUSES = ("new", "reviewing", "interview", "passed", "rejected")


# --------------------------------------------------------------------------- #
# Tin tuyển dụng
# --------------------------------------------------------------------------- #
class JobPostingCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    title = fields.String(required=True, validate=validate.Length(min=1, max=200))
    department_id = fields.Integer(allow_none=True)
    description = fields.String(allow_none=True)      # JD
    requirements = fields.String(allow_none=True)     # Yêu cầu kỹ năng/kinh nghiệm
    quantity = fields.Integer(
        allow_none=True, validate=validate.Range(min=1, error="Số lượng tuyển phải >= 1")
    )
    deadline = fields.Date(allow_none=True)           # Hạn nộp hồ sơ (YYYY-MM-DD)
    status = fields.String(
        load_default="open",
        validate=validate.OneOf(JOB_STATUSES, error="Trạng thái tin phải là open hoặc closed"),
    )


class JobPostingUpdateSchema(Schema):
    """Cập nhật từng phần — mọi trường đều không bắt buộc."""

    class Meta:
        unknown = EXCLUDE

    title = fields.String(validate=validate.Length(min=1, max=200))
    department_id = fields.Integer(allow_none=True)
    description = fields.String(allow_none=True)
    requirements = fields.String(allow_none=True)
    quantity = fields.Integer(
        allow_none=True, validate=validate.Range(min=1, error="Số lượng tuyển phải >= 1")
    )
    deadline = fields.Date(allow_none=True)
    status = fields.String(
        validate=validate.OneOf(JOB_STATUSES, error="Trạng thái tin phải là open hoặc closed")
    )


class JobPostingSchema(Schema):
    """Serialize tin tuyển dụng."""

    id = fields.Integer()
    title = fields.String()
    department_id = fields.Integer(allow_none=True)
    department_name = fields.Function(
        lambda obj: getattr(getattr(obj, "department", None), "name", None)
    )
    description = fields.String(allow_none=True)
    requirements = fields.String(allow_none=True)
    quantity = fields.Integer(allow_none=True)
    deadline = fields.Date(allow_none=True)
    status = fields.String()
    candidates_count = fields.Integer(dump_default=None)  # service gắn thêm khi cần
    created_at = fields.DateTime(allow_none=True)
    updated_at = fields.DateTime(allow_none=True)


# --------------------------------------------------------------------------- #
# Ứng viên
# --------------------------------------------------------------------------- #
class CandidateApplySchema(Schema):
    """Form công khai khi ứng viên nộp CV (multipart, phần text)."""

    class Meta:
        unknown = EXCLUDE

    full_name = fields.String(required=True, validate=validate.Length(min=1, max=120))
    email = fields.Email(required=True, validate=validate.Length(max=255))
    phone = fields.String(allow_none=True, validate=validate.Length(max=20))


class CandidateStatusSchema(Schema):
    """HR chuyển trạng thái ứng viên + ghi chú."""

    class Meta:
        unknown = EXCLUDE

    status = fields.String(
        allow_none=True,
        validate=validate.OneOf(
            CANDIDATE_STATUSES, error="Trạng thái ứng viên không hợp lệ"
        ),
    )
    hr_note = fields.String(allow_none=True, validate=validate.Length(max=2000))


class CandidateSchema(Schema):
    """Serialize ứng viên cho danh sách (không kèm cv_text cho nhẹ)."""

    id = fields.Integer()
    job_id = fields.Integer()
    full_name = fields.String()
    email = fields.String()
    phone = fields.String(allow_none=True)
    cv_file_url = fields.String(allow_none=True)
    status = fields.String()
    hr_note = fields.String(allow_none=True)
    created_at = fields.DateTime(allow_none=True)
    updated_at = fields.DateTime(allow_none=True)


class CvAnalysisSchema(Schema):
    """Serialize một bản phân tích CV bằng AI (bảng cv_analyses)."""

    id = fields.Integer()
    candidate_id = fields.Integer()
    match_score = fields.Integer(allow_none=True)
    matched_skills = fields.Raw(allow_none=True)
    missing_skills = fields.Raw(allow_none=True)
    experience_years_estimate = fields.Float(allow_none=True)
    education_summary = fields.String(allow_none=True)
    summary = fields.String(allow_none=True)
    strengths = fields.Raw(allow_none=True)
    concerns = fields.Raw(allow_none=True)
    model_name = fields.String(allow_none=True)
    status = fields.String(allow_none=True)
    created_at = fields.DateTime(allow_none=True)
