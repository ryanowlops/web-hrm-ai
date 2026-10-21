import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge, Card, CardHeader, Skeleton } from '../../../components/ui';
import { getKudos } from '../services';
import { badgeMeta } from '../pages/KudosPage.jsx';
import { formatDateTime, initials } from '../../../lib/format';

// Widget Dashboard "Vinh danh mới nhất" (mở rộng v3 mục 4): 3 kudo gần
// nhất + link sang trang /kudos. Lỗi tải thì ẩn hẳn để không ảnh hưởng
// trang Tổng quan.
export default function LatestKudosWidget() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['engagement', 'kudos-latest'],
    queryFn: () => getKudos({ limit: 3 }),
    staleTime: 60_000,
    retry: 1,
  });

  if (isError) return null;
  const items = data?.items || [];

  return (
    <section className="mt-5">
      <Card>
        <CardHeader
          title="Vinh danh mới nhất"
          subtitle="Những lời ghi nhận đồng nghiệp gửi nhau gần đây"
          actions={
            <Link
              to="/kudos"
              className="text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
            >
              Xem tường vinh danh
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
            {items.map((kudo) => {
              const meta = badgeMeta(kudo.badge);
              return (
                <li key={kudo.id} className="flex items-start gap-3 px-5 py-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[13px] font-semibold text-brand-700">
                    {initials(kudo.to_name || '?')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-gray-900">
                        {kudo.to_name}
                      </span>
                      <Badge tone={meta.tone} dot>
                        {kudo.badge_label || meta.label}
                      </Badge>
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-gray-500">
                      {kudo.message}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-gray-400">
                      {kudo.from_name ? `Từ ${kudo.from_name} · ` : ''}
                      {kudo.created_at ? formatDateTime(kudo.created_at) : ''}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-gray-500">
            Chưa có kudos nào. Hãy gửi lời ghi nhận đầu tiên cho đồng nghiệp.
          </p>
        )}
      </Card>
    </section>
  );
}
