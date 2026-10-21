// Service layer cho Trung tâm thông báo — bọc notificationsApi sẵn có
// trong src/api/index.js (list, markAsRead, markAllAsRead) và chuẩn hoá
// các biến thể phản hồi (mảng thuần / { data, meta, unreadCount }).
import { notificationsApi } from '../../api/index.js';

export async function fetchNotifications(params = {}) {
  const body = await notificationsApi.list({ limit: 100, ...params });
  if (Array.isArray(body)) {
    return { items: body, meta: null, unreadCount: body.filter((n) => !n.isRead).length };
  }
  const items = body?.data ?? body?.items ?? [];
  return {
    items,
    meta: body?.meta ?? null,
    unreadCount: body?.unreadCount ?? items.filter((n) => !n.isRead).length,
  };
}

export async function markNotificationRead(id) {
  return notificationsApi.markAsRead(id);
}

export async function markAllNotificationsRead() {
  return notificationsApi.markAllAsRead();
}
