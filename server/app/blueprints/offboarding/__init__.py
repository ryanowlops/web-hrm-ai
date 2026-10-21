"""Blueprint Offboarding (quy trinh nghi viec & ban giao) — tien to
/api/v1/offboarding.

HR/Admin tao quy trinh nghi viec cho nhan vien; he thong tu sinh
checklist ban giao (gom task rieng cho tung tai san dang cap phat).
Hoan tat khi 100% task xong -> nhan vien chuyen trang thai resigned
va tai khoan dang nhap bi khoa. Theo docs/feature-expansion-v3.md muc 3.
"""
from flask import Blueprint

bp = Blueprint("offboarding", __name__, url_prefix="/api/v1/offboarding")

from app.blueprints.offboarding import routes  # noqa: E402,F401  (dang ky route)
