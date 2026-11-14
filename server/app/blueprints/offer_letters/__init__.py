"""Blueprint Thư mời nhận việc (Offer Letter) — tiền tố /api/v1/offer-letters."""
from flask import Blueprint

bp = Blueprint("offer_letters", __name__, url_prefix="/api/v1/offer-letters")

from app.blueprints.offer_letters import routes  # noqa: E402,F401
