package com.hrmai.app.navigation

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.DynamicFeed
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.EventAvailable
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.SmartToy
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
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.InitialAvatar
import com.hrmai.app.feature.announcements.AnnouncementsRoute
import com.hrmai.app.feature.attendance.AttendanceRoute
import com.hrmai.app.feature.auth.LoginRoute
import com.hrmai.app.feature.chatbot.ChatbotRoute
import com.hrmai.app.feature.feed.FeedRoute
import com.hrmai.app.feature.home.HomeRoute
import com.hrmai.app.feature.kudos.KudosRoute
import com.hrmai.app.feature.leave.LeaveRoute
import com.hrmai.app.feature.notifications.NotificationsRoute
import com.hrmai.app.feature.payroll.PayrollRoute
import com.hrmai.app.feature.profile.ProfileRoute
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
        }
    }
}

@Composable
private fun MoreRoute(
    container: AppContainer,
    onOpenRoute: (String) -> Unit,
    onLogout: () -> Unit,
) {
    val session by container.sessionStore.sessionFlow.collectAsState()
    val user = session?.user
    val items = listOf(
        Triple(Routes.LEAVE, "Nghỉ phép", Icons.Filled.EventAvailable),
        Triple(Routes.PAYROLL, "Lương của tôi", Icons.Filled.Payments),
        Triple(Routes.KUDOS, "Vinh danh & điểm thưởng", Icons.Filled.EmojiEvents),
        Triple(Routes.ANNOUNCEMENTS, "Thông báo công ty", Icons.Filled.Campaign),
        Triple(Routes.NOTIFICATIONS, "Thông báo cá nhân", Icons.Filled.Notifications),
        Triple(Routes.PROFILE, "Hồ sơ cá nhân", Icons.Filled.Person),
    )
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
        items.forEach { (route, label, icon) ->
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
        // Giữ Arrangement import được dùng (menu dọc đều nhau)
        Column(Arrangement.spacedBy(0.dp)) { }
    }
}
