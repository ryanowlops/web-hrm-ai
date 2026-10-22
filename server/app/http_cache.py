"""Cache phản hồi GET trong bộ nhớ (TTL ngắn) cho các endpoint "nóng".

Bối cảnh (đợt tối ưu tốc độ 2026-10-23): production chạy Render free
(0,1 vCPU) + Neon — mỗi request API tốn ~0,4–1s chủ yếu vì CPU bị bóp
và độ trễ DB, trong khi trang Dashboard gọi lại đúng một nhóm endpoint
mỗi lần tải/nạp lại trang. Cache tiến trình 30 giây biến các lượt gọi
lặp thành ~vài ms, đủ ngắn để số liệu gần như luôn tươi cho demo.

An toàn:
- Chỉ cache GET trả 200 + JSON, theo (định danh người dùng, path, query)
  — không bao giờ trộn dữ liệu giữa hai người dùng/vai trò.
- Mọi request ghi (POST/PUT/PATCH/DELETE) thành công đều XOÁ TOÀN BỘ
  cache: thô nhưng đúng đắn ở quy mô này (dữ liệu không bao giờ cũ quá
  một thao tác ghi).
- Chỉ áp cho danh sách allowlist các path đọc thuần bên dưới.
"""
import threading
import time

from flask import Response, request

_TTL_SECONDS = 30
_MAX_ENTRIES = 512

_CACHE_PREFIXES = (
    "/api/v1/stats/overview",
    "/api/v1/departments",
    "/api/v1/feed/activity",
    "/api/v1/announcements",
    "/api/v1/engagement/",
    "/api/v1/gamification/leaderboard",
)

_store: dict = {}
_lock = threading.Lock()


def _cacheable_path(path: str) -> bool:
    return any(path == p or path.startswith(p) for p in _CACHE_PREFIXES)


def _identity() -> str:
    try:
        from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

        verify_jwt_in_request(optional=True)
        return str(get_jwt_identity() or "anon")
    except Exception:  # noqa: BLE001 - không có JWT thì coi như anon
        return "anon"


def init_http_cache(app) -> None:
    @app.before_request
    def _serve_from_cache():
        if request.method != "GET" or not _cacheable_path(request.path):
            return None
        key = (_identity(), request.full_path)
        now = time.monotonic()
        with _lock:
            entry = _store.get(key)
            if entry and entry[0] > now:
                _, body, content_type = entry
                resp = Response(body, status=200, content_type=content_type)
                resp.headers["X-Cache"] = "HIT"
                return resp
        return None

    @app.after_request
    def _fill_or_invalidate(resp):
        try:
            if resp.headers.get("X-Cache") == "HIT":
                return resp
            if request.method == "GET":
                if (
                    resp.status_code == 200
                    and _cacheable_path(request.path)
                    and resp.is_json
                    and "Set-Cookie" not in resp.headers
                ):
                    key = (_identity(), request.full_path)
                    with _lock:
                        if len(_store) >= _MAX_ENTRIES:
                            _store.clear()
                        _store[key] = (
                            time.monotonic() + _TTL_SECONDS,
                            resp.get_data(),
                            resp.content_type,
                        )
                    resp.headers["X-Cache"] = "MISS"
            elif resp.status_code < 400:
                with _lock:
                    _store.clear()
        except Exception:  # noqa: BLE001 - cache hỏng không được làm gục request
            app.logger.warning("HTTP cache lỗi", exc_info=True)
        return resp
