package com.hrmai.app.feature.home

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.DynamicFeed
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.EventAvailable
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.InitialAvatar
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.SkeletonBlock
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.util.Format
import com.hrmai.app.navigation.Routes
import java.util.Locale

@Composable
fun HomeRoute(
    container: AppContainer,
    onOpenRoute: (String) -> Unit,
    onOpenNotifications: () -> Unit,
) {
    val vm: HomeViewModel = viewModel(
        factory = HomeViewModel.Factory(
            api = container.api(HomeApi::class.java),
            sessionStore = container.sessionStore,
        ),
    )
    val state by vm.state.collectAsState()
    HomeScreen(
        state = state,
        onRefresh = vm::refresh,
        onOpenRoute = onOpenRoute,
        onOpenNotifications = onOpenNotifications,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HomeScreen(
    state: HomeUiState,
    onRefresh: () -> Unit,
    onOpenRoute: (String) -> Unit,
    onOpenNotifications: () -> Unit,
) {
    PullToRefreshBox(
        isRefreshing = state.refreshing,
        onRefresh = onRefresh,
        modifier = Modifier.fillMaxSize().background(CanvasGray),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item { HomeHeader(state = state, onOpenNotifications = onOpenNotifications) }

            item {
                TodayAttendanceCard(
                    block = state.today,
                    onOpenRoute = onOpenRoute,
                    onRetry = onRefresh,
                )
            }

            item { StatsRow(state = state) }

            item { ShortcutsGrid(onOpenRoute = onOpenRoute) }

            item {
                SectionHeader(
                    title = "Thông báo mới",
                    actionLabel = "Xem tất cả",
                    onAction = { onOpenRoute(Routes.ANNOUNCEMENTS) },
                )
            }
            when (val block = state.announcements) {
                is Block.Loading -> item { SkeletonBlock(heightDp = 96) }
                is Block.Failed -> item {
                    Column {
                        Text(
                            text = "Chưa tải được thông báo.",
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                        TextButton(onClick = onRefresh) { Text("Thử lại") }
                    }
                }
                is Block.Content -> {
                    if (block.value.isEmpty()) {
                        item { EmptyState("Chưa có thông báo nào.") }
                    } else {
                        items(block.value, key = { it.id ?: it.hashCode() }) { ann ->
                            AnnouncementRow(
                                announcement = ann,
                                onClick = { onOpenRoute(Routes.ANNOUNCEMENTS) },
                            )
                        }
                    }
                }
            }

            item { SectionHeader(title = "Hoạt động gần đây") }
            when (val block = state.activity) {
                is Block.Loading -> item { SkeletonBlock(heightDp = 120) }
                is Block.Failed -> item {
                    Column {
                        Text(
                            text = "Chưa tải được hoạt động gần đây.",
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                        TextButton(onClick = onRefresh) { Text("Thử lại") }
                    }
                }
                is Block.Content -> {
                    if (block.value.isEmpty()) {
                        item { EmptyState("Chưa có hoạt động nào gần đây.") }
                    } else {
                        items(block.value) { act ->
                            ActivityRow(activity = act)
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(4.dp)) }
        }
    }
}

@Composable
private fun HomeHeader(state: HomeUiState, onOpenNotifications: () -> Unit) {
    val user = state.user
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        InitialAvatar(user?.fullName, 52)
        Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
            Text(
                text = Format.greeting(),
                style = MaterialTheme.typography.bodyMedium,
                color = InkMuted,
            )
            Text(
                text = user?.fullName ?: "Bạn",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val sub = listOfNotNull(user?.positionName, user?.departmentName)
                .filter { it.isNotBlank() }
                .joinToString(" · ")
            if (sub.isNotBlank()) {
                Text(
                    text = sub,
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        IconButton(onClick = onOpenNotifications) {
            BadgedBox(
                badge = {
                    if (state.unreadCount > 0) {
                        Badge { Text(if (state.unreadCount > 99) "99+" else state.unreadCount.toString()) }
                    }
                },
            ) {
                Icon(
                    Icons.Filled.Notifications,
                    contentDescription = "Thông báo",
                    tint = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}

@Composable
private fun TodayAttendanceCard(
    block: Block<TodayAttendanceResponse>,
    onOpenRoute: (String) -> Unit,
    onRetry: () -> Unit,
) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        when (block) {
            is Block.Loading -> SkeletonBlock(heightDp = 72)
            is Block.Failed -> Column {
                Text(
                    text = "Chấm công hôm nay",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = block.message,
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                TextButton(onClick = onRetry) { Text("Thử lại") }
            }
            is Block.Content -> {
                val resp = block.value
                val record = resp.data
                val checkedIn = resp.hasCheckedIn ?: (record?.checkInAt != null)
                val checkedOut = resp.hasCheckedOut ?: (record?.checkOutAt != null)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier.size(44.dp).clip(CircleShape).background(BrandBlueSoft),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.Fingerprint, contentDescription = null, tint = BrandBlue)
                    }
                    Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
                        Text(
                            text = "Chấm công hôm nay",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(Modifier.height(4.dp))
                        when {
                            !checkedIn -> Text(
                                text = "Bạn chưa chấm công vào hôm nay.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = InkMuted,
                            )
                            checkedOut -> Row(verticalAlignment = Alignment.CenterVertically) {
                                StatusChip(
                                    text = "Đã hoàn thành",
                                    bg = BrandBlueSoft,
                                    fg = SuccessGreen,
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    text = "Vào ${Format.time(record?.checkInAt)} · Ra ${Format.time(record?.checkOutAt)}",
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                            else -> Row(verticalAlignment = Alignment.CenterVertically) {
                                StatusChip(
                                    text = "Đang làm việc",
                                    bg = BrandBlueSoft,
                                    fg = BrandBlue,
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    text = "Vào lúc ${Format.time(record?.checkInAt)}",
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        }
                        val statusNote = when (record?.status) {
                            "late" -> "Hôm nay bạn đi muộn."
                            "leave", "on_leave" -> "Hôm nay bạn đang nghỉ phép."
                            "absent" -> "Hôm nay bạn được ghi nhận vắng."
                            else -> null
                        }
                        if (statusNote != null && checkedIn) {
                            Text(
                                text = statusNote,
                                style = MaterialTheme.typography.bodySmall,
                                color = InkMuted,
                            )
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = { onOpenRoute(Routes.ATTENDANCE) },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (checkedIn && !checkedOut) "Đi chấm công ra" else "Đi chấm công")
                }
            }
        }
    }
}

@Composable
private fun StatsRow(state: HomeUiState) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Phép còn
        HrmCard(modifier = Modifier.weight(1f)) {
            Column {
                Text("Phép còn", style = MaterialTheme.typography.labelMedium, color = InkMuted)
                Spacer(Modifier.height(4.dp))
                when (state.leaveBalances) {
                    is Block.Loading -> SkeletonBlock(heightDp = 28)
                    is Block.Failed -> Text("—", style = MaterialTheme.typography.titleLarge)
                    is Block.Content -> {
                        val total = state.totalLeaveRemaining ?: 0.0
                        val animated by animateFloatAsState(
                            targetValue = total.toFloat(),
                            animationSpec = tween(800),
                            label = "leaveRemaining",
                        )
                        Text(
                            text = formatDays(animated.toDouble()),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = BrandBlue,
                        )
                    }
                }
                Text("ngày", style = MaterialTheme.typography.bodySmall, color = InkMuted)
            }
        }
        // Điểm thưởng
        HrmCard(modifier = Modifier.weight(1f)) {
            Column {
                Text("Điểm thưởng", style = MaterialTheme.typography.labelMedium, color = InkMuted)
                Spacer(Modifier.height(4.dp))
                when (val block = state.points) {
                    is Block.Loading -> SkeletonBlock(heightDp = 28)
                    is Block.Failed -> Text("—", style = MaterialTheme.typography.titleLarge)
                    is Block.Content -> {
                        val animated by animateIntAsState(
                            targetValue = block.value.balance ?: 0,
                            animationSpec = tween(800),
                            label = "pointsBalance",
                        )
                        Text(
                            text = animated.toString(),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = BrandBlue,
                        )
                    }
                }
                Text("điểm", style = MaterialTheme.typography.bodySmall, color = InkMuted)
            }
        }
        // Huy hiệu gần nhất — chỉ hiện khi đã có huy hiệu đạt được
        val badge = (state.latestBadge as? Block.Content)?.value
        if (badge != null) {
            HrmCard(modifier = Modifier.weight(1f)) {
                Column {
                    Text("Huy hiệu", style = MaterialTheme.typography.labelMedium, color = InkMuted)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = badge.emoji ?: "🏅",
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Text(
                        text = badge.name ?: "",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@Composable
private fun ShortcutsGrid(onOpenRoute: (String) -> Unit) {
    val shortcuts = listOf(
        Triple(Routes.LEAVE, "Nghỉ phép", Icons.Filled.EventAvailable),
        Triple(Routes.PAYROLL, "Lương", Icons.Filled.Payments),
        Triple(Routes.KUDOS, "Vinh danh", Icons.Filled.EmojiEvents),
        Triple(Routes.ANNOUNCEMENTS, "Thông báo", Icons.Filled.Campaign),
    )
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            shortcuts.forEach { (route, label, icon) ->
                ShortcutItem(label = label, icon = icon, onClick = { onOpenRoute(route) })
            }
        }
    }
}

@Composable
private fun ShortcutItem(label: String, icon: ImageVector, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp))
            .clickable { onClick() }
            .padding(horizontal = 6.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier.size(48.dp).clip(CircleShape).background(BrandBlueSoft),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = label, tint = BrandBlue)
        }
        Spacer(Modifier.height(6.dp))
        Text(text = label, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun AnnouncementRow(announcement: AnnouncementDto, onClick: () -> Unit) {
    HrmCard(
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
    ) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (announcement.isPinned == true) {
                    StatusChip(text = "Đã ghim", bg = BrandBlueSoft, fg = BrandBlue)
                    Spacer(Modifier.width(8.dp))
                }
                Text(
                    text = announcement.title ?: "Thông báo",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            val excerpt = announcement.content?.trim()?.take(120)
            if (!excerpt.isNullOrBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = excerpt,
                    style = MaterialTheme.typography.bodyMedium,
                    color = InkMuted,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.height(6.dp))
            Text(
                text = listOfNotNull(announcement.authorName, Format.date(announcement.createdAt))
                    .joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
        }
    }
}

@Composable
private fun ActivityRow(activity: ActivityDto) {
    val (icon, tint) = when (activity.type) {
        "kudo" -> Icons.Filled.Favorite to Color(0xFFB42318)
        "announcement" -> Icons.Filled.Campaign to BrandBlue
        "new_employee" -> Icons.Filled.PersonAdd to SuccessGreen
        "attendance" -> Icons.Filled.Fingerprint to BrandBlue
        "post" -> Icons.Filled.DynamicFeed to Color(0xFF6941C6)
        else -> Icons.Filled.DynamicFeed to InkMuted
    }
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier.size(36.dp).clip(CircleShape).background(BrandBlueSoft),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
        }
        Column(modifier = Modifier.weight(1f).padding(start = 10.dp)) {
            Text(
                text = activity.text ?: "",
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = Format.dateTime(activity.at),
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
        }
    }
}

/** 12.0 -> "12"; 12.5 -> "12,5" (giờ Việt Nam). */
private fun formatDays(value: Double): String =
    if (value % 1.0 == 0.0) value.toInt().toString()
    else String.format(Locale("vi", "VN"), "%.1f", value)
