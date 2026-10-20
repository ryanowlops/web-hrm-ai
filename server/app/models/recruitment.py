"""Tuyen dung: JobPosting, Candidate, CvAnalysis va AiJob (hang doi AI).

Theo A7: job_postings 1-N candidates; candidates 1-N cv_analyses
(phan tich lai nhieu lan, hien thi ban moi nhat). Ket qua AI chi la GOI Y —
trang thai ung vien chi thay doi boi HR (human-in-loop, xem A6.4).
AiJob la bang job bat dong bo cho tac vu AI (phan tich CV, embedding KB)
theo kien truc B2.2: status pending/processing/done/failed.
"""
from app.extensions import db
from app.models.users import TimestampMixin


class JobPosting(TimestampMixin, db.Model):
    __tablename__ = "job_postings"

    STATUS_OPEN = "open"
    STATUS_CLOSED = "closed"
    STATUSES = (STATUS_OPEN, STATUS_CLOSED)

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    department_id = db.Column(
        db.Integer, db.ForeignKey("departments.id"), nullable=True, index=True
    )
    description = db.Column(db.Text, nullable=True)  # JD day du
    requirements = db.Column(db.Text, nullable=True)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    deadline = db.Column(db.Date, nullable=True)
    status = db.Column(db.String(20), nullable=False, default=STATUS_OPEN, index=True)

    department = db.relationship("Department", back_populates="job_postings")
    candidates = db.relationship(
        "Candidate", back_populates="job", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<JobPosting id={self.id} title={self.title!r} status={self.status!r}>"


class Candidate(TimestampMixin, db.Model):
    __tablename__ = "candidates"
    __table_args__ = (db.Index("ix_candidates_job_status", "job_id", "status"),)

    STATUS_NEW = "new"
    STATUS_REVIEWING = "reviewing"
    STATUS_INTERVIEW = "interview"
    STATUS_PASSED = "passed"
    STATUS_REJECTED = "rejected"
    STATUSES = (
        STATUS_NEW,
        STATUS_REVIEWING,
        STATUS_INTERVIEW,
        STATUS_PASSED,
        STATUS_REJECTED,
    )

    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(
        db.Integer, db.ForeignKey("job_postings.id"), nullable=False, index=True
    )
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), nullable=False, index=True)
    phone = db.Column(db.String(20), nullable=True)
    cv_file_url = db.Column(db.String(500), nullable=True)  # ten file do server sinh
    cv_text = db.Column(db.Text, nullable=True)  # text da trich tu PDF
    status = db.Column(db.String(20), nullable=False, default=STATUS_NEW, index=True)
    hr_note = db.Column(db.Text, nullable=True)

    job = db.relationship("JobPosting", back_populates="candidates")
    analyses = db.relationship(
        "CvAnalysis",
        back_populates="candidate",
        cascade="all, delete-orphan",
        order_by="CvAnalysis.created_at.desc()",
    )

    @property
    def latest_analysis(self):
        """Ban phan tich AI moi nhat (de hien thi), None neu chua phan tich."""
        return self.analyses[0] if self.analyses else None

    def __repr__(self):
        return f"<Candidate id={self.id} name={self.full_name!r} status={self.status!r}>"


class CvAnalysis(TimestampMixin, db.Model):
    __tablename__ = "cv_analyses"
    __table_args__ = (
        db.Index("ix_cv_analyses_candidate_created", "candidate_id", "created_at"),
    )

    STATUS_DONE = "done"
    STATUS_FAILED = "failed"
    STATUSES = (STATUS_DONE, STATUS_FAILED)

    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(
        db.Integer, db.ForeignKey("candidates.id"), nullable=False, index=True
    )
    match_score = db.Column(db.Integer, nullable=True)  # 0-100, validate o service
    matched_skills = db.Column(db.JSON, nullable=True)  # list[str]
    missing_skills = db.Column(db.JSON, nullable=True)  # list[str]
    experience_years_estimate = db.Column(db.Float, nullable=True)
    education_summary = db.Column(db.String(255), nullable=True)
    strengths = db.Column(db.JSON, nullable=True)  # list[str]
    concerns = db.Column(db.JSON, nullable=True)  # list[str]
    summary = db.Column(db.Text, nullable=True)
    model_name = db.Column(db.String(100), nullable=True)
    status = db.Column(db.String(20), nullable=False, default=STATUS_DONE)

    candidate = db.relationship("Candidate", back_populates="analyses")

    def __repr__(self):
        return (
            f"<CvAnalysis id={self.id} candidate_id={self.candidate_id} "
            f"score={self.match_score} status={self.status!r}>"
        )


class AiJob(TimestampMixin, db.Model):
    __tablename__ = "ai_jobs"
    __table_args__ = (db.Index("ix_ai_jobs_status", "status"),)

    TYPE_CV_ANALYSIS = "cv_analysis"
    TYPE_KB_EMBEDDING = "kb_embedding"
    TYPES = (TYPE_CV_ANALYSIS, TYPE_KB_EMBEDDING)

    STATUS_PENDING = "pending"
    STATUS_PROCESSING = "processing"
    STATUS_DONE = "done"
    STATUS_FAILED = "failed"
    STATUSES = (STATUS_PENDING, STATUS_PROCESSING, STATUS_DONE, STATUS_FAILED)

    id = db.Column(db.Integer, primary_key=True)
    job_type = db.Column(db.String(30), nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False, default=STATUS_PENDING)
    # payload: {candidate_ids: [...], job_id: ...} hoac {document_id: ...}
    payload = db.Column(db.JSON, nullable=True)
    result = db.Column(db.JSON, nullable=True)
    error_message = db.Column(db.Text, nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    creator = db.relationship("User", foreign_keys=[created_by])

    def __repr__(self):
        return f"<AiJob id={self.id} type={self.job_type!r} status={self.status!r}>"
