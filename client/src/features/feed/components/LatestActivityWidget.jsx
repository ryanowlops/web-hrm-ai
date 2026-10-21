import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardHeader, Skeleton } from '../../../components/ui';
import { Icon } from '../../../components/icons.jsx';
import { ACTIVITY_ICON_NAMES, getActivity, timeAgo } from '../services';

// Widget Dashboard "Hoạt động mới nhất" (mở rộng v4 mục 1): 5 sự kiện
// tổng hợp mới nhất (kudos, thông báo, nhân viên mới, chấm công, bài
// viết). Lỗi tải thì ẩn hẳn để không ảnh hưởng trang Tổng quan.
export default function LatestActivityWidget() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['feed', 'activity-latest'],
    queryFn: () => getActivity({ limit: 5 }),
    staleTime: 60_000,
    retry: 1,
  });

  if (isError) return null;
  const items = Array.isArray(data) ? data : [];

  return (
    <section className="mt-5">
      <Card>
        <CardHeader
          title="Hoạt động mới nhất"
          subtitle="Diễn biến gần đây trên toàn công ty"
          actions={
            <Link
              to="/feed"
              className="text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
            >
              Xem bảng tin
            </Link>
          }
        />
        {isLoading ? (
          <div className="space-y-3 px-5 py-4" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : items.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {items.map((item, idx) => (
              <li key={`${item.type}-${item.at || idx}-${idx}`}>
                <Link
                  to={item.link || '/feed'}
                  className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-gray-50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
                    <Icon name={ACTIVITY_ICON_NAMES[item.type] || 'bell'} size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-gray-700">
                      {item.text}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-gray-400">
                      {timeAgo(item.at)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-gray-500">
            Chưa có hoạt động nào gần đây.
          </p>
        )}
      </Card>
    </section>
  );
}
