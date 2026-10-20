"""Xử lý lỗi tập trung cho toàn bộ API.

Mọi lỗi trả về MỘT định dạng duy nhất (kiến trúc B3.4):

    {"error": {"code": "...", "message": "...", "details": [...]}}

Service/route ném `ApiError` khi có lỗi nghiệp vụ; các handler đăng ký
trong file này lo phần còn lại (HTTP exception, Marshmallow, JWT, 500).
"""
from __future__ import annotations

from flask import jsonify
from marshmallow import ValidationError
from werkzeug.exceptions import HTTPException

# Mã lỗi mặc định theo HTTP status (code dùng ổn định cho frontend, B6).
_DEFAULT_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "FILE_TOO_LARGE",
    422: "UNPROCESSABLE_ENTITY",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    503: "SERVICE_UNAVAILABLE",
}

_DEFAULT_MESSAGES = {
    400: "Dữ liệu gửi lên không hợp lệ.",
    401: "Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.",
    403: "Bạn không có quyền thực hiện thao tác này.",
    404: "Không tìm thấy tài nguyên yêu cầu.",
    405: "Phương thức không được hỗ trợ cho địa chỉ này.",
    409: "Dữ liệu bị xung đột với trạng thái hiện tại.",
    413: "Tệp tải lên vượt quá kích thước cho phép.",
    422: "Dữ liệu hợp lệ về định dạng nhưng không xử lý được.",
    429: "Bạn đã gửi quá nhiều yêu cầu, vui lòng thử lại sau.",
    500: "Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.",
    503: "Dịch vụ tạm thời không khả dụng.",
}


class ApiError(Exception):
    """Lỗi nghiệp vụ có kiểm soát, dùng ở service/route.

    Ví dụ:
        raise ApiError(404, "EMPLOYEE_NOT_FOUND", "Không tìm thấy nhân viên.")
        raise ApiError(409, "EMAIL_EXISTS", "Email đã được sử dụng.")
    """

    def __init__(self, *args, code: str | None = None,
                 message: str | None = None, status_code: int | None = None,
                 status: int | None = None, details=None):
        # Chấp nhận cả 2 cách gọi đang dùng trong codebase:
        #   ApiError(404, "EMPLOYEE_NOT_FOUND", "Không tìm thấy nhân viên.")
        #   ApiError("FORBIDDEN", "Không có quyền.", status_code=403)
        pos = list(args)
        if pos and isinstance(pos[0], str) and code is None:
            code = pos.pop(0)
            if pos and isinstance(pos[0], str) and message is None:
                message = pos.pop(0)
        if pos and isinstance(pos[0], int) and status_code is None and status is None:
            status_code = pos.pop(0)
        if pos and isinstance(pos[0], str) and code is None:
            code = pos.pop(0)
        if pos and isinstance(pos[0], str) and message is None:
            message = pos.pop(0)
        if status_code is None:
            status_code = status if status is not None else 400
        super().__init__(message)
        self.status_code = status_code
        self.code = code or _DEFAULT_CODES.get(status_code, "ERROR")
        self.message = message or _DEFAULT_MESSAGES.get(status_code, "Đã xảy ra lỗi.")
        self.details = details if details is not None else []

    def to_dict(self) -> dict:
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details,
            }
        }


def error_response(status_code: int, code: str | None = None,
                   message: str | None = None, details=None):
    """Tạo (response, status) theo đúng format chuẩn."""
    err = ApiError(status_code, code, message, details)
    return jsonify(err.to_dict()), err.status_code


def register_error_handlers(app) -> None:
    """Đăng ký errorhandler toàn app. Gọi trong create_app()."""

    @app.errorhandler(ApiError)
    def _handle_api_error(err: ApiError):
        return jsonify(err.to_dict()), err.status_code

    @app.errorhandler(ValidationError)
    def _handle_marshmallow_error(err: ValidationError):
        # err.messages: {field: [messages]} — frontend hiển thị theo trường.
        return error_response(
            400,
            "VALIDATION_ERROR",
            "Dữ liệu gửi lên không hợp lệ.",
            details=err.messages,
        )

    @app.errorhandler(HTTPException)
    def _handle_http_error(err: HTTPException):
        # Gồm cả 404 route lạ, 405, và 429 do Flask-Limiter ném ra.
        return error_response(
            err.code or 500,
            _DEFAULT_CODES.get(err.code, "HTTP_ERROR"),
            _DEFAULT_MESSAGES.get(err.code, err.description),
        )

    @app.errorhandler(Exception)
    def _handle_unexpected_error(err: Exception):
        # Không lộ chi tiết nội bộ ra client; log đầy đủ ở server.
        app.logger.exception("Unhandled exception: %s", err)
        return error_response(500, "INTERNAL_ERROR")


def register_jwt_error_handlers(jwt) -> None:
    """Callback lỗi của Flask-JWT-Extended, trả cùng format chuẩn (401)."""

    @jwt.unauthorized_loader
    def _missing_token(reason):
        return error_response(401, "UNAUTHORIZED",
                              "Thiếu token đăng nhập trong yêu cầu.")

    @jwt.invalid_token_loader
    def _invalid_token(reason):
        return error_response(401, "INVALID_TOKEN", "Token không hợp lệ.")

    @jwt.expired_token_loader
    def _expired_token(jwt_header, jwt_payload):
        return error_response(401, "TOKEN_EXPIRED",
                              "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.")

    @jwt.revoked_token_loader
    def _revoked_token(jwt_header, jwt_payload):
        return error_response(401, "TOKEN_REVOKED", "Token đã bị thu hồi.")

    @jwt.needs_fresh_token_loader
    def _needs_fresh_token(jwt_header, jwt_payload):
        return error_response(401, "FRESH_TOKEN_REQUIRED",
                              "Thao tác này yêu cầu đăng nhập mới.")
