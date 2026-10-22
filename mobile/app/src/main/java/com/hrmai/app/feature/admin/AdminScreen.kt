package com.hrmai.app.feature.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.InitialAvatar
import com.hrmai.app.core.ui.SkeletonBlock
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BorderGray
import com.hrmai.app.core.ui.theme.BrandBlueDark
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.DangerRed
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format

/** Hành động quản trị đang chờ xác nhận (đổi vai trò hoặc khoá/mở khoá). */
private sealed interface AdminAction {
    data class ChangeRole(val user: UserDto, val newRole: String) : AdminAction
    data class SetActive(val user: UserDto, val active: Boolean) : AdminAction
}

@Composable
fun AdminRoute(container: AppContainer) {
    val vm: AdminViewModel = viewModel(
        factory = AdminViewModel.Factory(
            container.api(AdminApi::class.java),
            container.sessionStore,
        )
    )
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    var roleTarget by remember { mutableStateOf<UserDto?>(null) }
    var pendingAction by remember { mutableStateOf<AdminAction?>(null) }

    LaunchedEffect(state.toast) {
        state.toast?.let {
            snackbar.showSnackbar(it)
            vm.consumeToast()
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        AdminScreen(
            state = state,
            vm = vm,
            onAskRole = { roleTarget = it },
            onAskActive = { user, active ->
                pendingAction = AdminAction.SetActive(user, active)
            },
        )
        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
        )
    }

    roleTarget?.let { user ->
        RolePickerDialog(
            user = user,
            onDismiss = { roleTarget = null },
            onPick = { newRole ->
                roleTarget = null
                pendingAction = AdminAction.ChangeRole(user, newRole)
            },
        )
    }

    pendingAction?.let { action ->
        ConfirmActionDialog(
            action = action,
            onDismiss = { pendingAction = null },
            onConfirm = {
                pendingAction = null
                when (action) {
                    is AdminAction.ChangeRole -> vm.updateRole(action.user, action.newRole)
                    is AdminAction.SetActive -> vm.updateActive(action.user, action.active)
                }
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AdminScreen(
    state: AdminUiState,
    vm: AdminViewModel,
    onAskRole: (UserDto) -> Unit,
    onAskActive: (UserDto, Boolean) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "Quản trị tài khoản",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp),
        )
        Text(
            text = "Đổi vai trò và khoá/mở tài khoản người dùng",
            style = MaterialTheme.typography.bodyMedium,
            color = InkMuted,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp),
        )

        when {
            !state.isAdmin && state.role != null -> {
                Box(modifier = Modifier.padding(16.dp)) {
                    HrmCard(modifier = Modifier.fillMaxWidth()) {
                        EmptyState(
                            "Mục quản trị chỉ dành cho Quản trị viên (Admin). " +
                                "Tài khoản hiện tại chưa có quyền truy cập.",
                        )
                    }
                }
            }
            state.loading -> {
                Column(
                    modifier = Modifier.fillMaxSize().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SkeletonBlock(heightDp = 64)
                    SkeletonBlock(heightDp = 120)
                    SkeletonBlock(heightDp = 120)
                }
            }
            state.error != null && state.users.isEmpty() -> {
                ErrorState(message = state.error, onRetry = { vm.load() })
            }
            else -> {
                Column(modifier = Modifier.padding(start = 16.dp, end = 16.dp)) {
                    OutlinedTextField(
                        value = state.query,
                        onValueChange = { vm.onQueryChange(it) },
                        placeholder = { Text("Tìm theo tên hoặc email…") },
                        leadingIcon = {
                            Icon(Icons.Outlined.Search, contentDescription = null)
                        },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "Tổng ${state.totalItems} tài khoản",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
                PullToRefreshBox(
                    isRefreshing = state.refreshing,
                    onRefresh = { vm.refresh() },
                    modifier = Modifier.fillMaxSize(),
                ) {
                    if (state.users.isEmpty()) {
                        EmptyState("Không tìm thấy tài khoản nào phù hợp.")
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            items(state.users, key = { it.id ?: 0 }) { user ->
                                UserCard(
                                    user = user,
                                    isSelf = user.id != null && user.id == state.myUserId,
                                    acting = state.actingId == user.id,
                                    anyActing = state.actingId != null,
                                    onAskRole = { onAskRole(user) },
                                    onAskActive = { active -> onAskActive(user, active) },
                                )
                            }
                            if (state.page < state.totalPages) {
                                item {
                                    Box(
                                        modifier = Modifier.fillMaxWidth(),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        OutlinedButton(
                                            onClick = { vm.loadMore() },
                                            enabled = !state.loadingMore,
                                        ) {
                                            if (state.loadingMore) {
                                                CircularProgressIndicator(
                                                    modifier = Modifier.size(16.dp),
                                                    strokeWidth = 2.dp,
                                                )
                                                Spacer(Modifier.width(8.dp))
                                            }
                                            Text("Tải thêm tài khoản")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun UserCard(
    user: UserDto,
    isSelf: Boolean,
    acting: Boolean,
    anyActing: Boolean,
    onAskRole: () -> Unit,
    onAskActive: (Boolean) -> Unit,
) {
    val active = user.isActive == true
    val (roleBg, roleFg) = when (user.role) {
        "admin" -> Color(0xFFFEE4E2) to DangerRed
        "hr" -> BrandBlueSoft to BrandBlueDark
        "manager" -> Color(0xFFFEF0C7) to WarningAmber
        else -> Color(0xFFF2F4F7) to InkMuted
    }
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                InitialAvatar(name = user.fullName ?: user.email, sizeDp = 44)
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = (user.fullName ?: "—") + if (isSelf) " (bạn)" else "",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = user.email ?: "",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    val meta = listOfNotNull(
                        user.employeeId?.let { "Hồ sơ NV #$it" },
                        user.createdAt?.let { "Tạo ${Format.date(it)}" },
                    ).joinToString(" · ")
                    if (meta.isNotBlank()) {
                        Text(
                            text = meta,
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                StatusChip(
                    text = UserRoles.labelOf(user.role),
                    bg = roleBg,
                    fg = roleFg,
                )
                Spacer(Modifier.width(8.dp))
                StatusChip(
                    text = if (active) "Đang hoạt động" else "Đã khoá",
                    bg = if (active) Color(0xFFD1FADF) else Color(0xFFFEE4E2),
                    fg = if (active) SuccessGreen else DangerRed,
                )
            }
            Spacer(Modifier.height(12.dp))
            if (isSelf) {
                Text(
                    text = "Đây là tài khoản của bạn — hệ thống không cho tự đổi " +
                        "vai trò hay tự khoá chính mình.",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedButton(
                        onClick = onAskRole,
                        enabled = !anyActing,
                    ) { Text("Đổi vai trò") }
                    Spacer(Modifier.width(8.dp))
                    Button(
                        onClick = { onAskActive(!active) },
                        enabled = !anyActing,
                        colors = if (active) {
                            ButtonDefaults.buttonColors(containerColor = DangerRed)
                        } else {
                            ButtonDefaults.buttonColors()
                        },
                    ) {
                        if (acting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                color = Color.White,
                                strokeWidth = 2.dp,
                            )
                            Spacer(Modifier.width(8.dp))
                        }
                        Text(if (active) "Khoá tài khoản" else "Mở khoá")
                    }
                }
            }
        }
    }
}

@Composable
private fun RolePickerDialog(
    user: UserDto,
    onDismiss: () -> Unit,
    onPick: (String) -> Unit,
) {
    var selected by remember(user.id) { mutableStateOf(user.role ?: "employee") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Đổi vai trò") },
        text = {
            Column {
                Text(
                    text = "Chọn vai trò mới cho ${user.fullName ?: user.email ?: "tài khoản"}:",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(8.dp))
                UserRoles.options.forEach { (value, label) ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .border(
                                1.dp,
                                if (selected == value) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    BorderGray
                                },
                                RoundedCornerShape(10.dp),
                            )
                            .clickable { selected = value }
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(
                            selected = selected == value,
                            onClick = { selected = value },
                        )
                        Text(
                            text = label,
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onPick(selected) },
                enabled = selected != user.role,
            ) { Text("Tiếp tục") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Huỷ") }
        },
    )
}

@Composable
private fun ConfirmActionDialog(
    action: AdminAction,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    val (title, message, confirmLabel) = when (action) {
        is AdminAction.ChangeRole -> Triple(
            "Xác nhận đổi vai trò",
            "Đổi vai trò của ${action.user.fullName ?: action.user.email ?: "tài khoản"} " +
                "từ ${UserRoles.labelOf(action.user.role)} thành " +
                "${UserRoles.labelOf(action.newRole)}?\n\n" +
                "Quyền truy cập của tài khoản sẽ thay đổi ngay sau khi xác nhận.",
            "Đổi vai trò",
        )
        is AdminAction.SetActive -> if (action.active) {
            Triple(
                "Xác nhận mở khoá",
                "Mở khoá tài khoản ${action.user.fullName ?: action.user.email ?: ""}? " +
                    "Người dùng sẽ đăng nhập lại được ngay.",
                "Mở khoá",
            )
        } else {
            Triple(
                "Xác nhận khoá tài khoản",
                "Khoá tài khoản ${action.user.fullName ?: action.user.email ?: ""}? " +
                    "Người dùng sẽ không đăng nhập được cho tới khi được mở khoá lại.",
                "Khoá tài khoản",
            )
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = if (action is AdminAction.SetActive && !action.active) {
                    ButtonDefaults.buttonColors(containerColor = DangerRed)
                } else {
                    ButtonDefaults.buttonColors()
                },
            ) { Text(confirmLabel) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Huỷ") }
        },
    )
}
