"""Ho so dien tu (EmployeeDocument) va giay xac nhan (CertificateRequest).

Theo hop dong feature-expansion-v3 muc 2 (Doi DOCUMENTS):
- EmployeeDocument: kho tai lieu cua tung nhan vien (hop dong, CCCD, bang
  cap, chung chi, khac). File vat ly luu o UPLOAD_FOLDER/documents voi ten
  UUID; DB chi giu duong dan tuong doi (stored_path, dang "documents/<uuid>.<ext>")
  va ten file goc de tai xuong dung ten.
- CertificateRequest: nhan vien xin giay xac nhan luong / xac nhan cong tac,
  HR/Admin duyet 1 cap (pending -> approved/rejected). Khi approved, service
  sinh san issued_content (van ban tieng Viet trang trong) de tai file .txt.
"""
from app.extensions import db
from app.models.users import TimestampMixin


class EmployeeDocument(TimestampMixin, db.Model):
    __tablename__ = "employee_documents"
    __table_args__ = (
        db.Index("ix_employee_documents_employee_type", "employee_id", "doc_type"),
        db.Index("ix_employee_documents_expiry", "expiry_date"),
    )

    TYPE_CONTRACT = "contract"
    TYPE_CCCD = "cccd"
    TYPE_DEGREE = "degree"
    TYPE_CERTIFICATE = "certificate"
    TYPE_OTHER = "other"
    DOC_TYPES = (TYPE_CONTRACT, TYPE_CCCD, TYPE_DEGREE, TYPE_CERTIFICATE, TYPE_OTHER)

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    doc_type = db.Column(db.String(20), nullable=False, default=TYPE_OTHER, index=True)
    title = db.Column(db.String(255), nullable=False)
    original_filename = db.Column(db.String(255), nullable=False)
    stored_path = db.Column(db.String(500), nullable=False)  # documents/<uuid>.<ext>
    expiry_date = db.Column(db.Date, nullable=True)  # null = khong het han
    note = db.Column(db.Text, nullable=True)
    uploaded_by = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )

    employee = db.relationship(
        "Employee", backref="documents", foreign_keys=[employee_id]
    )
    uploader = db.relationship("User", foreign_keys=[uploaded_by])

    def __repr__(self):
        return (
            f"<EmployeeDocument id={self.id} employee_id={self.employee_id} "
            f"type={self.doc_type!r} title={self.title!r}>"
        )


class CertificateRequest(TimestampMixin, db.Model):
    __tablename__ = "certificate_requests"
    __table_args__ = (
        db.Index("ix_certificate_requests_employee_status", "employee_id", "status"),
    )

    TYPE_SALARY = "salary"
    TYPE_EMPLOYMENT = "employment"
    CERT_TYPES = (TYPE_SALARY, TYPE_EMPLOYMENT)

    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUSES = (STATUS_PENDING, STATUS_APPROVED, STATUS_REJECTED)

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    cert_type = db.Column(db.String(20), nullable=False, index=True)
    purpose = db.Column(db.String(1000), nullable=False)
    status = db.Column(
        db.String(20), nullable=False, default=STATUS_PENDING, index=True
    )
    # Duyet 1 cap (HR/Admin) — giu thong tin nguoi quyet dinh de truy vet.
    decided_by = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True
    )
    decided_at = db.Column(db.DateTime, nullable=True)
    decision_note = db.Column(db.Text, nullable=True)
    # Noi dung giay xac nhan da cap (chi co khi approved).
    issued_content = db.Column(db.Text, nullable=True)

    employee = db.relationship(
        "Employee", backref="certificate_requests", foreign_keys=[employee_id]
    )
    decider = db.relationship("User", foreign_keys=[decided_by])

    def __repr__(self):
        return (
            f"<CertificateRequest id={self.id} employee_id={self.employee_id} "
            f"type={self.cert_type!r} status={self.status!r}>"
        )
