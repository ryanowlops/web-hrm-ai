package com.hrmai.app.feature.leave

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberDatePickerState
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.InitialAvatar
import com.hrmai.app.core.ui.LoadingState
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.SkeletonBlock
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BorderGray
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.BrandBlueDark
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.DangerRed
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit

@Composable
fun LeaveRoute(container: AppContainer) {
    val vm: LeaveViewModel = viewModel(
        factory = LeaveViewModel.Factory(
            container.api(LeaveApi::class.java),
            container.sessionStore,
        ),
    )
    LeaveScreen(vm)
}

private data class DecisionTarget(val request: LeaveRequestDto, val approved: Boolean)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LeaveScreen(vm: LeaveViewModel) {
    val state by vm.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    var cancelTarget by remember { mutableStateOf<LeaveRequestDto?>(null) }
    var decisionTarget by remember { mutableStateOf<DecisionTarget?>(null) }

    LaunchedEffect(state.message) {
        val msg = state.message ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(msg)
        vm.consumeMessage()
    }

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        Column(modifier = Modifier.fillMaxSize()) {
            val tabs = if (state.canApprove) {
                listOf("Đơn của tôi", "Tạo đơn", "Duyệt đơn")
            } else {
                listOf("Đơn của tôi", "Tạo đơn")
            }
            TabRow(selectedTabIndex = state.tab.coerceAtMost(tabs.lastIndex)) {
                tabs.forEachIndexed { index, label ->
                    Tab(
                        selected = state.tab == index,
                        onClick = { vm.selectTab(index) },
                        text = { Text(label) },
                    )
                }
            }
            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                when (state.tab) {
                    0 -> MyRequestsTab(state, vm, onCancel = { cancelTarget = it })
                    1 -> CreateLeaveTab(state, vm)
                    2 -> ApprovalTab(
                        state = state,
                        vm = vm,
                        onDecide = { request, approved ->
                            decisionTarget = DecisionTarget(request, approved)
                        },
                    )
                }
            }
        }
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
        )
    }

    cancelTarget?.let { request ->
        AlertDialog(
            onDismissRequest = { cancelTarget = null },
            title = { Text("Huỷ đơn nghỉ phép?") },
            text = {
                Text(
                    "Đơn ${request.leaveTypeName ?: "nghỉ phép"} từ " +
                        "${Format.date(request.fromDate)} đến ${Format.date(request.toDate)} " +
                        "sẽ bị huỷ và không thể khôi phục.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        vm.cancel(request)
                        cancelTarget = null
                    },
                ) { Text("Huỷ đơn", color = DangerRed) }
            },
            dismissButton = {
                TextButton(onClick = { cancelTarget = null }) { Text("Giữ lại") }
            },
        )
    }

    decisionTarget?.let { target ->
        DecisionDialog(
            target = target,
            acting = state.actingId == target.request.id,
            onDismiss = { decisionTarget = null },
            onConfirm = { note ->
                vm.decide(target.request, target.approved, note)
                decisionTarget = null
            },
        )
    }
}

@Composable
private fun DecisionDialog(
    target: DecisionTarget,
    acting: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var note by remember(target) { mutableStateOf("") }
    var noteError by remember(target) { mutableStateOf<String?>(null) }
    val request = target.request
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(if (target.approved) "Duyệt đơn nghỉ phép" else "Từ chối đơn nghỉ phép")
        },
        text = {
            Column {
                Text(
                    "${request.employeeName ?: "Nhân viên"} · ${request.leaveTypeName ?: ""}",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    "${Format.date(request.fromDate)} → ${Format.date(request.toDate)} " +
                        "(${formatDays(request.daysCount)} ngày)",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = note,
                    onValueChange = {
                        note = it
                        noteError = null
                    },
                    label = {
                        Text(
                            if (target.approved) {
                                "Ghi chú (tuỳ chọn)"
                            } else {
                                "Lý do từ chối (bắt buộc)"
                            },
                        )
                    },
                    isError = noteError != null,
                    supportingText = noteError?.let { msg -> { Text(msg, color = DangerRed) } },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = !acting,
                onClick = {
                    if (!target.approved && note.isBlank()) {
                        noteError = "Nhập lý do từ chối giúp em nhé (server yêu cầu)."
                    } else {
                        onConfirm(note)
                    }
                },
            ) {
                Text(
                    if (target.approved) "Xác nhận duyệt" else "Xác nhận từ chối",
                    color = if (target.approved) BrandBlue else DangerRed,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Đóng") }
        },
    )
}

// ----------------------------------------------------------------------
// Tab 1: Đơn của tôi + số dư phép
// ----------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MyRequestsTab(
    state: LeaveUiState,
    vm: LeaveViewModel,
    onCancel: (LeaveRequestDto) -> Unit,
) {
    PullToRefreshBox(
        isRefreshing = state.myRefreshing,
        onRefresh = { vm.refreshMine() },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { BalancesSection(state, vm) }
            item { SectionHeader(title = "Đơn nghỉ của tôi") }
            when {
                state.myLoading && state.myRequests.isEmpty() -> {
                    items(3) { SkeletonBlock(heightDp = 96) }
                }
                state.myError != null && state.myRequests.isEmpty() -> {
                    item {
                        ErrorState(
                            message = state.myError ?: "Không tải được danh sách đơn.",
                            onRetry = { vm.loadMine() },
                        )
                    }
                }
                state.myRequests.isEmpty() -> {
                    item { EmptyState("Bạn chưa có đơn nghỉ nào. Tạo đơn ở tab \"Tạo đơn\" nhé.") }
                }
                else -> {
                    items(state.myRequests, key = { it.id ?: 0 }) { request ->
                        MyRequestCard(
                            request = request,
                            cancelling = state.actingId == request.id,
                            onCancel = { onCancel(request) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun BalancesSection(state: LeaveUiState, vm: LeaveViewModel) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            SectionHeader(title = "Số dư phép năm ${Format.today().year}")
            Spacer(Modifier.height(10.dp))
            when {
                state.balancesLoading && state.balances.isEmpty() -> LoadingState()
                state.balancesError != null && state.balances.isEmpty() -> {
                    ErrorState(
                        message = state.balancesError ?: "Không tải được số dư phép.",
                        onRetry = { vm.loadBalances() },
                    )
                }
                state.balances.isEmpty() -> {
                    EmptyState("Chưa có thông tin số dư phép.")
                }
                else -> {
                    state.balances.forEachIndexed { index, balance ->
                        if (index > 0) Spacer(Modifier.height(12.dp))
                        BalanceRow(balance)
                    }
                }
            }
        }
    }
}

@Composable
private fun BalanceRow(balance: LeaveBalanceDto) {
    val total = balance.totalDays ?: 0.0
    val used = balance.usedDays ?: 0.0
    val remaining = balance.remainingDays ?: (total - used)
    val progress = if (total > 0) (used / total).toFloat().coerceIn(0f, 1f) else 0f
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                balance.leaveTypeName ?: "Phép",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )
            Text(
                "Còn ${formatDays(remaining)} / ${formatDays(total)} ngày",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = BrandBlueDark,
            )
        }
        Spacer(Modifier.height(6.dp))
        LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(50)),
            color = BrandBlue,
            trackColor = BrandBlueSoft,
        )
        Text(
            "Đã dùng ${formatDays(used)} ngày",
            style = MaterialTheme.typography.bodySmall,
            color = InkMuted,
        )
    }
}

@Composable
private fun MyRequestCard(
    request: LeaveRequestDto,
    cancelling: Boolean,
    onCancel: () -> Unit,
) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    request.leaveTypeName ?: "Nghỉ phép",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                LeaveStatusChip(request.status)
            }
            Spacer(Modifier.height(6.dp))
            Text(
                "${Format.date(request.fromDate)} → ${Format.date(request.toDate)}" +
                    " · ${formatDays(request.daysCount)} ngày",
                style = MaterialTheme.typography.bodyMedium,
            )
            if (!request.reason.isNullOrBlank()) {
                Text(
                    "Lý do: ${request.reason}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            DecisionNotes(request)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Gửi lúc ${Format.dateTime(request.createdAt)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                // Server chỉ cho huỷ khi đơn còn pending (xem leave/services.py).
                if (request.status == "pending") {
                    TextButton(onClick = onCancel, enabled = !cancelling) {
                        if (cancelling) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = DangerRed,
                            )
                        } else {
                            Text("Huỷ đơn", color = DangerRed)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DecisionNotes(request: LeaveRequestDto) {
    if (!request.managerNote.isNullOrBlank()) {
        Text(
            "Quản lý: ${request.managerNote}",
            style = MaterialTheme.typography.bodySmall,
            color = InkMuted,
        )
    }
    if (!request.hrNote.isNullOrBlank()) {
        Text(
            "HR: ${request.hrNote}",
            style = MaterialTheme.typography.bodySmall,
            color = InkMuted,
        )
    }
}

// ----------------------------------------------------------------------
// Tab 2: Tạo đơn
// ----------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreateLeaveTab(state: LeaveUiState, vm: LeaveViewModel) {
    // null = đóng; true = chọn ngày bắt đầu; false = chọn ngày kết thúc.
    var pickingFrom by remember { mutableStateOf<Boolean?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        HrmCard(modifier = Modifier.fillMaxWidth()) {
            Column {
                Text(
                    "Loại phép",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(8.dp))
                if (state.types.isEmpty()) {
                    EmptyState("Đang tải danh mục loại phép…")
                } else {
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        state.types.forEach { type ->
                            FilterChip(
                                selected = state.formTypeId == type.id,
                                onClick = { type.id?.let { vm.setFormType(it) } },
                                label = { Text(type.name ?: "Phép") },
                            )
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    DateField(
                        label = "Từ ngày",
                        value = state.formFrom,
                        modifier = Modifier.weight(1f),
                        onClick = { pickingFrom = true },
                    )
                    DateField(
                        label = "Đến ngày",
                        value = state.formTo,
                        modifier = Modifier.weight(1f),
                        onClick = { pickingFrom = false },
                    )
                }
                val from = state.formFrom
                val to = state.formTo
                if (from != null && to != null && !to.isBefore(from)) {
                    Spacer(Modifier.height(8.dp))
                    val estimate = ChronoUnit.DAYS.between(from, to) + 1
                    Text(
                        "Ước tính $estimate ngày (số ngày chính thức do hệ thống tính).",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(
                    value = state.formReason,
                    onValueChange = { vm.setFormReason(it) },
                    label = { Text("Lý do nghỉ") },
                    placeholder = { Text("Ví dụ: Nghỉ phép năm, về quê…") },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (state.formError != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        state.formError,
                        style = MaterialTheme.typography.bodySmall,
                        color = DangerRed,
                    )
                }
                Spacer(Modifier.height(16.dp))
                Button(
                    onClick = { vm.submitCreate() },
                    enabled = !state.submitting,
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                ) {
                    if (state.submitting) {
                        CircularProgressIndicator(
                            color = Color.White,
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Text("Gửi đơn nghỉ phép")
                    }
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Text(
            "Đơn sẽ được quản lý trực tiếp duyệt trước, sau đó HR duyệt ở cấp cuối.",
            style = MaterialTheme.typography.bodySmall,
            color = InkMuted,
        )
    }

    pickingFrom?.let { isFrom ->
        val initial = (if (isFrom) state.formFrom else state.formTo) ?: Format.today()
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = initial.toUtcMillis(),
        )
        DatePickerDialog(
            onDismissRequest = { pickingFrom = null },
            confirmButton = {
                TextButton(
                    onClick = {
                        pickerState.selectedDateMillis?.let { millis ->
                            val date = millis.toLocalDateUtc()
                            if (isFrom) vm.setFormFrom(date) else vm.setFormTo(date)
                        }
                        pickingFrom = null
                    },
                ) { Text("Chọn") }
            },
            dismissButton = {
                TextButton(onClick = { pickingFrom = null }) { Text("Huỷ") }
            },
        ) {
            DatePicker(state = pickerState, showModeToggle = false)
        }
    }
}

@Composable
private fun DateField(
    label: String,
    value: LocalDate?,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, BorderGray, RoundedCornerShape(12.dp))
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = InkMuted)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.Filled.CalendarToday,
                contentDescription = label,
                tint = BrandBlue,
                modifier = Modifier.size(18.dp),
            )
            Text(
                value?.let { Format.dateOf(it) } ?: "Chọn ngày",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(start = 8.dp),
            )
        }
    }
}

// ----------------------------------------------------------------------
// Tab 3: Duyệt đơn
// ----------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ApprovalTab(
    state: LeaveUiState,
    vm: LeaveViewModel,
    onDecide: (LeaveRequestDto, Boolean) -> Unit,
) {
    PullToRefreshBox(
        isRefreshing = state.queueRefreshing,
        onRefresh = { vm.refreshQueue() },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Text(
                    if (state.role == "manager") {
                        "Đơn của phòng đang chờ bạn duyệt (cấp quản lý)."
                    } else {
                        "Đơn đã qua quản lý, đang chờ HR duyệt (cấp cuối)."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            when {
                state.queueLoading && state.queue.isEmpty() -> {
                    items(3) { SkeletonBlock(heightDp = 120) }
                }
                state.queueError != null && state.queue.isEmpty() -> {
                    item {
                        ErrorState(
                            message = state.queueError ?: "Không tải được hàng đợi duyệt.",
                            onRetry = { vm.loadQueue() },
                        )
                    }
                }
                state.queue.isEmpty() -> {
                    item { EmptyState("Không có đơn nào đang chờ bạn duyệt. 🎉") }
                }
                else -> {
                    items(state.queue, key = { it.id ?: 0 }) { request ->
                        ApprovalCard(
                            request = request,
                            acting = state.actingId == request.id,
                            onDecide = onDecide,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ApprovalCard(
    request: LeaveRequestDto,
    acting: Boolean,
    onDecide: (LeaveRequestDto, Boolean) -> Unit,
) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                InitialAvatar(request.employeeName, 42)
                Column(modifier = Modifier.padding(start = 10.dp).weight(1f)) {
                    Text(
                        request.employeeName ?: "Nhân viên",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        request.leaveTypeName ?: "Nghỉ phép",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
                LeaveStatusChip(request.status)
            }
            Spacer(Modifier.height(10.dp))
            Text(
                "${Format.date(request.fromDate)} → ${Format.date(request.toDate)}" +
                    " · ${formatDays(request.daysCount)} ngày",
                style = MaterialTheme.typography.bodyMedium,
            )
            if (!request.reason.isNullOrBlank()) {
                Text(
                    "Lý do: ${request.reason}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            if (!request.managerNote.isNullOrBlank()) {
                Text(
                    "Ghi chú quản lý: ${request.managerNote}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = { onDecide(request, true) },
                    enabled = !acting,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                ) {
                    if (acting) {
                        CircularProgressIndicator(
                            color = Color.White,
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Text("Duyệt")
                    }
                }
                OutlinedButton(
                    onClick = { onDecide(request, false) },
                    enabled = !acting,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = DangerRed),
                ) {
                    Text("Từ chối")
                }
            }
        }
    }
}

// ----------------------------------------------------------------------
// Tiện ích hiển thị
// ----------------------------------------------------------------------

@Composable
fun LeaveStatusChip(status: String?) {
    val (label, bg, fg) = when (status) {
        "pending" -> Triple("Chờ quản lý duyệt", Color(0xFFFFFAEB), WarningAmber)
        "manager_approved" -> Triple("Chờ HR duyệt", BrandBlueSoft, BrandBlueDark)
        "approved" -> Triple("Đã duyệt", Color(0xFFECFDF3), SuccessGreen)
        "rejected" -> Triple("Bị từ chối", Color(0xFFFEF3F2), DangerRed)
        "cancelled" -> Triple("Đã huỷ", Color(0xFFF2F4F7), InkMuted)
        null -> Triple("—", Color(0xFFF2F4F7), InkMuted)
        else -> Triple(status, Color(0xFFF2F4F7), InkMuted)
    }
    StatusChip(label, bg, fg)
}

/** 3.0 -> "3", 2.5 -> "2,5" (kiểu thập phân tiếng Việt). */
private fun formatDays(value: Double?): String {
    if (value == null) return "0"
    return if (value % 1.0 == 0.0) {
        value.toInt().toString()
    } else {
        value.toString().replace('.', ',')
    }
}

private fun LocalDate.toUtcMillis(): Long =
    atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

private fun Long.toLocalDateUtc(): LocalDate =
    Instant.ofEpochMilli(this).atZone(ZoneOffset.UTC).toLocalDate()
