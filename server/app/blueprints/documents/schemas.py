"""Schema (serialize + validate) cho module Documents.

Serialize thủ công có kiểm tra getattr để không phụ thuộc quan hệ ORM cụ
thể. Validate trả (cleaned_data, errors) với errors dạng
[{"field": ..., "message": ...}] để routes đóng vào error.details —
đúng quy ước của các module hiện tại (training, departments...).
"""

from datetime import date, datetime

from app.models.documents import CertificateRequest, EmployeeDocument


def _iso(value):
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _expiry_info(expiry_date, today=None):
    """(is_expired, days_to_expiry) cho badge cảnh báo ở frontend."""
    if expiry_date is None:
        return False, None
    today = today or date.today()
    delta = (expiry_date - today).days
    return delta < 0, delta


def document_to_dict(doc, today=None):
    employee = getattr(doc, "employee", None)
    uploader = getattr(doc, "uploader", None)
    department = getattr(employee, "department", None) if employee else None
    is_expired, days_to_expiry = _expiry_info(doc.expiry_date, today)
    return {
        "id": doc.id,
        "employee_id": doc.employee_id,
        "employee_name": getattr(employee, "full_name", None) if employee else None,
        "employee_code": getattr(employee, "code", None) if employee else None,
        "department_name": getattr(department, "name", None) if department else None,
        "doc_type": doc.doc_type,
        "title": doc.title,
        "original_filename": doc.original_filename,
        "expiry_date": _iso(doc.expiry_date),
        "is_expired": is_expired,
        "days_to_expiry": days_to_expiry,
        "note": getattr(doc, "note", None),
        "uploaded_by": doc.uploaded_by,
        "uploaded_by_name": getattr(uploader, "full_name", None) if uploader else None,
        "created_at": _iso(getattr(doc, "created_at", None)),
        "updated_at": _iso(getattr(doc, "updated_at", None)),
    }


def certificate_to_dict(req):
    employee = getattr(req, "employee", None)
    decider = getattr(req, "decider", None)
    department = getattr(employee, "department", None) if employee else None
    return {
        "id": req.id,
        "employee_id": req.employee_id,
        "employee_name": getattr(employee, "full_name", None) if employee else None,
        "employee_code": getattr(employee, "code", None) if employee else None,
        "department_name": getattr(department, "name", None) if department else None,
        "cert_type": req.cert_type,
        "purpose": req.purpose,
        "status": req.status,
        "decided_by": getattr(req, "decided_by", None),
        "decided_by_name": getattr(decider, "full_name", None) if decider else None,
        "decided_at": _iso(getattr(req, "decided_at", None)),
        "decision_note": getattr(req, "decision_note", None),
        "issued_content": getattr(req, "issued_content", None),
        "created_at": _iso(getattr(req, "created_at", None)),
        "updated_at": _iso(getattr(req, "updated_at", None)),
    }


# ---------------------------------------------------------------------------
# Validate payloads
# ---------------------------------------------------------------------------

def validate_certificate_payload(data):
    """Body {cert_type: salary|employment, purpose: str}."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    cert_type = data.get("cert_type")
    if cert_type not in CertificateRequest.CERT_TYPES:
        errors.append(
            {
                "field": "cert_type",
                "message": "Loại giấy không hợp lệ (salary|employment).",
            }
        )
    purpose = data.get("purpose")
    if not isinstance(purpose, str) or not purpose.strip():
        errors.append({"field": "purpose", "message": "Mục đích xin giấy là bắt buộc."})
    elif len(purpose.strip()) > 1000:
        errors.append({"field": "purpose", "message": "Tối đa 1000 ký tự."})
    if errors:
        return {}, errors
    return {"cert_type": cert_type, "purpose": purpose.strip()}, errors


def validate_decision_payload(data):
    """Body {decision: approve|reject, note?: str}."""
    errors = []
    if not isinstance(data, dict):
        return {}, [{"field": "body", "message": "Body phải là JSON object."}]
    decision = data.get("decision")
    if decision not in ("approve", "reject"):
        errors.append(
            {"field": "decision", "message": "Quyết định phải là approve hoặc reject."}
        )
    note = data.get("note")
    if note is not None and not isinstance(note, str):
        errors.append({"field": "note", "message": "Ghi chú phải là chuỗi."})
    elif isinstance(note, str) and len(note) > 2000:
        errors.append({"field": "note", "message": "Ghi chú tối đa 2000 ký tự."})
    if errors:
        return {}, errors
    return {
        "decision": decision,
        "note": (note or "").strip() or None,
    }, errors


def validate_doc_type(value):
    if value not in EmployeeDocument.DOC_TYPES:
        return {
            "field": "doc_type",
            "message": "Loại tài liệu không hợp lệ "
            "(contract|cccd|degree|certificate|other).",
        }
    return None
