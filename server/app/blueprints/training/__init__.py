"""Blueprint Training — tiền tố /api/v1/training.

Đào tạo nội bộ (feature-expansion-v2 mục 1D): HR/Admin quản lý khoá học và
gán học viên; nhân viên xem khoá của mình và cập nhật tiến độ học.
"""

from flask import Blueprint

bp = Blueprint("training", __name__, url_prefix="/api/v1/training")

from app.blueprints.training import routes  # noqa: E402,F401
