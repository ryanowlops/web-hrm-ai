"""Routes cho Bảng tin nội bộ — tiền tố /api/v1/feed.

    GET    /feed/posts                  Danh sách bài (ghim trước, mới sau)
    POST   /feed/posts                  Đăng bài (mọi role đã đăng nhập)
    DELETE /feed/posts/<id>             Xoá bài (tác giả hoặc hr/admin)
    POST   /feed/posts/<id>/pin         Ghim/bỏ ghim (hr/admin)
    POST   /feed/posts/<id>/like        Thả tim / bỏ tim (toggle)
    GET    /feed/posts/<id>/comments    Danh sách bình luận của 1 bài
    POST   /feed/posts/<id>/comments    Thêm bình luận
    DELETE /feed/comments/<id>          Xoá bình luận (tác giả hoặc hr/admin)
    GET    /feed/activity               Dòng hoạt động tổng hợp (chỉ đọc)
"""
from flask import jsonify, request

from app.blueprints.auth.guards import load_current_user, require_roles
from app.blueprints.feed import bp, schemas, services
from app.errors import ApiError

READ_ROLES = ("admin", "hr", "manager", "employee")
WRITE_ROLES = ("admin", "hr")


def _json_body():
    data = request.get_json(silent=True)
    if data is None:
        raise ApiError(400, "VALIDATION_ERROR", "Body phải là JSON hợp lệ.")
    return data


def _validated(cleaned, errors):
    if errors:
        raise ApiError(422, "VALIDATION_ERROR", "Dữ liệu không hợp lệ.", details=errors)
    return cleaned


@bp.get("/posts")
@require_roles(*READ_ROLES)
def list_posts():
    user = load_current_user()
    items, meta = services.list_posts(request.args, user)
    return jsonify({"data": items, "meta": meta})


@bp.post("/posts")
@require_roles(*READ_ROLES)
def create_post():
    user = load_current_user()
    cleaned = _validated(*schemas.validate_post_payload(_json_body()))
    data = services.create_post(cleaned, user)
    return jsonify({"data": data}), 201


@bp.delete("/posts/<int:post_id>")
@require_roles(*READ_ROLES)
def delete_post(post_id: int):
    user = load_current_user()
    post = services.get_post_or_404(post_id)
    services.delete_post(post, user)
    return jsonify({"data": {"deleted": True, "id": post_id}})


@bp.post("/posts/<int:post_id>/pin")
@require_roles(*WRITE_ROLES)
def pin_post(post_id: int):
    user = load_current_user()
    post = services.get_post_or_404(post_id)
    cleaned = _validated(*schemas.validate_pin_payload(_json_body()))
    data = services.set_pinned(post, cleaned["is_pinned"], user)
    return jsonify({"data": data})


@bp.post("/posts/<int:post_id>/like")
@require_roles(*READ_ROLES)
def toggle_like(post_id: int):
    user = load_current_user()
    post = services.get_post_or_404(post_id)
    data = services.toggle_like(post, user)
    return jsonify({"data": data})


@bp.get("/posts/<int:post_id>/comments")
@require_roles(*READ_ROLES)
def list_comments(post_id: int):
    user = load_current_user()
    post = services.get_post_or_404(post_id)
    items, meta = services.list_comments(post, request.args, user)
    return jsonify({"data": items, "meta": meta})


@bp.post("/posts/<int:post_id>/comments")
@require_roles(*READ_ROLES)
def create_comment(post_id: int):
    user = load_current_user()
    post = services.get_post_or_404(post_id)
    cleaned = _validated(*schemas.validate_comment_payload(_json_body()))
    data = services.create_comment(post, cleaned, user)
    return jsonify({"data": data}), 201


@bp.delete("/comments/<int:comment_id>")
@require_roles(*READ_ROLES)
def delete_comment(comment_id: int):
    user = load_current_user()
    comment = services.get_comment_or_404(comment_id)
    services.delete_comment(comment, user)
    return jsonify({"data": {"deleted": True, "id": comment_id}})


@bp.get("/activity")
@require_roles(*READ_ROLES)
def get_activity():
    load_current_user()
    try:
        limit = int(request.args.get("limit", 10))
    except (TypeError, ValueError):
        limit = 10
    items = services.get_activity(limit)
    return jsonify({"data": items})
