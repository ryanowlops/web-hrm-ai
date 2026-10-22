import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import PageLoading from './PageLoading.jsx';
import { Button, Card, CardBody } from '../components/ui';

// Bảo vệ route theo phiên đăng nhập và (tùy chọn) danh sách role được phép.
// Đây chỉ là lớp trải nghiệm người dùng — quyền thật luôn do backend kiểm tra.
//
// Cách dùng:
//   <ProtectedRoute><AppLayout /></ProtectedRoute>                 // mọi role đã đăng nhập
//   <ProtectedRoute roles={['admin']}><AdminPage /></ProtectedRoute> // chỉ admin
export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (loading) {
    // Dùng lại skeleton PageLoading của router thay cho dòng chữ trần.
    return (
      <div className="min-h-dvh bg-gray-50 p-6 lg:p-8">
        <PageLoading />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (Array.isArray(roles) && roles.length > 0 && !roles.includes(user.role)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-50 p-6">
        <Card className="w-full max-w-md">
          <CardBody className="px-6 py-6 text-center">
            <h1 className="text-xl font-semibold text-gray-900">Không có quyền truy cập</h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-500">
              Tài khoản của bạn (vai trò: {user.role || 'không xác định'}) không được phép mở trang
              này. Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ phòng nhân sự hoặc quản trị
              viên hệ thống.
            </p>
            <Button type="button" className="mt-5" onClick={() => navigate('/')}>
              Về trang tổng quan
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  return children;
}
