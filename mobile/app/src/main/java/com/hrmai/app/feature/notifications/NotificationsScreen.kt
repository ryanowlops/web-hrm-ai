package com.hrmai.app.feature.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.Assignment
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.EventNote
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.School
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
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
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.SkeletonBlock
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format

@Composable
fun NotificationsRoute(container: AppContainer) {
    val vm: NotificationsViewModel = viewModel(
        factory = NotificationsViewModel.Factory(
            container.api(NotificationsApi::class.java),
            container.sessionStore,
        )
    )
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(state.toast) {
        state.toast?.let {
            snackbar.showSnackbar(it)
            vm.consumeToast()
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        NotificationsScreen(state = state, vm = vm)
        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NotificationsScreen(state: NotificationsUiState, vm: NotificationsViewModel) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 16.dp, end = 8.dp, top = 16.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "Thông báo",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            if (state.unreadCount > 0) {
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.error)
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                ) {
                    Text(
                        text = "${state.unreadCount} chưa đọc",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 16.dp, end = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "Cập nhật dành riêng cho bạn",
                style = MaterialTheme.typography.bodyMedium,
                color = InkMuted,
                modifier = Modifier.weight(1f),
            )
            if (state.unreadCount > 0) {
                TextButton(
                    onClick = { vm.markAllRead() },
                    enabled = !state.markingAll,
                ) {
                    Icon(
                        Icons.Outlined.DoneAll,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.width(6.dp))
                    Text("Đánh dấu đã đọc tất cả")
                }
            }
        }

        when {
            state.loading -> {
                Column(
                    modifier = Modifier.fillMaxSize().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SkeletonBlock(heightDp = 84)
                    SkeletonBlock(heightDp = 84)
                    SkeletonBlock(heightDp = 84)
                    SkeletonBlock(heightDp = 84)
                }
            }
            state.error != null && state.items.isEmpty() -> {
                ErrorState(message = state.error, onRetry = { vm.load() })
            }
            else -> {
                PullToRefreshBox(
                    isRefreshing = state.refreshing,
                    onRefresh = { vm.refresh() },
                    modifier = Modifier.fillMaxSize(),
                ) {
                    if (state.items.isEmpty()) {
                        EmptyState("Bạn chưa có thông báo nào. Mọi cập nhật mới sẽ hiện ở đây.")
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            items(state.items, key = { it.id ?: 0 }) { item ->
                                NotificationRow(
                                    item = item,
                                    onClick = { vm.markRead(item) },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Icon + màu theo loại thông báo phía server (type tự do, suy đoán theo từ khoá). */
private fun iconForType(type: String?): ImageVector = when {
    type == null -> Icons.Outlined.Notifications
    type.contains("leave") -> Icons.Outlined.EventNote
    type.contains("payroll") || type.contains("salary") -> Icons.Outlined.Payments
    type.contains("kudo") -> Icons.Outlined.EmojiEvents
    type.contains("announcement") -> Icons.Outlined.Campaign
    type.contains("attendance") || type.contains("overtime") -> Icons.Outlined.AccessTime
    type.contains("course") || type.contains("training") -> Icons.Outlined.School
    type.contains("onboarding") || type.contains("offboarding") ||
        type.contains("asset") || type.contains("certificate") ||
        type.contains("document") -> Icons.Outlined.Assignment
    else -> Icons.Outlined.Notifications
}

private fun tintForType(type: String?): Color = when {
    type == null -> BrandBlue
    type.contains("leave") -> WarningAmber
    type.contains("payroll") || type.contains("salary") -> SuccessGreen
    type.contains("kudo") -> Color(0xFFB42318)
    type.contains("announcement") -> BrandBlue
    else -> BrandBlue
}

@Composable
private fun NotificationRow(item: NotificationDto, onClick: () -> Unit) {
    val unread = item.isRead != true
    val tint = tintForType(item.type)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(16.dp))
            .background(if (unread) BrandBlueSoft else Color.White)
            .clickable { onClick() }
            .padding(14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(tint.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = iconForType(item.type),
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(20.dp),
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = item.title ?: "Thông báo",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = if (unread) FontWeight.Bold else FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (unread) {
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .size(9.dp)
                            .clip(CircleShape)
                            .background(BrandBlue),
                    )
                }
            }
            if (!item.content.isNullOrBlank()) {
                Spacer(Modifier.height(3.dp))
                Text(
                    text = item.content,
                    style = MaterialTheme.typography.bodyMedium,
                    color = InkMuted,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = relativeTimeVi(item.createdAt).ifBlank { Format.dateTime(item.createdAt) },
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
        }
    }
}
