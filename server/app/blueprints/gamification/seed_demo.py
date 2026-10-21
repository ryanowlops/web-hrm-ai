"""Seed demo cho module Gamification — IDEMPOTENT, không tự commit.

Parent (server/seed.py) gọi seed_demo() trong transaction chung, SAU khi
đã có nhân viên NV0001–NV0004, kudo (engagement) và enrollment đào tạo:
- Catalog 5 món quà (khóa chống trùng: tên quà).
- sync_points cho NV0001–NV0004 để số dư khớp dữ liệu thật (kudo nhận
  được, khoá học đã hoàn thành, ngày đúng giờ).
- 2 redemption mẫu: NV0003 đổi voucher cà phê đã APPROVED (trừ điểm qua
  sổ cái + giảm stock như luồng duyệt thật), NV0001 đổi bình giữ nhiệt
  đang PENDING (chưa trừ điểm). Khóa chống trùng: (employee, reward,
  status) + dòng ledger của redemption.
"""

from datetime import datetime

from app.extensions import db
from app.models import Employee, User
from app.models.gamification import PointsLedger, Redemption, Reward
from app.blueprints.gamification.services import sync_points

# (tên, mô tả, giá điểm, stock — None = không giới hạn, emoji)
REWARDS = [
    (
        "Voucher cà phê 50.000đ",
        "Voucher đồ uống trị giá 50.000đ tại quán cà phê đối tác.",
        50,
        20,
        "☕",
    ),
    (
        "Bình giữ nhiệt công ty",
        "Bình giữ nhiệt 500ml in logo Web HRM AI.",
        200,
        10,
        "🍶",
    ),
    (
        "Áo thun Web HRM AI",
        "Áo thun đồng phục phiên bản giới hạn của công ty.",
        150,
        15,
        "👕",
    ),
    (
        "Chuột không dây",
        "Chuột không dây yên tĩnh, bảo hành 12 tháng.",
        300,
        5,
        "🖱️",
    ),
    (
        "Thêm 0.5 ngày phép",
        "Cộng thêm nửa ngày phép vào quỹ phép năm của bạn.",
        500,
        None,
        "🌴",
    ),
]


def _employee_by_code(code):
    return Employee.query.filter_by(code=code).first()


def seed_demo():
    employees = {}
    for code in ("NV0001", "NV0002", "NV0003", "NV0004"):
        employee = _employee_by_code(code)
        if employee is not None:
            employees[code] = employee
    if not employees:
        return

    # --- Catalog quà (theo tên) ---
    rewards = {}
    for name, description, cost, stock, emoji in REWARDS:
        reward = Reward.query.filter_by(name=name).first()
        if reward is None:
            reward = Reward(
                name=name,
                description=description,
                points_cost=cost,
                stock=stock,
                image_emoji=emoji,
                is_active=True,
            )
            db.session.add(reward)
        rewards[name] = reward
    db.session.flush()

    # --- Đồng bộ điểm cho 4 nhân viên demo trước khi tạo redemption ---
    for employee in employees.values():
        sync_points(employee.id)
    db.session.flush()

    hr_user = User.query.filter_by(email="hr@hrm.local").first()

    # --- NV0003: voucher cà phê đã duyệt (đã trừ điểm + giảm stock) ---
    nv0003 = employees.get("NV0003")
    voucher = rewards.get("Voucher cà phê 50.000đ")
    if nv0003 is not None and voucher is not None:
        approved = Redemption.query.filter_by(
            employee_id=nv0003.id,
            reward_id=voucher.id,
            status=Redemption.STATUS_APPROVED,
        ).first()
        if approved is None:
            approved = Redemption(
                employee_id=nv0003.id,
                reward_id=voucher.id,
                points_cost=voucher.points_cost,
                status=Redemption.STATUS_APPROVED,
                decided_by=hr_user.id if hr_user else None,
                decided_at=datetime.utcnow(),
                note="Seed demo: HR đã duyệt.",
            )
            db.session.add(approved)
            db.session.flush()
            # Trừ điểm qua sổ cái như luồng duyệt thật (chỉ 1 lần).
            exists = PointsLedger.query.filter_by(
                employee_id=nv0003.id,
                source_type=PointsLedger.SOURCE_REDEMPTION,
                source_ref=f"redemption:{approved.id}",
            ).first()
            if exists is None:
                db.session.add(
                    PointsLedger(
                        employee_id=nv0003.id,
                        delta=-voucher.points_cost,
                        source_type=PointsLedger.SOURCE_REDEMPTION,
                        source_ref=f"redemption:{approved.id}",
                        note=f"Đổi quà: {voucher.name}",
                    )
                )
                if voucher.stock is not None and voucher.stock > 0:
                    voucher.stock -= 1
            db.session.flush()

    # --- NV0001: bình giữ nhiệt đang chờ duyệt (chưa trừ điểm) ---
    nv0001 = employees.get("NV0001")
    thermos = rewards.get("Bình giữ nhiệt công ty")
    if nv0001 is not None and thermos is not None:
        pending = Redemption.query.filter_by(
            employee_id=nv0001.id,
            reward_id=thermos.id,
            status=Redemption.STATUS_PENDING,
        ).first()
        if pending is None:
            db.session.add(
                Redemption(
                    employee_id=nv0001.id,
                    reward_id=thermos.id,
                    points_cost=thermos.points_cost,
                    status=Redemption.STATUS_PENDING,
                )
            )
            db.session.flush()
