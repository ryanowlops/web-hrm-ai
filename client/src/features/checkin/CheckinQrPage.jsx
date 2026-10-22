import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  Skeleton,
} from '../../components/ui';
import {
  getCheckinConfig,
  getCheckinLogs,
  getTodayQr,
  updateCheckinConfig,
} from './services';

// ============================================================
// Trang "Chấm công QR" — route "/checkin-qr" (AppLayout, HR/Admin)
// - QR lớn chứa URL /checkin?d=<ngày>&t=<token> — token xoay theo
//   ngày (HMAC phía server), hết hạn lúc nửa đêm giờ Việt Nam.
// - Mã dự phòng 6 số cho máy không có GPS.
// - Form cấu hình toạ độ văn phòng + bảng nhật ký hôm nay.
// ============================================================

function errorMessage(error, fallback) {
  return error?.response?.data?.error?.message || fallback;
}

function formatCountdown(totalSeconds) {
  const s = Math.max(0, totalSeconds || 0);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export default function CheckinQrPage() {
  const [qr, setQr] = useState(null);
  const [remain, setRemain] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({ lat: '', lon: '', radius_m: '150' });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [locating, setLocating] = useState(false);

  const [logs, setLogs] = useState([]);
  const remainRef = useRef(0);

  const loadQr = useCallback(async () => {
    try {
      const data = await getTodayQr();
      setQr(data);
      setRemain(data?.expires_in_s || 0);
      remainRef.current = data?.expires_in_s || 0;
    } catch (error) {
      setLoadError(errorMessage(error, 'Không tải được mã QR hôm nay.'));
    }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const { items } = await getCheckinLogs();
      setLogs(items || []);
    } catch {
      setLogs([]);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const data = await getCheckinConfig();
      setConfig(data);
      setForm({
        lat: data?.lat ?? '',
        lon: data?.lon ?? '',
        radius_m: String(data?.radius_m ?? 150),
      });
    } catch (error) {
      setSaveError(errorMessage(error, 'Không tải được cấu hình văn phòng.'));
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadQr(), loadConfig(), loadLogs()]);
      setLoading(false);
    })();
  }, [loadQr, loadConfig, loadLogs]);

  // Đếm ngược tới nửa đêm ICT theo expires_in_s server trả; hết giờ tự
  // tải mã mới (ngày mới -> token mới).
  useEffect(() => {
    const timer = setInterval(() => {
      remainRef.current -= 1;
      if (remainRef.current <= 0) {
        loadQr();
        loadLogs();
      } else {
        setRemain(remainRef.current);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [loadQr, loadLogs]);

  const qrUrl = qr
    ? `${window.location.origin}/checkin?d=${qr.date}&t=${qr.token}`
    : '';

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setSaveError('Trình duyệt này không hỗ trợ định vị GPS.');
      return;
    }
    setLocating(true);
    setSaveError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setForm((prev) => ({
          ...prev,
          lat: pos.coords.latitude.toFixed(6),
          lon: pos.coords.longitude.toFixed(6),
        }));
      },
      () => {
        setLocating(false);
        setSaveError(
          'Không lấy được vị trí. Hãy cho phép trang truy cập vị trí trong cài đặt trình duyệt, hoặc nhập toạ độ thủ công (lấy từ Google Maps).',
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const saveConfig = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaveError('');
    setSaveMessage('');
    try {
      const data = await updateCheckinConfig({
        lat: Number(form.lat),
        lon: Number(form.lon),
        radius_m: Number(form.radius_m),
      });
      setConfig(data);
      setSaveMessage('Đã lưu cấu hình văn phòng. Nhân viên có thể chấm công bằng GPS ngay.');
    } catch (error) {
      setSaveError(errorMessage(error, 'Không lưu được cấu hình. Kiểm tra lại toạ độ và bán kính.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chấm công QR + GPS"
        subtitle="Mã QR đặt tại văn phòng, xoay mới mỗi ngày. Nhân viên quét bằng điện thoại và hệ thống tự đối chiếu vị trí GPS với toạ độ văn phòng."
      />

      {loadError && <Alert tone="red">{loadError}</Alert>}
      {config && !config.configured && (
        <Alert tone="amber">
          Văn phòng chưa được cấu hình toạ độ — chấm công bằng GPS đang tạm khóa.
          Hãy cài đặt vị trí văn phòng ở thẻ bên dưới (mã dự phòng 6 số vẫn dùng được).
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Mã QR hôm nay" subtitle={qr ? `Ngày ${qr.date} (giờ Việt Nam)` : ''} />
          <CardBody>
            {qr ? (
              <div className="flex flex-col items-center gap-4 py-2">
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <QRCodeSVG value={qrUrl} size={248} level="M" />
                </div>
                <p className="max-w-sm break-all text-center text-xs text-gray-400">{qrUrl}</p>
                <div className="text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Mã dự phòng 6 số (cho máy không có GPS)
                  </p>
                  <p className="mt-1 text-4xl font-semibold tracking-[0.35em] text-gray-900">
                    {qr.code6}
                  </p>
                </div>
                <Badge tone="blue">
                  Mã tự đổi sau {formatCountdown(remain)}
                </Badge>
              </div>
            ) : (
              <EmptyState title="Chưa có dữ liệu mã QR" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Cấu hình văn phòng"
            subtitle="Toạ độ dùng để đối chiếu GPS của nhân viên. Lấy từ Google Maps hoặc vị trí hiện tại của máy này nếu đang ở văn phòng."
          />
          <CardBody>
            <form className="space-y-4" onSubmit={saveConfig}>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Vĩ độ (lat)">
                  <Input
                    type="number"
                    step="any"
                    required
                    placeholder="10.762622"
                    value={form.lat}
                    onChange={(e) => setForm({ ...form, lat: e.target.value })}
                  />
                </FormField>
                <FormField label="Kinh độ (lon)">
                  <Input
                    type="number"
                    step="any"
                    required
                    placeholder="106.660172"
                    value={form.lon}
                    onChange={(e) => setForm({ ...form, lon: e.target.value })}
                  />
                </FormField>
              </div>
              <FormField label="Bán kính cho phép (mét, 10–2000)">
                <Input
                  type="number"
                  min="10"
                  max="2000"
                  required
                  value={form.radius_m}
                  onChange={(e) => setForm({ ...form, radius_m: e.target.value })}
                />
              </FormField>
              {saveMessage && <Alert tone="green">{saveMessage}</Alert>}
              {saveError && <Alert tone="red">{saveError}</Alert>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={useMyLocation} disabled={locating}>
                  {locating ? 'Đang lấy vị trí…' : 'Dùng vị trí hiện tại của tôi'}
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Đang lưu…' : 'Lưu cấu hình'}
                </Button>
              </div>
              <p className="text-xs leading-relaxed text-gray-400">
                Lưu ý trung thực cho buổi bảo vệ: hệ thống kiểm tra khoảng cách GPS do
                trình duyệt cung cấp, không chặn được giả lập vị trí ở mức hệ điều hành
                như ứng dụng ngân hàng.
              </p>
            </form>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Nhật ký chấm công QR hôm nay"
          actions={
            <Button size="sm" variant="secondary" onClick={loadLogs}>
              Tải lại
            </Button>
          }
        />
        <CardBody>
          {logs.length === 0 ? (
            <EmptyState title="Hôm nay chưa có lượt chấm công QR nào" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-3 font-medium">Nhân viên</th>
                    <th className="py-2 pr-3 font-medium">Phương thức</th>
                    <th className="py-2 pr-3 font-medium">Khoảng cách</th>
                    <th className="py-2 pr-3 font-medium">Kết quả</th>
                    <th className="py-2 pr-3 font-medium">Lý do</th>
                    <th className="py-2 font-medium">Thời gian</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2.5 pr-3">
                        <span className="font-medium text-gray-900">{row.employee_name || '—'}</span>
                        {row.employee_code && (
                          <span className="text-gray-400"> · {row.employee_code}</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-gray-600">
                        {row.method === 'qr_gps' ? 'QR + GPS' : 'Mã 6 số'}
                      </td>
                      <td className="py-2.5 pr-3 text-gray-600">
                        {row.distance_m == null ? '—' : `${row.distance_m}m`}
                      </td>
                      <td className="py-2.5 pr-3">
                        {row.result === 'ok' ? (
                          <Badge tone="green">Thành công</Badge>
                        ) : (
                          <Badge tone="red">Bị từ chối</Badge>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-gray-600">{row.reason || '—'}</td>
                      <td className="py-2.5 text-gray-600">{formatTime(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
