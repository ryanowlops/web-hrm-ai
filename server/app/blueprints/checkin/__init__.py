"""Blueprint chấm công QR + GPS (checkin) — v6 gói 3, mục 1.

App factory đăng ký với url_prefix="/api/v1", các route trong module này
bắt đầu bằng "/checkin/...".
"""
from flask import Blueprint

bp = Blueprint("checkin", __name__, url_prefix="/api/v1")

from . import routes  # noqa: E402,F401 - đăng ký routes vào blueprint
