"""Blueprint Shifts — tiền tố /api/v1/shifts.

Ca làm việc (feature-expansion-v3 mục 1 — đội SHIFTS): định nghĩa ca,
gán ca theo tuần, đơn tăng ca duyệt 2 cấp và đơn giải trình chấm công
duyệt 2 cấp (HR duyệt thì cập nhật bản ghi Attendance).
"""

from flask import Blueprint

bp = Blueprint("shifts", __name__, url_prefix="/api/v1/shifts")

from app.blueprints.shifts import routes  # noqa: E402,F401
