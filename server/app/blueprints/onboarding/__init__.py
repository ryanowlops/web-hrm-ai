"""Blueprint Onboarding (hoi nhap nhan vien moi) — tien to /api/v1/onboarding.

Quan ly mau ke hoach hoi nhap (template), ke hoach cua tung nhan vien
moi (plan) va cac dau viec (task), theo docs/kpi-okr-onboarding.md muc 5.
"""
from flask import Blueprint

bp = Blueprint("onboarding", __name__, url_prefix="/api/v1/onboarding")

from app.blueprints.onboarding import routes  # noqa: E402,F401  (dang ky route)
