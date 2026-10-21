"""Schema (serialize + validate) cho Announcements.

Serialize thu cong theo quy uoc camelCase cua cac module khac.
Validate tra danh sach loi dang [{"field": ..., "message": ...}]
de routes dong vao error.details chuan.
"""


def announcement_to_dict(announcement):
    author = getattr(announcement, "author", None)
    return {
        "id": announcement.id,
        "title": announcement.title,
        "content": announcement.content,
        "category": announcement.category,
        "isPinned": bool(announcement.is_pinned),
        "authorId": announcement.author_id,
        "authorName": getattr(author, "full_name", None) if author else None,
        "createdAt": (
            announcement.created_at.isoformat() if announcement.created_at else None
        ),
        "updatedAt": (
            announcement.updated_at.isoformat() if announcement.updated_at else None
        ),
    }


def validate_announcement_payload(data, *, partial=False):
    """Validate body tao/sua thong bao. Tra ve (cleaned, errors)."""
    errors = []
    cleaned = {}

    def _text(field, max_len=None):
        if field not in data:
            if not partial:
                errors.append({"field": field, "message": "Trường này là bắt buộc."})
            return
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            errors.append({"field": field, "message": "Không được để trống."})
            return
        value = value.strip()
        if max_len and len(value) > max_len:
            errors.append(
                {"field": field, "message": f"Tối đa {max_len} ký tự."}
            )
            return
        cleaned[field] = value

    _text("title", max_len=255)
    _text("content")

    if "category" in data and data.get("category") is not None:
        category = data.get("category")
        from app.models.announcements import Announcement

        if category not in Announcement.CATEGORIES:
            errors.append(
                {
                    "field": "category",
                    "message": "Loại thông báo phải là general, policy hoặc event.",
                }
            )
        else:
            cleaned["category"] = category
    elif not partial:
        cleaned["category"] = "general"

    if "is_pinned" in data and data.get("is_pinned") is not None:
        cleaned["is_pinned"] = bool(data.get("is_pinned"))

    return cleaned, errors
