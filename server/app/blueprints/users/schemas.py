"""Marshmallow schemas cho blueprint users.

UserSchema là schema response DUY NHẤT cho tài khoản — chỉ gồm trường an toàn,
không bao giờ chứa password_hash (docs B3.3).
"""
from marshmallow import Schema, fields, validate

from app.blueprints.auth.guards import ROLES


class UserSchema(Schema):
    """Response: thông tin tài khoản an toàn để trả ra API."""

    id = fields.Integer()
    email = fields.Email()
    full_name = fields.String()
    role = fields.String()
    is_active = fields.Boolean()
    employee_id = fields.Integer(allow_none=True)
    created_at = fields.DateTime(format="iso")
    updated_at = fields.DateTime(format="iso")


class CreateUserSchema(Schema):
    """Request tạo tài khoản (Admin). role phải thuộc ROLES của hệ thống."""

    email = fields.Email(required=True)
    password = fields.String(
        required=True, validate=validate.Length(min=8, max=128)
    )
    full_name = fields.String(
        required=True, validate=validate.Length(min=1, max=120)
    )
    role = fields.String(required=True, validate=validate.OneOf(ROLES))
    employee_id = fields.Integer(allow_none=True, load_default=None)
    is_active = fields.Boolean(load_default=True)


class UpdateUserSchema(Schema):
    """Request PATCH /users/:id — Admin chỉ sửa role và/hoặc trạng thái khóa."""

    role = fields.String(validate=validate.OneOf(ROLES))
    is_active = fields.Boolean()
