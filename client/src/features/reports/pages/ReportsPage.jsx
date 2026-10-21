// Trang Báo cáo tháng (Đội F) — hợp đồng thiết kế v4: phẳng, không gradient.
// Dữ liệu: GET /stats/reports/summary (xem features/reports/services.js).
// Biểu đồ Recharts màu phẳng; xuất CSV 3 loại qua blob kèm token.
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Select,
  Skeleton,
  StatCard,
} from '../../../components/ui';
import { downloadReportCsv, getReportSummary, parseApiError } from '../services';
import { formatNumber, formatVND } from '../../../lib/format';
import DeferredMount from '../../../components/motion/DeferredMount.jsx';

// Biểu đồ (recharts) nạp lazy + gắn sau khi trang đã vẽ xong (DeferredMount)
// để trang Báo cáo hiện số liệu trước, biểu đồ theo sau.
const HeadcountChart = lazy(() =>
  import('../components/ReportsCharts.jsx').then((m) => ({ default: m.HeadcountChart })),
);
const PayrollPieChart = lazy(() =>
  import('../components/ReportsCharts.jsx').then((m) => ({ default: m.PayrollPieChart })),
);

const CHART_COLORS = ['#274FEA', '#0DB795', '#F59E0B', '#D0D5DD', '#7C8DB0', '#B54708'];

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function currentMonthYear() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export default function ReportsPage() {
  const initial = useMemo(currentMonthYear, []);
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');
  const [notice, setNotice] = useState('');

  const years = useMemo(() => {
    const list = [];
    for (let y = initial.year - 2; y <= initial.year + 1; y += 1) list.push(y);
    return list;
  }, [initial.year]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const summary = await getReportSummary({ month, year });
      setData(summary);
    } catch (err) {
      setData(null);
      setError(
        err?.response?.status === 403
          ? 'Bạn không có quyền xem báo cáo. Báo cáo dành cho HR, Admin và Manager.'
          : parseApiError(err, 'Không tải được báo cáo tháng.').message,
      );
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const handleDownload = async (type) => {
    setDownloading(type);
    setNotice('');
    try {
      await downloadReportCsv(type, { month, year });
      setNotice('Đã tải file CSV.');
    } catch {
      setNotice('Không tải được file CSV, vui lòng thử lại.');
    } finally {
      setDownloading('');
    }
  };

  const headcountData = data?.headcount?.byDepartment ?? [];
  const payrollData = data?.payroll?.byDepartment ?? [];
  const attendance = data?.attendance;
  const leave = data?.leave;

  return (
    <div className="page-shell">
      <PageHeader
        title="Báo cáo nhân sự"
        subtitle="Tổng hợp nhân sự, chấm công, nghỉ phép và chi phí lương theo tháng. Manager chỉ thấy số liệu phòng ban của mình."
        actions={(
          <>
            <Select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Tháng">
              {MONTHS.map((m) => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </Select>
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Năm">
              {years.map((y) => (
                <option key={y} value={y}>Năm {y}</option>
              ))}
            </Select>
          </>
        )}
      />

      {notice && (
        <Alert tone="info" className="mb-4">{notice}</Alert>
      )}
      {error && (
        <Alert tone="error" className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="secondary" size="sm" onClick={load}>Thử lại</Button>
          </div>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
          </div>
          <Skeleton className="h-80" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Tổng nhân viên"
              value={data.headcount?.total ?? 0}
              sub={`${headcountData.length} phòng ban đang hoạt động`}
            />
            <StatCard
              label="Tỉ lệ chuyên cần tháng"
              value={`${attendance?.attendanceRate ?? 0}%`}
              sub={`${formatNumber(attendance?.totalRecords ?? 0)} bản ghi chấm công`}
            />
            <StatCard
              label="Đơn nghỉ đã duyệt"
              value={leave?.totalRequests ?? 0}
              sub={`Tổng ${formatNumber(leave?.totalDays ?? 0)} ngày nghỉ trong tháng`}
            />
            <StatCard
              label="Chi phí lương"
              value={formatVND(data.payroll?.totalCost ?? 0)}
              sub={data.payroll?.period
                ? `Kỳ lương ${String(data.payroll.period.month).padStart(2, '0')}/${data.payroll.period.year} · ${data.payroll.employeeCount} nhân viên`
                : 'Chưa có kỳ lương nào'}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Nhân sự theo phòng ban" subtitle="Số nhân viên đang làm việc (chưa nghỉ việc)" />
              <CardBody>
                {headcountData.length === 0 ? (
                  <EmptyState title="Chưa có dữ liệu phòng ban" description="Chưa có phòng ban nào trong phạm vi báo cáo." />
                ) : (
                  <DeferredMount fallback={<Skeleton className="h-[300px] w-full" />}>
                    <Suspense fallback={<Skeleton className="h-[300px] w-full" />}>
                      <HeadcountChart data={headcountData} />
                    </Suspense>
                  </DeferredMount>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Chi phí lương theo phòng ban"
                subtitle={data.payroll?.period
                  ? `Kỳ lương ${String(data.payroll.period.month).padStart(2, '0')}/${data.payroll.period.year}${data.payroll.period.status === 'locked' ? ' (đã khoá)' : ' (nháp)'}`
                  : 'Chưa có kỳ lương'}
              />
              <CardBody>
                {payrollData.length === 0 ? (
                  <EmptyState title="Chưa có dữ liệu lương" description="Chưa có kỳ lương nào để tổng hợp chi phí theo phòng ban." />
                ) : (
                  <DeferredMount fallback={<Skeleton className="h-[300px] w-full" />}>
                    <Suspense fallback={<Skeleton className="h-[300px] w-full" />}>
                      <PayrollPieChart data={payrollData} colors={CHART_COLORS} />
                    </Suspense>
                  </DeferredMount>
                )}
                {payrollData.length > 0 && (
                  <ul className="mt-2 space-y-2 border-t border-gray-100 pt-3">
                    {payrollData.map((item, index) => (
                      <li key={item.departmentId ?? item.departmentName} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-gray-700">
                          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                          {item.departmentName}
                        </span>
                        <span className="font-medium tabular-nums text-gray-900">{formatVND(item.totalCost)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Chấm công trong tháng" subtitle="Tổng hợp theo bản ghi công ngày" />
              <CardBody>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Đúng giờ', value: attendance?.present ?? 0, tone: 'green' },
                    { label: 'Đi muộn', value: attendance?.late ?? 0, tone: 'amber' },
                    { label: 'Vắng', value: attendance?.absent ?? 0, tone: 'red' },
                    { label: 'Nghỉ phép', value: attendance?.onLeave ?? 0, tone: 'blue' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] text-gray-500">{item.label}</p>
                        <Badge tone={item.tone} dot />
                      </div>
                      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{formatNumber(item.value)}</p>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Nghỉ phép theo loại" subtitle="Chỉ tính đơn đã duyệt giao với tháng đang xem" />
              <CardBody>
                {(leave?.byType ?? []).length === 0 ? (
                  <EmptyState title="Không có đơn nghỉ đã duyệt" description="Trong tháng này chưa có đơn nghỉ phép nào đã duyệt." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="ui-table">
                      <thead>
                        <tr>
                          <th className="ui-th">Loại nghỉ</th>
                          <th className="ui-th text-right">Số đơn</th>
                          <th className="ui-th text-right">Số ngày</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leave.byType.map((row) => (
                          <tr key={row.leaveType} className="ui-tr">
                            <td className="ui-td font-medium text-gray-900">{row.leaveType}</td>
                            <td className="ui-td text-right tabular-nums">{row.requests}</td>
                            <td className="ui-td text-right tabular-nums">{formatNumber(row.days)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Xuất báo cáo CSV" subtitle="File CSV có BOM UTF-8, mở đúng tiếng Việt bằng Excel" />
            <CardBody>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  loading={downloading === 'attendance'}
                  onClick={() => handleDownload('attendance')}
                >
                  Tải CSV chấm công
                </Button>
                <Button
                  variant="secondary"
                  loading={downloading === 'payroll'}
                  onClick={() => handleDownload('payroll')}
                >
                  Tải CSV lương
                </Button>
                <Button
                  variant="secondary"
                  loading={downloading === 'leave'}
                  onClick={() => handleDownload('leave')}
                >
                  Tải CSV nghỉ phép
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
