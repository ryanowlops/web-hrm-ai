"""Marshmallow schemas cho blueprint auth.

Schema request dùng để validate dữ liệu vào ở routes.py; schema response
(UserBriefSchema) chỉ chứa trường an toàn — KHÔNG bao giờ có password_hash.
"""
from marshmallow import Schema, fields, validate


class LoginSchema(Schema):
    email = fields.Email(required=True)
    password = fields.String(
        required=True, validate=validate.Length(min=1, max=128)
    )


class ChangePasswordSchema(Schema):
    current_password = fields.String(
        required=True, validate=validate.Length(min=1, max=128)
    )
    new_password = fields.String(
        required=True, validate=validate.Length(min=8, max=128)
    )


class UserBriefSchema(Schema):
    """User rút gọn trả kèm khi đăng nhập để frontend dựng phiên làm việc."""

    id = fields.Integer()
    email = fields.Email()
    full_name = fields.String()
    role = fields.String()
    employee_id = fields.Integer(allow_none=True)
