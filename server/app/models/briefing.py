"""Báo cáo điều hành AI (docs/feature-expansion-v6.md mục 4).

- Briefing: một bản báo cáo theo kỳ (tuần/tháng) — `numbers` là gói số liệu
  GỐC gom từ services của các module sở hữu số liệu (LLM không tự nghĩ số),
  `prose` là phần văn xuôi diễn giải (AI viết hoặc template dựng từ cùng gói
  số), `source` ghi nhãn trung thực nguồn của phần văn xuôi.
"""
from app.extensions import db
from app.models.users import TimestampMixin


class Briefing(TimestampMixin, db.Model):
    __tablename__ = "briefings"
    __table_args__ = (
        db.Index("ix_briefings_period_created", "period", "created_at"),
    )

    PERIOD_WEEK = "week"
    PERIOD_MONTH = "month"
    PERIODS = (PERIOD_WEEK, PERIOD_MONTH)

    SOURCE_AI = "ai"
    SOURCE_TEMPLATE = "template"
    SOURCES = (SOURCE_AI, SOURCE_TEMPLATE)

    id = db.Column(db.Integer, primary_key=True)
    # Kỳ báo cáo: "week" (tuần ISO chứa ref_date) | "month" (tháng chứa ref_date).
    period = db.Column(db.String(10), nullable=False, index=True)
    # Ngày neo kỳ báo cáo do người tạo chọn (mặc định hôm nay theo ICT).
    ref_date = db.Column(db.Date, nullable=False, index=True)
    # Gói số liệu gốc (JSON) — nguồn sự thật duy nhất cho phần văn xuôi.
    numbers = db.Column(db.JSON, nullable=False, default=dict)
    # Văn xuôi điều hành tiếng Việt, chỉ diễn giải các số trong `numbers`.
    prose = db.Column(db.Text, nullable=False)
    # Nguồn văn xuôi: "ai" (LLM viết) | "template" (dự phòng xác định).
    source = db.Column(db.String(10), nullable=False, default=SOURCE_TEMPLATE)
    created_by = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True, index=True
    )

    creator = db.relationship("User", foreign_keys=[created_by])

    def __repr__(self):
        return (
            f"<Briefing id={self.id} period={self.period!r} "
            f"ref_date={self.ref_date} source={self.source!r}>"
        )
