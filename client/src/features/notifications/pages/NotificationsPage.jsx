import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  PageHeader,
  Skeleton,
} from '../../../components/ui';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services';

// ============================================================
// Trung tâm thông báo — route "/notifications" — Design v4
// - Toàn bộ thông báo của người dùng hiện tại, mới nhất trước.
// - Mục chưa đọc: nền brand-50 nhẹ + chấm brand-600; bấm vào một
//   mục sẽ đánh dấu đã đọc ngay (PATCH qua notificationsApi).
// - Nút "Đánh dấu tất cả đã đọc" ở header trang.
// ============================================================

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function errorMessage(error, fallback) {
  return error?.response?.data?.error?.message || fallback;
}

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { items: rows, unreadCount: count } = await fetchNotifications();
      setItems(Array.isArray(rows) ? rows : []);
      setUnreadCount(count || 0);
    } catch (error) {
      setLoadError(errorMessage(error, 'Không tải được danh sách thông báo.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleMarkRead = async (item) => {
    if (item.isRead) return;
    // Cập nhật lạc quan để giao diện phản hồi ngay.
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await markNotificationRead(item.id);
    } catch {
      // Nếu lỗi, tải lại để đồng bộ trạng thái thật từ server.
      load();
    }
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      setLoadError(errorMessage(error, 'Không đánh dấu được tất cả thông báo.'));
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        title="Thông báo"
        subtitle={
          unreadCount > 0 ? `Bạn có ${unreadCount} thông báo chưa đọc.` : 'Tất cả thông báo của bạn ở một nơi.'
        }
        actions={
          <Button
            variant="secondary"
            onClick={handleMarkAll}
            disabled={markingAll || unreadCount === 0}
          >
            {markingAll ? 'Đang đánh dấu...' : 'Đánh dấu tất cả đã đọc'}
          </Button>
        }
      />

      {loading ? (
        <Card aria-hidden="true">
          <div className="divide-y divide-gray-100 px-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="py-4">
                <Skeleton className="h-4 w-64 max-w-full" />
                <Skeleton className="mt-2 h-3.5 w-96 max-w-full" />
              </div>
            ))}
          </div>
        </Card>
      ) : loadError ? (
        <Card>
          <CardBody className="py-5">
            <Alert tone="error">{loadError}</Alert>
            <Button variant="secondary" size="sm" className="mt-4" onClick={load}>
              Thử lại
            </Button>
          </CardBody>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            title="Chưa có thông báo nào"
            description="Khi có thông báo mới — duyệt phép, chốt lương, thông báo công ty — chúng sẽ hiện ở đây."
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-gray-100">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleMarkRead(item)}
                  className={`flex w-full items-start gap-3 px-5 py-4 text-left transition-colors ${
                    item.isRead ? 'bg-white hover:bg-gray-50' : 'bg-brand-50/60 hover:bg-brand-50'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${
                      item.isRead ? 'bg-transparent' : 'bg-brand-600'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      <span
                        className={`text-sm text-gray-900 ${item.isRead ? 'font-medium' : 'font-semibold'}`}
                      >
                        {item.title}
                      </span>
                      {!item.isRead ? (
                        <Badge tone="blue" dot>
                          Mới
                        </Badge>
                      ) : null}
                      <span className="ml-auto shrink-0 text-[13px] tabular-nums text-gray-400">
                        {formatDateTime(item.createdAt)}
                      </span>
                    </span>
                    {item.content ? (
                      <span className="mt-0.5 block text-sm leading-relaxed text-gray-500">
                        {item.content}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
