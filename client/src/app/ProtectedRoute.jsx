import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

// Bảo vệ route theo phiên đăng nhập và (tùy chọn) danh sách role được phép.
// Đây chỉ là lớp trải nghiệm người dùng — quyền thật luôn do backend kiểm tra.
//
// Cách dùng:
//   <ProtectedRoute><AppLayout /></ProtectedRoute>                 // mọi role đã đăng nhập
//   <ProtectedRoute roles={['admin']}><AdminPage /></ProtectedRoute> // chỉ admin
export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div role="status" aria-live="polite" style={{ padding: '2rem', textAlign: 'center' }}>
        Đang tải phiên đăng nhập…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (Array.isArray(roles) && roles.length > 0 && !roles.includes(user.role)) {
    return (
      <div style={{ padding: '2rem', maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>Không có quyền truy cập</h1>
        <p style={{ color: '#475569', marginBottom: '1.25rem' }}>
          Tài khoản của bạn (vai trò: {user.role || 'không xác định'}) không được phép mở trang
          này. Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ phòng nhân sự hoặc quản trị
          viên hệ thống.
        </p>
        <Link to="/" style={{ color: '#1d4ed8', fontWeight: 600 }}>
          Về trang tổng quan
        </Link>
      </div>
    );
  }

  return children;
}
