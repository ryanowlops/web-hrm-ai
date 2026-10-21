"""Service layer cho module Documents (hồ sơ điện tử + giấy xác nhận).

Logic nghiệp vụ + transaction; routes chỉ validate input, gọi service và
trả JSON. Lỗi nghiệp vụ ném ra dưới dạng ApiError (định dạng chuẩn
{"error": {"code", "message", "details"}}).

Quy tắc chính (hợp đồng feature-expansion-v3 mục 2):
- Scope dữ liệu: employee = chỉ hồ sơ của mình; manager = bản thân + nhân
  viên mình quản lý (trực tiếp hoặc qua phòng ban làm trưởng phòng — bám
  cách leave/services xác định manager scope); hr/admin = toàn công ty.
- Upload: file lưu ở UPLOAD_FOLDER/documents với tên UUID + đuôi gốc,
  tối đa 10MB, chặn đuôi file thực thi nguy hiểm (.exe/.sh/.bat...).
- Giấy xác nhận duyệt 1 cấp HR/Admin; khi approve thì sinh issued_content
  (văn bản trang trọng) lấy chức vụ/phòng ban/lương cơ bản từ hồ sơ hiện
  có — số liệu nào không có thì ghi "theo hồ sơ nhân sự", không bịa số.
"""

import os
import uuid
from datetime import date

from flask import current_app

from app.blueprints.auth.guards import load_current_user
from app.extensions import db
from app.models import Contract, Department, Employee, Notification, User
from app.models.documents import CertificateRequest, EmployeeDocument
from app.models.payroll import PayrollItem
from app.models.users import utcnow


class ApiError(Exception):
    """Lỗi nghiệp vụ có mã HTTP + code chuẩn để routes trả về."""

    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or []


COMPANY_NAME = "Công ty HRM Demo"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB
# Đuôi file thực thi / script nguy hiểm — từ chối khi upload.
BLOCKED_EXTENSIONS = {
    "exe", "sh", "bat", "cmd", "ps1", "msi", "com", "scr", "vbs", "jar",
}
HR_ADMIN_ROLES = ("admin", "hr")


# ---------------------------------------------------------------------------
# Helpers dùng chung
# ---------------------------------------------------------------------------

def get_or_404(model, pk, code, message):
    obj = db.session.get(model, pk)
    if obj is None:
        raise ApiError(404, code, message)
    return obj


def parse_pagination(args):
    try:
        page = int(args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    try:
        limit = int(args.get("limit", 20))
    except (TypeError, ValueError):
        limit = 20
    page = max(page, 1)
    limit = min(max(limit, 1), 100)
    return page, limit


def paginate(query, page, limit):
    total = query.count()
    total_pages = (total + limit - 1) // limit if total else 0
    items = query.offset((page - 1) * limit).limit(limit).all()
    meta = {
        "page": page,
        "limit": limit,
        "totalItems": total,
        "totalPages": total_pages,
    }
    return items, meta


def current_user():
    return load_current_user()


def _current_employee(user):
    """Hồ sơ nhân viên gắn với tài khoản hiện tại (có thể None)."""
    if getattr(user, "employee_id", None):
        return db.session.get(Employee, user.employee_id)
    return None


def _require_current_employee(user):
    employee = _current_employee(user)
    if employee is None:
        raise ApiError(
            400,
            "NO_EMPLOYEE_PROFILE",
            "Tài khoản chưa được gắn với hồ sơ nhân viên.",
        )
    return employee


# ---------------------------------------------------------------------------
# Scope dữ liệu (bám leave/services.py)
# ---------------------------------------------------------------------------

def _is_manager_of(manager_employee, employee):
    """Manager quản lý trực tiếp (employees.manager_id) hoặc là trưởng phòng."""
    if employee is None or manager_employee is None:
        return False
    if getattr(employee, "manager_id", None) == manager_employee.id:
        return True
    department = None
    if getattr(employee, "department_id", None):
        department = db.session.get(Department, employee.department_id)
    return department is not None and department.manager_id == manager_employee.id


def _team_employee_ids(manager_employee):
    """Id nhân viên thuộc phạm vi quản lý của manager (không gồm chính họ)."""
    ids = {
        e.id
        for e in Employee.query.filter_by(manager_id=manager_employee.id).all()
    }
    managed_departments = Department.query.filter_by(
        manager_id=manager_employee.id
    ).all()
    for dept in managed_departments:
        ids.update(
            e.id for e in Employee.query.filter_by(department_id=dept.id).all()
        )
    ids.discard(manager_employee.id)
    return ids


def visible_employee_ids(user):
    """Danh sách employee_id người dùng được xem dữ liệu.

    Trả None nghĩa là không giới hạn (hr/admin xem toàn công ty).
    """
    if user.role in HR_ADMIN_ROLES:
        return None
    me = _current_employee(user)
    if me is None:
        return set()
    if user.role == "manager":
        return _team_employee_ids(me) | {me.id}
    # employee (và mọi role còn lại): chỉ bản thân.
    return {me.id}


def ensure_can_view_employee(user, employee):
    """Ném 403 nếu hồ sơ `employee` nằm ngoài scope của `user`."""
    ids = visible_employee_ids(user)
    if ids is not None and employee.id not in ids:
        raise ApiError(
            403, "FORBIDDEN", "Bạn không có quyền truy cập hồ sơ của nhân viên này."
        )


def _notify_user(user_id, title, content, related_id):
    if user_id is None:
        return
    db.session.add(
        Notification(
            user_id=user_id,
            type="documents",
            title=title,
            content=content,
            is_read=False,
            related_type="certificate_request",
            related_id=related_id,
        )
    )


def _notify_hr_admins(title, content, related_id):
    for account in User.query.filter(User.role.in_(HR_ADMIN_ROLES)).all():
        _notify_user(account.id, title, content, related_id)


# ---------------------------------------------------------------------------
# Lưu trữ file upload
# ---------------------------------------------------------------------------

def _upload_root():
    return current_app.config.get("UPLOAD_FOLDER") or os.path.join(
        current_app.instance_path, "uploads"
    )


def document_abs_path(stored_path):
    return os.path.join(_upload_root(), stored_path)


def _extension_of(filename):
    if not filename or "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower().strip()


def save_document_file(file_storage):
    """Validate + lưu file upload. Trả (stored_path tương đối, tên gốc)."""
    original = (file_storage.filename or "").strip()
    if not original:
        raise ApiError(
            400, "VALIDATION_ERROR", "Chưa chọn file tải lên.",
            [{"field": "file", "message": "File là bắt buộc."}],
        )
    ext = _extension_of(original)
    if ext in BLOCKED_EXTENSIONS:
        raise ApiError(
            400,
            "INVALID_FILE_TYPE",
            "Định dạng file này không được phép tải lên vì lý do an toàn.",
            [{"field": "file", "message": f"Đuôi .{ext} bị chặn."}],
        )
    content = file_storage.read()
    if not content:
        raise ApiError(
            400, "VALIDATION_ERROR", "File rỗng, không thể lưu.",
            [{"field": "file", "message": "File rỗng."}],
        )
    if len(content) > MAX_UPLOAD_BYTES:
        raise ApiError(
            413,
            "FILE_TOO_LARGE",
            "File vượt quá dung lượng tối đa 10MB.",
            [{"field": "file", "message": "Tối đa 10MB."}],
        )
    safe_ext = "".join(ch for ch in ext if ch.isalnum())[:10]
    filename = f"{uuid.uuid4().hex}.{safe_ext}" if safe_ext else uuid.uuid4().hex
    docs_dir = os.path.join(_upload_root(), "documents")
    os.makedirs(docs_dir, exist_ok=True)
    with open(os.path.join(docs_dir, filename), "wb") as fh:
        fh.write(content)
    return f"documents/{filename}", original


# ---------------------------------------------------------------------------
# Tài liệu nhân viên (EmployeeDocument)
# ---------------------------------------------------------------------------

def list_documents(args, user):
    """Danh sách tài liệu theo scope; employee_id ngoài scope -> 403."""
    query = EmployeeDocument.query
    target_raw = args.get("employee_id")
    if target_raw not in (None, ""):
        try:
            target_id = int(target_raw)
        except (TypeError, ValueError):
            raise ApiError(
                400, "VALIDATION_ERROR", "employee_id phải là số nguyên.",
                [{"field": "employee_id", "message": "Phải là số nguyên."}],
            )
        target = get_or_404(
            Employee, target_id, "EMPLOYEE_NOT_FOUND", "Không tìm thấy nhân viên."
        )
        ensure_can_view_employee(user, target)
        query = query.filter(EmployeeDocument.employee_id == target.id)
    else:
        ids = visible_employee_ids(user)
        if ids is not None:
            if not ids:
                query = query.filter(db.false())
            else:
                query = query.filter(EmployeeDocument.employee_id.in_(ids))
    doc_type = (args.get("doc_type") or "").strip()
    if doc_type:
        query = query.filter(EmployeeDocument.doc_type == doc_type)
    search = (args.get("search") or args.get("q") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(
            db.or_(
                EmployeeDocument.title.ilike(like),
                EmployeeDocument.original_filename.ilike(like),
            )
        )
    query = query.order_by(
        EmployeeDocument.created_at.desc(), EmployeeDocument.id.desc()
    )
    page, limit = parse_pagination(args)
    return paginate(query, page, limit)


def create_document(user, form, file_storage):
    """Tạo tài liệu từ multipart form + file đã validate ở service."""
    if file_storage is None:
        raise ApiError(
            400, "VALIDATION_ERROR", "Thiếu file tải lên.",
            [{"field": "file", "message": "File là bắt buộc."}],
        )

    employee_id_raw = (form.get("employee_id") or "").strip()
    if user.role == "employee":
        target = _require_current_employee(user)
        if employee_id_raw and str(target.id) != employee_id_raw:
            raise ApiError(
                403, "FORBIDDEN", "Nhân viên chỉ được tải tài liệu cho chính mình."
            )
    elif user.role in HR_ADMIN_ROLES:
        if not employee_id_raw:
            raise ApiError(
                400, "VALIDATION_ERROR", "Thiếu nhân viên sở hữu tài liệu.",
                [{"field": "employee_id", "message": "Trường này là bắt buộc."}],
            )
        try:
            target_id = int(employee_id_raw)
        except (TypeError, ValueError):
            raise ApiError(
                400, "VALIDATION_ERROR", "employee_id phải là số nguyên.",
                [{"field": "employee_id", "message": "Phải là số nguyên."}],
            )
        target = get_or_404(
            Employee, target_id, "EMPLOYEE_NOT_FOUND", "Không tìm thấy nhân viên."
        )
    else:
        raise ApiError(
            403, "FORBIDDEN", "Bạn không có quyền tải tài liệu lên."
        )

    doc_type = (form.get("doc_type") or EmployeeDocument.TYPE_OTHER).strip()
    if doc_type not in EmployeeDocument.DOC_TYPES:
        raise ApiError(
            400, "VALIDATION_ERROR", "Loại tài liệu không hợp lệ.",
            [{"field": "doc_type", "message": "Loại tài liệu không hợp lệ."}],
        )
    title = (form.get("title") or "").strip()
    if not title:
        raise ApiError(
            400, "VALIDATION_ERROR", "Tiêu đề tài liệu là bắt buộc.",
            [{"field": "title", "message": "Trường này là bắt buộc."}],
        )
    if len(title) > 255:
        raise ApiError(
            400, "VALIDATION_ERROR", "Tiêu đề tối đa 255 ký tự.",
            [{"field": "title", "message": "Tối đa 255 ký tự."}],
        )
    expiry_date = None
    expiry_raw = (form.get("expiry_date") or "").strip()
    if expiry_raw:
        try:
            expiry_date = date.fromisoformat(expiry_raw)
        except ValueError:
            raise ApiError(
                400, "VALIDATION_ERROR", "Ngày hết hạn phải dạng YYYY-MM-DD.",
                [{"field": "expiry_date", "message": "Định dạng YYYY-MM-DD."}],
            )
    note = (form.get("note") or "").strip() or None

    stored_path, original_filename = save_document_file(file_storage)
    doc = EmployeeDocument(
        employee_id=target.id,
        doc_type=doc_type,
        title=title,
        original_filename=original_filename,
        stored_path=stored_path,
        expiry_date=expiry_date,
        note=note,
        uploaded_by=user.id,
    )
    db.session.add(doc)
    db.session.commit()
    return doc


def get_document_for_download(doc_id, user):
    doc = get_or_404(
        EmployeeDocument, doc_id, "DOCUMENT_NOT_FOUND", "Không tìm thấy tài liệu."
    )
    ensure_can_view_employee(user, doc.employee)
    abs_path = document_abs_path(doc.stored_path)
    if not os.path.isfile(abs_path):
        raise ApiError(
            404, "FILE_NOT_FOUND", "File tài liệu không còn tồn tại trên máy chủ."
        )
    return doc, abs_path


def delete_document(doc_id, user):
    doc = get_or_404(
        EmployeeDocument, doc_id, "DOCUMENT_NOT_FOUND", "Không tìm thấy tài liệu."
    )
    is_owner = (
        getattr(user, "employee_id", None) is not None
        and user.employee_id == doc.employee_id
    )
    if user.role not in HR_ADMIN_ROLES and not is_owner:
        raise ApiError(
            403, "FORBIDDEN", "Bạn không có quyền xoá tài liệu này."
        )
    abs_path = document_abs_path(doc.stored_path)
    db.session.delete(doc)
    db.session.commit()
    # Xoá file vật lý (best effort — lỗi file không làm hỏng nghiệp vụ).
    try:
        if os.path.isfile(abs_path):
            os.remove(abs_path)
    except OSError:
        current_app.logger.warning("Không xoá được file tài liệu %s", abs_path)


def list_expiring(args, user):
    """Giấy tờ đã/sắp hết hạn trong `days` ngày (mặc định 30) — HR/Admin."""
    if user.role not in HR_ADMIN_ROLES:
        raise ApiError(
            403, "FORBIDDEN", "Chỉ HR/Admin mới xem được danh sách sắp hết hạn."
        )
    try:
        days = int(args.get("days", 30))
    except (TypeError, ValueError):
        days = 30
    days = min(max(days, 0), 3650)
    today = date.today()
    from datetime import timedelta

    threshold = today + timedelta(days=days)
    query = (
        EmployeeDocument.query.filter(EmployeeDocument.expiry_date.isnot(None))
        .filter(EmployeeDocument.expiry_date <= threshold)
        .order_by(EmployeeDocument.expiry_date.asc(), EmployeeDocument.id.asc())
    )
    page, limit = parse_pagination(args)
    return paginate(query, page, limit)


# ---------------------------------------------------------------------------
# Giấy xác nhận (CertificateRequest)
# ---------------------------------------------------------------------------

def _format_vnd(amount):
    return f"{int(amount):,}".replace(",", ".") + " đồng"


def _format_date(value):
    if value is None:
        return None
    return value.strftime("%d/%m/%Y")


def _base_salary_of(employee):
    """Lương cơ bản hiện tại: HĐ đang hiệu lực mới nhất, hoặc dòng lương gần
    nhất. Trả (amount hoặc None, nguồn mô tả)."""
    contract = (
        Contract.query.filter_by(employee_id=employee.id, status=Contract.STATUS_ACTIVE)
        .order_by(Contract.start_date.desc(), Contract.id.desc())
        .first()
    )
    if contract is not None and contract.base_salary:
        return contract.base_salary, "hợp đồng lao động đang hiệu lực"
    item = (
        PayrollItem.query.filter_by(employee_id=employee.id)
        .order_by(PayrollItem.id.desc())
        .first()
    )
    if item is not None and item.base_salary:
        return item.base_salary, "bảng lương gần nhất"
    return None, None


def build_issued_content(req, employee, issued_date=None):
    """Sinh văn bản giấy xác nhận trang trọng (dùng cho decision + seed)."""
    issued_date = issued_date or date.today()
    code = f"XN-{req.id}-{issued_date.year}"
    title = (
        "GIẤY XÁC NHẬN LƯƠNG"
        if req.cert_type == CertificateRequest.TYPE_SALARY
        else "GIẤY XÁC NHẬN CÔNG TÁC"
    )
    honorific = {"male": "Ông", "female": "Bà"}.get(
        getattr(employee, "gender", None), "Ông/Bà"
    )
    position_title = (
        getattr(employee.position, "title", None) if employee.position else None
    ) or "theo hồ sơ nhân sự"
    department_name = (
        getattr(employee.department, "name", None) if employee.department else None
    ) or "theo hồ sơ nhân sự"
    start_text = _format_date(employee.start_date) or "theo hồ sơ nhân sự"

    lines = [
        COMPANY_NAME.upper(),
        "-" * len(COMPANY_NAME),
        "",
        title,
        f"Mã xác nhận: {code}",
        "",
        f"{COMPANY_NAME} xác nhận:",
        "",
        f"{honorific}: {employee.full_name}",
        f"Mã nhân viên: {employee.code}",
        f"Chức vụ: {position_title}",
        f"Phòng ban: {department_name}",
        f"Ngày bắt đầu làm việc: {start_text}",
    ]
    if req.cert_type == CertificateRequest.TYPE_SALARY:
        amount, source = _base_salary_of(employee)
        if amount:
            lines.append(
                f"Mức lương cơ bản hiện tại: {_format_vnd(amount)}/tháng "
                f"(theo {source})."
            )
        else:
            lines.append(
                "Mức lương cơ bản hiện tại: theo hồ sơ nhân sự của công ty."
            )
    else:
        lines.append(
            f"Hiện đang là nhân viên chính thức của {COMPANY_NAME}."
        )
    lines += [
        "",
        "Giấy xác nhận này được cấp theo yêu cầu của nhân viên với mục đích: "
        f"{req.purpose}.",
        "",
        f"Ngày cấp: {_format_date(issued_date)}",
        f"Nơi cấp: {COMPANY_NAME} — Phòng Nhân sự",
    ]
    return "\n".join(lines)


def create_certificate(user, cleaned):
    employee = _require_current_employee(user)
    req = CertificateRequest(
        employee_id=employee.id,
        cert_type=cleaned["cert_type"],
        purpose=cleaned["purpose"],
        status=CertificateRequest.STATUS_PENDING,
    )
    db.session.add(req)
    db.session.flush()
    _notify_hr_admins(
        "Yêu cầu giấy xác nhận mới",
        f"{employee.full_name} xin giấy xác nhận "
        f"({'lương' if req.cert_type == 'salary' else 'công tác'}): {req.purpose}",
        req.id,
    )
    db.session.commit()
    return req


def list_certificates(args, user):
    query = CertificateRequest.query
    scope = (args.get("scope") or "").strip().lower()
    me = _current_employee(user)
    if scope == "mine" or user.role == "employee":
        if me is None:
            query = query.filter(db.false())
        else:
            query = query.filter(CertificateRequest.employee_id == me.id)
    elif user.role == "manager":
        ids = visible_employee_ids(user) or set()
        if ids:
            query = query.filter(CertificateRequest.employee_id.in_(ids))
        else:
            query = query.filter(db.false())
    # hr/admin: toàn công ty, không lọc thêm.
    employee_id_raw = args.get("employee_id")
    if employee_id_raw not in (None, "") and user.role in HR_ADMIN_ROLES:
        try:
            query = query.filter(
                CertificateRequest.employee_id == int(employee_id_raw)
            )
        except (TypeError, ValueError):
            raise ApiError(
                400, "VALIDATION_ERROR", "employee_id phải là số nguyên.",
                [{"field": "employee_id", "message": "Phải là số nguyên."}],
            )
    status = (args.get("status") or "").strip()
    if status:
        query = query.filter(CertificateRequest.status == status)
    query = query.order_by(
        CertificateRequest.created_at.desc(), CertificateRequest.id.desc()
    )
    page, limit = parse_pagination(args)
    return paginate(query, page, limit)


def decide_certificate(req_id, user, cleaned):
    """HR/Admin duyệt 1 cấp; approve thì sinh issued_content ngay."""
    req = get_or_404(
        CertificateRequest, req_id, "CERTIFICATE_NOT_FOUND",
        "Không tìm thấy đơn xin giấy xác nhận.",
    )
    if req.status != CertificateRequest.STATUS_PENDING:
        raise ApiError(
            409, "ALREADY_DECIDED", "Đơn này đã được quyết định trước đó."
        )
    req.decided_by = user.id
    req.decided_at = utcnow()
    req.decision_note = cleaned.get("note")
    if cleaned["decision"] == "approve":
        req.status = CertificateRequest.STATUS_APPROVED
        req.issued_content = build_issued_content(req, req.employee)
    else:
        req.status = CertificateRequest.STATUS_REJECTED
        req.issued_content = None
    owner_user = User.query.filter_by(employee_id=req.employee_id).first()
    if owner_user is not None:
        _notify_user(
            owner_user.id,
            "Đơn xin giấy xác nhận đã được duyệt"
            if req.status == CertificateRequest.STATUS_APPROVED
            else "Đơn xin giấy xác nhận bị từ chối",
            f"Đơn giấy xác nhận {'lương' if req.cert_type == 'salary' else 'công tác'} "
            f"của bạn đã ở trạng thái: {req.status}.",
            req.id,
        )
    db.session.commit()
    return req


def get_certificate_for_download(req_id, user):
    req = get_or_404(
        CertificateRequest, req_id, "CERTIFICATE_NOT_FOUND",
        "Không tìm thấy đơn xin giấy xác nhận.",
    )
    is_owner = (
        getattr(user, "employee_id", None) is not None
        and user.employee_id == req.employee_id
    )
    if not is_owner and user.role not in HR_ADMIN_ROLES:
        raise ApiError(
            403, "FORBIDDEN", "Bạn không có quyền tải giấy xác nhận này."
        )
    if req.status != CertificateRequest.STATUS_APPROVED or not req.issued_content:
        raise ApiError(
            400, "NOT_ISSUED", "Giấy xác nhận chưa được cấp, chưa thể tải xuống."
        )
    return req
