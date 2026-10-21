import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Skeleton,
  StatCard,
} from '../../../components/ui';
import {
  IconCalendar,
  IconClock,
  IconSparkles,
  IconWallet,
} from '../../../components/icons.jsx';
import { useAuth } from '../../../app/AuthContext.jsx';
import {
  getLeaderboard,
  getMyBadges,
  getMyKudos,
  getMyPoints,
  getMyYear,
  parseApiError,
} from '../services';

// ============================================================
// Trang "Hành trình của tôi" — route /my-journey (mở rộng v4, mục 3)
// Chỉ hiển thị dữ liệu của chính người đang đăng nhập:
//  - Hàng số liệu: chuỗi đúng giờ, tổng ngày công năm, điểm thưởng, kudo.
//  - Bản đồ nhiệt chấm công cả năm kiểu GitHub (CSS grid thuần).
//  - Huy hiệu thành tích (gamification) + bảng xếp hạng toàn công ty.
// Nguồn dữ liệu: GET /attendance/my-year (module chấm công),
// /engagement/kudos/mine và các API /gamification/* của Đội GAME.
// ============================================================

const STATUS_META = {
  present: { label: 'Đúng giờ', cls: 'bg-green-500' },
  late: { label: 'Đi muộn', cls: 'bg-amber-400' },
  absent: { label: 'Vắng mặt', cls: 'bg-gray-400' },
  on_leave: { label: 'Nghỉ phép', cls: 'bg-gray-300' },
};

function dateKey(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatTimeHM(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/** Dựng lưới tuần (Thứ 2 → Chủ nhật) phủ trọn năm, kiểu bản đồ nhiệt GitHub. */
function buildYearGrid(year) {
  const jan1 = new Date(year, 0, 1);
  const startOffset = (jan1.getDay() + 6) % 7; // số ô lùi về Thứ 2 của tuần chứa 1/1
  const gridStart = new Date(year, 0, 1 - startOffset);
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInYear = isLeap ? 366 : 365;
  const weeks = Math.ceil((startOffset + daysInYear) / 7);
  const monthLabels = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks; w += 1) {
    const monday = new Date(gridStart);
    monday.setDate(gridStart.getDate() + w * 7);
    // Nhãn tháng lấy theo ngày đầu tiên thuộc năm trong tuần đó.
    const probe = new Date(monday);
    while (probe.getFullYear() < year && probe.getDate()) {
      probe.setDate(probe.getDate() + 1);
      if (probe.getDay() === 1) break;
    }
    const m = probe.getFullYear() === year ? probe.getMonth() : monday.getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ week: w, label: `Th${m + 1}` });
      lastMonth = m;
    }
  }
  return { gridStart, weeks, monthLabels };
}

function Heatmap({ year, days }) {
  const { gridStart, weeks, monthLabels } = useMemo(() => buildYearGrid(year), [year]);
  const byDate = useMemo(() => {
    const map = new Map();
    (days || []).forEach((d) => map.set(d.date, d));
    return map;
  }, [days]);
  const todayKey = dateKey(new Date());

  const cells = [];
  for (let w = 0; w < weeks; w += 1) {
    for (let dow = 0; dow < 7; dow += 1) {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + w * 7 + dow);
      const key = dateKey(date);
      const inYear = date.getFullYear() === year;
      const record = inYear ? byDate.get(key) : null;
      const isToday = key === todayKey;
      const isWeekend = dow >= 5;
      const isFuture = key > todayKey;

      let cls = 'bg-gray-100'; // ngày thường chưa có dữ liệu
      if (!inYear) cls = 'bg-transparent';
      else if (record && STATUS_META[record.status]) cls = STATUS_META[record.status].cls;
      else if (isFuture) cls = 'bg-gray-50';
      else if (isWeekend) cls = 'bg-gray-50';

      let title = '';
      if (inYear) {
        const dateText = date.toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        if (record) {
          const meta = STATUS_META[record.status];
          title = `${dateText} — ${meta ? meta.label : record.status}`;
          if (record.check_in) title += ` · Vào ${formatTimeHM(record.check_in)}`;
          if (record.check_out) title += ` · Ra ${formatTimeHM(record.check_out)}`;
        } else {
          title = `${dateText} — Chưa có dữ liệu chấm công`;
        }
      }

      cells.push(
        <div
          key={key}
          title={title || undefined}
          className={`h-3 w-3 rounded-[3px] ${cls} ${isToday ? 'ring-2 ring-gray-900' : ''}`}
        />,
      );
    }
  }

  const labelByWeek = new Map(monthLabels.map((m) => [m.week, m.label]));
  const dayLabels = ['T2', '', 'T4', '', 'T6', '', 'CN'];

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="inline-block min-w-full">
          {/* Nhãn tháng */}
          <div className="mb-1 flex pl-7" aria-hidden="true">
            {Array.from({ length: weeks }, (_, w) => (
              <div key={w} className="w-[15px] shrink-0 text-[10px] leading-4 text-gray-400">
                {labelByWeek.get(w) || ''}
              </div>
            ))}
          </div>
          <div className="flex gap-1.5">
            {/* Nhãn thứ trong tuần */}
            <div
              className="grid shrink-0 gap-[3px] pt-0 text-right text-[9px] leading-3 text-gray-400"
              style={{ gridTemplateRows: 'repeat(7, 12px)' }}
              aria-hidden="true"
            >
              {dayLabels.map((label, i) => (
                <div key={i} className="flex w-5 items-center justify-end">
                  {label}
                </div>
              ))}
            </div>
            {/* Lưới ô ngày: chạy theo cột (mỗi cột = 1 tuần) */}
            <div
              className="grid gap-[3px]"
              style={{
                gridTemplateRows: 'repeat(7, 12px)',
                gridAutoFlow: 'column',
                gridAutoColumns: '12px',
              }}
              role="img"
              aria-label={`Bản đồ nhiệt chấm công năm ${year}`}
            >
              {cells}
            </div>
          </div>
        </div>
      </div>
      {/* Chú thích màu */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] bg-green-500" /> Đúng giờ
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] bg-amber-400" /> Đi muộn
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] bg-gray-400" /> Vắng mặt
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] bg-gray-300" /> Nghỉ phép
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] bg-gray-100 ring-1 ring-inset ring-gray-200" /> Chưa có dữ liệu
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] bg-white ring-2 ring-gray-900" /> Hôm nay
        </span>
      </div>
    </div>
  );
}

function lbName(item) {
  return (
    item?.employee?.full_name || item?.employee_name || item?.full_name || item?.name || '—'
  );
}

function lbDepartment(item) {
  const dept = item?.employee?.department ?? item?.department;
  if (dept && typeof dept === 'object') return dept.name || '';
  if (typeof dept === 'string') return dept;
  return item?.department_name || item?.employee?.department_name || '';
}

function lbEmployeeId(item) {
  const id = item?.employee?.id ?? item?.employee_id ?? null;
  return id == null ? null : Number(id);
}

export default function JourneyPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const year = new Date().getFullYear();
  const myEmployeeId = user?.employeeId != null ? Number(user.employeeId) : null;

  const yearQuery = useQuery({
    queryKey: ['journey', 'my-year', year],
    queryFn: () => getMyYear(year),
  });
  const pointsQuery = useQuery({
    queryKey: ['gamification', 'my-points'],
    queryFn: getMyPoints,
  });
  const kudosQuery = useQuery({
    queryKey: ['engagement', 'kudos-mine'],
    queryFn: getMyKudos,
  });
  const badgesQuery = useQuery({
    queryKey: ['gamification', 'my-badges'],
    queryFn: getMyBadges,
  });
  const leaderboardQuery = useQuery({
    queryKey: ['gamification', 'leaderboard', 10],
    queryFn: () => getLeaderboard(10),
  });

  const yearData = yearQuery.data;
  const summary = yearData?.summary;
  const points = pointsQuery.data;
  const kudos = kudosQuery.data;
  const badges = badgesQuery.data || [];
  const leaderboard = leaderboardQuery.data || [];

  return (
    <div className="page-shell">
      <PageHeader
        title="Hành trình của tôi"
        subtitle={`Nhìn lại chặng đường làm việc trong năm ${year}: chuyên cần, điểm thưởng, huy hiệu và vị trí của bạn trong công ty.`}
        actions={
          <Button variant="primary" onClick={() => navigate('/rewards')}>
            Đổi điểm lấy quà
          </Button>
        }
      />

      {yearQuery.isError && (
        <Alert tone="error" className="mb-5">
          {parseApiError(yearQuery.error, 'Không tải được dữ liệu chấm công.')}
          <button
            type="button"
            className="ml-2 font-medium underline"
            onClick={() => yearQuery.refetch()}
          >
            Thử lại
          </button>
        </Alert>
      )}

      {/* Hàng số liệu tổng quan */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {yearQuery.isLoading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-[104px] w-full rounded-xl" />
            ))}
          </>
        ) : (
          <>
            <StatCard
              icon={<IconClock size={18} />}
              label="Chuỗi đúng giờ hiện tại"
              value={summary ? `${summary.current_streak} ngày` : '—'}
              sub={
                summary
                  ? `Kỷ lục của bạn: ${summary.best_streak} ngày liên tiếp`
                  : 'Chưa có dữ liệu'
              }
            />
            <StatCard
              icon={<IconCalendar size={18} />}
              label={`Tổng ngày công năm ${year}`}
              value={summary ? `${summary.total_days} ngày` : '—'}
              sub={
                summary
                  ? `Đúng giờ ${summary.on_time_days} ngày · Đi muộn ${summary.late_days} ngày`
                  : 'Chưa có dữ liệu'
              }
            />
            <StatCard
              icon={<IconWallet size={18} />}
              label="Điểm thưởng của tôi"
              value={
                pointsQuery.isLoading
                  ? '…'
                  : points && typeof points.balance === 'number'
                    ? points.balance
                    : '—'
              }
              sub={
                points && typeof points.total_earned === 'number'
                  ? `Đã kiếm ${points.total_earned} điểm · Đã tiêu ${points.total_spent ?? 0} điểm`
                  : 'Điểm từ kudo, đào tạo và ngày đúng giờ'
              }
            />
            <StatCard
              icon={<IconSparkles size={18} />}
              label="Kudo đã nhận"
              value={kudosQuery.isLoading ? '…' : kudos ? kudos.receivedCount : '—'}
              sub={
                kudos
                  ? `Bạn cũng đã tặng ${kudos.givenCount} kudo cho đồng nghiệp`
                  : 'Lời ghi nhận từ đồng nghiệp'
              }
            />
          </>
        )}
      </div>

      {/* Bản đồ nhiệt chấm công */}
      <Card className="mt-5">
        <CardHeader
          title={`Bản đồ chấm công năm ${year}`}
          subtitle="Mỗi ô là một ngày — màu xanh là đi làm đúng giờ. Di chuột lên ô để xem chi tiết ngày."
        />
        <CardBody>
          {yearQuery.isLoading ? (
            <Skeleton className="h-[168px] w-full" />
          ) : yearData && yearData.days.length === 0 ? (
            <EmptyState
              icon={<IconCalendar size={26} />}
              title="Chưa có dữ liệu chấm công trong năm nay"
              description="Khi bạn bắt đầu chấm công, bản đồ hành trình sẽ được tô màu dần theo từng ngày làm việc."
            />
          ) : yearData ? (
            <Heatmap year={yearData.year} days={yearData.days} />
          ) : null}
        </CardBody>
      </Card>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Huy hiệu của tôi */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Huy hiệu của tôi"
            subtitle="Thành tích tự động ghi nhận từ dữ liệu chấm công, học tập và gắn kết."
          />
          <CardBody>
            {badgesQuery.isLoading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-[92px] w-full" />
                ))}
              </div>
            ) : badgesQuery.isError ? (
              <Alert tone="error">
                {parseApiError(badgesQuery.error, 'Không tải được danh sách huy hiệu.')}
                <button
                  type="button"
                  className="ml-2 font-medium underline"
                  onClick={() => badgesQuery.refetch()}
                >
                  Thử lại
                </button>
              </Alert>
            ) : badges.length === 0 ? (
              <EmptyState
                icon={<IconSparkles size={26} />}
                title="Chưa có huy hiệu nào"
                description="Huy hiệu sẽ xuất hiện khi hệ thống ghi nhận thành tích đầu tiên của bạn."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {badges.map((badge) => (
                  <div
                    key={badge.key || badge.name}
                    className={`flex items-start gap-3 rounded-xl border p-4 ${
                      badge.earned
                        ? 'border-gray-200 bg-white'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <span
                      className={`text-3xl leading-none ${badge.earned ? '' : 'opacity-40 grayscale'}`}
                      aria-hidden="true"
                    >
                      {badge.emoji || '🏅'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            badge.earned ? 'text-gray-900' : 'text-gray-500'
                          }`}
                        >
                          {badge.name}
                        </span>
                        {badge.earned ? (
                          <Badge tone="green" dot>
                            Đã đạt
                          </Badge>
                        ) : (
                          <Badge tone="slate">Chưa đạt</Badge>
                        )}
                      </div>
                      {badge.description && (
                        <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
                          {badge.description}
                        </p>
                      )}
                      {!badge.earned && badge.progress_text && (
                        <p className="mt-1 text-[13px] font-medium text-gray-600">
                          {badge.progress_text}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Xếp hạng công ty */}
        <Card>
          <CardHeader
            title="Xếp hạng công ty"
            subtitle="Top 10 theo tổng điểm đã kiếm"
            actions={
              <Button variant="secondary" onClick={() => navigate('/rewards')}>
                Cửa hàng quà
              </Button>
            }
          />
          <CardBody>
            {leaderboardQuery.isLoading ? (
              <div className="space-y-2.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : leaderboardQuery.isError ? (
              <Alert tone="error">
                {parseApiError(leaderboardQuery.error, 'Không tải được bảng xếp hạng.')}
                <button
                  type="button"
                  className="ml-2 font-medium underline"
                  onClick={() => leaderboardQuery.refetch()}
                >
                  Thử lại
                </button>
              </Alert>
            ) : leaderboard.length === 0 ? (
              <EmptyState
                icon={<IconSparkles size={26} />}
                title="Chưa có dữ liệu xếp hạng"
                description="Bảng xếp hạng sẽ hình thành khi mọi người bắt đầu tích điểm."
              />
            ) : (
              <ol className="divide-y divide-gray-100">
                {leaderboard.map((item, idx) => {
                  const isMe =
                    myEmployeeId != null && lbEmployeeId(item) === myEmployeeId;
                  return (
                    <li
                      key={`${lbEmployeeId(item) ?? 'x'}-${idx}`}
                      className={`flex items-center gap-3 px-2 py-2.5 ${
                        isMe ? 'rounded-lg bg-brand-50' : ''
                      }`}
                    >
                      <span
                        className={`w-6 shrink-0 text-center text-sm font-semibold tabular-nums ${
                          idx < 3 ? 'text-brand-700' : 'text-gray-400'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-gray-900">
                            {lbName(item)}
                          </span>
                          {isMe && <Badge tone="blue">Bạn</Badge>}
                        </div>
                        {lbDepartment(item) && (
                          <div className="truncate text-[13px] text-gray-500">
                            {lbDepartment(item)}
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                        {(item?.total_earned ?? 0).toLocaleString('vi-VN')}
                        <span className="ml-1 text-xs font-normal text-gray-400">điểm</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
