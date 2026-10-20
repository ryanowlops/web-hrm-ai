"""Module bảo mật dùng chung cho backend Flask — Web HRM tích hợp AI.

Module ĐỘC LẬP, không import model/blueprint nào của dự án để tránh import vòng.
App factory chỉ cần import khi tích hợp, ví dụ:

    from app.security import add_security_headers

    def create_app(...):
        app = Flask(__name__)
        ...
        add_security_headers(app)
        return app

Nội dung module:
1. ``add_security_headers``  — gắn security headers cho mọi response.
2. ``sanitize_filename``     — làm sạch tên file upload (chống path traversal).
3. ``validate_upload``       — kiểm tra đuôi file + kích thước + magic bytes (PDF).
4. Helper audit log an toàn   — ``redact_sensitive`` / ``log_audit_event`` /
   ``record_audit_log``: ghi nhật ký kiểm toán mà KHÔNG bao giờ ghi dữ liệu
   nhạy cảm (mật khẩu, token, API key, nội dung CV, số lương chi tiết...).

Ánh xạ thiết kế: docs/architecture.md mục B8, checklist ở docs/security.md.
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any, Iterable, Mapping, Optional

__all__ = [
    "add_security_headers",
    "sanitize_filename",
    "validate_upload",
    "UploadValidationError",
    "redact_sensitive",
    "log_audit_event",
    "record_audit_log",
    "SENSITIVE_KEYS",
    "REDACTED",
]

# ---------------------------------------------------------------------------
# 1. Security headers
# ---------------------------------------------------------------------------

# Flask chỉ phục vụ API JSON (frontend React JS là SPA riêng), nên CSP mặc định
# khóa toàn bộ: không cho trang nào nhúng/chạy tài nguyên từ origin của API.
# Nếu sau này Flask phục vụ thêm HTML, phải nới CSP tương ứng — đừng nới bừa.
_DEFAULT_CSP = (
    "default-src 'none'; "
    "frame-ancestors 'none'; "
    "base-uri 'none'; "
    "form-action 'none'"
)


def add_security_headers(app, *, csp: str = _DEFAULT_CSP, hsts: bool = True,
                         hsts_max_age: int = 31_536_000) -> None:
    """Đăng ký ``after_request`` gắn security headers cho mọi response.

    Headers được gắn:
    - ``Content-Security-Policy``: mặc định ``default-src 'none'`` (API JSON).
    - ``X-Content-Type-Options: nosniff``: chặn trình duyệt đoán sai MIME type.
    - ``Referrer-Policy: no-referrer``: không rò rỉ URL (có thể chứa id nhạy cảm).
    - ``X-Frame-Options: DENY``: chống clickjacking (trùng với frame-ancestors).
    - ``Strict-Transport-Security`` (khi ``hsts=True``): chỉ có tác dụng trên
      HTTPS; bật sẵn để khi triển khai qua HTTPS là có hiệu lực ngay, môi
      trường dev HTTP cục bộ không bị ảnh hưởng thực tế.
    - ``Cache-Control: no-store`` cho các response ``/api/``: tránh trình duyệt
      hoặc proxy lưu đệm dữ liệu nhân sự/lương.

    Hàm không ghi đè header mà từng view đã chủ động đặt.
    """

    @app.after_request
    def _apply_security_headers(response):  # pragma: no cover - hook mỏng
        headers = response.headers
        headers.setdefault("Content-Security-Policy", csp)
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("Referrer-Policy", "no-referrer")
        headers.setdefault("X-Frame-Options", "DENY")
        if hsts:
            headers.setdefault(
                "Strict-Transport-Security",
                f"max-age={hsts_max_age}; includeSubDomains",
            )
        if response.content_type and "application/json" in response.content_type:
            headers.setdefault("Cache-Control", "no-store")
        return response

    return None


# ---------------------------------------------------------------------------
# 2. Làm sạch tên file upload
# ---------------------------------------------------------------------------

_UNSAFE_CHARS_RE = re.compile(r"[^A-Za-z0-9._-]+")
_MAX_FILENAME_LEN = 120


def sanitize_filename(filename: Optional[str], *, fallback: str = "upload") -> str:
    """Trả về tên file an toàn để lưu trữ/hiển thị.

    - Bỏ mọi thành phần thư mục (``../../etc/passwd`` -> ``passwd``) — dùng cả
      ``/`` và ``\\`` vì client có thể gửi path kiểu Windows.
    - Bỏ dấu tiếng Việt và ký tự ngoài ``[A-Za-z0-9._-]`` (gộp ký tự lạ thành
      một dấu ``_``), chống ký tự điều khiển và tên file gây lỗi filesystem.
    - Chặn tên chỉ gồm dấu chấm (``.``, ``..``) và tên rỗng -> dùng ``fallback``.
    - Giới hạn độ dài, giữ lại phần đuôi file.

    LƯU Ý: đây chỉ là lớp làm sạch tên. Khi lưu file thật, hệ thống vẫn phải
    sinh tên mới (ví dụ UUID) và lưu ngoài thư mục public — xem docs/security.md.
    """
    if not filename:
        return fallback

    # Chỉ lấy phần tên file, bỏ đường dẫn ở cả hai kiểu phân cách.
    name = str(filename).replace("\\", "/").rsplit("/", 1)[-1].strip()

    # Chuẩn hóa Unicode rồi bỏ dấu, sau đó lọc ký tự an toàn.
    name = unicodedata.normalize("NFKD", name)
    name = name.encode("ascii", "ignore").decode("ascii")
    name = _UNSAFE_CHARS_RE.sub("_", name)
    name = name.strip("._")

    if not name or name in {".", ".."}:
        return fallback

    if len(name) > _MAX_FILENAME_LEN:
        stem, dot, ext = name.rpartition(".")
        if dot and len(ext) <= 10:
            keep = _MAX_FILENAME_LEN - len(ext) - 1
            name = f"{stem[:keep]}.{ext}"
        else:
            name = name[:_MAX_FILENAME_LEN]
    return name


# ---------------------------------------------------------------------------
# 3. Kiểm tra file upload (đuôi + kích thước + magic bytes)
# ---------------------------------------------------------------------------


class UploadValidationError(ValueError):
    """Ném ra khi file upload không hợp lệ. Message tiếng Việt, an toàn để
    trả về cho người dùng trong response 400 (không chứa dữ liệu nội bộ)."""


# Magic bytes theo định dạng. PDF bắt đầu bằng "%PDF-" theo đặc tả ISO 32000.
_MAGIC_BYTES: dict[str, tuple[bytes, ...]] = {
    ".pdf": (b"%PDF-",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    # .docx/.xlsx là file ZIP nên cùng chữ ký "PK\x03\x04" — chỉ dùng nếu
    # dự án mở rộng cho phép upload tài liệu Office (mặc định HRM chỉ cần PDF).
    ".docx": (b"PK\x03\x04",),
    ".xlsx": (b"PK\x03\x04",),
}

_HEADER_READ_SIZE = 8  # đủ cho mọi chữ ký trong _MAGIC_BYTES


def _file_extension(filename: Optional[str]) -> str:
    if not filename or "." not in filename:
        return ""
    return "." + filename.rsplit(".", 1)[-1].lower()


def _measure_and_check_header(file) -> tuple[int, bytes]:
    """Đo kích thước file và đọc vài byte đầu mà không phá vị trí stream.

    Hỗ trợ đối tượng kiểu Werkzeug ``FileStorage`` (có ``.stream``) và mọi
    file-like object có ``read/seek/tell``. Sau khi đo, stream được đưa về
    vị trí ban đầu để nơi gọi tiếp tục xử lý bình thường.
    """
    stream = getattr(file, "stream", file)
    try:
        position = stream.tell()
    except (OSError, ValueError):
        position = 0
    try:
        stream.seek(0, 2)  # cuối file
        size = stream.tell()
        stream.seek(0)
        header = stream.read(_HEADER_READ_SIZE) or b""
    except (OSError, ValueError) as exc:  # stream không seek được
        raise UploadValidationError(
            "Không đọc được nội dung file tải lên, vui lòng thử lại."
        ) from exc
    finally:
        try:
            stream.seek(position)
        except (OSError, ValueError):
            pass
    return size, header


def validate_upload(file, allowed_exts: Iterable[str], max_mb: float) -> dict[str, Any]:
    """Kiểm tra một file upload trước khi lưu/xử lý.

    Tham số:
    - ``file``: đối tượng file nhận được từ request (Werkzeug FileStorage).
    - ``allowed_exts``: tập đuôi cho phép, ví dụ ``{".pdf"}`` cho CV.
      So sánh không phân biệt hoa/thường, có hoặc không có dấu chấm đều được.
    - ``max_mb``: dung lượng tối đa tính bằng megabyte.

    Kiểm tra lần lượt: có file & có tên → đuôi thuộc danh sách cho phép →
    file không rỗng → dung lượng không vượt giới hạn → **magic bytes** khớp
    với định dạng khai báo (chống đổi tên file ``.exe``/``.html`` thành
    ``.pdf`` — đây là lớp kiểm tra mà chỉ nhìn đuôi/content-type không có).

    Trả về dict thông tin đã kiểm chứng::

        {"filename": <tên gốc>, "safe_filename": <tên đã làm sạch>,
         "ext": ".pdf", "size_bytes": 12345, "detected_type": "pdf"}

    Ném :class:`UploadValidationError` với thông báo tiếng Việt khi không hợp
    lệ; tầng route nên bắt lỗi này và trả HTTP 400.
    """
    if file is None or not getattr(file, "filename", None):
        raise UploadValidationError("Chưa chọn file để tải lên.")

    allowed = {
        (ext if ext.startswith(".") else f".{ext}").lower() for ext in allowed_exts
    }
    ext = _file_extension(file.filename)
    if ext not in allowed:
        allowed_text = ", ".join(sorted(e.lstrip(".").upper() for e in allowed))
        raise UploadValidationError(
            f"Định dạng file không được hỗ trợ. Chỉ chấp nhận: {allowed_text}."
        )

    size, header = _measure_and_check_header(file)

    if size <= 0:
        raise UploadValidationError("File tải lên đang rỗng.")

    max_bytes = int(max_mb * 1024 * 1024)
    if size > max_bytes:
        raise UploadValidationError(
            f"File vượt quá dung lượng cho phép (tối đa {max_mb:g} MB)."
        )

    signatures = _MAGIC_BYTES.get(ext)
    if signatures is not None and not any(
        header.startswith(sig) for sig in signatures
    ):
        raise UploadValidationError(
            "Nội dung file không khớp với định dạng đã khai báo, "
            "file có thể đã bị đổi tên hoặc bị hỏng."
        )

    return {
        "filename": file.filename,
        "safe_filename": sanitize_filename(file.filename),
        "ext": ext,
        "size_bytes": size,
        "detected_type": ext.lstrip("."),
    }


# ---------------------------------------------------------------------------
# 4. Audit log an toàn (redaction dữ liệu nhạy cảm)
# ---------------------------------------------------------------------------

REDACTED = "***REDACTED***"

# Các khóa mà GIÁ TRỊ của chúng không bao giờ được xuất hiện trong log/audit.
# So khớp theo chuỗi con, không phân biệt hoa/thường (vd "access_token",
# "base_salary", "cv_text" đều bị che).
SENSITIVE_KEYS = frozenset(
    {
        "password",
        "passwd",
        "token",
        "secret",
        "api_key",
        "apikey",
        "authorization",
        "cookie",
        "session",
        "salary",
        "luong",
        "cv_text",
        "cv_content",
        "document_text",
        "full_text",
        "credit_card",
        "bank_account",
        "cccd",
        "cmnd",
        "ssn",
    }
)

_MAX_DEPTH = 4  # chặn đệ quy sâu để log không phình và tránh vòng tham chiếu


def _is_sensitive_key(key: Any) -> bool:
    lowered = str(key).lower()
    return any(marker in lowered for marker in SENSITIVE_KEYS)


def redact_sensitive(data: Any, *, _depth: int = 0) -> Any:
    """Trả về bản sao của ``data`` với mọi giá trị nhạy cảm đã bị che.

    Áp dụng đệ quy cho dict/list/tuple. Khóa chứa từ nhạy cảm (xem
    ``SENSITIVE_KEYS``) bị thay bằng ``***REDACTED***`` bất kể giá trị là gì.
    Dùng hàm này cho MỌI dữ liệu trước khi ghi log hoặc lưu vào trường
    ``details`` của AuditLog.
    """
    if _depth > _MAX_DEPTH:
        return "<truncated>"
    if isinstance(data, Mapping):
        return {
            str(key): (REDACTED if _is_sensitive_key(key)
                       else redact_sensitive(value, _depth=_depth + 1))
            for key, value in data.items()
        }
    if isinstance(data, (list, tuple)):
        return [redact_sensitive(item, _depth=_depth + 1) for item in data]
    if isinstance(data, (str, int, float, bool)) or data is None:
        return data
    # Kiểu lạ (datetime, object...) -> chuyển thành chuỗi ngắn, không repr sâu.
    return str(data)[:200]


def _build_audit_entry(*, action: str, actor_id: Any = None,
                       actor_role: Optional[str] = None,
                       resource_type: Optional[str] = None,
                       resource_id: Any = None,
                       result: str = "success",
                       ip_address: Optional[str] = None,
                       metadata: Optional[Mapping[str, Any]] = None) -> dict[str, Any]:
    """Dựng một bản ghi audit đã qua redaction.

    CHỦ ĐÍCH chỉ ghi: ai (actor_id/role), làm gì (action), lên đối tượng nào
    (resource_type/resource_id), kết quả, thời gian, IP. ``metadata`` nếu có
    bắt buộc đi qua :func:`redact_sensitive` — không có đường nào ghi metadata
    thô vào audit.
    """
    entry: dict[str, Any] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "actor_id": actor_id,
        "actor_role": actor_role,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "result": result,
        "ip_address": ip_address,
    }
    if metadata:
        entry["metadata"] = redact_sensitive(dict(metadata))
    return entry


def log_audit_event(action: str, *, actor_id: Any = None,
                    actor_role: Optional[str] = None,
                    resource_type: Optional[str] = None,
                    resource_id: Any = None, result: str = "success",
                    ip_address: Optional[str] = None,
                    metadata: Optional[Mapping[str, Any]] = None,
                    logger: Optional[logging.Logger] = None) -> dict[str, Any]:
    """Ghi một sự kiện audit dạng JSON một dòng vào log ứng dụng.

    Dùng cho các thao tác bắt buộc audit theo kiến trúc B8: xem/xuất phiếu
    lương, duyệt/từ chối đơn nghỉ, thay đổi hợp đồng/lương, chốt kỳ lương,
    chạy phân tích CV bằng AI, đăng nhập thành công/thất bại.

    Trả về entry đã ghi (đã redaction) để nơi gọi có thể dùng tiếp nếu cần.
    """
    log = logger or logging.getLogger("hrm.audit")
    entry = _build_audit_entry(
        action=action, actor_id=actor_id, actor_role=actor_role,
        resource_type=resource_type, resource_id=resource_id, result=result,
        ip_address=ip_address, metadata=metadata,
    )
    log.info("audit %s", json.dumps(entry, ensure_ascii=False, default=str))
    return entry


def record_audit_log(db_session, audit_model, **fields: Any):
    """Lưu một bản ghi vào bảng AuditLog qua SQLAlchemy (khi model đã sẵn sàng).

    ``db_session`` và ``audit_model`` được TRUYỀN VÀO (dependency injection)
    để module này không phụ thuộc model cụ thể — model AuditLog thuộc về
    module models của dự án (các trường tối thiểu: ``action``, ``actor_id``,
    ``actor_role``, ``resource_type``, ``resource_id``, ``result``,
    ``ip_address``, ``metadata`` dạng JSON/text, ``created_at``).

    Mọi ``metadata`` đều qua :func:`redact_sensitive`. Hàm tự ``flush`` để lấy
    id nhưng KHÔNG commit — transaction thuộc về service gọi nó (để audit và
    nghiệp vụ cùng thành công hoặc cùng rollback, xem kiến trúc B3.3/A7).
    """
    entry = _build_audit_entry(
        action=fields.pop("action"),
        actor_id=fields.pop("actor_id", None),
        actor_role=fields.pop("actor_role", None),
        resource_type=fields.pop("resource_type", None),
        resource_id=fields.pop("resource_id", None),
        result=fields.pop("result", "success"),
        ip_address=fields.pop("ip_address", None),
        metadata=fields.pop("metadata", None),
    )
    entry.pop("timestamp", None)  # created_at do model/DB tự sinh
    metadata = entry.pop("metadata", None)
    record = audit_model(**entry, **fields)
    if metadata is not None:
        # Model có thể lưu metadata dạng JSON (dict) hoặc text — tôn trọng cả hai.
        try:
            record.metadata = metadata  # type: ignore[attr-defined]
        except AttributeError:
            record.details = json.dumps(metadata, ensure_ascii=False)  # type: ignore[attr-defined]
    db_session.add(record)
    db_session.flush()
    return record
