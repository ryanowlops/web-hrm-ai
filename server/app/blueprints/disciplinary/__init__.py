"""Blueprint Kỷ luật nhân viên — tiền tố /api/v1/disciplinary."""
from flask import Blueprint

bp = Blueprint("disciplinary", __name__, url_prefix="/api/v1/disciplinary")

from app.blueprints.disciplinary import routes  # noqa: E402,F401
