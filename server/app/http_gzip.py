"""Nén gzip phản hồi JSON (đợt tối ưu tốc độ 2026-11-13).

Bối cảnh: API không nén gì cả — list 50 nhân viên trả 33KB JSON thô, trong
khi gzip còn ~4-5KB. Dùng gzip của thư viện chuẩn, không thêm dependency.

Thứ tự đăng ký quan trọng: phải gọi init_http_gzip TRƯỚC init_http_cache
trong app/__init__.py — Flask chạy after_request theo thứ tự NGƯỢC với lúc
đăng ký, nên cache sẽ ghi body thô trước, gzip nén lúc trả ra sau. Nhờ vậy
cả phản hồi mới lẫn phản hồi lấy từ cache đều được nén, mà cache không bao
giờ lưu nhầm body đã nén.
"""

import gzip

_MIN_BYTES = 1024


def init_http_gzip(app) -> None:
    @app.after_request
    def _gzip_json(resp):
        try:
            if resp.status_code != 200:
                return resp
            if resp.headers.get("Content-Encoding"):
                return resp
            if not resp.is_json:
                return resp
            from flask import request

            if "gzip" not in request.headers.get("Accept-Encoding", ""):
                return resp
            body = resp.get_data()
            if len(body) < _MIN_BYTES:
                return resp
            compressed = gzip.compress(body, compresslevel=6)
            resp.set_data(compressed)
            resp.headers["Content-Encoding"] = "gzip"
            resp.headers["Vary"] = "Accept-Encoding"
            resp.headers["Content-Length"] = str(len(compressed))
        except Exception:  # noqa: BLE001 - nén hỏng không được làm gục request
            app.logger.warning("HTTP gzip lỗi", exc_info=True)
        return resp
