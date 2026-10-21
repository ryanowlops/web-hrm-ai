"""Quan ly tai san cong ty: Asset va AssetAssignment (cap phat / thu hoi).

Theo hop dong feature-expansion-v2 muc 1C:
- assets la bang trung tam: moi tai san co ma (code, duy nhat), ten, loai,
  so serial, trang thai available/assigned/maintenance/retired, ngay mua.
- asset_assignments ghi lich su cap phat: 1 tai san co nhieu luot cap phat
  theo thoi gian, tai mot thoi diem chi co TOI DA mot assignment 'active'
  (rang buoc nay do service dam bao khi cap phat/thu hoi).
"""
from app.extensions import db
from app.models.users import TimestampMixin


class Asset(TimestampMixin, db.Model):
    __tablename__ = "assets"

    STATUS_AVAILABLE = "available"
    STATUS_ASSIGNED = "assigned"
    STATUS_MAINTENANCE = "maintenance"
    STATUS_RETIRED = "retired"
    STATUSES = (
        STATUS_AVAILABLE,
        STATUS_ASSIGNED,
        STATUS_MAINTENANCE,
        STATUS_RETIRED,
    )

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(50), nullable=False, unique=True, index=True)
    name = db.Column(db.String(200), nullable=False)
    category = db.Column(db.String(100), nullable=True, index=True)
    serial = db.Column(db.String(100), nullable=True)
    status = db.Column(
        db.String(20),
        nullable=False,
        default=STATUS_AVAILABLE,
        index=True,
    )
    purchase_date = db.Column(db.Date, nullable=True)
    notes = db.Column(db.Text, nullable=True)

    assignments = db.relationship(
        "AssetAssignment",
        back_populates="asset",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<Asset id={self.id} code={self.code!r} status={self.status!r}>"


class AssetAssignment(TimestampMixin, db.Model):
    __tablename__ = "asset_assignments"
    __table_args__ = (
        db.Index("ix_asset_assignments_asset_status", "asset_id", "status"),
        db.Index("ix_asset_assignments_employee_status", "employee_id", "status"),
    )

    STATUS_ACTIVE = "active"
    STATUS_RETURNED = "returned"
    STATUSES = (STATUS_ACTIVE, STATUS_RETURNED)

    id = db.Column(db.Integer, primary_key=True)
    asset_id = db.Column(
        db.Integer, db.ForeignKey("assets.id"), nullable=False, index=True
    )
    employee_id = db.Column(
        db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True
    )
    assigned_at = db.Column(db.DateTime, nullable=False)
    returned_at = db.Column(db.DateTime, nullable=True)
    status = db.Column(
        db.String(20), nullable=False, default=STATUS_ACTIVE, index=True
    )
    note = db.Column(db.Text, nullable=True)

    asset = db.relationship("Asset", back_populates="assignments")
    employee = db.relationship("Employee")

    def __repr__(self):
        return (
            f"<AssetAssignment id={self.id} asset_id={self.asset_id} "
            f"employee_id={self.employee_id} status={self.status!r}>"
        )
