"""Phỏng vấn thử với AI (feature-expansion-v5 mục B).

InterviewSession: một buổi phỏng vấn thử gắn với 1 tin tuyển dụng
(JobPosting). Người dùng có thể là:
- user đã đăng nhập (user_id có giá trị, access_token NULL), hoặc
- khách chưa đăng nhập (user_id NULL, guest_name/guest_email +
  access_token ngẫu nhiên — khách giữ token này để đọc/ghi phiên của
  mình qua header X-Session-Token).

InterviewQA: từng câu hỏi trong phiên — câu hỏi sinh từ JD (AI hoặc
ngân hàng mẫu dự phòng), câu trả lời của ứng viên và điểm/nhận xét sau
khi finish. summary của phiên là JSON text: {source: "ai"|"heuristic",
strengths[], improvements[], verdict}.
"""

import json

from app.extensions import db
from app.models.users import TimestampMixin


class InterviewSession(TimestampMixin, db.Model):
    __tablename__ = "interview_sessions"

    STATUS_IN_PROGRESS = "in_progress"
    STATUS_FINISHED = "finished"
    STATUSES = (STATUS_IN_PROGRESS, STATUS_FINISHED)

    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(
        db.Integer, db.ForeignKey("job_postings.id"), nullable=False, index=True
    )
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True, index=True
    )
    guest_name = db.Column(db.String(120), nullable=True)
    guest_email = db.Column(db.String(255), nullable=True)
    access_token = db.Column(db.String(64), nullable=True, index=True)
    status = db.Column(
        db.String(20), nullable=False, default=STATUS_IN_PROGRESS, index=True
    )
    current_index = db.Column(db.Integer, nullable=False, default=0)
    overall_score = db.Column(db.Float, nullable=True)  # thang 100
    summary = db.Column(db.Text, nullable=True)  # JSON text
    finished_at = db.Column(db.DateTime, nullable=True)

    job = db.relationship("JobPosting")
    user = db.relationship("User")
    qas = db.relationship(
        "InterviewQA",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="InterviewQA.order_no",
    )

    def summary_dict(self):
        """Parse summary JSON -> dict hoặc None nếu chưa chấm."""
        if not self.summary:
            return None
        try:
            data = json.loads(self.summary)
        except (ValueError, TypeError):
            return None
        return data if isinstance(data, dict) else None

    def __repr__(self):
        return (
            f"<InterviewSession id={self.id} job_id={self.job_id} "
            f"status={self.status!r}>"
        )


class InterviewQA(db.Model):
    __tablename__ = "interview_qas"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(
        db.Integer,
        db.ForeignKey("interview_sessions.id"),
        nullable=False,
        index=True,
    )
    order_no = db.Column(db.Integer, nullable=False)  # 1..N
    question = db.Column(db.Text, nullable=False)
    # JSON text: list[str] từ khoá kỳ vọng (dạng hiển thị) — dùng cho
    # chấm dự phòng heuristic và gợi ý khi AI chấm.
    keywords = db.Column(db.Text, nullable=True)
    answer = db.Column(db.Text, nullable=True)
    score = db.Column(db.Float, nullable=True)  # thang 10
    comment = db.Column(db.Text, nullable=True)

    session = db.relationship("InterviewSession", back_populates="qas")

    def keywords_list(self):
        if not self.keywords:
            return []
        try:
            data = json.loads(self.keywords)
        except (ValueError, TypeError):
            return []
        if isinstance(data, list):
            return [str(item) for item in data if str(item).strip()]
        return []

    def __repr__(self):
        return f"<InterviewQA id={self.id} session_id={self.session_id} order={self.order_no}>"
