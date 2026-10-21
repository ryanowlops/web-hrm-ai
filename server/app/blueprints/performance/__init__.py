"""Blueprint Hieu suat / KPI-OKR (performance) — tien to /api/v1/performance."""

from flask import Blueprint

bp = Blueprint("performance", __name__, url_prefix="/api/v1/performance")

from app.blueprints.performance import routes  # noqa: E402,F401
