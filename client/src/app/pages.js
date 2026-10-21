import { lazy } from 'react';

// ---------------------------------------------------------------------------
// Toàn bộ page của app, khai báo tập trung tại đây:
// - Mỗi page có một "importer" (hàm import động) dùng cho React.lazy.
// - prefetchRoute(path) gọi lại đúng importer đó để trình duyệt tải trước
//   chunk của trang khi người dùng rê chuột vào menu — bấm vào là hiện ngay
//   vì module đã nằm trong cache. Gọi import() lần hai không tải lại mạng.
// ---------------------------------------------------------------------------

const importLoginPage = () => import('../features/auth/pages/LoginPage.jsx');
const importPublicJobsPage = () => import('../features/public/pages/PublicJobsPage.jsx');
const importDashboardPage = () => import('../features/dashboard/pages/DashboardPage.jsx');
const importEmployeeListPage = () => import('../features/employees/pages/EmployeeListPage.jsx');
const importEmployeeDetailPage = () => import('../features/employees/pages/EmployeeDetailPage.jsx');
const importDepartmentListPage = () =>
  import('../features/departments/pages/DepartmentListPage.jsx');
const importAttendancePage = () => import('../features/attendance/pages/AttendancePage.jsx');
const importLeavePage = () => import('../features/leave/pages/LeavePage.jsx');
const importPayrollPage = () => import('../features/payroll/pages/PayrollPage.jsx');
const importJobListPage = () => import('../features/recruitment/pages/RecruitmentPage.jsx');
const importJobDetailPage = () => import('../features/recruitment/pages/JobDetailPage.jsx');
const importChatbotPage = () => import('../features/chatbot/pages/ChatbotPage.jsx');
const importAdminPage = () => import('../features/admin/pages/AdminPage.jsx');
const importPerformancePage = () => import('../features/performance/pages/PerformancePage.jsx');
const importOnboardingPage = () => import('../features/onboarding/pages/OnboardingPage.jsx');
const importOrgChartPage = () => import('../features/orgchart/pages/OrgChartPage.jsx');
const importTeamCalendarPage = () => import('../features/calendar/pages/TeamCalendarPage.jsx');
const importAssetsPage = () => import('../features/assets/pages/AssetsPage.jsx');
const importTrainingPage = () => import('../features/training/pages/TrainingPage.jsx');
const importAnnouncementsPage = () =>
  import('../features/announcements/pages/AnnouncementsPage.jsx');
const importNotificationsPage = () =>
  import('../features/notifications/pages/NotificationsPage.jsx');
const importReportsPage = () => import('../features/reports/pages/ReportsPage.jsx');
const importShiftsPage = () => import('../features/shifts/pages/ShiftsPage.jsx');
const importDocumentsPage = () => import('../features/documents/pages/DocumentsPage.jsx');
const importOffboardingPage = () =>
  import('../features/offboarding/pages/OffboardingPage.jsx');
const importKudosPage = () => import('../features/kudos/pages/KudosPage.jsx');
const importSurveysPage = () => import('../features/surveys/pages/SurveysPage.jsx');
const importAttritionPage = () => import('../features/attrition/pages/AttritionPage.jsx');
const importFeedPage = () => import('../features/feed/pages/FeedPage.jsx');
const importRewardsPage = () => import('../features/rewards/pages/RewardsPage.jsx');
const importJourneyPage = () => import('../features/journey/pages/JourneyPage.jsx');
const importSkillsPage = () => import('../features/skills/pages/SkillsPage.jsx');
const importMockInterviewPage = () =>
  import('../features/interviews/pages/MockInterviewPage.jsx');
const importDisplayPage = () => import('../features/display/pages/DisplayPage.jsx');

export const LoginPage = lazy(importLoginPage);
export const PublicJobsPage = lazy(importPublicJobsPage);
export const DashboardPage = lazy(importDashboardPage);
export const EmployeeListPage = lazy(importEmployeeListPage);
export const EmployeeDetailPage = lazy(importEmployeeDetailPage);
export const DepartmentListPage = lazy(importDepartmentListPage);
export const AttendancePage = lazy(importAttendancePage);
export const LeavePage = lazy(importLeavePage);
export const PayrollPage = lazy(importPayrollPage);
export const JobListPage = lazy(importJobListPage);
export const JobDetailPage = lazy(importJobDetailPage);
export const ChatbotPage = lazy(importChatbotPage);
export const AdminPage = lazy(importAdminPage);
export const PerformancePage = lazy(importPerformancePage);
export const OnboardingPage = lazy(importOnboardingPage);
export const OrgChartPage = lazy(importOrgChartPage);
export const TeamCalendarPage = lazy(importTeamCalendarPage);
export const AssetsPage = lazy(importAssetsPage);
export const TrainingPage = lazy(importTrainingPage);
export const AnnouncementsPage = lazy(importAnnouncementsPage);
export const NotificationsPage = lazy(importNotificationsPage);
export const ReportsPage = lazy(importReportsPage);
export const ShiftsPage = lazy(importShiftsPage);
export const DocumentsPage = lazy(importDocumentsPage);
export const OffboardingPage = lazy(importOffboardingPage);
export const KudosPage = lazy(importKudosPage);
export const SurveysPage = lazy(importSurveysPage);
export const AttritionPage = lazy(importAttritionPage);
export const FeedPage = lazy(importFeedPage);
export const RewardsPage = lazy(importRewardsPage);
export const JourneyPage = lazy(importJourneyPage);
export const SkillsPage = lazy(importSkillsPage);
export const MockInterviewPage = lazy(importMockInterviewPage);
export const DisplayPage = lazy(importDisplayPage);

// Map đường dẫn menu → các chunk cần tải trước khi điều hướng tới.
const ROUTE_PREFETCHERS = {
  '/': [importDashboardPage],
  '/employees': [importEmployeeListPage, importEmployeeDetailPage],
  '/departments': [importDepartmentListPage],
  '/attendance': [importAttendancePage],
  '/leave': [importLeavePage],
  '/payroll': [importPayrollPage],
  '/performance': [importPerformancePage],
  '/onboarding': [importOnboardingPage],
  '/org-chart': [importOrgChartPage],
  '/team-calendar': [importTeamCalendarPage],
  '/assets': [importAssetsPage],
  '/training': [importTrainingPage],
  '/recruitment': [importJobListPage, importJobDetailPage],
  '/chatbot': [importChatbotPage],
  '/announcements': [importAnnouncementsPage],
  '/notifications': [importNotificationsPage],
  '/reports': [importReportsPage],
  '/shifts': [importShiftsPage],
  '/documents': [importDocumentsPage],
  '/offboarding': [importOffboardingPage],
  '/kudos': [importKudosPage],
  '/surveys': [importSurveysPage],
  '/attrition-risk': [importAttritionPage],
  '/feed': [importFeedPage],
  '/rewards': [importRewardsPage],
  '/my-journey': [importJourneyPage],
  '/skills': [importSkillsPage],
  '/mock-interview': [importMockInterviewPage],
  '/display': [importDisplayPage],
  '/admin': [importAdminPage],
  '/jobs': [importPublicJobsPage],
  '/login': [importLoginPage],
};

const prefetchedRoutes = new Set();

export function prefetchRoute(path) {
  if (!path || prefetchedRoutes.has(path)) return;
  const importers = ROUTE_PREFETCHERS[path];
  if (!importers) return;
  prefetchedRoutes.add(path);
  importers.forEach((load) => {
    load().catch(() => {});
  });
}
