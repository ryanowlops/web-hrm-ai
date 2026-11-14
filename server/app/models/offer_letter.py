"""Thư mời nhận việc (Offer Letter) — BẢNG MỚI, db.create_all() tạo tự động, không cần migration.

Một thư mời gắn với một ứng viên (bắt buộc) và một tin tuyển dụng (tùy
chọn — mặc định lấy vị trí ứng viên đã ứng tuyển). Trạng thái 'expired'
KHÔNG lưu trong DB: đọc lúc serialize, thư ở trạng thái 'sent' mà đã
quá hạn trả lời (deadline < hôm nay) thì hiển thị là 'expired'
(xem offer_letters/services.effective_status).
"""
from app.extensions import db
from app.models.users import TimestampMixin


class OfferLetter(TimestampMixin, db.Model):
    __tablename__ = "offer_letters"

    STATUS_DRAFT = "draft"
    STATUS_SENT = "sent"
    STATUS_ACCEPTED = "accepted"
    STATUS_DECLINED = "declined"
    STATUS_WITHDRAWN = "withdrawn"
    STATUS_EXPIRED = "expired"  # chỉ tính lúc đọc, không lưu trong DB
    STATUSES = (
        STATUS_DRAFT,
        STATUS_SENT,
        STATUS_ACCEPTED,
        STATUS_DECLINED,
        STATUS_WITHDRAWN,
        STATUS_EXPIRED,
    )
    # Trạng thái được phép lưu trong DB (expired chỉ là trạng thái hiển thị).
    STORED_STATUSES = (
        STATUS_DRAFT,
        STATUS_SENT,
        STATUS_ACCEPTED,
        STATUS_DECLINED,
        STATUS_WITHDRAWN,
    )

    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(
        db.Integer, db.ForeignKey("candidates.id"), nullable=False, index=True
    )
    job_id = db.Column(
        db.Integer, db.ForeignKey("job_postings.id"), nullable=True, index=True
    )
    # Mức lương tháng (VNĐ), số nguyên > 0.
    salary = db.Column(db.Integer, nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    # Hạn trả lời thư mời; null = không giới hạn.
    deadline = db.Column(db.Date, nullable=True)
    status = db.Column(
        db.String(20), nullable=False, default=STATUS_DRAFT, index=True
    )
    # Nội dung thư mời (tiếng Việt) do backend sinh từ mẫu.
    letter_body = db.Column(db.Text, nullable=False)
    created_by = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True, index=True
    )

    candidate = db.relationship("Candidate")
    job = db.relationship("JobPosting")
    creator = db.relationship("User", foreign_keys=[created_by])

    def __repr__(self):
        return (
            f"<OfferLetter id={self.id} candidate_id={self.candidate_id} "
            f"status={self.status!r}>"
        )
