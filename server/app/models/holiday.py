"""Ngay nghi le (Holiday) — lich nghi le cua cong ty.

Bang MOI: admin/HR quan ly ngay le; cac module khac (nghi phep, luong,
cham cong) se tra cuu bang nay o buoc noi sau — hien chi CRUD.
Bang duoc db.create_all() tao tu dong (khong can migration) vi model
duoc dang ky trong app.models.
"""
from app.extensions import db
from app.models.users import TimestampMixin


class Holiday(TimestampMixin, db.Model):
    __tablename__ = "holidays"

    id = db.Column(db.Integer, primary_key=True)
    # Ngay le: duy nhat — mot ngay chi co the la mot ngay le.
    date = db.Column(db.Date, nullable=False, unique=True, index=True)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    # True = le quoc gia (Tet, 30/4...), False = le rieng cua cong ty.
    is_national = db.Column(db.Boolean, nullable=False, default=True)

    # Nguoi tao — tro toi User (nullable vi co the tao bang seed).
    created_by = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True, index=True
    )
    creator = db.relationship("User", foreign_keys=[created_by])

    def __repr__(self):
        return (
            f"<Holiday id={self.id} date={self.date!r} name={self.name!r}>"
        )
