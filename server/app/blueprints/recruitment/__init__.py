"""Blueprint Tuyển dụng (recruitment).

Một blueprint duy nhất sở hữu cả hai tiền tố theo tài liệu kiến trúc B3.2:
- ``/api/v1/jobs``       : tin tuyển dụng + nộp CV công khai
- ``/api/v1/candidates`` : quản lý ứng viên (HR/Admin)
"""
from flask import Blueprint

bp = Blueprint("recruitment", __name__, url_prefix="/api/v1")

from . import routes  # noqa: E402,F401  (import cuối để đăng ký route, tránh circular import)

__all__ = ["bp"]
