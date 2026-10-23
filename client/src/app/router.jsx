import { Suspense } from 'react';
import { createBrowserRouter, useRouteError } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute.jsx';
import RouteGuard from './RouteGuard.jsx';
import PageLoading from './PageLoading.jsx';
import AppLayout from '../layouts/AppLayout.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';
import { Alert, Button, Card, CardBody } from '../components/ui';
import {
  AdminPage,
  AnnouncementsPage,
  AssetsPage,
  AttendancePage,
  AttritionPage,
  BriefingPage,
  ChatbotPage,
  CheckinPage,
  CheckinQrPage,
  DashboardPage,
  DepartmentListPage,
  DisplayPage,
  DocumentsPage,
  EmployeeDetailPage,
  EmployeeListPage,
  FeedPage,
  JobDetailPage,
  JobListPage,
  JourneyPage,
  KudosPage,
  LeavePage,
  LoginPage,
  MockInterviewPage,
  NotificationsPage,
  OffboardingPage,
  OnboardingPage,
  OrgChartPage,
  PayrollPage,
  PerformancePage,
  PublicJobsPage,
  ReportsPage,
  RewardsPage,
  ShiftsPage,
  SkillsPage,
  SurveysPage,
  TeamCalendarPage,
  TrainingPage,
} from './pages.js';

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
//   /employees              -> features/employees/pages/EmployeeListPage.jsx      [admin, hr, manager]
//   /employees/:id          -> features/employees/pages/EmployeeDetailPage.jsx    [admin, hr, manager]
//   /departments            -> features/departments/pages/DepartmentListPage.jsx   [admin, hr, manager]
//   /attendance             -> features/attendance/pages/AttendancePage.jsx
//   /leave                  -> features/leave/pages/LeavePage.jsx
//   /payroll                -> features/payroll/pages/PayrollPage.jsx
//   /recruitment            -> features/recruitment/pages/JobListPage.jsx          [admin, hr, manager]
//   /recruitment/:jobId     -> features/recruitment/pages/JobDetailPage.jsx        [admin, hr, manager]
//                               (danh sách ứng viên + AI sàng lọc CV nằm trong trang này)
//   /chatbot                -> features/chatbot/pages/ChatbotPage.jsx
//   /admin                  -> features/admin/pages/AdminPage.jsx                  [admin]
//   /performance            -> features/performance/pages/PerformancePage.jsx     (mở rộng v2)
//   /onboarding             -> features/onboarding/pages/OnboardingPage.jsx       (mở rộng v2)
//   /org-chart              -> features/orgchart/pages/OrgChartPage.jsx           (mở rộng v2) [admin, hr, manager]
//   /team-calendar          -> features/calendar/pages/TeamCalendarPage.jsx       (mở rộng v2) [admin, hr, manager]
//   /skills                 -> features/skills/pages/SkillsPage.jsx               (mở rộng v5) — mọi role: có tab "Kỹ năng của tôi" tự cập nhật
//   /assets                 -> features/assets/pages/AssetsPage.jsx               (mở rộng v2)
//   /training               -> features/training/pages/TrainingPage.jsx           (mở rộng v2)
//   /announcements          -> features/announcements/pages/AnnouncementsPage.jsx (mở rộng v2)
//   /notifications          -> features/notifications/pages/NotificationsPage.jsx (mở rộng v2)
//   /reports                -> features/reports/pages/ReportsPage.jsx             (mở rộng v2) [admin, hr, manager]
//   *                       -> pages/NotFoundPage.jsx
// ---------------------------------------------------------------------------

// Trang lỗi cấp route: hiện khi một route con ném lỗi (thường gặp nhất là
// chunk JS cũ bị 404 sau khi deploy bản mới). Đưa người dùng về trạng thái
// an toàn bằng nút "Tải lại trang" thay vì màn hình lỗi mặc định.
function RouteErrorPage() {
  const error = useRouteError();
  // Ghi log để tiện truy vết; người dùng chỉ thấy thông điệp thân thiện.
  console.error('Lỗi route:', error);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gray-50 p-6">
      <Card className="w-full max-w-md">
        <CardBody className="px-6 py-6">
          <h1 className="text-xl font-semibold text-gray-900">Đã xảy ra lỗi</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            Trang không tải được — có thể hệ thống vừa được cập nhật lên phiên bản mới.
          </p>
          <Alert tone="error" className="mt-4">
            Vui lòng tải lại trang để tiếp tục. Dữ liệu đã lưu của bạn không bị ảnh hưởng.
          </Alert>
          <Button type="button" className="mt-5" onClick={() => window.location.reload()}>
            Tải lại trang
          </Button>
        </CardBody>
      </Card>
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

// Guard lặng cho route con trong AppLayout: sai role (hoặc thiếu hồ sơ
// nhân viên khi route gắn needsEmployee) thì chuyển thẳng về "/" — ẩn hẳn
// màn hình không thuộc về người dùng, không hiện trang lỗi. Phiên đăng
// nhập vẫn do ProtectedRoute ở route cha đảm bảo.
function guardedPage(Component, roles, { needsEmployee } = {}) {
  const page = lazyPage(Component);
  if (!roles && !needsEmployee) return page;
  return (
    <RouteGuard roles={roles} needsEmployee={needsEmployee}>
      {page}
    </RouteGuard>
  );
}

const router = createBrowserRouter([
  // --- Công khai ---
  { path: '/login', element: lazyPage(LoginPage) },
  { path: '/jobs', element: lazyPage(PublicJobsPage) },
  // --- Mở rộng v5: phỏng vấn thử AI (công khai như /jobs) ---
  { path: '/mock-interview', element: lazyPage(MockInterviewPage) },

  // --- Mở rộng v5: màn hình sảnh TV (đã đăng nhập, không AppLayout) ---
  {
    path: '/display',
    element: <ProtectedRoute>{lazyPage(DisplayPage)}</ProtectedRoute>,
  },

  // --- Mở rộng v6: trang quét QR chấm công (đã đăng nhập, không AppLayout) ---
  {
    path: '/checkin',
    element: <ProtectedRoute>{lazyPage(CheckinPage)}</ProtectedRoute>,
  },

  // --- Khu vực đã đăng nhập (AppLayout: sidebar + header + Outlet) ---
  {
    path: '/',
    errorElement: <RouteErrorPage />,
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: lazyPage(DashboardPage) },
      {
        path: 'employees',
        element: guardedPage(EmployeeListPage, ['admin', 'hr', 'manager']),
      },
      {
        path: 'employees/:id',
        element: guardedPage(EmployeeDetailPage, ['admin', 'hr', 'manager']),
      },
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
      // --- Mở rộng v2 (mở cho mọi user đã đăng nhập, scope xử lý ở trang/API) ---
      { path: 'performance', element: lazyPage(PerformancePage) },
      { path: 'onboarding', element: lazyPage(OnboardingPage) },
      {
        path: 'org-chart',
        element: guardedPage(OrgChartPage, ['admin', 'hr', 'manager']),
      },
      {
        path: 'team-calendar',
        element: guardedPage(TeamCalendarPage, ['admin', 'hr', 'manager']),
      },
      { path: 'assets', element: lazyPage(AssetsPage) },
      { path: 'training', element: lazyPage(TrainingPage) },
      { path: 'announcements', element: lazyPage(AnnouncementsPage) },
      { path: 'notifications', element: lazyPage(NotificationsPage) },
      {
        path: 'reports',
        element: guardedPage(ReportsPage, ['admin', 'hr', 'manager']),
      },
      // --- Mở rộng v3 ---
      { path: 'shifts', element: lazyPage(ShiftsPage) },
      { path: 'documents', element: lazyPage(DocumentsPage) },
      {
        path: 'offboarding',
        element: guardedPage(OffboardingPage, ['admin', 'hr']),
      },
      { path: 'kudos', element: lazyPage(KudosPage) },
      { path: 'surveys', element: lazyPage(SurveysPage) },
      {
        path: 'attrition-risk',
        element: guardedPage(AttritionPage, ['admin', 'hr', 'manager']),
      },
      // --- Mở rộng v4 ---
      { path: 'feed', element: lazyPage(FeedPage) },
      {
        path: 'rewards',
        element: guardedPage(RewardsPage, null, { needsEmployee: true }),
      },
      {
        path: 'my-journey',
        element: guardedPage(JourneyPage, null, { needsEmployee: true }),
      },
      // --- Mở rộng v5 ---
      { path: 'skills', element: lazyPage(SkillsPage) },
      // --- Mở rộng v6 (gói 3) ---
      {
        path: 'checkin-qr',
        element: guardedPage(CheckinQrPage, ['admin', 'hr']),
      },
      {
        path: 'briefing',
        element: guardedPage(BriefingPage, ['admin', 'hr']),
      },
    ],
  },

  { path: '*', element: <NotFoundPage /> },
]);

export default router;
