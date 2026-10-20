import { Suspense, lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute.jsx';
import AppLayout from '../layouts/AppLayout.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';

// ---------------------------------------------------------------------------
// QUY ƯỚC ROUTE → PAGE (các worker FE khác phải tạo page đúng path này)
// Mọi page đều nạp bằng React.lazy để code-splitting theo route.
//
// Route công khai (không cần đăng nhập):
//   /login                  -> features/auth/pages/LoginPage.jsx
//   /jobs                   -> features/recruitment/pages/PublicJobsPage.jsx
//
// Route trong AppLayout (bắt buộc đăng nhập, mọi role trừ khi ghi chú thêm):
//   /                       -> features/dashboard/pages/DashboardPage.jsx
//   /employees              -> features/employees/pages/EmployeeListPage.jsx
//   /employees/:id          -> features/employees/pages/EmployeeDetailPage.jsx
//   /departments            -> features/departments/pages/DepartmentListPage.jsx   [admin, hr, manager]
//   /attendance             -> features/attendance/pages/AttendancePage.jsx
//   /leave                  -> features/leave/pages/LeavePage.jsx
//   /payroll                -> features/payroll/pages/PayrollPage.jsx
//   /recruitment            -> features/recruitment/pages/JobListPage.jsx          [admin, hr, manager]
//   /recruitment/:jobId     -> features/recruitment/pages/JobDetailPage.jsx        [admin, hr, manager]
//                               (danh sách ứng viên + AI sàng lọc CV nằm trong trang này)
//   /chatbot                -> features/chatbot/pages/ChatbotPage.jsx
//   /admin                  -> features/admin/pages/AdminPage.jsx                  [admin]
//   *                       -> pages/NotFoundPage.jsx
// ---------------------------------------------------------------------------

const LoginPage = lazy(() => import('../features/auth/pages/LoginPage.jsx'));
const PublicJobsPage = lazy(() => import('../features/public/pages/PublicJobsPage.jsx'));
const DashboardPage = lazy(() => import('../features/dashboard/pages/DashboardPage.jsx'));
const EmployeeListPage = lazy(() => import('../features/employees/pages/EmployeeListPage.jsx'));
const EmployeeDetailPage = lazy(
  () => import('../features/employees/pages/EmployeeDetailPage.jsx'),
);
const DepartmentListPage = lazy(
  () => import('../features/departments/pages/DepartmentListPage.jsx'),
);
const AttendancePage = lazy(() => import('../features/attendance/pages/AttendancePage.jsx'));
const LeavePage = lazy(() => import('../features/leave/pages/LeavePage.jsx'));
const PayrollPage = lazy(() => import('../features/payroll/pages/PayrollPage.jsx'));
const JobListPage = lazy(() => import('../features/recruitment/pages/RecruitmentPage.jsx'));
const JobDetailPage = lazy(() => import('../features/recruitment/pages/JobDetailPage.jsx'));
const ChatbotPage = lazy(() => import('../features/chatbot/pages/ChatbotPage.jsx'));
const AdminPage = lazy(() => import('../features/admin/pages/AdminPage.jsx'));

function PageLoading() {
  return (
    <div role="status" aria-live="polite" style={{ padding: '2rem', textAlign: 'center' }}>
      Đang tải trang…
    </div>
  );
}

function lazyPage(Component) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Component />
    </Suspense>
  );
}

function guardedPage(Component, roles) {
  const page = lazyPage(Component);
  if (!roles) return page;
  return <ProtectedRoute roles={roles}>{page}</ProtectedRoute>;
}

const router = createBrowserRouter([
  // --- Công khai ---
  { path: '/login', element: lazyPage(LoginPage) },
  { path: '/jobs', element: lazyPage(PublicJobsPage) },

  // --- Khu vực đã đăng nhập (AppLayout: sidebar + header + Outlet) ---
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: lazyPage(DashboardPage) },
      { path: 'employees', element: lazyPage(EmployeeListPage) },
      { path: 'employees/:id', element: lazyPage(EmployeeDetailPage) },
      {
        path: 'departments',
        element: guardedPage(DepartmentListPage, ['admin', 'hr', 'manager']),
      },
      { path: 'attendance', element: lazyPage(AttendancePage) },
      { path: 'leave', element: lazyPage(LeavePage) },
      { path: 'payroll', element: lazyPage(PayrollPage) },
      {
        path: 'recruitment',
        element: guardedPage(JobListPage, ['admin', 'hr', 'manager']),
      },
      {
        path: 'recruitment/:jobId',
        element: guardedPage(JobDetailPage, ['admin', 'hr', 'manager']),
      },
      { path: 'chatbot', element: lazyPage(ChatbotPage) },
      { path: 'admin', element: guardedPage(AdminPage, ['admin']) },
    ],
  },

  { path: '*', element: <NotFoundPage /> },
]);

export default router;
