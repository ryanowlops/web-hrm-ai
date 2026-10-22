"""Suite kiểm chứng v6 — Đội CHECKIN: chấm công QR + GPS (mục 1.5).

Chạy:  server/.venv/bin/python check_v6_checkin.py
Môi trường: DB sqlite tạm (TEST_DATABASE_URL), config "testing",
test_client + JWT thật (đăng nhập qua API auth). Không bọc nhiều request
trong một app_context dùng chung — mỗi request đi qua test_client riêng,
app_context chỉ dùng cho khâu dựng dữ liệu và đọc DB kiểm chứng.
"""
import hashlib
import hmac
import os
import sys
import tempfile
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

# --- Môi trường phải đặt TRƯỚC khi import app (config đọc env lúc import) ---
_TMPDIR = tempfile.mkdtemp(prefix="checkin-v6-")
_DB_PATH = os.path.join(_TMPDIR, "checkin.db")
os.environ["TEST_DATABASE_URL"] = f"sqlite:///{_DB_PATH}"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from werkzeug.security import generate_password_hash  # noqa: E402

import app.models  # noqa: E402,F401 - đăng ký mọi model vào metadata
import app.models.checkin_log  # noqa: E402,F401 - bảng mới của vòng này
from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models import Department, Employee, User  # noqa: E402
from app.models.checkin_log import CheckinLog  # noqa: E402

ICT = ZoneInfo("Asia/Ho_Chi_Minh")
OFFICE_LAT, OFFICE_LON, RADIUS = 10.762622, 106.660172, 150
PASSWORD = "Test@123"

RESULTS = []


def check(name, condition, extra=""):
    RESULTS.append((name, bool(condition), extra))
    print(f"{'PASS' if condition else 'FAIL'}  {name}  {extra}")


def hmac_for(day, secret):
    return hmac.new(
        secret.encode("utf-8"),
        f"qr-checkin:{day.isoformat()}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


# ---------------------------------------------------------------------------
# Dựng app + dữ liệu tối thiểu
# ---------------------------------------------------------------------------
app = create_app("testing")
if "checkin" not in app.blueprints:  # parent chưa đăng ký -> tự đăng ký để test
    from app.blueprints.checkin import bp as checkin_bp

    app.register_blueprint(checkin_bp)
client = app.test_client()
SECRET = app.config["JWT_SECRET_KEY"]

LOGIN_PATH = next(
    r.rule for r in app.url_map.iter_rules() if r.rule.endswith("/auth/login")
)


def make_user(email, role, employee=None):
    user = User(
        email=email,
        password_hash=generate_password_hash(PASSWORD),
        full_name=email.split("@")[0],
        role=role,
        is_active=True,
        employee_id=employee.id if employee else None,
    )
    db.session.add(user)
    db.session.flush()
    return user


def login(email):
    resp = client.post(LOGIN_PATH, json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200, f"login {email} -> {resp.status_code}"
    body = resp.get_json()
    token = body.get("access_token") or (body.get("data") or {}).get("access_token")
    assert token, f"login {email}: không có access_token"
    return {"Authorization": f"Bearer {token}"}


EMP_KEYS = ["a", "b", "c", "d", "e", "f", "g"]
with app.app_context():
    db.create_all()
    dept = Department(name="Kỹ thuật")
    db.session.add(dept)
    db.session.flush()
    employees = {}
    for i, key in enumerate(EMP_KEYS, start=1):
        emp = Employee(
            code=f"NV90{i:02d}",
            full_name=f"Nhân viên {key.upper()}",
            email=f"emp{key}@hrm.local",
            department_id=dept.id,
            status="working",
        )
        db.session.add(emp)
        db.session.flush()
        employees[key] = emp
    make_user("hr@hrm.local", "hr")
    for key in EMP_KEYS:
        make_user(f"emp{key}@hrm.local", "employee", employees[key])
    make_user("solo@hrm.local", "employee")  # user không liên kết hồ sơ NV
    db.session.commit()
    EMP_IDS = {k: e.id for k, e in employees.items()}

HR = login("hr@hrm.local")
EMP = {k: login(f"emp{k}@hrm.local") for k in EMP_KEYS}
SOLO = login("solo@hrm.local")

TODAY = datetime.now(ICT).date()
YESTERDAY = TODAY - timedelta(days=1)
TODAY_S = TODAY.isoformat()
TOKEN = hmac_for(TODAY, SECRET)[:12]
CODE6 = str(int(hmac_for(TODAY, SECRET), 16) % 1_000_000).zfill(6)
OLD_TOKEN = hmac_for(YESTERDAY, SECRET)[:12]


def scan(headers, **payload):
    return client.post("/api/v1/checkin/scan", json=payload, headers=headers)


def get_log(employee_id, method):
    with app.app_context():
        row = (
            db.session.query(CheckinLog)
            .filter_by(employee_id=employee_id, date=TODAY, method=method)
            .first()
        )
        if row is None:
            return None
        return {"result": row.result, "distance_m": row.distance_m, "reason": row.reason}


# ---------------------------------------------------------------------------
# Phase 0: phân quyền + today-qr
# ---------------------------------------------------------------------------
r = client.get("/api/v1/checkin/today-qr")
check("today-qr không JWT -> 401", r.status_code == 401, f"got {r.status_code}")

r = client.get("/api/v1/checkin/today-qr", headers=EMP["a"])
check("today-qr employee -> 403", r.status_code == 403, f"got {r.status_code}")

r = client.get("/api/v1/checkin/today-qr", headers=HR)
body = r.get_json().get("data") or {}
check(
    "today-qr HR -> 200, token/code6 khớp HMAC tự tính lại",
    r.status_code == 200
    and body.get("token") == TOKEN
    and body.get("code6") == CODE6
    and len(body.get("token", "")) == 12
    and len(body.get("code6", "")) == 6
    and body.get("date") == TODAY_S
    and (body.get("expires_in_s") or 0) > 0,
    f"got {r.status_code} {body}",
)

r = client.get("/api/v1/checkin/config", headers=HR)
cfg = r.get_json().get("data") or {}
check(
    "config chưa cài: configured=False, radius mặc định 150",
    r.status_code == 200 and cfg.get("configured") is False and cfg.get("radius_m") == 150,
    f"got {r.status_code} {cfg}",
)

r = client.get("/api/v1/checkin/config", headers=EMP["a"])
check("config employee -> 403", r.status_code == 403, f"got {r.status_code}")

# ---------------------------------------------------------------------------
# Phase 1: văn phòng CHƯA cấu hình
# ---------------------------------------------------------------------------
r = scan(EMP["b"], date=TODAY_S, token=CODE6)
data = (r.get_json() or {}).get("data") or {}
check(
    "chưa cấu hình VP: mã 6 số vẫn check-in được (method=qr_code)",
    r.status_code == 201 and data.get("method") == "qr_code",
    f"got {r.status_code} {r.get_json()}",
)
log = get_log(EMP_IDS["b"], "qr_code")
check("  + log ok/qr_code đã ghi", log and log["result"] == "ok", f"{log}")

r = scan(EMP["c"], date=TODAY_S, token=TOKEN, lat=OFFICE_LAT, lon=OFFICE_LON)
err = (r.get_json() or {}).get("error") or {}
check(
    "chưa cấu hình VP + gửi GPS -> lỗi nghiệp vụ OFFICE_NOT_CONFIGURED",
    r.status_code == 400 and err.get("code") == "OFFICE_NOT_CONFIGURED",
    f"got {r.status_code} {err}",
)

r = scan(EMP["c"], date=TODAY_S, token=TOKEN)
err = (r.get_json() or {}).get("error") or {}
check(
    "quét QR không kèm GPS -> 400 GPS_REQUIRED",
    r.status_code == 400 and err.get("code") == "GPS_REQUIRED",
    f"got {r.status_code} {err}",
)

# ---------------------------------------------------------------------------
# Phase 2: validate + lưu cấu hình văn phòng
# ---------------------------------------------------------------------------
for name, payload in [
    ("lat=91", {"lat": 91, "lon": OFFICE_LON, "radius_m": 150}),
    ("lon=-181", {"lat": OFFICE_LAT, "lon": -181, "radius_m": 150}),
    ("radius=5", {"lat": OFFICE_LAT, "lon": OFFICE_LON, "radius_m": 5}),
    ("radius=2001", {"lat": OFFICE_LAT, "lon": OFFICE_LON, "radius_m": 2001}),
]:
    r = client.put("/api/v1/checkin/config", json=payload, headers=HR)
    check(f"PUT config {name} -> 400", r.status_code == 400, f"got {r.status_code}")

r = client.put(
    "/api/v1/checkin/config",
    json={"lat": OFFICE_LAT, "lon": OFFICE_LON, "radius_m": RADIUS},
    headers=EMP["a"],
)
check("PUT config employee -> 403", r.status_code == 403, f"got {r.status_code}")

r = client.put(
    "/api/v1/checkin/config",
    json={"lat": OFFICE_LAT, "lon": OFFICE_LON, "radius_m": RADIUS},
    headers=HR,
)
saved = (r.get_json() or {}).get("data") or {}
check(
    "PUT config hợp lệ -> 200 + configured=True",
    r.status_code == 200 and saved.get("configured") is True and saved.get("radius_m") == RADIUS,
    f"got {r.status_code} {saved}",
)

# ---------------------------------------------------------------------------
# Phase 3: luồng GPS sau khi đã cấu hình
# ---------------------------------------------------------------------------
r = scan(EMP["a"], date=TODAY_S, token=TOKEN, lat=OFFICE_LAT, lon=OFFICE_LON)
data = (r.get_json() or {}).get("data") or {}
att = data.get("attendance") or {}
check(
    "GPS tại văn phòng -> 201, distance_m<=5, message GPS ✓, có attendance",
    r.status_code == 201
    and data.get("method") == "qr_gps"
    and data.get("distance_m") is not None and data["distance_m"] <= 5
    and "GPS ✓" in (data.get("message") or "")
    and att.get("check_in_at"),
    f"got {r.status_code} {r.get_json()}",
)
log = get_log(EMP_IDS["a"], "qr_gps")
check("  + log ok/qr_gps đã ghi", log and log["result"] == "ok", f"{log}")

r = scan(EMP["a"], date=TODAY_S, token=TOKEN, lat=OFFICE_LAT, lon=OFFICE_LON)
err = (r.get_json() or {}).get("error") or {}
check(
    "check-in lần 2 -> 409 ALREADY_CHECKED_IN (truyền nguyên từ attendance)",
    r.status_code == 409 and err.get("code") == "ALREADY_CHECKED_IN",
    f"got {r.status_code} {err}",
)

r = scan(EMP["d"], date=TODAY_S, token="000000000000", lat=OFFICE_LAT, lon=OFFICE_LON)
err = (r.get_json() or {}).get("error") or {}
check(
    "token sai -> 403 INVALID_QR_CODE",
    r.status_code == 403 and err.get("code") == "INVALID_QR_CODE",
    f"got {r.status_code} {err}",
)

r = scan(EMP["d"], date=TODAY_S, token=OLD_TOKEN, lat=OFFICE_LAT, lon=OFFICE_LON)
check(
    "token hôm qua + date hôm nay -> 403",
    r.status_code == 403, f"got {r.status_code}",
)

r = scan(EMP["d"], date=YESTERDAY.isoformat(), token=OLD_TOKEN, lat=OFFICE_LAT, lon=OFFICE_LON)
check(
    "QR hôm qua (date+token cũ) dùng hôm nay -> 403",
    r.status_code == 403, f"got {r.status_code}",
)

r = scan(EMP["d"], date=TODAY_S, token=TOKEN, lat=OFFICE_LAT + 0.02, lon=OFFICE_LON)
err = (r.get_json() or {}).get("error") or {}
details = {d["field"]: d["message"] for d in err.get("details") or []}
dist_real = int(details.get("distance_m", "0") or 0)
check(
    "ngoài phạm vi (~2.2km) -> 403 OUT_OF_RANGE kèm distance_m thật",
    r.status_code == 403 and err.get("code") == "OUT_OF_RANGE" and dist_real > 2000,
    f"got {r.status_code} {err}",
)
log = get_log(EMP_IDS["d"], "qr_gps")
check(
    "  + log rejected/qr_gps ghi đúng khoảng cách",
    log and log["result"] == "rejected" and abs((log["distance_m"] or 0) - dist_real) <= 2,
    f"{log} vs api {dist_real}",
)

r = scan(EMP["e"], date=TODAY_S, token=TOKEN, lat=OFFICE_LAT + 0.0009, lon=OFFICE_LON)
data = (r.get_json() or {}).get("data") or {}
check(
    "biên trong bán kính (~100m < 150m) -> 201",
    r.status_code == 201 and 50 <= (data.get("distance_m") or -1) <= 150,
    f"got {r.status_code} distance={data.get('distance_m')}",
)

r = scan(EMP["f"], date=TODAY_S, token=TOKEN, lat=OFFICE_LAT + 0.0018, lon=OFFICE_LON)
err = (r.get_json() or {}).get("error") or {}
check(
    "biên ngoài bán kính (~200m > 150m) -> 403 OUT_OF_RANGE",
    r.status_code == 403 and err.get("code") == "OUT_OF_RANGE",
    f"got {r.status_code} {err}",
)

r = scan(EMP["g"], date=TODAY_S, token=CODE6, lat=OFFICE_LAT + 0.05, lon=OFFICE_LON)
data = (r.get_json() or {}).get("data") or {}
check(
    "mã 6 số + toạ độ rất xa -> vẫn 201 (luồng mã không kiểm khoảng cách)",
    r.status_code == 201 and data.get("method") == "qr_code",
    f"got {r.status_code} {r.get_json()}",
)

r = client.post("/api/v1/checkin/scan", json={"date": TODAY_S}, headers=EMP["a"])
check("scan thiếu token -> 400 VALIDATION_ERROR", r.status_code == 400, f"got {r.status_code}")

r = scan(SOLO, date=TODAY_S, token=TOKEN, lat=OFFICE_LAT, lon=OFFICE_LON)
err = (r.get_json() or {}).get("error") or {}
check(
    "user chưa liên kết hồ sơ NV -> 403 EMPLOYEE_NOT_LINKED",
    r.status_code == 403 and err.get("code") == "EMPLOYEE_NOT_LINKED",
    f"got {r.status_code} {err}",
)

# ---------------------------------------------------------------------------
# Phase 4: nhật ký + kiểm tra tĩnh
# ---------------------------------------------------------------------------
r = client.get("/api/v1/checkin/logs", headers=HR)
rows = (r.get_json() or {}).get("data") or []
by_emp = {}
for row in rows:
    by_emp.setdefault(row.get("employee_id"), []).append(row)
check(
    "logs HR: thấy dòng ok (emp A) + rejected (emp D) hôm nay",
    r.status_code == 200
    and any(x["result"] == "ok" and x["method"] == "qr_gps" for x in by_emp.get(EMP_IDS["a"], []))
    and any(x["result"] == "rejected" for x in by_emp.get(EMP_IDS["d"], [])),
    f"got {r.status_code}, {len(rows)} rows",
)

r = client.get("/api/v1/checkin/logs", headers=EMP["a"])
check("logs employee -> 403", r.status_code == 403, f"got {r.status_code}")

r = client.get(f"/api/v1/checkin/logs?date={YESTERDAY.isoformat()}", headers=HR)
rows = (r.get_json() or {}).get("data") or []
check("logs ngày hôm qua -> rỗng", r.status_code == 200 and rows == [], f"got {r.status_code} {rows}")

src = open(os.path.join(os.path.dirname(__file__), "app/blueprints/checkin/services.py"), encoding="utf-8").read()
check("services dùng hmac.compare_digest", "compare_digest" in src)
check("services tự tính Haversine phía server", "haversine" in src.lower())

# ---------------------------------------------------------------------------
passed = sum(1 for _, ok, _ in RESULTS if ok)
print(f"\n===== {passed}/{len(RESULTS)} case PASS =====")
sys.exit(0 if passed == len(RESULTS) else 1)
