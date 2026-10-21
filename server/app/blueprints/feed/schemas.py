"""Schema (serialize + validate) cho Bảng tin nội bộ (feed).

Serialize thủ công theo quy ước của module engagement (snake_case).
Validate trả danh sách lỗi dạng [{"field": ..., "message": ...}] để
routes đóng vào error.details chuẩn.
"""


def _iso(value):
    return value.isoformat() if value else None


def _author_block(user):
    """Thông tin tác giả từ User (+ Employee gắn kèm nếu có)."""
    employee = getattr(user, "employee", None) if user else None
    department = getattr(employee, "department", None) if employee else None
    return {
        "author_id": user.id if user else None,
        "author_name": user.full_name if user else "Người dùng",
        "author_code": employee.code if employee else None,
        "author_department": department.name if department else None,
    }


def comment_to_dict(comment, current_user_id=None):
    data = {
        "id": comment.id,
        "post_id": comment.post_id,
        "content": comment.content,
        "created_at": _iso(comment.created_at),
    }
    data.update(_author_block(comment.author))
    data["can_delete"] = bool(
        current_user_id is not None
        and (comment.author_id == current_user_id)
    )
    return data


def post_to_dict(post, *, like_count, comment_count, liked_by_me,
                 comments_preview, current_user):
    data = {
        "id": post.id,
        "content": post.content,
        "is_pinned": bool(post.is_pinned),
        "like_count": like_count,
        "comment_count": comment_count,
        "liked_by_me": bool(liked_by_me),
        "comments_preview": comments_preview,
        "created_at": _iso(post.created_at),
        "updated_at": _iso(post.updated_at),
    }
    data.update(_author_block(post.author))
    is_author = current_user is not None and post.author_id == current_user.id
    is_privileged = current_user is not None and current_user.role in ("admin", "hr")
    data["can_delete"] = bool(is_author or is_privileged)
    data["can_pin"] = bool(is_privileged)
    return data


def validate_post_payload(data):
    """Validate body đăng bài. Trả về (cleaned, errors)."""
    errors = []
    cleaned = {}
    content = data.get("content")
    if not isinstance(content, str) or not content.strip():
        errors.append({"field": "content", "message": "Nội dung bài viết không được để trống."})
    else:
        content = content.strip()
        if len(content) > 2000:
            errors.append({"field": "content", "message": "Nội dung tối đa 2000 ký tự."})
        else:
            cleaned["content"] = content
    return cleaned, errors


def validate_comment_payload(data):
    """Validate body bình luận. Trả về (cleaned, errors)."""
    errors = []
    cleaned = {}
    content = data.get("content")
    if not isinstance(content, str) or not content.strip():
        errors.append({"field": "content", "message": "Nội dung bình luận không được để trống."})
    else:
        content = content.strip()
        if len(content) > 1000:
            errors.append({"field": "content", "message": "Bình luận tối đa 1000 ký tự."})
        else:
            cleaned["content"] = content
    return cleaned, errors


def validate_pin_payload(data):
    """Validate body ghim bài {is_pinned: bool}. Trả về (cleaned, errors)."""
    errors = []
    cleaned = {}
    value = data.get("is_pinned")
    if not isinstance(value, bool):
        errors.append({"field": "is_pinned", "message": "is_pinned phải là true hoặc false."})
    else:
        cleaned["is_pinned"] = value
    return cleaned, errors
