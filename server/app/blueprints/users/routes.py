"""Routes cho blueprint users — tiền tố /api/v1/users (chỉ Admin).

    GET   /users            Danh sách tài khoản, phân trang + lọc search/role/is_active
    GET   /users/<id>       Chi tiết một tài khoản
    POST  /users            Tạo tài khoản (mật khẩu băm bằng werkzeug)
    PATCH /users/<id>       Sửa role và/hoặc khóa–mở tài khoản (is_active)

Mọi response đi qua UserSchema — không bao giờ trả password_hash.
"""
from flask import jsonify, request
from marshmallow import ValidationError
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash

from app.blueprints.auth.guards import load_current_user, require_roles
from app.blueprints.users import bp
from app.blueprints.users.schemas import (
    CreateUserSchema,
    UpdateUserSchema,
    UserSchema,
)
from app.errors import ApiError
from app.extensions import db
from app.models import User


def _load(schema, payload):
    """Validate payload bằng marshmallow, lỗi -> ApiError VALIDATION_ERROR."""
    try:
        return schema.load(payload or {})
    except ValidationError as exc:
        details = [
            {"field": field, "message": message}
            for field, messages in exc.messages.items()
            for message in (messages if isinstance(messages, list) else [messages])
        ]
        raise ApiError(
            "VALIDATION_ERROR",
            "Dữ liệu gửi lên không hợp lệ.",
            status_code=400,
            details=details,
        ) from exc


def _get_user_or_404(user_id: int) -> User:
    user = db.session.get(User, user_id)
    if user is None:
        raise ApiError(
            "USER_NOT_FOUND", "Không tìm thấy tài khoản.", status_code=404
        )
    return user


@bp.get("/me")
@require_roles()
def get_me():
    """Thông tin tài khoản đang đăng nhập (mọi role) — FE AuthContext dùng."""
    user = load_current_user()
    return jsonify(UserSchema().dump(user))


@bp.get("")
@require_roles("admin")
def list_users():
    page = max(request.args.get("page", 1, type=int) or 1, 1)
    limit = request.args.get("limit", 20, type=int) or 20
    limit = min(max(limit, 1), 100)

    query = db.session.query(User)

    search = (request.args.get("search") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(
            User.full_name.ilike(like) | User.email.ilike(like)
        )
    role = request.args.get("role")
    if role:
        query = query.filter(User.role == role)
    is_active_arg = request.args.get("is_active")
    if is_active_arg is not None:
        query = query.filter(
            User.is_active == (is_active_arg.strip().lower() == "true")
        )

    total_items = query.count()
    users = (
        query.order_by(User.id)
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    total_pages = (total_items + limit - 1) // limit if total_items else 0
    return (
        jsonify(
            {
                "data": UserSchema(many=True).dump(users),
                "meta": {
                    "page": page,
                    "limit": limit,
                    "totalItems": total_items,
                    "totalPages": total_pages,
                },
            }
        ),
        200,
    )


@bp.get("/<int:user_id>")
@require_roles("admin")
def get_user(user_id: int):
    return jsonify(UserSchema().dump(_get_user_or_404(user_id))), 200


@bp.post("")
@require_roles("admin")
def create_user():
    data = _load(CreateUserSchema(), request.get_json(silent=True))
    email = data["email"].strip().lower()

    existing = db.session.query(User).filter(User.email == email).first()
    if existing is not None:
        raise ApiError(
            "EMAIL_ALREADY_EXISTS",
            "Email này đã được dùng cho một tài khoản khác.",
            status_code=409,
        )

    user = User(
        email=email,
        password_hash=generate_password_hash(data["password"]),
        full_name=data["full_name"].strip(),
        role=data["role"],
        is_active=data.get("is_active", True),
        employee_id=data.get("employee_id"),
    )
    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        raise ApiError(
            "CREATE_USER_FAILED",
            "Không tạo được tài khoản, dữ liệu liên kết không hợp lệ.",
            status_code=400,
        ) from exc
    return jsonify(UserSchema().dump(user)), 201


@bp.patch("/<int:user_id>")
@require_roles("admin")
def update_user(user_id: int):
    data = _load(UpdateUserSchema(), request.get_json(silent=True))
    if not data:
        raise ApiError(
            "VALIDATION_ERROR",
            "Không có trường nào để cập nhật (chỉ sửa được role, is_active).",
            status_code=400,
        )

    user = _get_user_or_404(user_id)
    current_user = load_current_user()
    if user.id == current_user.id:
        # Tránh Admin tự khóa chính mình / tự đổi role làm mất quyền quản trị.
        if data.get("is_active") is False:
            raise ApiError(
                "CANNOT_DEACTIVATE_SELF",
                "Không thể tự khóa tài khoản của chính mình.",
                status_code=400,
            )
        if "role" in data and data["role"] != user.role:
            raise ApiError(
                "CANNOT_CHANGE_OWN_ROLE",
                "Không thể tự thay đổi vai trò của chính mình.",
                status_code=400,
            )

    if "role" in data:
        user.role = data["role"]
    if "is_active" in data:
        user.is_active = data["is_active"]
    db.session.commit()
    return jsonify(UserSchema().dump(user)), 200
