"""Bộ câu hỏi phỏng vấn theo tin tuyển dụng (feature-expansion-v6 mục 3).

InterviewKit: MỘT bộ câu hỏi cho MỘT tin tuyển dụng (job_posting_id
UNIQUE). Bộ câu hỏi do AI sinh (hoặc template dự phòng khi AI không khả
dụng) nhóm theo 3 vòng phỏng vấn, HR được sửa tay từng câu qua API PUT.

- ``questions``: JSON list [{round, topic, question, rubric, weight}]
  (round 1: kiến thức nền; 2: tình huống/kỹ năng; 3: văn hoá/động lực;
  weight là trọng số % — tổng chuẩn hoá về 100 ở tầng service).
- ``generated_by``: nhãn nguồn trung thực "ai" | "template" của lần sinh
  gần nhất (PUT sửa tay không đổi nhãn này).
- ``version``: bắt đầu 1, tăng mỗi lần TÁI TẠO (generate lại). Sửa tay
  bằng PUT không tăng version.
- ``updated_by``: user (HR/Admin) thực hiện thao tác ghi gần nhất.

Bảng MỚI hoàn toàn — không ALTER bảng cũ (quy tắc v6: production dùng
db.create_all(), chỉ thêm bảng mới).
"""
from app.extensions import db
from app.models.users import TimestampMixin


class InterviewKit(TimestampMixin, db.Model):
    __tablename__ = "interview_kits"

    SOURCE_AI = "ai"
    SOURCE_TEMPLATE = "template"
    SOURCES = (SOURCE_AI, SOURCE_TEMPLATE)

    id = db.Column(db.Integer, primary_key=True)
    job_posting_id = db.Column(
        db.Integer,
        db.ForeignKey("job_postings.id"),
        nullable=False,
        unique=True,
        index=True,
    )
    questions = db.Column(db.JSON, nullable=False, default=list)
    generated_by = db.Column(db.String(20), nullable=False, default=SOURCE_TEMPLATE)
    version = db.Column(db.Integer, nullable=False, default=1)
    updated_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    job_posting = db.relationship("JobPosting")
    updater = db.relationship("User", foreign_keys=[updated_by])

    def __repr__(self):
        return (
            f"<InterviewKit id={self.id} job_posting_id={self.job_posting_id} "
            f"version={self.version} generated_by={self.generated_by!r}>"
        )
