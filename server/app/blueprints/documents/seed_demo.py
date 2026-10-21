"""Seed demo cho module Documents (hợp đồng feature-expansion-v3 mục 2.4).

- Tài liệu: NV0001 — HĐLĐ (hết hạn sau 20 ngày), NV0002 — CCCD (không hết
  hạn), NV0003 — Bằng đại học, NV0004 — Chứng chỉ tiếng Anh (đã hết hạn 10
  ngày). File vật lý .txt giả lập được tạo thật trong uploads/documents.
- Giấy xác nhận: NV0003 xin lương (pending); NV0001 xin xác nhận công tác
  (approved, có issued_content đầy đủ do chính service sinh).

IDEMPOTENT: kiểm tra tồn tại theo (employee_id, title) / (employee_id,
cert_type, purpose) trước khi insert. Không commit — transaction do
parent seed.py quản lý; ngày tháng tính tương đối theo ngày chạy seed.
"""

import os
import uuid
from datetime import date, timedelta

from flask import current_app

from app.extensions import db
from app.models import Employee, User
from app.models.documents import CertificateRequest, EmployeeDocument
from app.blueprints.documents.services import build_issued_content


def _employee_by_code(code):
    return Employee.query.filter_by(code=code).first()


def _user_by_email(email):
    return User.query.filter_by(email=email).first()


def _write_demo_file(title):
    """Tạo file .txt giả lập trong uploads/documents, trả stored_path."""
    upload_root = current_app.config.get("UPLOAD_FOLDER") or os.path.join(
        current_app.instance_path, "uploads"
    )
    docs_dir = os.path.join(upload_root, "documents")
    os.makedirs(docs_dir, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.txt"
    with open(os.path.join(docs_dir, filename), "w", encoding="utf-8") as fh:
        fh.write(f"Tài liệu demo — {title}\n")
    return f"documents/{filename}"


def _ensure_document(employee, doc_type, title, expiry_date, uploader):
    if employee is None or uploader is None:
        return None
    existing = (
        EmployeeDocument.query.filter_by(employee_id=employee.id, title=title)
        .first()
    )
    if existing is not None:
        return existing
    doc = EmployeeDocument(
        employee_id=employee.id,
        doc_type=doc_type,
        title=title,
        original_filename=f"{title}.txt",
        stored_path=_write_demo_file(title),
        expiry_date=expiry_date,
        uploaded_by=uploader.id,
    )
    db.session.add(doc)
    db.session.flush()
    return doc


def _ensure_certificate(employee, cert_type, purpose, status, decider=None):
    if employee is None:
        return None
    existing = (
        CertificateRequest.query.filter_by(
            employee_id=employee.id, cert_type=cert_type, purpose=purpose
        ).first()
    )
    if existing is not None:
        return existing
    req = CertificateRequest(
        employee_id=employee.id,
        cert_type=cert_type,
        purpose=purpose,
        status=CertificateRequest.STATUS_PENDING,
    )
    db.session.add(req)
    db.session.flush()  # cần req.id để sinh mã xác nhận trong issued_content
    if status == CertificateRequest.STATUS_APPROVED:
        from app.models.users import utcnow

        req.status = CertificateRequest.STATUS_APPROVED
        req.decided_by = decider.id if decider is not None else None
        req.decided_at = utcnow()
        req.issued_content = build_issued_content(req, employee)
    db.session.flush()
    return req


def seed_demo():
    today = date.today()
    hr_user = _user_by_email("hr@hrm.local")
    employee_user = _user_by_email("employee@hrm.local")
    uploader_hr = hr_user
    uploader_self = employee_user or hr_user

    nv0001 = _employee_by_code("NV0001")
    nv0002 = _employee_by_code("NV0002")
    nv0003 = _employee_by_code("NV0003")
    nv0004 = _employee_by_code("NV0004")

    _ensure_document(
        nv0001,
        EmployeeDocument.TYPE_CONTRACT,
        "Hợp đồng lao động — Trần Văn Minh",
        today + timedelta(days=20),
        uploader_hr,
    )
    _ensure_document(
        nv0002,
        EmployeeDocument.TYPE_CCCD,
        "Căn cước công dân — Nguyễn Thu Hà",
        None,
        uploader_hr,
    )
    _ensure_document(
        nv0003,
        EmployeeDocument.TYPE_DEGREE,
        "Bằng đại học — Phạm Thị Lan",
        None,
        uploader_self,
    )
    _ensure_document(
        nv0004,
        EmployeeDocument.TYPE_CERTIFICATE,
        "Chứng chỉ tiếng Anh IELTS",
        today - timedelta(days=10),
        uploader_hr,
    )

    _ensure_certificate(
        nv0003,
        CertificateRequest.TYPE_SALARY,
        "Bổ sung hồ sơ mở thẻ tín dụng tại ngân hàng",
        CertificateRequest.STATUS_PENDING,
    )
    _ensure_certificate(
        nv0001,
        CertificateRequest.TYPE_EMPLOYMENT,
        "Xác nhận công tác để làm thủ tục visa du lịch",
        CertificateRequest.STATUS_APPROVED,
        decider=hr_user,
    )
