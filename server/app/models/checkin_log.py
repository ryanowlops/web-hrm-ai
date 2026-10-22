"""Model CheckinLog — nhật ký chấm công bằng QR + GPS (v6, gói 3, mục 1.2).

Mỗi ngày, mỗi nhân viên, mỗi phương thức (qr_gps | qr_code) chỉ có TỐI ĐA
1 dòng (UNIQUE employee_id + date + method): lần quét sau trong ngày ghi đè
kết quả lần trước (vd sáng quét ngoài phạm vi bị rejected, vào văn phòng
quét lại thành công -> dòng chuyển thành ok). Cấu hình văn phòng KHÔNG nằm
ở bảng này — dùng model Setting sẵn có (checkin.office_lat/lon/radius_m).
"""
from app.extensions import db
from app.models.users import TimestampMixin


class CheckinLog(TimestampMixin, db.Model):
    __tablename__ = "checkin_logs"
    __table_args__ = (
        db.UniqueConstraint(
            "employee_id", "date", "method",
            name="uq_checkin_logs_employee_date_method",
        ),
        db.Index("ix_checkin_logs_date", "date"),
    )

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    # Ngày chấm công theo giờ Việt Nam (ICT) — cùng quy ước với Attendance.
    date = db.Column(db.Date, nullable=False)
    # qr_gps: quét QR + định vị GPS; qr_code: nhập mã dự phòng 6 số.
    method = db.Column(db.String(10), nullable=False)
    lat = db.Column(db.Float, nullable=True)
    lon = db.Column(db.Float, nullable=True)
    # Khoảng cách tới văn phòng do server tính (mét, đã làm tròn).
    distance_m = db.Column(db.Integer, nullable=True)
    result = db.Column(db.String(10), nullable=False)  # ok | rejected
    reason = db.Column(db.String(255), nullable=True)

    employee = db.relationship("Employee")

    def __repr__(self):
        return (
            f"<CheckinLog id={self.id} employee_id={self.employee_id} "
            f"date={self.date} method={self.method!r} result={self.result!r}>"
        )
