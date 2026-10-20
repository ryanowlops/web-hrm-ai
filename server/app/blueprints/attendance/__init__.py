"""Blueprint chấm công (attendance).

App factory đăng ký với url_prefix="/api/v1", các route trong module này
bắt đầu bằng "/attendance/...".
"""
from flask import Blueprint

bp = Blueprint("attendance", __name__, url_prefix="/api/v1")

from . import routes  # noqa: E402,F401 - đăng ký routes vào blueprint
