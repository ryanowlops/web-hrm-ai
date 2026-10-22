"""Service layer — chấm công QR + GPS (docs/feature-expansion-v6.md mục 1).

Nguyên tắc chống gian lận (mức đồ án):
- Mã QR xoay theo NGÀY (giờ ICT), stateless: HMAC-SHA256(JWT_SECRET_KEY,
  "qr-checkin:YYYY-MM-DD"); token = 12 ký tự hex đầu, mã dự phòng 6 số =
  HMAC mod 1_000_000 (zero-pad). Server tự tính lại, không lưu DB; so sánh
  bằng hmac.compare_digest. Mã hôm qua tự hết hiệu lực vì ngày đã đổi.
- Server KHÔNG tin toạ độ client tự khai là "đã ở văn phòng": tự tính
  khoảng cách Haversine tới toạ độ văn phòng trong Setting
  (checkin.office_lat / checkin.office_lon / checkin.office_radius_m,
  mặc định bán kính 150m). Ngoài phạm vi -> ghi CheckinLog rejected +
  403 kèm khoảng cách thật.
- Luồng mã 6 số (method=qr_code) KHÔNG kiểm khoảng cách — dành cho máy
  không có GPS; vẫn phải có mã đúng của ngày hôm nay.
- Chấm công thật tái dùng attendance.services.check_in() (1 lần/ngày,
  tự tính muộn/đúng giờ, lỗi 409 truyền nguyên).
- Giới hạn đã biết: không chặn được fake-GPS ở mức hệ điều hành như app
  ngân hàng (không khả thi trên web).
"""
import hashlib
import hmac
import math
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from flask import current_app

from app.blueprints.attendance import services as attendance_services
from app.errors import ApiError
from app.extensions import db
from app.models import Setting
from app.models.checkin_log import CheckinLog

ICT = ZoneInfo("Asia/Ho_Chi_Minh")

KEY_OFFICE_LAT = "checkin.office_lat"
KEY_OFFICE_LON = "checkin.office_lon"
KEY_OFFICE_RADIUS = "checkin.office_radius_m"
DEFAULT_RADIUS_M = 150
EARTH_RADIUS_M = 6_371_000

METHOD_QR_GPS = "qr_gps"
METHOD_QR_CODE = "qr_code"


# ---------------------------------------------------------------------------
# Thời gian ICT + mã xoay theo ngày
# ---------------------------------------------------------------------------
def now_ict():
    return datetime.now(ICT)


def today_ict():
    return now_ict().date()


def _digest_for(day):
    """HMAC-SHA256 hex của ngày — nguồn duy nhất sinh token/mã dự phòng."""
    secret = str(current_app.config.get("JWT_SECRET_KEY") or "").encode("utf-8")
    message = f"qr-checkin:{day.isoformat()}".encode("utf-8")
    return hmac.new(secret, message, hashlib.sha256).hexdigest()


def token_for(day):
    """Token 12 ký tự hex đầu của HMAC — nhúng trong URL của mã QR."""
    return _digest_for(day)[:12]


def code6_for(day):
    """Mã dự phòng 6 chữ số: HMAC mod 1_000_000, zero-pad."""
    return str(int(_digest_for(day), 16) % 1_000_000).zfill(6)


def _seconds_until_midnight_ict():
    now = now_ict()
    midnight = datetime.combine(now.date() + timedelta(days=1), time.min, tzinfo=ICT)
    return max(int((midnight - now).total_seconds()), 0)


def get_today_qr():
    """Dữ kiện hiển thị ở màn hình HR: ngày, token, mã 6 số, hạn còn lại."""
    today = today_ict()
    return {
        "date": today.isoformat(),
        "token": token_for(today),
        "code6": code6_for(today),
        "expires_in_s": _seconds_until_midnight_ict(),
    }


# ---------------------------------------------------------------------------
# Cấu hình văn phòng (Setting key-value, không bảng riêng)
# ---------------------------------------------------------------------------
def _as_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def get_office_config():
    """{lat, lon, radius_m, configured} — configured=False khi chưa đặt toạ độ."""
    lat = _as_float(Setting.get_value(KEY_OFFICE_LAT))
    lon = _as_float(Setting.get_value(KEY_OFFICE_LON))
    radius = Setting.get_value(KEY_OFFICE_RADIUS)
    try:
        radius_m = int(radius)
    except (TypeError, ValueError):
        radius_m = DEFAULT_RADIUS_M
    return {
        "lat": lat,
        "lon": lon,
        "radius_m": radius_m,
        "configured": lat is not None and lon is not None,
    }


def update_office_config(data):
    """Lưu toạ độ + bán kính (đã validate ở schema: lat/lon/radius đúng miền)."""
    Setting.set_value(KEY_OFFICE_LAT, float(data["lat"]))
    Setting.set_value(KEY_OFFICE_LON, float(data["lon"]))
    if data.get("radius_m") is not None:
        Setting.set_value(KEY_OFFICE_RADIUS, int(data["radius_m"]))
    db.session.commit()
    return get_office_config()


# ---------------------------------------------------------------------------
# Khoảng cách + nhật ký
# ---------------------------------------------------------------------------
def haversine_m(lat1, lon1, lat2, lon2):
    """Khoảng cách mặt cầu (mét) giữa 2 toạ độ — server tự tính, không tin client."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def _upsert_log(employee_id, day, method, lat, lon, distance_m, result, reason):
    """Mỗi (nhân viên, ngày, phương thức) 1 dòng — lần quét sau ghi đè."""
    row = (
        db.session.query(CheckinLog)
        .filter_by(employee_id=employee_id, date=day, method=method)
        .first()
    )
    if row is None:
        row = CheckinLog(employee_id=employee_id, date=day, method=method)
        db.session.add(row)
    row.lat = lat
    row.lon = lon
    row.distance_m = distance_m
    row.result = result
    row.reason = reason
    db.session.commit()
    return row


def list_logs(day):
    """Nhật ký QR của một ngày (mặc định hôm nay) — cho HR đối soát."""
    return (
        db.session.query(CheckinLog)
        .filter_by(date=day)
        .order_by(CheckinLog.id.desc())
        .all()
    )


# ---------------------------------------------------------------------------
# Luồng quét mã
# ---------------------------------------------------------------------------
def _matches(submitted, expected):
    return hmac.compare_digest(
        str(submitted).encode("utf-8"), str(expected).encode("utf-8")
    )


def _invalid_code_error():
    return ApiError(
        403, "INVALID_QR_CODE", "Mã đã hết hiệu lực hoặc không đúng."
    )


def scan(payload):
    """Xử lý 1 lần quét/nhập mã. Trả {attendance, distance_m, method, message}.

    payload đã qua ScanSchema: {date: date, token: str, lat?, lon?}.
    Thứ tự kiểm tra: ngày phải là hôm nay (ICT) -> mã khớp (6 số | token QR)
    -> riêng luồng QR: bắt buộc có GPS + văn phòng đã cấu hình + trong bán
    kính -> gọi attendance.check_in() (lỗi 409 của nó truyền nguyên).
    """
    today = today_ict()
    if payload["date"] != today:
        # QR chụp từ hôm qua (hoặc ngày bất kỳ khác hôm nay) đều vô hiệu.
        raise _invalid_code_error()

    token = str(payload["token"]).strip()
    lat = payload.get("lat")
    lon = payload.get("lon")
    employee = attendance_services.get_current_employee()

    # --- Luồng mã dự phòng 6 số: không kiểm khoảng cách ---
    if len(token) == 6 and token.isdigit() and _matches(token, code6_for(today)):
        record = attendance_services.check_in()
        _upsert_log(
            employee.id, today, METHOD_QR_CODE, lat, lon, None, "ok", None
        )
        return {
            "attendance": record,
            "distance_m": None,
            "method": METHOD_QR_CODE,
            "message": "Check-in thành công bằng mã dự phòng.",
        }

    # --- Luồng quét QR: bắt buộc GPS + đối chiếu khoảng cách ---
    if _matches(token, token_for(today)):
        if lat is None or lon is None:
            raise ApiError(
                400,
                "GPS_REQUIRED",
                "Chấm công bằng mã QR cần vị trí GPS. Hãy bật định vị rồi quét "
                "lại, hoặc dùng mã dự phòng 6 số ở màn hình HR.",
            )
        config = get_office_config()
        if not config["configured"]:
            raise ApiError(
                400,
                "OFFICE_NOT_CONFIGURED",
                "Văn phòng chưa được cấu hình toạ độ nên chưa chấm công bằng "
                "GPS được. Vui lòng báo HR mở trang 'Chấm công QR' để cài đặt "
                "vị trí văn phòng, hoặc dùng mã dự phòng 6 số.",
            )
        distance_m = int(round(haversine_m(lat, lon, config["lat"], config["lon"])))
        if distance_m > config["radius_m"]:
            reason = f"Ngoài phạm vi cho phép ({config['radius_m']}m)"
            _upsert_log(
                employee.id, today, METHOD_QR_GPS,
                lat, lon, distance_m, "rejected", reason,
            )
            raise ApiError(
                403,
                "OUT_OF_RANGE",
                f"Bạn đang cách văn phòng {distance_m}m — ngoài phạm vi "
                f"{config['radius_m']}m.",
                details=[
                    {"field": "distance_m", "message": str(distance_m)},
                    {"field": "radius_m", "message": str(config["radius_m"])},
                ],
            )
        record = attendance_services.check_in()
        _upsert_log(
            employee.id, today, METHOD_QR_GPS, lat, lon, distance_m, "ok", None
        )
        return {
            "attendance": record,
            "distance_m": distance_m,
            "method": METHOD_QR_GPS,
            "message": f"GPS ✓ — cách văn phòng {distance_m}m",
        }

    raise _invalid_code_error()
