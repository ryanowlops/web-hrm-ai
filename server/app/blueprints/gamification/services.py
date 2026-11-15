"""Service layer cho Gamification (điểm thưởng + cửa hàng quà + huy hiệu).

Nguyên tắc điểm thưởng (feature-expansion-v4 mục 2.2):
- Điểm KHÔNG cộng bằng hook vào module khác. Hàm sync_points(employee_id)
  quét 3 nguồn có sẵn (kudo đã nhận, khoá học hoàn thành, ngày chấm công
  đúng giờ) và chèn các dòng PointsLedger còn thiếu — UNIQUE(employee_id,
  source_type, source_ref) + kiểm tra tồn tại trước giúp chạy lại bao nhiêu
  lần cũng không cộng trùng (lazy sync, gọi ở đầu các endpoint đọc điểm).
- Số dư = SUM(delta) trên sổ cái; không lưu cột số dư riêng.
- Đổi quà: tạo Redemption ở trạng thái pending CHƯA trừ điểm; HR/Admin
  duyệt mới trừ (chèn dòng delta âm) + giảm stock, sau khi kiểm tra lại
  số dư tại thời điểm duyệt.
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import case, func, insert
from sqlalchemy.orm import selectinload

from app.blueprints.auth.guards import load_current_user
from app.extensions import db
from app.models import Employee, User  # noqa: F401  (User dùng cho type/joins)
from app.models.attendance import Attendance
from app.models.engagement import Kudo
from app.models.gamification import PointsLedger, Redemption, Reward
from app.models.training import CourseEnrollment
from app.blueprints.gamification import schemas


class ApiError(Exception):
    """Lỗi nghiệp vụ có mã HTTP + code chuẩn để routes trả về."""

    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or []


POINTS_PER_KUDO = 10
POINTS_PER_COURSE = 50
POINTS_PER_ONTIME_DAY = 2

HR_ROLES = ("admin", "hr")
LOCAL_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def current_user():
    return load_current_user()


def _today_local():
    return datetime.now(LOCAL_TZ).date()


def get_or_404(model, pk, code, message):
    obj = db.session.get(model, pk)
    if obj is None:
        raise ApiError(404, code, message)
    return obj


def parse_int_arg(args, name, default, minimum=1, maximum=100):
    try:
        value = int(args.get(name, default))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


# ---------------------------------------------------------------------------
# Đồng bộ điểm (lazy sync)
# ---------------------------------------------------------------------------

def _existing_refs(employee_id, source_type):
    rows = (
        PointsLedger.query.with_entities(PointsLedger.source_ref)
        .filter_by(employee_id=employee_id, source_type=source_type)
        .all()
    )
    return {row[0] for row in rows}


def _add_ledger(employee_id, delta, source_type, source_ref, note, existing=None):
    """Chèn 1 dòng sổ cái nếu chưa tồn tại. Trả True nếu có chèn mới."""
    if existing is not None:
        if source_ref in existing:
            return False
        existing.add(source_ref)
    elif (
        PointsLedger.query.filter_by(
            employee_id=employee_id,
            source_type=source_type,
            source_ref=source_ref,
        ).first()
        is not None
    ):
        return False
    db.session.add(
        PointsLedger(
            employee_id=employee_id,
            delta=delta,
            source_type=source_type,
            source_ref=source_ref,
            note=note,
        )
    )
    return True


def sync_points(employee_id):
    """Quét 3 nguồn điểm và chèn các dòng ledger còn thiếu (chỉ flush).

    Idempotent: nguồn đã có dòng ledger (theo source_ref) sẽ bị bỏ qua.
    Caller chịu trách nhiệm commit (seed_demo không tự commit; các service
    endpoint commit ở cuối hàm của mình).
    """
    if employee_id is None or db.session.get(Employee, employee_id) is None:
        return 0
    added = 0

    # 1) Nhận kudo: +10/kudo. source_ref = "kudo:<id>".
    seen = _existing_refs(employee_id, PointsLedger.SOURCE_KUDO)
    kudos = (
        Kudo.query.filter_by(to_employee_id=employee_id)
        .order_by(Kudo.id.asc())
        .all()
    )
    for kudo in kudos:
        if _add_ledger(
            employee_id,
            POINTS_PER_KUDO,
            PointsLedger.SOURCE_KUDO,
            f"kudo:{kudo.id}",
            "Nhận kudo từ đồng nghiệp",
            existing=seen,
        ):
            added += 1

    # 2) Hoàn thành khoá học: +50/khoá. source_ref = "course:<enrollment_id>".
    seen = _existing_refs(employee_id, PointsLedger.SOURCE_TRAINING)
    enrollments = (
        CourseEnrollment.query.filter_by(
            employee_id=employee_id, status=CourseEnrollment.STATUS_COMPLETED
        )
        .order_by(CourseEnrollment.id.asc())
        .all()
    )
    for enrollment in enrollments:
        title = enrollment.course.title if enrollment.course else "khoá học"
        if _add_ledger(
            employee_id,
            POINTS_PER_COURSE,
            PointsLedger.SOURCE_TRAINING,
            f"course:{enrollment.id}",
            f"Hoàn thành khoá học: {title}",
            existing=seen,
        ):
            added += 1

    # 3) Ngày đi làm đúng giờ: +2/ngày. "Đúng giờ" = Attendance.status
    # "present" theo đúng quy ước của module chấm công (check-in sau giờ
    # bắt đầu làm việc cấu hình thì status đã là "late").
    # source_ref = "attendance:<YYYY-MM-DD>".
    seen = _existing_refs(employee_id, PointsLedger.SOURCE_ONTIME)
    attendances = (
        Attendance.query.filter_by(
            employee_id=employee_id, status=Attendance.STATUS_PRESENT
        )
        .order_by(Attendance.work_date.asc())
        .all()
    )
    for record in attendances:
        if _add_ledger(
            employee_id,
            POINTS_PER_ONTIME_DAY,
            PointsLedger.SOURCE_ONTIME,
            f"attendance:{record.work_date.isoformat()}",
            f"Đi làm đúng giờ ngày {record.work_date.strftime('%d/%m/%Y')}",
            existing=seen,
        ):
            added += 1

    db.session.flush()
    return added


def sync_points_many(employee_ids):
    """Đồng bộ điểm cho NHIỀU nhân viên trong vài câu query (dùng cho
    leaderboard). Cùng luật idempotent với sync_points nhưng không gọi
    sync_points từng người (mỗi người ~7 câu: 20 người -> ~140 câu, 49
    người -> ~340 câu chỉ riêng sync).

    - 1 câu SELECT lấy toàn bộ source_ref đã có (cả 3 nguồn).
    - 3 câu SELECT lấy toàn bộ nguồn điểm (kudo / khoá học / ngày đúng giờ).
    - 1 câu INSERT đa dòng cho các dòng ledger còn thiếu.
    UNIQUE(employee_id, source_type, source_ref) chống cộng trùng; nếu 2
    request chạy song song cùng chèn 1 dòng thì bắt IntegrityError, rollback
    rồi tiếp tục — dòng đó đã có, tổng điểm đọc sau vẫn đúng.
    """
    ids = [i for i in dict.fromkeys(employee_ids) if i is not None]
    if not ids:
        return 0
    sources = (
        PointsLedger.SOURCE_KUDO,
        PointsLedger.SOURCE_TRAINING,
        PointsLedger.SOURCE_ONTIME,
    )
    existing = {stype: set() for stype in sources}
    for emp_id, stype, ref in (
        db.session.query(
            PointsLedger.employee_id, PointsLedger.source_type,
            PointsLedger.source_ref)
        .filter(PointsLedger.employee_id.in_(ids),
                PointsLedger.source_type.in_(sources))
        .all()
    ):
        existing[stype].add((emp_id, ref))

    new_rows = []
    for kudo in (
        Kudo.query.filter(Kudo.to_employee_id.in_(ids))
        .order_by(Kudo.id.asc()).all()
    ):
        ref = f"kudo:{kudo.id}"
        if (kudo.to_employee_id, ref) in existing[PointsLedger.SOURCE_KUDO]:
            continue
        existing[PointsLedger.SOURCE_KUDO].add((kudo.to_employee_id, ref))
        new_rows.append({
            "employee_id": kudo.to_employee_id, "delta": POINTS_PER_KUDO,
            "source_type": PointsLedger.SOURCE_KUDO, "source_ref": ref,
            "note": "Nhận kudo từ đồng nghiệp",
        })
    for enr in (
        CourseEnrollment.query.filter(
            CourseEnrollment.employee_id.in_(ids),
            CourseEnrollment.status == CourseEnrollment.STATUS_COMPLETED)
        .options(selectinload(CourseEnrollment.course))
        .order_by(CourseEnrollment.id.asc()).all()
    ):
        ref = f"course:{enr.id}"
        if (enr.employee_id, ref) in existing[PointsLedger.SOURCE_TRAINING]:
            continue
        existing[PointsLedger.SOURCE_TRAINING].add((enr.employee_id, ref))
        title = enr.course.title if enr.course else "khoá học"
        new_rows.append({
            "employee_id": enr.employee_id, "delta": POINTS_PER_COURSE,
            "source_type": PointsLedger.SOURCE_TRAINING, "source_ref": ref,
            "note": f"Hoàn thành khoá học: {title}",
        })
    for record in (
        Attendance.query.filter(
            Attendance.employee_id.in_(ids),
            Attendance.status == Attendance.STATUS_PRESENT)
        .order_by(Attendance.work_date.asc()).all()
    ):
        ref = f"attendance:{record.work_date.isoformat()}"
        if (record.employee_id, ref) in existing[PointsLedger.SOURCE_ONTIME]:
            continue
        existing[PointsLedger.SOURCE_ONTIME].add((record.employee_id, ref))
        new_rows.append({
            "employee_id": record.employee_id,
            "delta": POINTS_PER_ONTIME_DAY,
            "source_type": PointsLedger.SOURCE_ONTIME, "source_ref": ref,
            "note": f"Đi làm đúng giờ ngày "
                    f"{record.work_date.strftime('%d/%m/%Y')}",
        })
    if new_rows:
        from sqlalchemy.exc import IntegrityError

        try:
            db.session.execute(insert(PointsLedger), new_rows)
            db.session.flush()
        except IntegrityError:
            # Request khác đã chèn trùng dòng trong lúc này — rollback
            # rồi tiếp tục, tổng điểm đọc sau vẫn đúng.
            db.session.rollback()
    return len(new_rows)


def _totals_many(employee_ids):
    """(balance, earned, spent) cho nhiều nhân viên trong 1 câu query
    (thay cho get_totals gọi 3 câu SUM cho từng người)."""
    rows = (
        db.session.query(
            PointsLedger.employee_id,
            func.coalesce(func.sum(PointsLedger.delta), 0),
            func.coalesce(func.sum(case(
                (PointsLedger.delta > 0, PointsLedger.delta), else_=0)), 0),
            func.coalesce(func.sum(case(
                (PointsLedger.delta < 0, -PointsLedger.delta), else_=0)), 0),
        )
        .filter(PointsLedger.employee_id.in_(employee_ids))
        .group_by(PointsLedger.employee_id)
        .all()
    )
    return {emp_id: (int(b), int(e), int(s)) for emp_id, b, e, s in rows}


def get_totals(employee_id):
    """Trả (balance, total_earned, total_spent) từ sổ cái."""
    balance = (
        db.session.query(func.coalesce(func.sum(PointsLedger.delta), 0))
        .filter(PointsLedger.employee_id == employee_id)
        .scalar()
    )
    earned = (
        db.session.query(func.coalesce(func.sum(PointsLedger.delta), 0))
        .filter(
            PointsLedger.employee_id == employee_id, PointsLedger.delta > 0
        )
        .scalar()
    )
    spent = (
        db.session.query(func.coalesce(func.sum(PointsLedger.delta), 0))
        .filter(
            PointsLedger.employee_id == employee_id, PointsLedger.delta < 0
        )
        .scalar()
    )
    return int(balance), int(earned), int(-spent)


def require_employee(user):
    """Tài khoản phải gắn hồ sơ nhân viên mới tham gia được điểm thưởng."""
    employee = None
    if getattr(user, "employee_id", None):
        employee = db.session.get(Employee, user.employee_id)
    if employee is None:
        raise ApiError(
            400,
            "NO_EMPLOYEE_PROFILE",
            "Tài khoản chưa gắn hồ sơ nhân viên nên chưa tham gia được "
            "chương trình điểm thưởng.",
        )
    return employee


# ---------------------------------------------------------------------------
# Điểm của tôi / xếp hạng
# ---------------------------------------------------------------------------

def my_points(user):
    employee = require_employee(user)
    sync_points(employee.id)
    db.session.commit()
    balance, earned, spent = get_totals(employee.id)
    recent = (
        PointsLedger.query.filter_by(employee_id=employee.id)
        .order_by(PointsLedger.id.desc())
        .limit(10)
        .all()
    )
    return {
        "balance": balance,
        "total_earned": earned,
        "total_spent": spent,
        "recent": [schemas.ledger_to_dict(entry) for entry in recent],
    }


def leaderboard(limit=10):
    """Top theo tổng điểm đã kiếm; sync trước cho mọi nhân viên đang làm.

    Trước đây gọi sync_points + get_totals từng người: 20 nhân viên tốn
    ~208 câu (140 sync + 30 SUM + 10 lazy department + INSERT lần đầu),
    49 nhân viên prod tốn ~500 câu. Giờ: sync gộp (5 câu) + tổng gộp
    (1 câu) + department eager-load — tổng ~8 câu, không tăng theo
    số nhân viên.
    """
    employees = (
        Employee.query.filter(Employee.status != Employee.STATUS_RESIGNED)
        .options(selectinload(Employee.department))
        .order_by(Employee.id.asc())
        .all()
    )
    employee_ids = [employee.id for employee in employees]
    sync_points_many(employee_ids)
    totals = _totals_many(employee_ids)
    by_id = {employee.id: employee for employee in employees}
    items = []
    for employee_id, (balance, earned, _spent) in totals.items():
        employee = by_id.get(employee_id)
        if employee is None or earned <= 0:
            continue
        items.append(
            {
                "employee": schemas.employee_brief(employee),
                "department": (
                    employee.department.name if employee.department else None
                ),
                "total_earned": earned,
                "balance": balance,
            }
        )
    # Commit SAU khi đã dựng xong items: commit expire toàn bộ object
    # trong session (expire_on_commit), dựng items sau commit sẽ làm mỗi
    # employee + department bị SELECT lại 1 lần (20 người -> +25 câu).
    db.session.commit()
    items.sort(
        key=lambda item: (
            -item["total_earned"],
            -item["balance"],
            item["employee"]["full_name"],
        )
    )
    return items[:limit]


# ---------------------------------------------------------------------------
# Huy hiệu (tính tại chỗ, không lưu bảng)
# ---------------------------------------------------------------------------

def my_badges(user):
    employee = None
    if getattr(user, "employee_id", None):
        employee = db.session.get(Employee, user.employee_id)

    records = []
    courses_done = 0
    kudos_received = 0
    if employee is not None:
        records = (
            Attendance.query.filter_by(employee_id=employee.id)
            .order_by(Attendance.work_date.asc())
            .all()
        )
        courses_done = CourseEnrollment.query.filter_by(
            employee_id=employee.id, status=CourseEnrollment.STATUS_COMPLETED
        ).count()
        kudos_received = Kudo.query.filter_by(
            to_employee_id=employee.id
        ).count()
    kudos_given = Kudo.query.filter_by(from_user_id=user.id).count()

    # Chuỗi ngày đúng giờ dài nhất: chạy liên tiếp các bản ghi "present"
    # theo thứ tự ngày; một bản ghi khác trạng thái sẽ cắt chuỗi.
    best_streak = 0
    current_streak = 0
    for record in records:
        if record.status == Attendance.STATUS_PRESENT:
            current_streak += 1
            best_streak = max(best_streak, current_streak)
        else:
            current_streak = 0

    today = _today_local()
    month_records = [
        r
        for r in records
        if r.work_date.year == today.year and r.work_date.month == today.month
    ]
    worked_this_month = sum(
        1
        for r in month_records
        if r.status in (Attendance.STATUS_PRESENT, Attendance.STATUS_LATE)
    )
    late_this_month = sum(
        1 for r in month_records if r.status == Attendance.STATUS_LATE
    )

    return [
        {
            "key": "punctual_7",
            "name": "Đúng giờ 7 ngày liên tiếp",
            "emoji": "🔥",
            "description": "Đạt chuỗi 7 ngày đi làm đúng giờ liên tiếp.",
            "earned": best_streak >= 7,
            "progress_text": f"Chuỗi đúng giờ dài nhất: {best_streak}/7 ngày",
        },
        {
            "key": "perfect_month",
            "name": "Chuyên cần tháng này",
            "emoji": "⭐",
            "description": "Tháng hiện tại không muộn lần nào và có ít nhất 10 ngày công.",
            "earned": late_this_month == 0 and worked_this_month >= 10,
            "progress_text": (
                f"Tháng này: {worked_this_month}/10 ngày công, "
                f"{late_this_month} lần muộn"
            ),
        },
        {
            "key": "learner_1",
            "name": "Bước đầu học tập",
            "emoji": "📚",
            "description": "Hoàn thành khoá học đầu tiên.",
            "earned": courses_done >= 1,
            "progress_text": f"Đã hoàn thành {courses_done}/1 khoá học",
        },
        {
            "key": "learner_3",
            "name": "Chiến binh học tập",
            "emoji": "🎓",
            "description": "Hoàn thành 3 khoá học.",
            "earned": courses_done >= 3,
            "progress_text": f"Đã hoàn thành {courses_done}/3 khoá học",
        },
        {
            "key": "star_5",
            "name": "Ngôi sao gắn kết",
            "emoji": "💛",
            "description": "Nhận được 5 kudo từ đồng nghiệp.",
            "earned": kudos_received >= 5,
            "progress_text": f"Đã nhận {kudos_received}/5 kudo",
        },
        {
            "key": "giver_5",
            "name": "Người truyền lửa",
            "emoji": "🎁",
            "description": "Tặng 5 kudo cho đồng nghiệp.",
            "earned": kudos_given >= 5,
            "progress_text": f"Đã tặng {kudos_given}/5 kudo",
        },
    ]


# ---------------------------------------------------------------------------
# Cửa hàng quà
# ---------------------------------------------------------------------------

def list_rewards(user):
    employee = None
    if getattr(user, "employee_id", None):
        employee = db.session.get(Employee, user.employee_id)
    balance = 0
    if employee is not None:
        sync_points(employee.id)
        db.session.commit()
        balance, _, _ = get_totals(employee.id)
    rewards = (
        Reward.query.filter_by(is_active=True)
        .order_by(Reward.points_cost.asc(), Reward.id.asc())
        .all()
    )
    return [schemas.reward_to_dict(reward, balance=balance) for reward in rewards]


def list_all_rewards():
    """Toàn bộ catalog (kể cả đã khoá) cho panel quản lý của HR/Admin."""
    rewards = Reward.query.order_by(Reward.id.asc()).all()
    return [schemas.reward_to_dict(reward) for reward in rewards]


def create_reward(cleaned):
    reward = Reward(**cleaned)
    db.session.add(reward)
    db.session.commit()
    return reward


def update_reward(reward_id, cleaned):
    reward = get_or_404(Reward, reward_id, "REWARD_NOT_FOUND", "Không tìm thấy quà tặng.")
    for field, value in cleaned.items():
        setattr(reward, field, value)
    db.session.commit()
    return reward


# ---------------------------------------------------------------------------
# Đổi quà
# ---------------------------------------------------------------------------

def create_redemption(user, reward_id):
    employee = require_employee(user)
    sync_points(employee.id)

    reward = db.session.get(Reward, reward_id)
    if reward is None:
        db.session.rollback()
        raise ApiError(404, "REWARD_NOT_FOUND", "Không tìm thấy quà tặng.")
    if not reward.is_active:
        db.session.rollback()
        raise ApiError(400, "REWARD_INACTIVE", "Quà tặng này đang tạm ngừng đổi.")
    if reward.stock is not None and reward.stock <= 0:
        db.session.rollback()
        raise ApiError(400, "OUT_OF_STOCK", "Quà tặng này đã hết hàng.")

    balance, _, _ = get_totals(employee.id)
    if balance < reward.points_cost:
        db.session.rollback()
        raise ApiError(
            400,
            "INSUFFICIENT_POINTS",
            "Số dư điểm chưa đủ để đổi quà này.",
            [
                {
                    "field": "reward_id",
                    "message": f"Cần {reward.points_cost} điểm, bạn đang có {balance} điểm.",
                }
            ],
        )

    redemption = Redemption(
        employee_id=employee.id,
        reward_id=reward.id,
        points_cost=reward.points_cost,
        status=Redemption.STATUS_PENDING,
    )
    db.session.add(redemption)
    db.session.commit()
    return redemption


def list_redemptions(user, args):
    scope = (args.get("scope") or "mine").lower()
    status = args.get("status") or None
    page = parse_int_arg(args, "page", 1, minimum=1, maximum=100000)
    limit = parse_int_arg(args, "limit", 20, minimum=1, maximum=100)

    query = Redemption.query
    if scope == "all":
        if user.role not in HR_ROLES:
            raise ApiError(
                403,
                "FORBIDDEN",
                "Chỉ HR/Admin mới xem được toàn bộ yêu cầu đổi quà.",
            )
    else:
        employee = require_employee(user)
        query = query.filter_by(employee_id=employee.id)
    if status:
        if status not in Redemption.STATUSES:
            raise ApiError(
                400,
                "VALIDATION_ERROR",
                "Trạng thái không hợp lệ.",
                [{"field": "status", "message": "pending/approved/rejected."}],
            )
        query = query.filter_by(status=status)

    total = query.count()
    items = (
        query.order_by(Redemption.created_at.desc(), Redemption.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    meta = {
        "page": page,
        "limit": limit,
        "total": total,
        "total_pages": (total + limit - 1) // limit if total else 0,
    }
    return items, meta


def decide_redemption(user, redemption_id, decision, note):
    redemption = get_or_404(
        Redemption, redemption_id, "REDEMPTION_NOT_FOUND", "Không tìm thấy yêu cầu đổi quà."
    )
    if redemption.status != Redemption.STATUS_PENDING:
        raise ApiError(
            409,
            "ALREADY_DECIDED",
            "Yêu cầu đổi quà này đã được quyết định trước đó.",
        )

    if decision == "approve":
        reward = redemption.reward
        # Kiểm tra lại số dư TẠI THỜI ĐIỂM DUYỆT (sau khi sync bổ sung).
        sync_points(redemption.employee_id)
        balance, _, _ = get_totals(redemption.employee_id)
        if balance < redemption.points_cost:
            db.session.rollback()
            raise ApiError(
                409,
                "INSUFFICIENT_POINTS",
                "Số dư điểm của nhân viên không đủ tại thời điểm duyệt.",
            )
        if reward is not None and reward.stock is not None:
            if reward.stock <= 0:
                db.session.rollback()
                raise ApiError(
                    409, "OUT_OF_STOCK", "Quà tặng đã hết hàng tại thời điểm duyệt."
                )
            reward.stock -= 1
        _add_ledger(
            redemption.employee_id,
            -redemption.points_cost,
            PointsLedger.SOURCE_REDEMPTION,
            f"redemption:{redemption.id}",
            f"Đổi quà: {reward.name if reward else 'quà tặng'}",
        )
        redemption.status = Redemption.STATUS_APPROVED
    else:
        redemption.status = Redemption.STATUS_REJECTED

    redemption.decided_by = user.id
    redemption.decided_at = datetime.utcnow()
    if note:
        redemption.note = note
    db.session.commit()
    return redemption


# Giữ tham chiếu date cho các module khác nếu cần (tránh lint unused).
__all__ = [
    "ApiError",
    "POINTS_PER_KUDO",
    "POINTS_PER_COURSE",
    "POINTS_PER_ONTIME_DAY",
    "current_user",
    "sync_points",
    "get_totals",
    "require_employee",
    "my_points",
    "leaderboard",
    "my_badges",
    "list_rewards",
    "list_all_rewards",
    "create_reward",
    "update_reward",
    "create_redemption",
    "list_redemptions",
    "decide_redemption",
    "date",
]
