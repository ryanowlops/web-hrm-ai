"""Gắn kết nhân viên (feature-expansion-v3 mục 4): Kudos, khảo sát xung + eNPS.

Thiết kế ẩn danh cho khảo sát (quan trọng):
- SurveyResponse KHÔNG có cột user_id — đáp án không thể truy ngược về
  người trả lời bằng bất kỳ join nào.
- SurveyParticipation (survey_id + user_id, unique) chỉ phục vụ chống trả
  lời 2 lần; API kết quả không bao giờ join bảng này với responses.
"""
from app.extensions import db
from app.models.users import TimestampMixin, utcnow


class Kudo(TimestampMixin, db.Model):
    __tablename__ = "kudos"

    BADGE_TEAMWORK = "teamwork"
    BADGE_INNOVATION = "innovation"
    BADGE_DEDICATION = "dedication"
    BADGE_LEADERSHIP = "leadership"
    BADGE_THANKS = "thanks"
    BADGES = (
        BADGE_TEAMWORK,
        BADGE_INNOVATION,
        BADGE_DEDICATION,
        BADGE_LEADERSHIP,
        BADGE_THANKS,
    )

    id = db.Column(db.Integer, primary_key=True)
    from_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    to_employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    badge = db.Column(db.String(30), nullable=False, default=BADGE_THANKS)
    message = db.Column(db.Text, nullable=False)

    from_user = db.relationship("User", foreign_keys=[from_user_id])
    to_employee = db.relationship("Employee", foreign_keys=[to_employee_id])

    def __repr__(self):
        return (
            f"<Kudo id={self.id} from_user_id={self.from_user_id} "
            f"to_employee_id={self.to_employee_id} badge={self.badge!r}>"
        )


class Survey(TimestampMixin, db.Model):
    __tablename__ = "surveys"

    STATUS_DRAFT = "draft"
    STATUS_ACTIVE = "active"
    STATUS_CLOSED = "closed"
    STATUSES = (STATUS_DRAFT, STATUS_ACTIVE, STATUS_CLOSED)

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    # JSON: list of {id, type: enps|scale|single|text, text, options?}
    questions = db.Column(db.JSON, nullable=False, default=list)
    status = db.Column(
        db.String(20), nullable=False, default=STATUS_ACTIVE, index=True
    )
    created_by = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    ends_at = db.Column(db.DateTime, nullable=True)

    creator = db.relationship("User", foreign_keys=[created_by])
    responses = db.relationship(
        "SurveyResponse", back_populates="survey", cascade="all, delete-orphan"
    )
    participations = db.relationship(
        "SurveyParticipation", back_populates="survey", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Survey id={self.id} title={self.title!r} status={self.status!r}>"


class SurveyResponse(db.Model):
    """Một lượt trả lời khảo sát — ẨN DANH: tuyệt đối không lưu user_id."""

    __tablename__ = "survey_responses"

    id = db.Column(db.Integer, primary_key=True)
    survey_id = db.Column(
        db.Integer, db.ForeignKey("surveys.id"), nullable=False, index=True
    )
    # JSON: {question_id: value} — enps/scale: int, single: str, text: str.
    answers = db.Column(db.JSON, nullable=False, default=dict)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    survey = db.relationship("Survey", back_populates="responses")

    def __repr__(self):
        return f"<SurveyResponse id={self.id} survey_id={self.survey_id}>"


class SurveyParticipation(db.Model):
    """Đánh dấu user đã trả lời 1 khảo sát (chỉ để chống trùng).

    Bảng này KHÔNG chứa đáp án và không được join với survey_responses
    trong bất kỳ API kết quả nào.
    """

    __tablename__ = "survey_participations"
    __table_args__ = (
        db.UniqueConstraint(
            "survey_id", "user_id", name="uq_survey_participations_survey_user"
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    survey_id = db.Column(
        db.Integer, db.ForeignKey("surveys.id"), nullable=False, index=True
    )
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    survey = db.relationship("Survey", back_populates="participations")
    user = db.relationship("User", foreign_keys=[user_id])

    def __repr__(self):
        return (
            f"<SurveyParticipation id={self.id} survey_id={self.survey_id} "
            f"user_id={self.user_id}>"
        )
