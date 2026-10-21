// Các cảnh của Màn hình sảnh (v5 mục C). Mỗi cảnh tự chịu trạng thái của
// mình: đang tải -> khung chờ tối; lỗi/thiếu dữ liệu -> cảnh chào rỗng đẹp;
// có dữ liệu -> trình bày chữ lớn, tương phản cao cho màn hình TV.
// Màu: nền navy #0B1B3A, panel trắng mờ (white/5 + ring white/10), điểm
// nhấn brand #274FEA và xanh nhạt #9DB8FF.
import { Icon } from '../../../components/icons.jsx';
import { ACTIVITY_ICON_NAMES } from '../../feed/services';
import { formatDate, initials } from '../../../lib/format';
import { timeAgo } from '../services';

// ---------- Khối dùng chung ----------

export function SceneShell({ eyebrow, title, children }) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9DB8FF]">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-[44px] font-bold leading-tight text-white">{title}</h2>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export function EmptyScene({ eyebrow, title, message }) {
  return (
    <SceneShell eyebrow={eyebrow} title={title}>
      <div className="flex h-full flex-col items-center justify-center text-center">
        <img src="/logo.svg" alt="" className="h-24 w-24 rounded-3xl bg-white p-3" />
        <p className="mt-8 max-w-2xl text-2xl leading-relaxed text-white/70">{message}</p>
      </div>
    </SceneShell>
  );
}

function SceneLoading({ eyebrow, title }) {
  return (
    <SceneShell eyebrow={eyebrow} title={title}>
      <div className="grid h-full grid-cols-2 gap-6" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-3xl bg-white/5 ring-1 ring-white/10" />
        ))}
      </div>
    </SceneShell>
  );
}

function Avatar({ name, size = 'lg' }) {
  const dims =
    size === 'lg'
      ? 'h-24 w-24 text-3xl'
      : size === 'md'
        ? 'h-16 w-16 text-xl'
        : 'h-12 w-12 text-base';
  return (
    <span
      className={`flex ${dims} shrink-0 items-center justify-center rounded-full bg-[#274FEA] font-bold text-white ring-4 ring-white/15`}
    >
      {initials(name || '?')}
    </span>
  );
}

function stateOf(query) {
  if (query.isLoading) return 'loading';
  if (query.isError) return 'error';
  return 'ready';
}

// ---------- Cảnh 1: Vinh danh ----------

const RANK_STYLES = [
  'bg-amber-400 text-[#0B1B3A]',
  'bg-slate-200 text-[#0B1B3A]',
  'bg-amber-700 text-white',
  'bg-white/10 text-white',
  'bg-white/10 text-white',
];

export function SceneCelebration({ kudosQuery, leaderboardQuery }) {
  const eyebrow = 'Vinh danh';
  const title = 'Ghi nhận & tỏa sáng';
  const kudos = kudosQuery.data || [];
  const leaders = leaderboardQuery.data || [];
  const loading = stateOf(kudosQuery) === 'loading' && stateOf(leaderboardQuery) === 'loading';
  if (loading) return <SceneLoading eyebrow={eyebrow} title={title} />;
  if (kudos.length === 0 && leaders.length === 0) {
    return (
      <EmptyScene
        eyebrow={eyebrow}
        title={title}
        message="Chào mừng bạn đến với Web HRM AI — hãy gửi lời ghi nhận đầu tiên cho đồng nghiệp hôm nay."
      />
    );
  }
  const [spotlight, ...restKudos] = kudos;
  return (
    <SceneShell eyebrow={eyebrow} title={title}>
      <div className="grid h-full grid-cols-5 gap-8">
        <div className="col-span-3 flex flex-col gap-6">
          {spotlight ? (
            <div className="rounded-3xl bg-white/5 p-9 ring-1 ring-white/10">
              <div className="flex items-center gap-6">
                <Avatar name={spotlight.toName} />
                <div className="min-w-0">
                  <p className="truncate text-3xl font-bold text-white">{spotlight.toName}</p>
                  <p className="mt-1 text-xl text-white/60">
                    {spotlight.fromName ? `Nhận kudos từ ${spotlight.fromName}` : 'Nhận kudos mới nhất'}
                    {spotlight.createdAt ? ` · ${timeAgo(spotlight.createdAt)}` : ''}
                  </p>
                </div>
                {spotlight.badgeLabel ? (
                  <span className="ml-auto shrink-0 rounded-full bg-[#274FEA] px-5 py-2 text-base font-semibold text-white">
                    {spotlight.badgeLabel}
                  </span>
                ) : null}
              </div>
              <p className="mt-7 text-[34px] font-medium leading-snug text-white">
                “{spotlight.message}”
              </p>
            </div>
          ) : null}
          {restKudos.slice(0, 2).map((kudo) => (
            <div
              key={kudo.id}
              className="flex items-center gap-5 rounded-3xl bg-white/5 px-8 py-5 ring-1 ring-white/10"
            >
              <Avatar name={kudo.toName} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-semibold text-white">
                  {kudo.toName}
                  <span className="ml-3 text-base font-normal text-white/50">
                    {kudo.fromName ? `từ ${kudo.fromName}` : ''}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-lg text-white/65">“{kudo.message}”</p>
              </div>
            </div>
          ))}
        </div>
        <div className="col-span-2 rounded-3xl bg-white/5 p-8 ring-1 ring-white/10">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#9DB8FF]">
            Bảng xếp hạng điểm thưởng
          </p>
          {leaders.length > 0 ? (
            <ol className="mt-6 space-y-4">
              {leaders.map((row, idx) => (
                <li key={row.key} className="flex items-center gap-4">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold ${RANK_STYLES[idx] || RANK_STYLES[4]}`}
                  >
                    {idx + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[22px] font-semibold text-white">
                      {row.name}
                    </span>
                    {row.department ? (
                      <span className="block truncate text-base text-white/50">
                        {row.department}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[26px] font-bold tabular-nums text-white">
                      {row.totalEarned.toLocaleString('vi-VN')}
                    </span>
                    <span className="block text-sm text-white/50">điểm</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-6 text-xl text-white/60">
              Bảng xếp hạng sẽ hình thành khi mọi người bắt đầu tích điểm.
            </p>
          )}
        </div>
      </div>
    </SceneShell>
  );
}

// ---------- Cảnh 2: Cột mốc tháng này ----------

function MilestoneCard({ item, rightText }) {
  return (
    <div className="flex items-center gap-5 rounded-3xl bg-white/5 px-7 py-5 ring-1 ring-white/10">
      <Avatar name={item.name} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-2xl font-semibold text-white">{item.name}</p>
        <p className="truncate text-base text-white/55">
          {item.code}
          {item.department ? ` · ${item.department}` : ''}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-white/10 px-4 py-1.5 text-base font-medium text-[#9DB8FF]">
        {rightText}
      </span>
    </div>
  );
}

export function SceneMilestones({ milestonesQuery }) {
  const eyebrow = 'Cột mốc tháng này';
  const title = 'Sinh nhật & kỷ niệm';
  if (stateOf(milestonesQuery) === 'loading') {
    return <SceneLoading eyebrow={eyebrow} title={title} />;
  }
  const birthdays = milestonesQuery.data?.birthdays || [];
  const anniversaries = milestonesQuery.data?.anniversaries || [];
  if (stateOf(milestonesQuery) === 'error' || (birthdays.length === 0 && anniversaries.length === 0)) {
    return (
      <EmptyScene
        eyebrow={eyebrow}
        title={title}
        message="Tháng này chưa có cột mốc nào — chúc toàn thể đồng nghiệp một tháng làm việc nhiều niềm vui."
      />
    );
  }
  const now = new Date();
  const monthLabel = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  return (
    <SceneShell eyebrow={eyebrow} title={title}>
      <div className="grid h-full grid-cols-2 gap-8">
        <div>
          <p className="mb-5 flex items-center gap-3 text-2xl font-semibold text-white">
            <span aria-hidden="true">🎂</span> Sinh nhật — {monthLabel}
            <span className="text-lg font-normal text-white/50">({birthdays.length})</span>
          </p>
          <div className="space-y-4">
            {birthdays.slice(0, 5).map((item) => (
              <MilestoneCard
                key={item.key}
                item={item}
                rightText={
                  item.date
                    ? formatDate(item.date)
                    : item.day
                      ? `Ngày ${String(item.day).padStart(2, '0')}/${monthLabel.slice(0, 2)}`
                      : ''
                }
              />
            ))}
            {birthdays.length === 0 ? (
              <p className="text-xl text-white/55">Không có sinh nhật nào trong tháng này.</p>
            ) : null}
          </div>
        </div>
        <div>
          <p className="mb-5 flex items-center gap-3 text-2xl font-semibold text-white">
            <span aria-hidden="true">🏅</span> Kỷ niệm ngày vào làm
            <span className="text-lg font-normal text-white/50">({anniversaries.length})</span>
          </p>
          <div className="space-y-4">
            {anniversaries.slice(0, 5).map((item) => (
              <MilestoneCard
                key={item.key}
                item={item}
                rightText={`${item.years ?? ''} năm công tác`.trim()}
              />
            ))}
            {anniversaries.length === 0 ? (
              <p className="text-xl text-white/55">Chưa có kỷ niệm nào trong tháng này.</p>
            ) : null}
          </div>
        </div>
      </div>
    </SceneShell>
  );
}

// ---------- Cảnh 3: Thông báo ----------

export function SceneAnnouncements({ announcementsQuery }) {
  const eyebrow = 'Thông báo công ty';
  const title = 'Tin mới nhất';
  if (stateOf(announcementsQuery) === 'loading') {
    return <SceneLoading eyebrow={eyebrow} title={title} />;
  }
  const items = announcementsQuery.data || [];
  if (stateOf(announcementsQuery) === 'error' || items.length === 0) {
    return (
      <EmptyScene
        eyebrow={eyebrow}
        title={title}
        message="Hiện chưa có thông báo mới — mọi cập nhật chính thức của công ty sẽ xuất hiện tại đây."
      />
    );
  }
  return (
    <SceneShell eyebrow={eyebrow} title={title}>
      <div className="flex h-full flex-col gap-6">
        {items.map((a) => (
          <article key={a.id} className="rounded-3xl bg-white/5 px-9 py-7 ring-1 ring-white/10">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-[#274FEA] px-4 py-1 text-sm font-semibold uppercase tracking-wider text-white">
                {a.categoryLabel}
              </span>
              {a.isPinned ? (
                <span className="rounded-full bg-amber-400 px-4 py-1 text-sm font-semibold uppercase tracking-wider text-[#0B1B3A]">
                  Đã ghim
                </span>
              ) : null}
              <span className="ml-auto text-base text-white/50">
                {a.authorName}
                {a.createdAt ? ` · ${formatDate(a.createdAt)}` : ''}
              </span>
            </div>
            <h3 className="mt-4 text-4xl font-bold leading-snug text-white">{a.title}</h3>
            {a.content ? (
              <p className="mt-3 line-clamp-3 text-xl leading-relaxed text-white/65">{a.content}</p>
            ) : null}
          </article>
        ))}
      </div>
    </SceneShell>
  );
}

// ---------- Cảnh 4: Nhịp công ty ----------

function BigStat({ label, value, sub }) {
  return (
    <div className="rounded-3xl bg-white/5 px-8 py-7 ring-1 ring-white/10">
      <p className="text-base font-semibold uppercase tracking-[0.2em] text-[#9DB8FF]">{label}</p>
      <p className="mt-3 text-7xl font-bold tabular-nums leading-none text-white">{value}</p>
      {sub ? <p className="mt-3 text-lg text-white/55">{sub}</p> : null}
    </div>
  );
}

export function ScenePulse({ overviewQuery, activityQuery }) {
  const eyebrow = 'Nhịp công ty';
  const title = 'Hôm nay tại công ty';
  const loading = stateOf(overviewQuery) === 'loading' && stateOf(activityQuery) === 'loading';
  if (loading) return <SceneLoading eyebrow={eyebrow} title={title} />;
  const o = overviewQuery.data;
  const activity = activityQuery.data || [];
  if (!o && activity.length === 0) {
    return (
      <EmptyScene
        eyebrow={eyebrow}
        title={title}
        message="Chúc một ngày làm việc hiệu quả — số liệu và hoạt động của công ty sẽ cập nhật tại đây."
      />
    );
  }
  return (
    <SceneShell eyebrow={eyebrow} title={title}>
      <div className="grid h-full grid-cols-5 gap-8">
        <div className="col-span-3 grid content-start grid-cols-2 gap-6">
          {o ? (
            <>
              <BigStat label="Tổng nhân viên" value={o.totalEmployees.toLocaleString('vi-VN')} sub={`${o.totalDepartments} phòng ban`} />
              <BigStat
                label="Đang làm hôm nay"
                value={o.presentToday.toLocaleString('vi-VN')}
                sub={o.attendanceRate != null ? `Tỷ lệ chuyên cần ${o.attendanceRate}%` : undefined}
              />
              <BigStat label="Đang nghỉ phép" value={o.onLeaveToday.toLocaleString('vi-VN')} sub="tính đến thời điểm hiện tại" />
              <BigStat label="Đơn chờ duyệt" value={o.pendingLeaveCount.toLocaleString('vi-VN')} sub="đơn nghỉ phép đang xử lý" />
            </>
          ) : (
            <p className="col-span-2 text-xl text-white/60">Chưa tải được số liệu tổng quan.</p>
          )}
        </div>
        <div className="col-span-2 rounded-3xl bg-white/5 p-8 ring-1 ring-white/10">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#9DB8FF]">
            Hoạt động mới nhất
          </p>
          {activity.length > 0 ? (
            <ul className="mt-6 space-y-5">
              {activity.map((item) => (
                <li key={item.key} className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#274FEA]/30 text-[#9DB8FF] ring-1 ring-white/10">
                    <Icon name={ACTIVITY_ICON_NAMES[item.type] || 'bell'} size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg leading-snug text-white/85">{item.text}</span>
                    {item.at ? (
                      <span className="mt-0.5 block text-sm text-white/45">{timeAgo(item.at)}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-xl text-white/60">Chưa có hoạt động nào gần đây.</p>
          )}
        </div>
      </div>
    </SceneShell>
  );
}
