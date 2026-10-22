import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  FormField,
  Input,
  Spinner,
} from '../../components/ui';
import { scanCheckin } from './services';

// ============================================================
// Trang quét chấm công — route "/checkin" (NGOÀI AppLayout, yêu
// cầu đăng nhập). Nhân viên quét QR ở văn phòng bằng camera điện
// thoại -> mở trang này với ?d=<ngày>&t=<token> -> trang tự xin
// quyền vị trí 1 lần rồi POST /checkin/scan. Server tự tính khoảng
// cách tới văn phòng, client không tự khai "đã ở công ty".
// Tab dự phòng: nhập mã 6 số khi máy không có GPS / bị từ chối quyền.
// ============================================================

function todayICT() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function parseScanError(error) {
  const apiError = error?.response?.data?.error;
  const details = Array.isArray(apiError?.details) ? apiError.details : [];
  const distance = details.find((d) => d.field === 'distance_m');
  return {
    code: apiError?.code || 'UNKNOWN',
    message: apiError?.message || 'Không chấm công được. Vui lòng thử lại.',
    distanceM: distance ? Number(distance.message) : null,
  };
}

export default function CheckinPage() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const qrDate = params.get('d') || '';
  const qrToken = params.get('t') || '';

  const [tab, setTab] = useState(qrToken ? 'scan' : 'code');
  const [phase, setPhase] = useState('idle'); // idle|locating|submitting|success|error|gps-denied
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState(null);
  const [code, setCode] = useState('');
  const startedRef = useRef(false);

  const submit = async (payload) => {
    setPhase('submitting');
    setFailure(null);
    try {
      const data = await scanCheckin(payload);
      setResult(data);
      setPhase('success');
    } catch (error) {
      setFailure(parseScanError(error));
      setPhase('error');
    }
  };

  // Luồng tự động khi mở từ QR: xin vị trí đúng 1 lần rồi gửi ngay.
  useEffect(() => {
    if (loading || !user || startedRef.current) return;
    if (!qrToken || tab !== 'scan') return;
    startedRef.current = true;
    if (!navigator.geolocation) {
      setPhase('gps-denied');
      return;
    }
    setPhase('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        submit({
          date: qrDate || todayICT(),
          token: qrToken,
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
      },
      () => setPhase('gps-denied'),
      { enableHighAccuracy: true, timeout: 12000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, qrToken, qrDate, tab]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const submitCode = (event) => {
    event.preventDefault();
    if (code.trim().length !== 6) return;
    submit({ date: todayICT(), token: code.trim() });
  };

  const attendance = result?.attendance || {};
  const statusBadge =
    attendance.status === 'late' ? (
      <Badge tone="amber">Đi muộn</Badge>
    ) : attendance.status === 'present' ? (
      <Badge tone="green">Đúng giờ</Badge>
    ) : null;

  return (
    <div className="flex min-h-screen items-start justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#274FEA] text-lg font-bold text-white">
            H
          </div>
          <div>
            <p className="text-lg font-semibold leading-tight text-gray-900">HRM AI</p>
            <p className="text-sm leading-tight text-gray-500">Chấm công QR + GPS</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-gray-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setTab('scan')}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === 'scan' ? 'bg-[#274FEA] text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Quét QR
          </button>
          <button
            type="button"
            onClick={() => setTab('code')}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === 'code' ? 'bg-[#274FEA] text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Nhập mã 6 số
          </button>
        </div>

        <Card>
          <CardBody className="py-6">
            {phase === 'success' && result ? (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-2xl font-bold text-green-600">
                  ✓
                </div>
                <h1 className="text-xl font-semibold text-gray-900">Check-in thành công</h1>
                <p className="mt-2 text-sm text-gray-600">{result.message}</p>
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-600">
                  <span>Check-in lúc {formatTime(attendance.check_in_at)}</span>
                  {statusBadge}
                </div>
                <Link
                  to="/"
                  className="mt-6 inline-block text-sm font-medium text-[#274FEA] hover:underline"
                >
                  Về trang tổng quan
                </Link>
              </div>
            ) : phase === 'error' && failure ? (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-2xl font-bold text-red-500">
                  !
                </div>
                <h1 className="text-xl font-semibold text-gray-900">Chưa chấm công được</h1>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{failure.message}</p>
                {failure.distanceM != null && (
                  <p className="mt-2 text-sm font-medium text-gray-900">
                    Khoảng cách hiện tại: {failure.distanceM}m
                  </p>
                )}
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {tab === 'scan' && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        startedRef.current = false;
                        setPhase('idle');
                        setTab('code');
                      }}
                    >
                      Nhập mã 6 số thay thế
                    </Button>
                  )}
                  <Link
                    to="/"
                    className="inline-flex items-center rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Về trang tổng quan
                  </Link>
                </div>
              </div>
            ) : tab === 'code' ? (
              <form onSubmit={submitCode} className="space-y-4">
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Nhập mã dự phòng</h1>
                  <p className="mt-1 text-sm leading-relaxed text-gray-500">
                    Mã 6 số hiển thị dưới mã QR ở màn hình văn phòng (đổi mới mỗi ngày).
                    Cách này không cần GPS — phù hợp khi máy không có định vị.
                  </p>
                </div>
                <FormField label="Mã 6 số">
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    className="text-center text-2xl font-semibold tracking-[0.4em]"
                  />
                </FormField>
                <Button type="submit" className="w-full" disabled={code.length !== 6 || phase === 'submitting'}>
                  {phase === 'submitting' ? 'Đang chấm công…' : 'Chấm công'}
                </Button>
              </form>
            ) : phase === 'gps-denied' ? (
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Chưa lấy được vị trí</h1>
                <div className="mt-2 space-y-2 text-sm leading-relaxed text-gray-600">
                  <p>Trình duyệt chưa được cấp quyền vị trí, hoặc máy không có GPS.</p>
                  <p>
                    Cách bật lại: chạm vào biểu tượng ổ khóa ở thanh địa chỉ của trình
                    duyệt → Quyền (Permissions) → Vị trí (Location) → Cho phép, rồi tải
                    lại trang và quét QR lần nữa.
                  </p>
                  <p>Nếu vẫn không được, dùng mã dự phòng 6 số ở tab bên cạnh.</p>
                </div>
                <Button className="mt-5 w-full" onClick={() => setTab('code')}>
                  Chuyển sang nhập mã 6 số
                </Button>
              </div>
            ) : (
              <div className="py-4 text-center">
                <Spinner />
                <p className="mt-4 text-sm text-gray-600">
                  {phase === 'locating'
                    ? 'Đang lấy vị trí GPS của bạn…'
                    : phase === 'submitting'
                      ? 'Đang gửi chấm công…'
                      : qrToken
                        ? 'Đang chuẩn bị…'
                        : 'Trang này cần mở từ mã QR ở văn phòng. Nếu máy không quét được, hãy nhập mã 6 số ở tab bên cạnh.'}
                </p>
                {phase === 'idle' && !qrToken && (
                  <Alert tone="amber" className="mt-4 text-left">
                    Không thấy mã QR trong đường dẫn — mã có thể đã hết hạn (mã đổi
                    mỗi ngày). Hãy quét lại mã QR mới nhất tại văn phòng.
                  </Alert>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        <p className="mt-4 text-center text-xs leading-relaxed text-gray-400">
          Vị trí chỉ được gửi 1 lần khi chấm công để đối chiếu với toạ độ văn phòng;
          hệ thống không theo dõi vị trí liên tục.
        </p>
      </div>
    </div>
  );
}
