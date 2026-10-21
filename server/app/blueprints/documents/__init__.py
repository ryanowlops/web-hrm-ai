"""Blueprint Documents — tiền tố /api/v1/documents.

Hồ sơ điện tử + giấy xác nhận (feature-expansion-v3 mục 2): kho tài liệu
của từng nhân viên (upload/tải xuống theo đúng scope dữ liệu, cảnh báo hết
hạn) và quy trình xin/cấp giấy xác nhận lương / xác nhận công tác.
"""

from flask import Blueprint

bp = Blueprint("documents", __name__, url_prefix="/api/v1/documents")

from app.blueprints.documents import routes  # noqa: E402,F401
