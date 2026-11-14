package com.hrmai.app.feature.shiftswaps

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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
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
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.DangerRed
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format
import com.hrmai.app.core.util.stripDiacritics
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

@Composable
fun ShiftSwapsRoute(container: AppContainer) {
    val vm: ShiftSwapsViewModel = viewModel(
        factory = ShiftSwapsViewModel.Factory(
            container.api(ShiftSwapsApi::class.java),
            container.sessionStore,
        ),
    )
    ShiftSwapsScreen(vm)
}

private sealed interface ConfirmAction {
    data class Approve(val item: ShiftSwapDto) : ConfirmAction
    data class Cancel(val item: ShiftSwapDto) : ConfirmAction
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ShiftSwapsScreen(vm: ShiftSwapsViewModel) {
    val state by vm.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    var confirmAction by remember { mutableStateOf<ConfirmAction?>(null) }

    LaunchedEffect(state.message) {
        val msg = state.message ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(msg)
        vm.consumeMessage()
    }

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        PullToRefreshBox(
            isRefreshing = state.refreshing,
            onRefresh = { vm.refresh() },
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    Button(
                        onClick = { vm.openCreate() },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                    ) { Text("Tạo đơn đổi ca") }
                }
                item { SummaryRow(state) }
                item { FilterRow(state, vm) }
                when {
                    state.loading && state.items.isEmpty() -> {
                        items(3) { SkeletonBlock(heightDp = 132) }
                    }
                    state.error != null && state.items.isEmpty() -> {
                        item {
                            ErrorState(
                                message = state.error ?: "Không tải được danh sách đơn đổi ca.",
                                onRetry = { vm.load() },
                            )
                        }
                    }
                    state.items.isEmpty() -> {
                        item {
                            EmptyState(
                                "Chưa có đơn đổi ca nào. Khi cần đổi ca với đồng nghiệp " +
                                    "vào một ngày cụ thể, hãy tạo đơn — quản lý hoặc HR " +
                                    "duyệt xong ca làm của hai người sẽ tự đổi cho nhau.",
                            )
                        }
                    }
                    else -> {
                        items(state.items, key = { it.id ?: 0 }) { item ->
                            SwapCard(
                                item = item,
                                isMine = state.myEmployeeId != null &&
                                    item.requesterId == state.myEmployeeId,
                                targetIsMe = state.myEmployeeId != null &&
                                    item.targetId == state.myEmployeeId,
                                canDecide = state.canDecide,
                                acting = state.actingId == item.id,
                                onOpenDetail = { vm.selectDetail(item) },
                                onApprove = { confirmAction = ConfirmAction.Approve(item) },
                                onReject = { vm.openReject(item) },
                                onCancel = { confirmAction = ConfirmAction.Cancel(item) },
                            )
                        }
                    }
                }
            }
        }
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
        )
    }

    if (state.showCreate) {
        CreateSwapDialog(state = state, vm = vm)
    }
    if (state.showColleaguePicker) {
        ColleaguePickerDialog(state = state, vm = vm)
    }
    state.selected?.let { item ->
        SwapDetailDialog(
            item = item,
            isMine = state.myEmployeeId != null && item.requesterId == state.myEmployeeId,
            targetIsMe = state.myEmployeeId != null && item.targetId == state.myEmployeeId,
            canDecide = state.canDecide,
            acting = state.actingId == item.id,
            onDismiss = { vm.closeDetail() },
            onApprove = { confirmAction = ConfirmAction.Approve(item) },
            onReject = { vm.openReject(item) },
            onCancel = { confirmAction = ConfirmAction.Cancel(item) },
        )
    }
    state.rejectTarget?.let { item ->
        RejectSwapDialog(
            item = item,
            note = state.rejectNote,
            onNoteChange = { vm.setRejectNote(it) },
            onDismiss = { vm.closeReject() },
            onConfirm = { vm.rejectSwap() },
        )
    }
    confirmAction?.let { action ->
        val item = when (action) {
            is ConfirmAction.Approve -> action.item
            is ConfirmAction.Cancel -> action.item
        }
        val isApprove = action is ConfirmAction.Approve
        AlertDialog(
            onDismissRequest = { confirmAction = null },
            title = { Text(if (isApprove) "Duyệt đơn đổi ca" else "Hủy đơn đổi ca") },
            text = {
                Text(
                    if (isApprove) {
                        "Duyệt đơn đổi ca ngày ${Format.date(item.workDate)} của " +
                            "${item.requesterName ?: "—"} với ${item.targetName ?: "—"} — " +
                            "ca làm của hai người ngày hôm đó sẽ được hoán đổi."
                    } else {
                        "Hủy đơn đổi ca ngày ${Format.date(item.workDate)}? " +
                            "Đơn sẽ chuyển sang trạng thái đã hủy."
                    },
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmAction = null
                        if (isApprove) vm.approveSwap(item) else vm.cancelSwap(item)
                    },
                ) {
                    Text(
                        if (isApprove) "Duyệt đơn" else "Hủy đơn",
                        color = if (isApprove) BrandBlue else DangerRed,
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmAction = null }) { Text("Huỷ") }
            },
        )
    }
}

// ----------------------------------------------------------------------
// Tổng quan + lọc — bám bản web (3 thẻ thống kê + lọc trạng thái).
// ----------------------------------------------------------------------

@Composable
private fun SummaryRow(state: ShiftSwapsUiState) {
    val pending = state.items.count { it.status == "pending" }
    val approved = state.items.count { it.status == "approved" }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        SummaryCell(
            label = "Tổng số đơn",
            value = state.items.size.toString(),
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        SummaryCell(
            label = "Đang chờ duyệt",
            value = pending.toString(),
            color = WarningAmber,
            modifier = Modifier.weight(1f),
        )
        SummaryCell(
            label = "Đã duyệt",
            value = approved.toString(),
            color = SuccessGreen,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun SummaryCell(label: String, value: String, color: Color, modifier: Modifier = Modifier) {
    HrmCard(modifier = modifier) {
        Column {
            Text(label, style = MaterialTheme.typography.bodySmall, color = InkMuted)
            Text(
                value,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                color = color,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FilterRow(state: ShiftSwapsUiState, vm: ShiftSwapsViewModel) {
    val filters = listOf(
        null to "Tất cả",
        "pending" to "Chờ duyệt",
        "approved" to "Đã duyệt",
        "rejected" to "Đã từ chối",
        "cancelled" to "Đã hủy",
    )
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        filters.forEach { (status, label) ->
            FilterChip(
                selected = state.statusFilter == status,
                onClick = { vm.setStatusFilter(status) },
                label = { Text(label) },
            )
        }
        FilterChip(
            selected = state.mineOnly,
            onClick = { vm.setMineOnly(!state.mineOnly) },
            label = { Text("Đơn của tôi") },
        )
    }
}

// ----------------------------------------------------------------------
// Thẻ đơn đổi ca
// ----------------------------------------------------------------------

@Composable
private fun SwapCard(
    item: ShiftSwapDto,
    isMine: Boolean,
    targetIsMe: Boolean,
    canDecide: Boolean,
    acting: Boolean,
    onOpenDetail: () -> Unit,
    onApprove: () -> Unit,
    onReject: () -> Unit,
    onCancel: () -> Unit,
) {
    HrmCard(
        modifier = Modifier.fillMaxWidth().clickable { onOpenDetail() },
    ) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Đổi ca ${Format.date(item.workDate)}",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                SwapStatusChip(item.status)
            }
            Spacer(Modifier.height(8.dp))
            SwapPeopleLines(item = item, isMine = isMine, targetIsMe = targetIsMe)
            if (!item.note.isNullOrBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    "Lý do: ${item.note}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            if (item.status != "pending" && !item.decidedByName.isNullOrBlank()) {
                Text(
                    "Người duyệt: ${item.decidedByName}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            Text(
                "Gửi lúc ${Format.dateTime(item.createdAt)}",
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
            if (item.status == "pending" && (canDecide || isMine)) {
                SwapActionButtons(
                    canDecide = canDecide,
                    isMine = isMine,
                    acting = acting,
                    onApprove = onApprove,
                    onReject = onReject,
                    onCancel = onCancel,
                )
            }
        }
    }
}

@Composable
private fun SwapPeopleLines(item: ShiftSwapDto, isMine: Boolean, targetIsMe: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        InitialAvatar(item.requesterName, 40)
        Column(modifier = Modifier.padding(start = 10.dp).weight(1f)) {
            Text(
                "${item.requesterName ?: "—"}${if (isMine) " (bạn)" else ""}",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                listOfNotNull(item.requesterCode, item.requesterDepartment)
                    .joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
        }
        Text(
            "→",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = BrandBlue,
        )
        Column(
            modifier = Modifier.padding(start = 10.dp).weight(1f),
            horizontalAlignment = Alignment.End,
        ) {
            Text(
                "${item.targetName ?: "—"}${if (targetIsMe) " (bạn)" else ""}",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                listOfNotNull(item.targetCode, item.targetDepartment)
                    .joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
        }
    }
}

@Composable
private fun SwapActionButtons(
    canDecide: Boolean,
    isMine: Boolean,
    acting: Boolean,
    onApprove: () -> Unit,
    onReject: () -> Unit,
    onCancel: () -> Unit,
) {
    Spacer(Modifier.height(12.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        if (canDecide) {
            Button(
                onClick = onApprove,
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
                onClick = onReject,
                enabled = !acting,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = DangerRed),
            ) { Text("Từ chối") }
        }
        if (isMine) {
            OutlinedButton(
                onClick = onCancel,
                enabled = !acting,
                modifier = Modifier.weight(1f),
            ) { Text("Hủy đơn") }
        }
    }
}

@Composable
fun SwapStatusChip(status: String?) {
    val (label, bg, fg) = when (status) {
        "pending" -> Triple("Chờ duyệt", Color(0xFFFFFAEB), WarningAmber)
        "approved" -> Triple("Đã duyệt", Color(0xFFECFDF3), SuccessGreen)
        "rejected" -> Triple("Đã từ chối", Color(0xFFFEF3F2), DangerRed)
        "cancelled" -> Triple("Đã hủy", Color(0xFFF2F4F7), InkMuted)
        null -> Triple("—", Color(0xFFF2F4F7), InkMuted)
        else -> Triple(status, Color(0xFFF2F4F7), InkMuted)
    }
    StatusChip(label, bg, fg)
}

// ----------------------------------------------------------------------
// Chi tiết đơn
// ----------------------------------------------------------------------

@Composable
private fun SwapDetailDialog(
    item: ShiftSwapDto,
    isMine: Boolean,
    targetIsMe: Boolean,
    canDecide: Boolean,
    acting: Boolean,
    onDismiss: () -> Unit,
    onApprove: () -> Unit,
    onReject: () -> Unit,
    onCancel: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Chi tiết đơn đổi ca") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                DetailLine("Ngày đổi ca", Format.date(item.workDate))
                DetailLine(
                    "Người xin đổi",
                    "${item.requesterName ?: "—"}${if (isMine) " (bạn)" else ""}\n" +
                        listOfNotNull(item.requesterCode, item.requesterDepartment)
                            .joinToString(" · "),
                )
                DetailLine(
                    "Đổi ca với",
                    "${item.targetName ?: "—"}${if (targetIsMe) " (bạn)" else ""}\n" +
                        listOfNotNull(item.targetCode, item.targetDepartment)
                            .joinToString(" · "),
                )
                DetailLine("Lý do", item.note?.ifBlank { null } ?: "—")
                DetailLine(
                    "Trạng thái",
                    when (item.status) {
                        "pending" -> "Chờ duyệt"
                        "approved" -> "Đã duyệt"
                        "rejected" -> "Đã từ chối"
                        "cancelled" -> "Đã hủy"
                        else -> item.status ?: "—"
                    },
                )
                if (!item.decidedByName.isNullOrBlank()) {
                    DetailLine("Người duyệt", item.decidedByName)
                }
                DetailLine("Gửi lúc", Format.dateTime(item.createdAt))
                if (item.status == "pending" && (canDecide || isMine)) {
                    SwapActionButtons(
                        canDecide = canDecide,
                        isMine = isMine,
                        acting = acting,
                        onApprove = onApprove,
                        onReject = onReject,
                        onCancel = onCancel,
                    )
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Đóng") }
        },
    )
}

@Composable
private fun DetailLine(label: String, value: String) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = InkMuted)
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}

// ----------------------------------------------------------------------
// Từ chối đơn — ghi chú không bắt buộc (khác tăng ca/chỉnh công).
// ----------------------------------------------------------------------

@Composable
private fun RejectSwapDialog(
    item: ShiftSwapDto,
    note: String,
    onNoteChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Từ chối đơn đổi ca") },
        text = {
            Column {
                Text(
                    "${item.requesterName ?: "Nhân viên"} · ${Format.date(item.workDate)} " +
                        "· đổi ca với ${item.targetName ?: "—"}",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = note,
                    onValueChange = { if (it.length <= 500) onNoteChange(it) },
                    label = { Text("Lý do từ chối (không bắt buộc)") },
                    placeholder = { Text("Ví dụ: không đủ người trực ca hôm đó...") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    "Đơn bị từ chối sẽ không đổi ca làm. Người xin đổi có thể tạo đơn mới cho ngày khác.",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text("Xác nhận từ chối", color = DangerRed)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Huỷ") }
        },
    )
}

// ----------------------------------------------------------------------
// Hộp thoại tạo đơn — bám form web: đồng nghiệp + ngày + lý do.
// ----------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreateSwapDialog(
    state: ShiftSwapsUiState,
    vm: ShiftSwapsViewModel,
) {
    var pickingDate by remember { mutableStateOf(false) }
    // Đóng hộp thoại khi ViewModel báo tạo thành công.
    LaunchedEffect(state.submitted) {
        if (state.submitted) {
            vm.consumeSubmitted()
            vm.closeCreate()
        }
    }
    AlertDialog(
        onDismissRequest = { vm.closeCreate() },
        title = { Text("Tạo đơn đổi ca") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                Text(
                    "Chọn đồng nghiệp và ngày muốn đổi ca — ca làm của hai người " +
                        "ngày hôm đó sẽ được hoán đổi khi đơn được duyệt.",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                Spacer(Modifier.height(12.dp))
                SwapPickerField(
                    label = "Đổi ca với",
                    value = state.selectedTarget?.let {
                        "${it.code ?: ""} · ${it.fullName ?: "—"}"
                    } ?: "Chọn đồng nghiệp",
                    icon = Icons.Filled.Person,
                    onClick = { vm.openColleaguePicker() },
                )
                Spacer(Modifier.height(12.dp))
                SwapPickerField(
                    label = "Ngày đổi ca",
                    value = state.workDate?.let { Format.dateOf(it) } ?: "Chọn ngày",
                    icon = Icons.Filled.CalendarToday,
                    onClick = { pickingDate = true },
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = state.note,
                    onValueChange = { if (it.length <= 500) vm.setNote(it) },
                    label = { Text("Lý do (không bắt buộc)") },
                    placeholder = { Text("Ví dụ: bận việc gia đình buổi sáng...") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    "Một người chỉ có tối đa một đơn đang chờ duyệt cho cùng một ngày. " +
                        "Khi đơn được duyệt, ca làm của hai người ngày hôm đó sẽ tự động hoán đổi.",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                if (state.formError != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        state.formError,
                        style = MaterialTheme.typography.bodySmall,
                        color = DangerRed,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !state.submitting,
                onClick = { vm.submitCreate() },
            ) {
                if (state.submitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = BrandBlue,
                    )
                } else {
                    Text("Gửi đơn", color = BrandBlue)
                }
            }
        },
        dismissButton = {
            TextButton(onClick = { vm.closeCreate() }) { Text("Huỷ") }
        },
    )
    if (pickingDate) {
        SwapDatePickDialog(
            initial = state.workDate ?: Format.today(),
            onDismiss = { pickingDate = false },
            onPick = {
                vm.setWorkDate(it)
                pickingDate = false
            },
        )
    }
}

@Composable
private fun SwapPickerField(label: String, value: String, icon: ImageVector, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, BorderGray, RoundedCornerShape(12.dp))
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = InkMuted)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                icon,
                contentDescription = label,
                tint = BrandBlue,
                modifier = Modifier.size(18.dp),
            )
            Text(
                value,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(start = 8.dp),
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwapDatePickDialog(
    initial: LocalDate,
    onDismiss: () -> Unit,
    onPick: (LocalDate) -> Unit,
) {
    val pickerState = rememberDatePickerState(
        initialSelectedDateMillis = initial
            .atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
    )
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                onClick = {
                    pickerState.selectedDateMillis?.let { millis ->
                        onPick(
                            Instant.ofEpochMilli(millis)
                                .atZone(ZoneOffset.UTC).toLocalDate(),
                        )
                    } ?: onDismiss()
                },
            ) { Text("Chọn") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Huỷ") }
        },
    ) {
        DatePicker(state = pickerState, showModeToggle = false)
    }
}

// ----------------------------------------------------------------------
// Chọn đồng nghiệp — bám EmployeePickerDialog của Kudos (tìm không dấu).
// ----------------------------------------------------------------------

@Composable
private fun ColleaguePickerDialog(state: ShiftSwapsUiState, vm: ShiftSwapsViewModel) {
    var query by remember { mutableStateOf("") }
    val filtered = remember(state.colleagues, query) {
        if (query.isBlank()) {
            state.colleagues
        } else {
            val q = query.trim().stripDiacritics()
            state.colleagues.filter { emp ->
                (emp.fullName ?: "").stripDiacritics().contains(q) ||
                    (emp.code ?: "").stripDiacritics().contains(q) ||
                    (emp.departmentName ?: "").stripDiacritics().contains(q)
            }
        }
    }
    AlertDialog(
        onDismissRequest = { vm.closeColleaguePicker() },
        title = { Text("Chọn đồng nghiệp") },
        text = {
            Column {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text("Tìm theo tên, mã, phòng ban…") },
                    leadingIcon = {
                        Icon(Icons.Outlined.Search, contentDescription = null)
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                when {
                    state.colleaguesLoading -> {
                        Box(
                            modifier = Modifier.fillMaxWidth().padding(24.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(color = BrandBlue)
                        }
                    }
                    filtered.isEmpty() -> {
                        Text(
                            text = "Không tìm thấy nhân viên phù hợp.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = InkMuted,
                        )
                    }
                    else -> {
                        LazyColumn(modifier = Modifier.heightIn(max = 340.dp)) {
                            items(filtered, key = { it.id ?: 0 }) { emp ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { vm.selectTarget(emp) }
                                        .padding(vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    InitialAvatar(name = emp.fullName, sizeDp = 38)
                                    Spacer(Modifier.width(10.dp))
                                    Column {
                                        Text(
                                            text = emp.fullName ?: "—",
                                            style = MaterialTheme.typography.bodyLarge,
                                            fontWeight = FontWeight.Medium,
                                        )
                                        val sub = listOfNotNull(
                                            emp.code,
                                            emp.departmentName,
                                        ).joinToString(" · ")
                                        if (sub.isNotBlank()) {
                                            Text(
                                                text = sub,
                                                style = MaterialTheme.typography.bodySmall,
                                                color = InkMuted,
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = { vm.closeColleaguePicker() }) { Text("Đóng") }
        },
    )
}
