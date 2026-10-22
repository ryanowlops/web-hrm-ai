package com.hrmai.app.navigation

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.AccountTree
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.DynamicFeed
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.EventAvailable
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.FactCheck
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Poll
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material.icons.filled.Timeline
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.InitialAvatar
import com.hrmai.app.feature.admin.AdminRoute
import com.hrmai.app.feature.announcements.AnnouncementsRoute
import com.hrmai.app.feature.assets.AssetsRoute
import com.hrmai.app.feature.attendance.AttendanceRoute
import com.hrmai.app.feature.attrition.AttritionRoute
import com.hrmai.app.feature.auth.LoginRoute
import com.hrmai.app.feature.chatbot.ChatbotRoute
import com.hrmai.app.feature.cvcheck.CvCheckRoute
import com.hrmai.app.feature.departments.DepartmentsRoute
import com.hrmai.app.feature.documents.DocumentsRoute
import com.hrmai.app.feature.employees.EmployeeDetailRoute
import com.hrmai.app.feature.employees.EmployeesRoute
import com.hrmai.app.feature.feed.FeedRoute
import com.hrmai.app.feature.home.HomeRoute
import com.hrmai.app.feature.jobs.JobDetailRoute
import com.hrmai.app.feature.jobs.JobsRoute
import com.hrmai.app.feature.journey.JourneyRoute
import com.hrmai.app.feature.kudos.KudosRoute
import com.hrmai.app.feature.leave.LeaveRoute
import com.hrmai.app.feature.mockinterview.MockInterviewRoute
import com.hrmai.app.feature.notifications.NotificationsRoute
import com.hrmai.app.feature.offboarding.OffboardingRoute
import com.hrmai.app.feature.onboarding.OnboardingRoute
import com.hrmai.app.feature.orgchart.OrgChartRoute
import com.hrmai.app.feature.payroll.PayrollRoute
import com.hrmai.app.feature.payrolladmin.PayrollAdminRoute
import com.hrmai.app.feature.performance.PerformanceRoute
import com.hrmai.app.feature.profile.ProfileRoute
import com.hrmai.app.feature.recruitment.RecruitmentJobRoute
import com.hrmai.app.feature.recruitment.RecruitmentRoute
import com.hrmai.app.feature.reports.ReportsRoute
import com.hrmai.app.feature.rewards.RewardsRoute
import com.hrmai.app.feature.shifts.ShiftsRoute
import com.hrmai.app.feature.skills.SkillsRoute
import com.hrmai.app.feature.surveys.SurveysRoute
import com.hrmai.app.feature.teamcalendar.TeamCalendarRoute
import com.hrmai.app.feature.training.TrainingRoute
import kotlinx.coroutines.launch

object Routes {
    const val HOME = "home"
    const val ATTENDANCE = "attendance"
    const val CHATBOT = "chatbot"
    const val FEED = "feed"
    const val MORE = "more"
    const val LEAVE = "leave"
    const val PAYROLL = "payroll"
    const val KUDOS = "kudos"
    const val ANNOUNCEMENTS = "announcements"
    const val NOTIFICATIONS = "notifications"
    const val PROFILE = "profile"
    // Mo rong dong bo voi ban web
    const val REWARDS = "rewards"
    const val JOURNEY = "journey"
    const val PERFORMANCE = "performance"
    const val TRAINING = "training"
    const val SHIFTS = "shifts"
    const val ASSETS = "assets"
    const val DOCUMENTS = "documents"
    const val ONBOARDING = "onboarding"
    const val SKILLS = "skills"
    const val SURVEYS = "surveys"
    const val TEAM_CALENDAR = "team-calendar"
    const val EMPLOYEES = "employees"
    const val EMPLOYEE_DETAIL = "employee/{employeeId}"
    const val DEPARTMENTS = "departments"
    const val ORG_CHART = "org-chart"
    const val RECRUITMENT = "recruitment"
    const val RECRUITMENT_JOB = "recruitment-job/{jobId}"
    const val REPORTS = "reports"
    const val ATTRITION = "attrition"
    const val OFFBOARDING = "offboarding"
    const val PAYROLL_ADMIN = "payroll-admin"
    const val ADMIN = "admin"
    const val JOBS = "jobs"
    const val JOB_DETAIL = "job/{jobId}"
    const val CV_CHECK = "cv-check"
    const val MOCK_INTERVIEW = "mock-interview"
}

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val TABS = listOf(
    Tab(Routes.HOME, "Trang chủ", Icons.Filled.Home),
    Tab(Routes.ATTENDANCE, "Chấm công", Icons.Filled.Fingerprint),
    Tab(Routes.CHATBOT, "Chatbot", Icons.Filled.SmartToy),
    Tab(Routes.FEED, "Bảng tin", Icons.Filled.DynamicFeed),
    Tab(Routes.MORE, "Thêm", Icons.Filled.GridView),
)

private val DETAIL_TITLES = mapOf(
    Routes.LEAVE to "Nghỉ phép",
    Routes.PAYROLL to "Lương của tôi",
    Routes.KUDOS to "Vinh danh",
    Routes.ANNOUNCEMENTS to "Thông báo công ty",
    Routes.NOTIFICATIONS to "Thông báo",
    Routes.PROFILE to "Hồ sơ cá nhân",
    Routes.REWARDS to "Cửa hàng đổi thưởng",
    Routes.JOURNEY to "Hành trình của tôi",
    Routes.PERFORMANCE to "KPI & OKR",
    Routes.TRAINING to "Đào tạo",
    Routes.SHIFTS to "Ca làm việc",
    Routes.ASSETS to "Tài sản",
    Routes.DOCUMENTS to "Tài liệu & giấy xác nhận",
    Routes.ONBOARDING to "Onboarding",
    Routes.SKILLS to "Bản đồ kỹ năng",
    Routes.SURVEYS to "Khảo sát gắn kết",
    Routes.TEAM_CALENDAR to "Lịch nhóm",
    Routes.EMPLOYEES to "Nhân viên",
    Routes.EMPLOYEE_DETAIL to "Chi tiết nhân viên",
    Routes.DEPARTMENTS to "Phòng ban",
    Routes.ORG_CHART to "Sơ đồ tổ chức",
    Routes.RECRUITMENT to "Tuyển dụng",
    Routes.RECRUITMENT_JOB to "Chi tiết tuyển dụng",
    Routes.REPORTS to "Báo cáo",
    Routes.ATTRITION to "Rủi ro nghỉ việc",
    Routes.OFFBOARDING to "Quy trình nghỉ việc",
    Routes.PAYROLL_ADMIN to "Quản lý lương",
    Routes.ADMIN to "Quản trị tài khoản",
    Routes.JOBS to "Việc làm đang mở",
    Routes.JOB_DETAIL to "Chi tiết việc làm",
    Routes.CV_CHECK to "Kiểm tra CV bằng AI",
    Routes.MOCK_INTERVIEW to "Phỏng vấn thử AI",
)

@Composable
fun HrmNavHost(container: AppContainer) {
    val session by container.sessionStore.sessionFlow.collectAsState()
    if (session == null) {
        LoginRoute(container)
    } else {
        MainShell(container)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainShell(container: AppContainer) {
    val navController = rememberNavController()
    val backStack by navController.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route
    val isTab = TABS.any { it.route == currentRoute }
    val scope = rememberCoroutineScope()

    fun openRoute(route: String) {
        navController.navigate(route) {
            popUpTo(navController.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }

    Scaffold(
        topBar = {
            if (!isTab && currentRoute != null) {
                TopAppBar(
                    title = { Text(DETAIL_TITLES[currentRoute] ?: "") },
                    navigationIcon = {
                        IconButton(onClick = { navController.popBackStack() }) {
                            Text("←", style = MaterialTheme.typography.titleLarge)
                        }
                    },
                )
            }
        },
        bottomBar = {
            NavigationBar {
                TABS.forEach { tab ->
                    val selected = backStack?.destination?.hierarchy?.any { it.route == tab.route } == true
                    NavigationBarItem(
                        selected = selected,
                        onClick = { openRoute(tab.route) },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) },
                    )
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Routes.HOME,
            modifier = Modifier.fillMaxSize().padding(padding),
            enterTransition = {
                slideIntoContainer(AnimatedContentTransitionScope.SlideDirection.Left, tween(260)) + fadeIn(tween(260))
            },
            exitTransition = {
                slideOutOfContainer(AnimatedContentTransitionScope.SlideDirection.Left, tween(260)) + fadeOut(tween(260))
            },
            popEnterTransition = {
                slideIntoContainer(AnimatedContentTransitionScope.SlideDirection.Right, tween(260)) + fadeIn(tween(260))
            },
            popExitTransition = {
                slideOutOfContainer(AnimatedContentTransitionScope.SlideDirection.Right, tween(260)) + fadeOut(tween(260))
            },
        ) {
            composable(Routes.HOME) {
                HomeRoute(
                    container = container,
                    onOpenRoute = { openRoute(it) },
                    onOpenNotifications = { navController.navigate(Routes.NOTIFICATIONS) },
                )
            }
            composable(Routes.ATTENDANCE) { AttendanceRoute(container) }
            composable(Routes.CHATBOT) { ChatbotRoute(container) }
            composable(Routes.FEED) { FeedRoute(container) }
            composable(Routes.MORE) {
                MoreRoute(
                    container = container,
                    onOpenRoute = { navController.navigate(it) },
                    onLogout = { scope.launch { container.sessionStore.clear() } },
                )
            }
            composable(Routes.LEAVE) { LeaveRoute(container) }
            composable(Routes.PAYROLL) { PayrollRoute(container) }
            composable(Routes.KUDOS) { KudosRoute(container) }
            composable(Routes.ANNOUNCEMENTS) { AnnouncementsRoute(container) }
            composable(Routes.NOTIFICATIONS) { NotificationsRoute(container) }
            composable(Routes.PROFILE) { ProfileRoute(container) }
            // ===== Mo rong dong bo ban web =====
            composable(Routes.REWARDS) { RewardsRoute(container) }
            composable(Routes.JOURNEY) { JourneyRoute(container) }
            composable(Routes.PERFORMANCE) { PerformanceRoute(container) }
            composable(Routes.TRAINING) { TrainingRoute(container) }
            composable(Routes.SHIFTS) { ShiftsRoute(container) }
            composable(Routes.ASSETS) { AssetsRoute(container) }
            composable(Routes.DOCUMENTS) { DocumentsRoute(container) }
            composable(Routes.ONBOARDING) { OnboardingRoute(container) }
            composable(Routes.SKILLS) { SkillsRoute(container) }
            composable(Routes.SURVEYS) { SurveysRoute(container) }
            composable(Routes.TEAM_CALENDAR) { TeamCalendarRoute(container) }
            composable(Routes.EMPLOYEES) {
                EmployeesRoute(container, onOpenEmployee = { id -> navController.navigate("employee/$id") })
            }
            composable(
                Routes.EMPLOYEE_DETAIL,
                arguments = listOf(navArgument("employeeId") { type = NavType.IntType }),
            ) { entry ->
                EmployeeDetailRoute(
                    container,
                    entry.arguments?.getInt("employeeId") ?: 0,
                    onBack = { navController.popBackStack() },
                )
            }
            composable(Routes.DEPARTMENTS) { DepartmentsRoute(container) }
            composable(Routes.ORG_CHART) { OrgChartRoute(container) }
            composable(Routes.RECRUITMENT) {
                RecruitmentRoute(container, onOpenJob = { id -> navController.navigate("recruitment-job/$id") })
            }
            composable(
                Routes.RECRUITMENT_JOB,
                arguments = listOf(navArgument("jobId") { type = NavType.IntType }),
            ) { entry ->
                RecruitmentJobRoute(
                    container,
                    entry.arguments?.getInt("jobId") ?: 0,
                    onBack = { navController.popBackStack() },
                )
            }
            composable(Routes.REPORTS) { ReportsRoute(container) }
            composable(Routes.ATTRITION) { AttritionRoute(container) }
            composable(Routes.OFFBOARDING) { OffboardingRoute(container) }
            composable(Routes.PAYROLL_ADMIN) { PayrollAdminRoute(container) }
            composable(Routes.ADMIN) { AdminRoute(container) }
            composable(Routes.JOBS) {
                JobsRoute(container, onOpenJob = { id -> navController.navigate("job/$id") })
            }
            composable(
                Routes.JOB_DETAIL,
                arguments = listOf(navArgument("jobId") { type = NavType.IntType }),
            ) { entry ->
                JobDetailRoute(
                    container,
                    entry.arguments?.getInt("jobId") ?: 0,
                    onBack = { navController.popBackStack() },
                )
            }
            composable(Routes.CV_CHECK) { CvCheckRoute(container) }
            composable(Routes.MOCK_INTERVIEW) { MockInterviewRoute(container) }
        }
    }
}

private data class MenuSection(val title: String?, val items: List<Triple<String, String, ImageVector>>)

@Composable
private fun MoreRoute(
    container: AppContainer,
    onOpenRoute: (String) -> Unit,
    onLogout: () -> Unit,
) {
    val session by container.sessionStore.sessionFlow.collectAsState()
    val user = session?.user
    val role = user?.role ?: "employee"
    val isManagerUp = role in listOf("manager", "hr", "admin")
    val isHrUp = role in listOf("hr", "admin")

    val sections = buildList {
        add(
            MenuSection(
                null,
                listOf(
                    Triple(Routes.LEAVE, "Nghỉ phép", Icons.Filled.EventAvailable),
                    Triple(Routes.PAYROLL, "Lương của tôi", Icons.Filled.Payments),
                    Triple(Routes.KUDOS, "Vinh danh & điểm thưởng", Icons.Filled.EmojiEvents),
                    Triple(Routes.REWARDS, "Cửa hàng đổi thưởng", Icons.Filled.CardGiftcard),
                    Triple(Routes.JOURNEY, "Hành trình của tôi", Icons.Filled.Timeline),
                    Triple(Routes.ANNOUNCEMENTS, "Thông báo công ty", Icons.Filled.Campaign),
                    Triple(Routes.NOTIFICATIONS, "Thông báo cá nhân", Icons.Filled.Notifications),
                    Triple(Routes.PROFILE, "Hồ sơ cá nhân", Icons.Filled.Person),
                ),
            )
        )
        add(
            MenuSection(
                "Công việc & phát triển",
                listOf(
                    Triple(Routes.PERFORMANCE, "KPI & OKR", Icons.Filled.TrendingUp),
                    Triple(Routes.TRAINING, "Đào tạo", Icons.Filled.School),
                    Triple(Routes.SHIFTS, "Ca làm việc", Icons.Filled.Schedule),
                    Triple(Routes.ASSETS, "Tài sản của tôi", Icons.Filled.Devices),
                    Triple(Routes.DOCUMENTS, "Tài liệu & giấy xác nhận", Icons.Filled.Description),
                    Triple(Routes.ONBOARDING, "Onboarding", Icons.Filled.PersonAdd),
                    Triple(Routes.SKILLS, "Bản đồ kỹ năng", Icons.Filled.Map),
                    Triple(Routes.SURVEYS, "Khảo sát gắn kết", Icons.Filled.Poll),
                    Triple(Routes.TEAM_CALENDAR, "Lịch nhóm", Icons.Filled.CalendarToday),
                ),
            )
        )
        if (isManagerUp) {
            add(
                MenuSection(
                    "Quản lý",
                    buildList {
                        add(Triple(Routes.EMPLOYEES, "Nhân viên", Icons.Filled.Group))
                        add(Triple(Routes.DEPARTMENTS, "Phòng ban", Icons.Filled.Business))
                        add(Triple(Routes.ORG_CHART, "Sơ đồ tổ chức", Icons.Filled.AccountTree))
                        add(Triple(Routes.RECRUITMENT, "Tuyển dụng", Icons.Filled.Assignment))
                        add(Triple(Routes.REPORTS, "Báo cáo", Icons.Filled.Assessment))
                        add(Triple(Routes.ATTRITION, "Rủi ro nghỉ việc", Icons.Filled.Warning))
                        add(Triple(Routes.OFFBOARDING, "Quy trình nghỉ việc", Icons.Filled.ExitToApp))
                    },
                )
            )
        }
        if (isHrUp) {
            add(
                MenuSection(
                    "HR & hệ thống",
                    buildList {
                        add(Triple(Routes.PAYROLL_ADMIN, "Quản lý lương", Icons.Filled.Payments))
                        if (role == "admin") {
                            add(Triple(Routes.ADMIN, "Quản trị tài khoản", Icons.Filled.Settings))
                        }
                    },
                )
            )
        }
        add(
            MenuSection(
                "Trải nghiệm ứng viên",
                listOf(
                    Triple(Routes.JOBS, "Việc làm đang mở", Icons.Filled.Work),
                    Triple(Routes.CV_CHECK, "Kiểm tra CV bằng AI", Icons.Filled.FactCheck),
                    Triple(Routes.MOCK_INTERVIEW, "Phỏng vấn thử AI", Icons.Filled.SmartToy),
                ),
            )
        )
    }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            InitialAvatar(user?.fullName, 52)
            Column(Modifier.padding(start = 12.dp)) {
                Text(
                    user?.fullName ?: "—",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    listOfNotNull(user?.positionName, user?.departmentName).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.height(20.dp))
        sections.forEach { section ->
            if (section.title != null) {
                Text(
                    section.title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 10.dp, bottom = 10.dp),
                )
            }
            section.items.forEach { (route, label, icon) ->
                HrmCard(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)
                        .clickable { onOpenRoute(route) },
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(icon, contentDescription = label, tint = MaterialTheme.colorScheme.primary)
                        Text(
                            label,
                            style = MaterialTheme.typography.bodyLarge,
                            modifier = Modifier.padding(start = 12.dp),
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        HrmCard(
            modifier = Modifier.fillMaxWidth().clickable { onLogout() },
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.AutoMirrored.Filled.Logout,
                    contentDescription = "Đăng xuất",
                    tint = MaterialTheme.colorScheme.error,
                )
                Text(
                    "Đăng xuất",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(start = 12.dp),
                )
            }
        }
        Spacer(Modifier.height(24.dp))
        Text(
            "HRM AI Mobile v1.0 · Dữ liệu đồng bộ với bản web",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
