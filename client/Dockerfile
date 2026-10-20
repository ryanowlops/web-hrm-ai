# Frontend React JS (Vite) — Web HRM tích hợp AI
# Build context: thư mục client/ (xem docker-compose.yml, service client)
# Multi-stage: stage 1 build bằng Node, stage 2 chỉ phục vụ file tĩnh bằng Nginx (image cuối rất nhẹ)

# ---------- Stage 1: build ----------
FROM node:20-alpine AS build
WORKDIR /app

# Cài dependencies trước để tận dụng cache layer
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Vite xuất bundle ra dist/ — tên chunk có hash để Nginx cache dài hạn (xem nginx.conf)
RUN npm run build

# ---------- Stage 2: serve ----------
FROM nginx:1.27-alpine
# Cấu hình Nginx của dự án: gzip, cache tĩnh, security headers, proxy /api/ sang backend
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
