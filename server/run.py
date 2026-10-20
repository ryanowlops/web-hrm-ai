"""Điểm chạy backend HRM API.

Chạy dev:
    cd server && python run.py
    # hoặc: flask --app run run --debug --port 5000

Chạy production (gunicorn):
    cd server && gunicorn run:app --bind 0.0.0.0:5000 --workers 2
"""
import os
import sys

# Cho phép chạy từ thư mục gốc repo: python server/run.py
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app  # noqa: E402

app = create_app()

if __name__ == "__main__":
    app.run(
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "5000")),
        debug=app.config.get("DEBUG", False),
    )
