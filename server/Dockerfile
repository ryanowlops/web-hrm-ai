# Backend Flask — Web HRM tích hợp AI
# Build context: thư mục server/
# Tối ưu cho máy yếu (Render Free 512 MB RAM): image slim 2 lớp, không công cụ
# biên dịch (mọi dependency đều có wheel sẵn), Gunicorn 1 worker x nhiều thread
# để RAM thấp nhất mà vẫn phục vụ song song tốt (API chủ yếu chờ I/O: DB/AI).

# ---------- Stage 1: cài dependencies vào venv riêng ----------
FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build
COPY requirements.txt ./
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install -r requirements.txt

# ---------- Stage 2: image chạy thật, chỉ gồm venv + mã nguồn ----------
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_ENV=production \
    PATH="/opt/venv/bin:$PATH" \
    # Giảm phân mảnh RAM của glibc khi chạy nhiều thread trong 1 process
    MALLOC_ARENA_MAX=2

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
COPY . .

# Thư mục upload (CV, tài liệu KB) + thư mục instance cho SQLite local.
# Trên Render đây là đĩa tạm: file mất khi service khởi động lại (đã ghi chú
# trong docs/deployment-golden-combo.md).
RUN mkdir -p /app/uploads /app/instance \
    && useradd --create-home --uid 1001 appuser \
    && chown -R appuser:appuser /app
USER appuser

# Render cấp cổng qua biến $PORT (mặc định của họ là 10000); local/compose
# không đặt $PORT thì dùng 5000 như cũ.
# AUTO_SEED=1 (chỉ đặt trên môi trường demo): chạy seed.py trước khi mở
# server — seed là get-or-create nên chạy lại mỗi lần khởi động vẫn an toàn,
# lỗi seed cũng không chặn server lên.
EXPOSE 5000
CMD ["sh", "-c", "if [ \"$AUTO_SEED\" = \"1\" ]; then echo 'AUTO_SEED=1 -> seed du lieu mau (idempotent)'; python seed.py || echo 'Seed loi — van khoi dong server'; fi; exec gunicorn run:app --bind 0.0.0.0:${PORT:-5000} --worker-class gthread --workers ${WEB_CONCURRENCY:-1} --threads ${GUNICORN_THREADS:-8} --timeout 120 --max-requests 1000 --max-requests-jitter 100 --access-logfile - --error-logfile -"]
