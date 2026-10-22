import { Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute.jsx';
import AppLayout from '../layouts/AppLayout.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';
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
//   /performance            -> features/performance/pages/PerformancePage.jsx     (mở rộng v2)
//   /onboarding             -> features/onboarding/pages/OnboardingPage.jsx       (mở rộng v2)
//   /org-chart              -> features/orgchart/pages/OrgChartPage.jsx           (mở rộng v2)
//   /team-calendar          -> features/calendar/pages/TeamCalendarPage.jsx       (mở rộng v2)
//   /assets                 -> features/assets/pages/AssetsPage.jsx               (mở rộng v2)
//   /training               -> features/training/pages/TrainingPage.jsx           (mở rộng v2)
//   /announcements          -> features/announcements/pages/AnnouncementsPage.jsx (mở rộng v2)
//   /notifications          -> features/notifications/pages/NotificationsPage.jsx (mở rộng v2)
//   /reports                -> features/reports/pages/ReportsPage.jsx             (mở rộng v2)
//   *                       -> pages/NotFoundPage.jsx
// ---------------------------------------------------------------------------

function PageLoading() {
  // Khung chờ dạng skeleton (pulse nhẹ) — giữ bố cục ổn định trong lúc chunk
  // của trang đang tải, tránh cảm giác trang trắng/nhảy hình.
  return (
    <div role="status" aria-live="polite" aria-label="Đang tải trang" className="animate-pulse">
      <div className="mb-2 h-6 w-56 rounded-md bg-gray-200" />
      <div className="mb-6 h-4 w-80 max-w-full rounded-md bg-gray-100" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-xl border border-gray-200 bg-white" />
        ))}
      </div>
      <div className="mt-5 h-64 rounded-xl border border-gray-200 bg-white" />
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
      // --- Mở rộng v2 (mở cho mọi user đã đăng nhập, scope xử lý ở trang/API) ---
      { path: 'performance', element: lazyPage(PerformancePage) },
      { path: 'onboarding', element: lazyPage(OnboardingPage) },
      { path: 'org-chart', element: lazyPage(OrgChartPage) },
      { path: 'team-calendar', element: lazyPage(TeamCalendarPage) },
      { path: 'assets', element: lazyPage(AssetsPage) },
      { path: 'training', element: lazyPage(TrainingPage) },
      { path: 'announcements', element: lazyPage(AnnouncementsPage) },
      { path: 'notifications', element: lazyPage(NotificationsPage) },
      { path: 'reports', element: lazyPage(ReportsPage) },
      // --- Mở rộng v3 ---
      { path: 'shifts', element: lazyPage(ShiftsPage) },
      { path: 'documents', element: lazyPage(DocumentsPage) },
      { path: 'offboarding', element: lazyPage(OffboardingPage) },
      { path: 'kudos', element: lazyPage(KudosPage) },
      { path: 'surveys', element: lazyPage(SurveysPage) },
      {
        path: 'attrition-risk',
        element: guardedPage(AttritionPage, ['admin', 'hr', 'manager']),
      },
      // --- Mở rộng v4 ---
      { path: 'feed', element: lazyPage(FeedPage) },
      { path: 'rewards', element: lazyPage(RewardsPage) },
      { path: 'my-journey', element: lazyPage(JourneyPage) },
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
