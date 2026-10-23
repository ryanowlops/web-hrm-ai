import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import PageLoading from './PageLoading.jsx';

// Guard LẶNG cho các route con trong AppLayout, theo role và/hoặc yêu cầu
// tài khoản có gắn hồ sơ nhân viên (needsEmployee).
//
// Khác ProtectedRoute (bảo vệ phiên đăng nhập; khi sai role hiện thẻ
// "Không có quyền truy cập"): ở đây màn hình không thuộc về người dùng thì
// ẨN HẲN — chuyển thẳng về trang tổng quan, không hiện trang/banner lỗi.
// Route cha đã được ProtectedRoute bọc nên phiên đăng nhập luôn được đảm
// bảo trước khi tới guard này; guard chỉ quyết định hiển thị hay không.
//
// Cách dùng (trong router.jsx, qua hàm guardedPage):
//   <RouteGuard roles={['admin', 'hr']}><Page /></RouteGuard>
//   <RouteGuard needsEmployee><Page /></RouteGuard>
export default function RouteGuard({ children, roles, needsEmployee }) {
  const { user, loading } = useAuth();

  // Đang khôi phục phiên (chưa rõ user) thì hiện skeleton như
  // ProtectedRoute vẫn làm, tránh chuyển hướng oan.
  if (loading || !user) {
    return <PageLoading />;
  }

  if (Array.isArray(roles) && roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  // Chương trình điểm thưởng / hành trình cá nhân chỉ dành cho tài khoản
  // có gắn hồ sơ nhân viên; tài khoản thuần hệ thống (vd admin) bị ẩn.
  if (needsEmployee && !user.employeeId) {
    return <Navigate to="/" replace />;
  }

  return children;
}
