"""Game hoá & phúc lợi (feature-expansion-v4 mục 2): điểm thưởng, quà, đổi quà.

- PointsLedger: sổ cái điểm — mọi thay đổi điểm đều là 1 dòng (cộng/trừ)
  kèm nguồn (source_type + source_ref). UNIQUE(employee_id, source_type,
  source_ref) chống cộng/trừ trùng khi đồng bộ lười (lazy sync) chạy lại.
  Số dư của nhân viên = SUM(delta) trên sổ cái, không lưu cột số dư riêng.
- Reward: catalog quà HR quản lý; stock = None nghĩa là không giới hạn.
- Redemption: yêu cầu đổi quà — tạo ở trạng thái pending (CHƯA trừ điểm),
  HR/Admin duyệt mới trừ điểm qua sổ cái + giảm stock.
"""
from app.extensions import db
from app.models.users import TimestampMixin, utcnow


class PointsLedger(db.Model):
    __tablename__ = "points_ledger"
    __table_args__ = (
        db.UniqueConstraint(
            "employee_id",
            "source_type",
            "source_ref",
            name="uq_points_ledger_emp_source_ref",
        ),
        db.Index("ix_points_ledger_employee_created", "employee_id", "created_at"),
    )

    SOURCE_KUDO = "kudo_received"
    SOURCE_TRAINING = "training_completed"
    SOURCE_ONTIME = "ontime_day"
    SOURCE_REDEMPTION = "redemption"
    SOURCE_MANUAL = "manual"
    SOURCE_TYPES = (
        SOURCE_KUDO,
        SOURCE_TRAINING,
        SOURCE_ONTIME,
        SOURCE_REDEMPTION,
        SOURCE_MANUAL,
    )

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    delta = db.Column(db.Integer, nullable=False)  # + cộng / − trừ
    source_type = db.Column(db.String(30), nullable=False, index=True)
    source_ref = db.Column(db.String(120), nullable=False)
    note = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    employee = db.relationship("Employee", foreign_keys=[employee_id])

    def __repr__(self):
        return (
            f"<PointsLedger id={self.id} employee_id={self.employee_id} "
            f"delta={self.delta} source={self.source_type}:{self.source_ref}>"
        )


class Reward(TimestampMixin, db.Model):
    __tablename__ = "rewards"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    points_cost = db.Column(db.Integer, nullable=False)
    # None = không giới hạn số lượng.
    stock = db.Column(db.Integer, nullable=True)
    image_emoji = db.Column(db.String(10), nullable=False, default="🎁")
    is_active = db.Column(db.Boolean, nullable=False, default=True, index=True)

    redemptions = db.relationship(
        "Redemption", back_populates="reward", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return (
            f"<Reward id={self.id} name={self.name!r} cost={self.points_cost} "
            f"stock={self.stock} active={self.is_active}>"
        )


class Redemption(TimestampMixin, db.Model):
    __tablename__ = "redemptions"

    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUSES = (STATUS_PENDING, STATUS_APPROVED, STATUS_REJECTED)

    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    reward_id = db.Column(
        db.Integer, db.ForeignKey("rewards.id"), nullable=False, index=True
    )
    # Giá điểm chụp lại tại thời điểm đổi (giá quà có thể đổi sau này).
    points_cost = db.Column(db.Integer, nullable=False)
    status = db.Column(
        db.String(20), nullable=False, default=STATUS_PENDING, index=True
    )
    decided_by = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True
    )
    decided_at = db.Column(db.DateTime, nullable=True)
    note = db.Column(db.String(255), nullable=True)

    employee = db.relationship("Employee", foreign_keys=[employee_id])
    reward = db.relationship("Reward", back_populates="redemptions")
    decider = db.relationship("User", foreign_keys=[decided_by])

    def __repr__(self):
        return (
            f"<Redemption id={self.id} employee_id={self.employee_id} "
            f"reward_id={self.reward_id} status={self.status!r}>"
        )
