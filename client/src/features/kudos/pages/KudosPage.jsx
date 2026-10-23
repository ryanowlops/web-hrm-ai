import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  FormField,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
} from '../../../components/ui';
import { useAuth } from '../../../app/AuthContext.jsx';
import { getEmployees } from '../../employees/services';
import {
  createKudo,
  getKudos,
  getKudosLeaderboard,
  getMilestones,
  parseApiError,
} from '../services';
import { formatDate, formatDateTime, initials } from '../../../lib/format';

// ============================================================
// Trang Vinh danh — route /kudos (mở rộng v3, mục 4)
// Tab 1: Tường vinh danh (lưới thẻ kudo + bảng xếp hạng tháng)
// Tab 2: Cột mốc (sinh nhật + kỷ niệm ngày vào làm trong tháng)
// ============================================================

export const KUDO_BADGES = [
  { value: 'teamwork', label: 'Đồng đội', tone: 'blue' },
  { value: 'innovation', label: 'Sáng tạo', tone: 'violet' },
  { value: 'dedication', label: 'Tận tâm', tone: 'amber' },
  { value: 'leadership', label: 'Lãnh đạo', tone: 'teal' },
  { value: 'thanks', label: 'Cảm ơn', tone: 'green' },
];

export function badgeMeta(value) {
  return KUDO_BADGES.find((b) => b.value === value) || KUDO_BADGES[4];
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function KudoCard({ kudo }) {
  const meta = badgeMeta(kudo.badge);
  return (
    <Card>
      <CardBody>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
            {initials(kudo.to_name || '?')}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium text-gray-900">{kudo.to_name}</span>
              <Badge tone={meta.tone} dot>
                {kudo.badge_label || meta.label}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-[13px] text-gray-500">
              {kudo.to_code}
              {kudo.to_department ? ` · ${kudo.to_department}` : ''}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-gray-700">{kudo.message}</p>
        <p className="mt-3 border-t border-gray-100 pt-2.5 text-[13px] text-gray-500">
          {kudo.from_name ? (
            <>
              Từ <span className="font-medium text-gray-700">{kudo.from_name}</span>
              {' · '}
            </>
          ) : null}
          {kudo.created_at ? formatDateTime(kudo.created_at) : ''}
        </p>
      </CardBody>
    </Card>
  );
}

function GiveKudoModal({ open, onClose, employees, myEmployeeId }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ to_employee_id: '', badge: 'thanks', message: '' });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      createKudo({
        to_employee_id: Number(form.to_employee_id),
        badge: form.badge,
        message: form.message.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagement', 'kudos'] });
      queryClient.invalidateQueries({ queryKey: ['engagement', 'kudos-leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['engagement', 'kudos-latest'] });
      setForm({ to_employee_id: '', badge: 'thanks', message: '' });
      setError('');
      onClose();
    },
    onError: (err) => setError(parseApiError(err, 'Không tặng được kudos. Vui lòng thử lại.')),
  });

  const recipients = (employees || []).filter((e) => e.id !== myEmployeeId);
  const canSubmit =
    form.to_employee_id && form.message.trim().length > 0 && !mutation.isPending;

  return (
    <Modal
      open={open}
      title="Tặng kudos"
      subtitle="Gửi lời ghi nhận tới đồng nghiệp — kudo sẽ hiện trên tường vinh danh."
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit} loading={mutation.isPending}>
            Tặng kudos
          </Button>
        </>
      }
    >
      {error ? (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      ) : null}
      <div className="space-y-4">
        <FormField label="Người nhận">
          <Select
            value={form.to_employee_id}
            onChange={(e) => setForm((f) => ({ ...f, to_employee_id: e.target.value }))}
          >
            <option value="">— Chọn đồng nghiệp —</option>
            {recipients.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name || e.fullName} ({e.code})
                {e.department_name || e.departmentName ? ` — ${e.department_name || e.departmentName}` : ''}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Loại huy hiệu">
          <Select
            value={form.badge}
            onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))}
          >
            {KUDO_BADGES.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Lời nhắn">
          <Textarea
            rows={4}
            maxLength={1000}
            placeholder="Viết lời cảm ơn / ghi nhận cụ thể…"
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
          />
        </FormField>
      </div>
    </Modal>
  );
}

function LeaderboardCard({ month }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['engagement', 'kudos-leaderboard', month],
    queryFn: () => getKudosLeaderboard(month),
    staleTime: 60_000,
    retry: 1,
  });
  const topReceived = data?.top_received || [];
  const topGivers = data?.top_givers || [];

  return (
    <Card>
      <CardHeader title="Bảng xếp hạng tháng" subtitle="Ghi nhận trong tháng hiện tại" />
      <CardBody>
        {isLoading ? (
          <div className="space-y-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-sm text-gray-500">Không tải được bảng xếp hạng.</p>
        ) : (
          <>
            <p className="text-[13px] font-medium text-gray-500">Nhận nhiều kudos nhất</p>
            {topReceived.length > 0 ? (
              <ol className="mt-2 space-y-2.5">
                {topReceived.slice(0, 5).map((row, idx) => (
                  <li key={row.employee_id} className="flex items-center gap-3">
                    <span className="w-5 shrink-0 text-sm font-semibold tabular-nums text-gray-400">
                      {idx + 1}
                    </span>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[13px] font-semibold text-brand-700">
                      {initials(row.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900">{row.name}</span>
                      {row.department ? (
                        <span className="block truncate text-[13px] text-gray-500">{row.department}</span>
                      ) : null}
                    </span>
                    <Badge tone="blue">{row.count} kudos</Badge>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-gray-500">Chưa có kudos nào trong tháng.</p>
            )}

            <p className="mt-5 border-t border-gray-100 pt-4 text-[13px] font-medium text-gray-500">
              Tặng nhiều nhất
            </p>
            {topGivers.length > 0 ? (
              <ol className="mt-2 space-y-2">
                {topGivers.slice(0, 5).map((row, idx) => (
                  <li key={row.user_id} className="flex items-center gap-3 text-sm">
                    <span className="w-5 shrink-0 font-semibold tabular-nums text-gray-400">{idx + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-gray-700">{row.name}</span>
                    <span className="shrink-0 tabular-nums text-gray-500">{row.count} lần</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-gray-500">Chưa có dữ liệu.</p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function MilestonesTab({ month }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['engagement', 'milestones', month],
    queryFn: () => getMilestones(month),
    staleTime: 60_000,
    retry: 1,
  });
  const birthdays = data?.birthdays || [];
  const anniversaries = data?.anniversaries || [];
  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-');
    return `Tháng ${Number(m)}/${y}`;
  }, [month]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2" aria-hidden="true">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (isError) {
    return (
      <Alert tone="error">
        <span className="font-bold">Không tải được cột mốc</span>
        <br />
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>
          Thử lại
        </Button>
      </Alert>
    );
  }

  const renderRow = (item, right) => (
    <div key={`${item.type}-${item.employee_id}`} className="flex items-center gap-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[13px] font-semibold text-brand-700">
        {initials(item.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-gray-900">{item.name}</span>
        <span className="block truncate text-[13px] text-gray-500">
          {item.code}
          {item.department ? ` · ${item.department}` : ''}
        </span>
      </span>
      <span className="shrink-0 text-[13px] tabular-nums text-gray-500">{right}</span>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title={`Sinh nhật — ${monthLabel}`} subtitle={`${birthdays.length} đồng nghiệp có sinh nhật`} />
        <div className="px-5 py-2">
          {birthdays.length > 0 ? (
            birthdays.map((item) =>
              renderRow(item, `Ngày ${String(item.day).padStart(2, '0')}/${month.slice(5)}`),
            )
          ) : (
            <p className="py-3 text-sm text-gray-500">Không có sinh nhật nào trong tháng này.</p>
          )}
        </div>
      </Card>
      <Card>
        <CardHeader
          title={`Kỷ niệm ngày vào làm — ${monthLabel}`}
          subtitle={`${anniversaries.length} đồng nghiệp tròn năm công tác`}
        />
        <div className="px-5 py-2">
          {anniversaries.length > 0 ? (
            anniversaries.map((item) =>
              renderRow(
                item,
                <>
                  {formatDate(item.date)} · <span className="font-medium text-gray-700">{item.years} năm</span>
                </>,
              ),
            )
          ) : (
            <p className="py-3 text-sm text-gray-500">Chưa có kỷ niệm nào trong tháng này.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function KudosPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('wall');
  const [giveOpen, setGiveOpen] = useState(false);
  const month = currentMonthValue();
  const myEmployeeId = user?.employee_id ?? user?.employeeId ?? null;
  // Tài khoản không gắn hồ sơ nhân viên (vd admin hệ thống) không tham gia
  // tặng/nhận kudos → ẩn hẳn nút + form tặng, chỉ xem tường vinh danh.
  const hasEmployeeProfile = myEmployeeId != null;

  const wallQuery = useQuery({
    queryKey: ['engagement', 'kudos', 'wall'],
    queryFn: () => getKudos({ limit: 60 }),
    staleTime: 30_000,
    retry: 1,
  });
  const employeesQuery = useQuery({
    queryKey: ['employees', 'kudos-picker'],
    queryFn: async () => (await getEmployees({ limit: 100 })).items,
    staleTime: 60_000,
    retry: 1,
    enabled: hasEmployeeProfile,
  });

  const kudos = wallQuery.data?.items || [];

  return (
    <div className="page-shell">
      <PageHeader
        title="Vinh danh"
        subtitle="Tường kudos ghi nhận đóng góp của đồng nghiệp và các cột mốc đáng nhớ trong tháng."
        actions={
          hasEmployeeProfile ? (
            <Button onClick={() => setGiveOpen(true)}>Tặng kudos</Button>
          ) : undefined
        }
      />

      <div className="mb-5 flex gap-2" role="tablist" aria-label="Chọn mục hiển thị">
        {[
          { key: 'wall', label: 'Tường vinh danh' },
          { key: 'milestones', label: 'Cột mốc' },
        ].map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/30 ${
              tab === t.key
                ? 'bg-brand-600 text-white'
                : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'wall' ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="xl:col-span-2">
            {wallQuery.isLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-40" />
                ))}
              </div>
            ) : wallQuery.isError ? (
              <Alert tone="error">
                <span className="font-bold">Không tải được tường vinh danh</span>
                <br />
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => wallQuery.refetch()}
                >
                  Thử lại
                </Button>
              </Alert>
            ) : kudos.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {kudos.map((kudo) => (
                  <KudoCard key={kudo.id} kudo={kudo} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="Chưa có kudos nào"
                description="Hãy là người đầu tiên gửi lời ghi nhận tới đồng nghiệp."
              />
            )}
          </div>
          <LeaderboardCard month={month} />
        </div>
      ) : (
        <MilestonesTab month={month} />
      )}

      {hasEmployeeProfile ? (
        <GiveKudoModal
          open={giveOpen}
          onClose={() => setGiveOpen(false)}
          employees={employeesQuery.data || []}
          myEmployeeId={myEmployeeId}
        />
      ) : null}
    </div>
  );
}
