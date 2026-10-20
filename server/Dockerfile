# Backend Flask — Web HRM tích hợp AI
# Build context: thư mục server/ (xem docker-compose.yml, service api/worker)
FROM python:3.12-slim

# Không ghi .pyc, log Python xuất thẳng ra stdout/stderr để Docker thu thập
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Thư viện hệ thống tối thiểu:
# - build-essential + libpq-dev: biên dịch các gói Python cần native build (psycopg, bcrypt...)
# - libmagic1: kiểm tra magic bytes của file upload (python-magic) theo kiến trúc bảo mật B8
# - curl: dùng cho healthcheck/debug khi cần
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev libmagic1 curl \
    && rm -rf /var/lib/apt/lists/*

# Cài dependencies trước (tận dụng cache layer: chỉ build lại khi requirements đổi)
COPY requirements.txt ./
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

# Mã nguồn backend
COPY . .

# Thư mục chứa file upload (CV, tài liệu quy chế) — compose gắn volume vào đây
RUN mkdir -p /app/uploads

# Chạy bằng user thường, không dùng root
RUN useradd --create-home appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/api/v1/health', timeout=3)" || exit 1

# Gunicorn phục vụ Flask app factory qua entrypoint run:app (run.py ở gốc thư mục server/)
# - workers/threads: API chủ yếu chờ I/O (DB, AI) nên 2 workers x 4 threads là điểm khởi đầu an toàn
# - timeout 120s: chừa cho các request tổng hợp nặng; tác vụ AI dài vẫn phải chạy nền qua worker, không qua request này
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "4", "--timeout", "120", "--access-logfile", "-", "--error-logfile", "-", "run:app"]
