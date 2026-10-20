"""Routes cho Thông báo — tiền tố /api/v1/notifications (docs FR-12).

    GET   /notifications              Danh sách thông báo của tôi (phân trang,
                                      mới nhất trước) + số chưa đọc
    PATCH /notifications/<id>/read    Đánh dấu 1 thông báo đã đọc
    POST  /notifications/read-all     Đánh dấu tất cả thông báo của tôi đã đọc

Bảo mật theo B8: thông báo là dữ liệu riêng tư — truy cập thông báo của
người khác (kể cả đoán id) trả 404 NOT_FOUND, không lộ sự tồn tại.
"""
from flask import jsonify, request

from app.blueprints.auth.guards import load_current_user, require_roles
from app.blueprints.notifications import bp
from app.errors import ApiError
from app.extensions import db
from app.models import Notification


def _serialize(notification: Notification) -> dict:
    return {
        "id": notification.id,
        "type": notification.type,
        "title": notification.title,
        "content": notification.content,
        "isRead": bool(notification.is_read),
        "relatedType": notification.related_type,
        "relatedId": notification.related_id,
        "createdAt": (notification.created_at.isoformat()
                      if notification.created_at else None),
    }


def _unread_count(user_id: int) -> int:
    return (Notification.query
            .filter_by(user_id=user_id, is_read=False).count())


def _own_notification_or_404(user_id: int, notification_id: int) -> Notification:
    notification = db.session.get(Notification, notification_id)
    if notification is None or notification.user_id != user_id:
        raise ApiError(404, "NOT_FOUND", "Không tìm thấy thông báo.")
    return notification


@bp.get("")
@require_roles()
def list_notifications():
    user = load_current_user()
    page = max(1, request.args.get("page", 1, type=int))
    limit = min(max(1, request.args.get("limit", 20, type=int)), 100)
    query = (Notification.query.filter_by(user_id=user.id)
             .order_by(Notification.created_at.desc(), Notification.id.desc()))
    # Lọc nhanh theo trạng thái đọc nếu frontend yêu cầu: ?unread=1
    if request.args.get("unread") in ("1", "true"):
        query = query.filter_by(is_read=False)
    total = query.count()
    rows = query.offset((page - 1) * limit).limit(limit).all()
    return jsonify({
        "data": [_serialize(row) for row in rows],
        "meta": {
            "page": page,
            "limit": limit,
            "totalItems": total,
            "totalPages": (total + limit - 1) // limit if total else 0,
        },
        "unreadCount": _unread_count(user.id),
    })


@bp.patch("/<int:notification_id>/read")
@require_roles()
def mark_as_read(notification_id: int):
    user = load_current_user()
    notification = _own_notification_or_404(user.id, notification_id)
    if not notification.is_read:
        notification.is_read = True
        db.session.commit()
    return jsonify({
        "notification": _serialize(notification),
        "unreadCount": _unread_count(user.id),
    })


@bp.post("/read-all")
@require_roles()
def mark_all_as_read():
    user = load_current_user()
    updated = (Notification.query
               .filter_by(user_id=user.id, is_read=False)
               .update({"is_read": True}, synchronize_session=False))
    db.session.commit()
    return jsonify({"updated": updated, "unreadCount": 0})
