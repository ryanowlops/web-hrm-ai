// Trang Báo cáo điều hành — route /briefing (v6 mục 4.3, chỉ Admin/HR).
// Số liệu do server gom từ các module sở hữu (LLM không tự nghĩ số); phần
// văn xuôi ghi nhãn nguồn trung thực: "ai" (AI viết quanh gói số) hoặc
// "template" (bản mẫu tự động dựng từ cùng gói số). Trang luôn hiển thị
// kèm BẢNG SỐ LIỆU GỐC để lãnh đạo đối chiếu với phần diễn giải.
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  Select,
  Skeleton,
} from '../../components/ui';
import { IconChart, IconFileText } from '../../components/icons.jsx';
import { formatDate, formatDateTime } from '../../lib/format';
import {
  generateBriefing,
  getBriefingHistory,
  getLatestBriefing,
  parseApiError,
} from './services';

const PERIOD_OPTIONS = [
  { value: 'week', label: 'Theo tuần' },
  { value: 'month', label: 'Theo tháng' },
];

const SOURCE_META = {
  ai: { label: 'Văn xuôi do AI viết', tone: 'green' },
  template: { label: 'Bản mẫu tự động (chưa dùng AI)', tone: 'amber' },
};

function todayInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatRate(value) {
  if (value === null || value === undefined) return 'Chưa có dữ liệu';
  return `${String(value).replace('.', ',')}%`;
}

function numberRows(briefing) {
  const n = briefing?.numbers || {};
  const att = n.attendance || {};
  const leave = n.leave || {};
  const rec = n.recruitment || {};
  const eng = n.engagement || {};
  const enps = eng.enps;
  return [
    { label: 'Kỳ báo cáo', value: `${formatDate(n.period_start)} – ${formatDate(n.period_end)}` },
    { label: 'Tổng nhân sự hiện hành', value: n.headcount_total ?? '—' },
    { label: 'Nhân viên vào mới trong kỳ', value: n.new_hires ?? '—' },
    { label: 'Đã hoàn tất nghỉ việc trong kỳ', value: n.departures ?? '—' },
    { label: 'Bản ghi chấm công trong kỳ', value: att.total_records ?? '—' },
    { label: 'Lượt đúng giờ / đi muộn / vắng / nghỉ phép', value: `${att.present ?? 0} / ${att.late ?? 0} / ${att.absent ?? 0} / ${att.on_leave ?? 0}` },
    { label: 'Tỉ lệ đúng giờ', value: formatRate(att.on_time_rate) },
    { label: 'Đơn nghỉ đang chờ duyệt', value: leave.pending_requests ?? '—' },
    { label: 'Đơn nghỉ đã duyệt (bắt đầu trong kỳ)', value: leave.approved_in_period ?? '—' },
    { label: 'Tin tuyển dụng đang mở', value: rec.open_job_postings ?? '—' },
    { label: 'Ứng viên nộp mới trong kỳ', value: rec.new_candidates ?? '—' },
    { label: 'Lượt kudos trong kỳ', value: eng.kudos_in_period ?? '—' },
    {
      label: 'eNPS gần nhất',
      value: enps
        ? `${enps.score} điểm — “${enps.survey_title}” (${enps.responses} phản hồi)`
        : 'Chưa có dữ liệu',
    },
    {
      label: `Nhân viên nguy cơ nghỉ việc cao (cửa sổ ${n.attrition_window_days ?? 60} ngày)`,
      value: n.attrition_high_risk ?? '—',
    },
  ];
}

export default function BriefingPage() {
  const [period, setPeriod] = useState('month');
  const [refDate, setRefDate] = useState(todayInputValue());
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const loadHistory = useCallback(async () => {
    try {
      const items = await getBriefingHistory({ limit: 20 });
      setHistory(Array.isArray(items) ? items : []);
    } catch {
      /* lịch sử là phụ trợ — lỗi thì bỏ qua */
    }
  }, []);

  const loadLatest = useCallback(async (selectedPeriod) => {
    setLoadingLatest(true);
    setError('');
    try {
      const briefing = await getLatestBriefing(selectedPeriod);
      setCurrent(briefing);
    } catch (err) {
      if (err?.response?.status === 404 || err?.responseData?.error?.code === 'BRIEFING_NOT_FOUND') {
        setCurrent(null);
      } else {
        setError(parseApiError(err, 'Không tải được báo cáo gần nhất.'));
      }
    } finally {
      setLoadingLatest(false);
    }
  }, []);

  useEffect(() => {
    loadLatest(period);
  }, [period, loadLatest]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const briefing = await generateBriefing({ period, refDate: refDate || undefined });
      setCurrent(briefing);
      await loadHistory();
    } catch (err) {
      setError(parseApiError(err, 'Không tạo được báo cáo. Vui lòng thử lại.'));
    } finally {
      setGenerating(false);
    }
  };

  const sourceMeta = current ? SOURCE_META[current.source] || SOURCE_META.template : null;
  const rows = current ? numberRows(current) : [];

  return (
    <div className="page-shell">
      <PageHeader
        title="Báo cáo điều hành"
        subtitle="Bản tin nhân sự theo tuần/tháng: số liệu gom trực tiếp từ các module nghiệp vụ, phần diễn giải do AI viết quanh đúng các số đó (hoặc bản mẫu tự động khi AI không khả dụng)."
      />

      <Card className="mb-5">
        <div className="flex flex-wrap items-end gap-3 px-5 py-4">
          <FormField label="Kỳ báo cáo">
            <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-44">
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Ngày neo kỳ">
            <Input
              type="date"
              value={refDate}
              onChange={(e) => setRefDate(e.target.value)}
              className="w-48"
            />
          </FormField>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? 'Đang tạo báo cáo…' : 'Tạo báo cáo'}
          </Button>
          <p className="w-full text-xs text-gray-400">
            Kỳ được tính theo ngày neo: tuần là tuần chứa ngày đó (thứ 2 – chủ nhật), tháng là
            tháng chứa ngày đó.
          </p>
        </div>
      </Card>

      {error && (
        <Alert tone="error" className="mb-5">
          {error}
        </Alert>
      )}

      {loadingLatest ? (
        <Card className="mb-5">
          <div className="space-y-3 px-5 py-5">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </Card>
      ) : !current ? (
        <Card className="mb-5">
          <div className="p-5">
            <EmptyState
              icon={IconFileText}
              title="Chưa có báo cáo cho kỳ này"
              description="Bấm “Tạo báo cáo” để hệ thống gom số liệu hiện tại và soạn bản tin điều hành đầu tiên."
            />
          </div>
        </Card>
      ) : (
        <>
          <Card className="mb-5">
            <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                {current.period === 'week' ? 'Báo cáo tuần' : 'Báo cáo tháng'}
                {current.period_start && current.period_end
                  ? ` · ${formatDate(current.period_start)} – ${formatDate(current.period_end)}`
                  : ''}
              </h2>
              {sourceMeta && <Badge tone={sourceMeta.tone}>{sourceMeta.label}</Badge>}
              <span className="ml-auto text-xs text-gray-400">
                {current.created_at ? `Tạo lúc ${formatDateTime(current.created_at)}` : ''}
                {current.created_by_name ? ` · bởi ${current.created_by_name}` : ''}
              </span>
            </div>
            <div className="space-y-4 px-5 py-5">
              {(current.prose || '').split(/\n\s*\n/).filter(Boolean).map((paragraph, idx) => (
                <p key={idx} className="text-sm leading-relaxed text-gray-700">
                  {paragraph}
                </p>
              ))}
            </div>
          </Card>

          <Card className="mb-5">
            <div className="border-b border-gray-200 px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900">Số liệu gốc để đối chiếu</h3>
              <p className="mt-0.5 text-xs text-gray-400">
                Toàn bộ con số phần diễn giải dựa vào — lấy trực tiếp từ dữ liệu nghiệp vụ tại
                thời điểm tạo báo cáo.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => (
                    <tr key={row.label} className="hover:bg-gray-50">
                      <td className="w-1/2 px-5 py-3 text-gray-500">{row.label}</td>
                      <td className="px-5 py-3 font-medium text-gray-900">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Card>
        <div className="border-b border-gray-200 px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-900">Lịch sử báo cáo</h3>
        </div>
        {history.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={IconChart}
              title="Chưa có báo cáo nào"
              description="Các báo cáo đã tạo sẽ xuất hiện tại đây để xem lại theo từng kỳ."
            />
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {history.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPeriod(item.period);
                    setCurrent(item);
                  }}
                  className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-900">
                    {item.period === 'week' ? 'Tuần' : 'Tháng'}
                    {item.period_start && item.period_end
                      ? ` · ${formatDate(item.period_start)} – ${formatDate(item.period_end)}`
                      : ''}
                  </span>
                  <Badge tone={(SOURCE_META[item.source] || SOURCE_META.template).tone}>
                    {(SOURCE_META[item.source] || SOURCE_META.template).label}
                  </Badge>
                  <span className="ml-auto text-xs text-gray-400">
                    {item.created_at ? formatDateTime(item.created_at) : ''}
                    {item.created_by_name ? ` · ${item.created_by_name}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
