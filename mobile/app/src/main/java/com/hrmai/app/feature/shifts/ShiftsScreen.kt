package com.hrmai.app.feature.shifts

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.text.input.KeyboardType
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

@Composable
fun ShiftsRoute(container: AppContainer) {
    val vm: ShiftsViewModel = viewModel(
        factory = ShiftsViewModel.Factory(
            container.api(ShiftsApi::class.java),
            container.sessionStore,
        ),
    )
    ShiftsScreen(vm)
}

private sealed interface DecideTarget {
    data class Ot(val item: OvertimeDto, val approved: Boolean) : DecideTarget
    data class Corr(val item: CorrectionDto, val approved: Boolean) : DecideTarget
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ShiftsScreen(vm: ShiftsViewModel) {
    val state by vm.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    var showOtDialog by remember { mutableStateOf(false) }
    var showCorrDialog by remember { mutableStateOf(false) }
    var decideTarget by remember { mutableStateOf<DecideTarget?>(null) }

    LaunchedEffect(state.message) {
        val msg = state.message ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(msg)
        vm.consumeMessage()
    }

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        Column(modifier = Modifier.fillMaxSize()) {
            val tabs = if (state.canApprove) {
                listOf("Lịch ca", "Yêu cầu", "Duyệt")
            } else {
                listOf("Lịch ca", "Yêu cầu")
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
                    0 -> ScheduleTab(state, vm)
                    1 -> MyRequestsTab(
                        state = state,
                        onNewOvertime = { showOtDialog = true },
                        onNewCorrection = { showCorrDialog = true },
                        onRefresh = { vm.refreshMine() },
                        onRetry = { vm.loadMine() },
                    )
                    2 -> QueueTab(
                        state = state,
                        onRefresh = { vm.refreshQueue() },
                        onRetry = { vm.loadQueue() },
                        onDecide = { target -> decideTarget = target },
                    )
                }
            }
        }
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
        )
    }

    if (showOtDialog) {
        OvertimeDialog(
            state = state,
            vm = vm,
            onDismiss = { showOtDialog = false },
            onDone = { showOtDialog = false },
        )
    }
    if (showCorrDialog) {
        CorrectionDialog(
            state = state,
            vm = vm,
            onDismiss = { showCorrDialog = false },
            onDone = { showCorrDialog = false },
        )
    }
    decideTarget?.let { target ->
        val (title, subtitle, acting) = when (target) {
            is DecideTarget.Ot -> Triple(
                if (target.approved) "Duyệt tăng ca" else "Từ chối tăng ca",
                "${target.item.employeeName ?: "Nhân viên"} · ${Format.date(target.item.workDate)}" +
                    " · ${formatHours(target.item.hours)} giờ",
                state.actingKey == "ot-${target.item.id}",
            )
            is DecideTarget.Corr -> Triple(
                if (target.approved) "Duyệt chỉnh công" else "Từ chối chỉnh công",
                "${target.item.employeeName ?: "Nhân viên"} · ${Format.date(target.item.workDate)}",
                state.actingKey == "corr-${target.item.id}",
            )
        }
        ShiftDecisionDialog(
            title = title,
            subtitle = subtitle,
            approved = when (target) {
                is DecideTarget.Ot -> target.approved
                is DecideTarget.Corr -> target.approved
            },
            acting = acting,
            onDismiss = { decideTarget = null },
            onConfirm = { note ->
                when (target) {
                    is DecideTarget.Ot -> vm.decideOvertime(target.item, target.approved, note)
                    is DecideTarget.Corr ->
                        vm.decideCorrection(target.item, target.approved, note)
                }
                decideTarget = null
            },
        )
    }
}

@Composable
private fun ShiftDecisionDialog(
    title: String,
    subtitle: String,
    approved: Boolean,
    acting: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var note by remember { mutableStateOf("") }
    var noteError by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = note,
                    onValueChange = {
                        note = it
                        noteError = null
                    },
                    label = {
                        Text(if (approved) "Ghi chú (tuỳ chọn)" else "Lý do từ chối (bắt buộc)")
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
                    if (!approved && note.isBlank()) {
                        noteError = "Nhập lý do từ chối giúp em nhé (server yêu cầu)."
                    } else {
                        onConfirm(note)
                    }
                },
            ) {
                Text(
                    if (approved) "Xác nhận duyệt" else "Xác nhận từ chối",
                    color = if (approved) BrandBlue else DangerRed,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Đóng") }
        },
    )
}

// ----------------------------------------------------------------------
// Tab 0: Lịch ca của tôi
// ----------------------------------------------------------------------

@Composable
private fun ScheduleTab(state: ShiftsUiState, vm: ShiftsViewModel) {
    val definitionsById = remember(state.definitions) {
        state.definitions.mapNotNull { d -> d.id?.let { it to d } }.toMap()
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                IconButton(onClick = { vm.shiftMonth(-1) }) {
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = "Tháng trước")
                }
                Text(
                    Format.monthLabel(state.month.atDay(1)),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                IconButton(onClick = { vm.shiftMonth(1) }) {
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = "Tháng sau")
                }
            }
        }
        when {
            state.scheduleLoading && state.schedule.isEmpty() -> {
                items(4) { SkeletonBlock(heightDp = 76) }
            }
            state.scheduleError != null && state.schedule.isEmpty() -> {
                item {
                    ErrorState(
                        message = state.scheduleError ?: "Không tải được lịch ca.",
                        onRetry = { vm.loadSchedule() },
                    )
                }
            }
            state.schedule.isEmpty() -> {
                item { EmptyState("Tháng này bạn chưa được xếp ca nào.") }
            }
            else -> {
                items(state.schedule, key = { it.id ?: 0 }) { item ->
                    val def = item.shiftId?.let { definitionsById[it] }
                    HrmCard(modifier = Modifier.fillMaxWidth()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    Format.date(item.workDate),
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Text(
                                    item.shiftName ?: "Ca làm việc",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = BrandBlueDark,
                                )
                                if (def != null) {
                                    val timeText = buildString {
                                        append(def.startTime?.take(5) ?: "—")
                                        append(" – ")
                                        append(def.endTime?.take(5) ?: "—")
                                        def.breakMinutes?.let {
                                            append(" · nghỉ ${it}′")
                                        }
                                        if (def.isOvernight == true) {
                                            append(" · ca qua đêm")
                                        }
                                    }
                                    Text(
                                        timeText,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = InkMuted,
                                    )
                                }
                                if (!item.note.isNullOrBlank()) {
                                    Text(
                                        item.note,
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
}

// ----------------------------------------------------------------------
// Tab 1: Yêu cầu của tôi (tăng ca + chỉnh công)
// ----------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MyRequestsTab(
    state: ShiftsUiState,
    onNewOvertime: () -> Unit,
    onNewCorrection: () -> Unit,
    onRefresh: () -> Unit,
    onRetry: () -> Unit,
) {
    PullToRefreshBox(
        isRefreshing = state.myRefreshing,
        onRefresh = onRefresh,
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = onNewOvertime,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                    ) { Text("Xin tăng ca") }
                    OutlinedButton(
                        onClick = onNewCorrection,
                        modifier = Modifier.weight(1f),
                    ) { Text("Xin chỉnh công") }
                }
            }
            item { SectionHeader(title = "Tăng ca của tôi") }
            when {
                state.myLoading && state.myOvertime.isEmpty() &&
                    state.myCorrections.isEmpty() -> {
                    items(3) { SkeletonBlock(heightDp = 96) }
                }
                state.myError != null && state.myOvertime.isEmpty() &&
                    state.myCorrections.isEmpty() -> {
                    item {
                        ErrorState(
                            message = state.myError ?: "Không tải được danh sách yêu cầu.",
                            onRetry = onRetry,
                        )
                    }
                }
                else -> {
                    if (state.myOvertime.isEmpty()) {
                        item { EmptyState("Chưa có yêu cầu tăng ca nào.") }
                    } else {
                        items(state.myOvertime, key = { "ot-${it.id}" }) { item ->
                            OvertimeCard(item, showOwner = false, acting = false, onDecide = null)
                        }
                    }
                    item { SectionHeader(title = "Chỉnh công của tôi") }
                    if (state.myCorrections.isEmpty()) {
                        item { EmptyState("Chưa có yêu cầu chỉnh công nào.") }
                    } else {
                        items(state.myCorrections, key = { "corr-${it.id}" }) { item ->
                            CorrectionCard(item, showOwner = false, acting = false, onDecide = null)
                        }
                    }
                }
            }
        }
    }
}

// ----------------------------------------------------------------------
// Tab 2: Duyệt yêu cầu
// ----------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QueueTab(
    state: ShiftsUiState,
    onRefresh: () -> Unit,
    onRetry: () -> Unit,
    onDecide: (DecideTarget) -> Unit,
) {
    PullToRefreshBox(
        isRefreshing = state.queueRefreshing,
        onRefresh = onRefresh,
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
                        "Yêu cầu của phòng đang chờ bạn duyệt (cấp quản lý)."
                    } else {
                        "Yêu cầu đã qua quản lý, đang chờ HR duyệt (cấp cuối)."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            item { SectionHeader(title = "Tăng ca chờ duyệt") }
            when {
                state.queueLoading && state.queueOvertime.isEmpty() &&
                    state.queueCorrections.isEmpty() -> {
                    items(3) { SkeletonBlock(heightDp = 120) }
                }
                state.queueError != null && state.queueOvertime.isEmpty() &&
                    state.queueCorrections.isEmpty() -> {
                    item {
                        ErrorState(
                            message = state.queueError ?: "Không tải được hàng đợi duyệt.",
                            onRetry = onRetry,
                        )
                    }
                }
                else -> {
                    if (state.queueOvertime.isEmpty()) {
                        item { EmptyState("Không có yêu cầu tăng ca nào chờ duyệt.") }
                    } else {
                        items(state.queueOvertime, key = { "qot-${it.id}" }) { item ->
                            OvertimeCard(
                                item = item,
                                showOwner = true,
                                acting = state.actingKey == "ot-${item.id}",
                                onDecide = { approved ->
                                    onDecide(DecideTarget.Ot(item, approved))
                                },
                            )
                        }
                    }
                    item { SectionHeader(title = "Chỉnh công chờ duyệt") }
                    if (state.queueCorrections.isEmpty()) {
                        item { EmptyState("Không có yêu cầu chỉnh công nào chờ duyệt.") }
                    } else {
                        items(state.queueCorrections, key = { "qcorr-${it.id}" }) { item ->
                            CorrectionCard(
                                item = item,
                                showOwner = true,
                                acting = state.actingKey == "corr-${item.id}",
                                onDecide = { approved ->
                                    onDecide(DecideTarget.Corr(item, approved))
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

// ----------------------------------------------------------------------
// Thẻ yêu cầu
// ----------------------------------------------------------------------

@Composable
private fun OvertimeCard(
    item: OvertimeDto,
    showOwner: Boolean,
    acting: Boolean,
    onDecide: ((Boolean) -> Unit)?,
) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            if (showOwner) {
                OwnerRow(item.employeeName, item.departmentName)
                Spacer(Modifier.height(8.dp))
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Tăng ca ${Format.date(item.workDate)}",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                ApprovalStatusChip(item.status)
            }
            Text(
                "Số giờ: ${formatHours(item.hours)} giờ",
                style = MaterialTheme.typography.bodyMedium,
            )
            if (!item.reason.isNullOrBlank()) {
                Text(
                    "Lý do: ${item.reason}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            ApprovalNotes(item)
            Text(
                "Gửi lúc ${Format.dateTime(item.createdAt)}",
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
            if (onDecide != null) {
                DecideButtons(acting = acting, onDecide = onDecide)
            }
        }
    }
}

@Composable
private fun CorrectionCard(
    item: CorrectionDto,
    showOwner: Boolean,
    acting: Boolean,
    onDecide: ((Boolean) -> Unit)?,
) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            if (showOwner) {
                OwnerRow(item.employeeName, item.departmentName)
                Spacer(Modifier.height(8.dp))
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Chỉnh công ${Format.date(item.workDate)}",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                ApprovalStatusChip(item.status)
            }
            val inText = item.requestedCheckIn?.let { Format.time(it) }
            val outText = item.requestedCheckOut?.let { Format.time(it) }
            Text(
                "Giờ đề xuất: vào ${inText ?: "—"} · ra ${outText ?: "—"}",
                style = MaterialTheme.typography.bodyMedium,
            )
            if (!item.reason.isNullOrBlank()) {
                Text(
                    "Lý do: ${item.reason}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            ApprovalNotes(item)
            Text(
                "Gửi lúc ${Format.dateTime(item.createdAt)}",
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
            if (onDecide != null) {
                DecideButtons(acting = acting, onDecide = onDecide)
            }
        }
    }
}

@Composable
private fun OwnerRow(name: String?, department: String?) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        InitialAvatar(name, 42)
        Column(modifier = Modifier.padding(start = 10.dp)) {
            Text(
                name ?: "Nhân viên",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            if (!department.isNullOrBlank()) {
                Text(
                    department,
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
        }
    }
}

@Composable
private fun ApprovalNotes(fields: ApprovalFields) {
    if (!fields.managerNote.isNullOrBlank()) {
        Text(
            "Quản lý${fields.managerDecidedByName?.let { " ($it)" } ?: ""}: ${fields.managerNote}",
            style = MaterialTheme.typography.bodySmall,
            color = InkMuted,
        )
    }
    if (!fields.hrNote.isNullOrBlank()) {
        Text(
            "HR${fields.hrDecidedByName?.let { " ($it)" } ?: ""}: ${fields.hrNote}",
            style = MaterialTheme.typography.bodySmall,
            color = InkMuted,
        )
    }
}

@Composable
private fun DecideButtons(acting: Boolean, onDecide: (Boolean) -> Unit) {
    Spacer(Modifier.height(12.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Button(
            onClick = { onDecide(true) },
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
            onClick = { onDecide(false) },
            enabled = !acting,
            modifier = Modifier.weight(1f),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = DangerRed),
        ) { Text("Từ chối") }
    }
}

// ----------------------------------------------------------------------
// Hộp thoại tạo yêu cầu
// ----------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OvertimeDialog(
    state: ShiftsUiState,
    vm: ShiftsViewModel,
    onDismiss: () -> Unit,
    onDone: () -> Unit,
) {
    var picking by remember { mutableStateOf(false) }
    // Đóng hộp thoại khi ViewModel báo gửi thành công.
    LaunchedEffect(state.otSubmitted) {
        if (state.otSubmitted) {
            vm.consumeOtSubmitted()
            onDone()
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Xin tăng ca") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                ShiftDateField(
                    label = "Ngày tăng ca",
                    value = state.otDate,
                    onClick = { picking = true },
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = state.otHours,
                    onValueChange = { vm.setOtHours(it) },
                    label = { Text("Số giờ tăng ca (tối đa 16)") },
                    placeholder = { Text("Ví dụ: 2 hoặc 2,5") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = state.otReason,
                    onValueChange = { vm.setOtReason(it) },
                    label = { Text("Lý do (tuỳ chọn)") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (state.otError != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        state.otError,
                        style = MaterialTheme.typography.bodySmall,
                        color = DangerRed,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !state.otSubmitting,
                onClick = { vm.submitOvertime() },
            ) {
                if (state.otSubmitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = BrandBlue,
                    )
                } else {
                    Text("Gửi yêu cầu", color = BrandBlue)
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Đóng") }
        },
    )
    if (picking) {
        DatePickDialog(
            initial = state.otDate ?: Format.today(),
            onDismiss = { picking = false },
            onPick = {
                vm.setOtDate(it)
                picking = false
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CorrectionDialog(
    state: ShiftsUiState,
    vm: ShiftsViewModel,
    onDismiss: () -> Unit,
    onDone: () -> Unit,
) {
    var picking by remember { mutableStateOf(false) }
    LaunchedEffect(state.corrSubmitted) {
        if (state.corrSubmitted) {
            vm.consumeCorrSubmitted()
            onDone()
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Xin chỉnh công") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                ShiftDateField(
                    label = "Ngày cần chỉnh",
                    value = state.corrDate,
                    onClick = { picking = true },
                )
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(
                        value = state.corrIn,
                        onValueChange = { vm.setCorrIn(it) },
                        label = { Text("Giờ vào") },
                        placeholder = { Text("08:30") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        value = state.corrOut,
                        onValueChange = { vm.setCorrOut(it) },
                        label = { Text("Giờ ra") },
                        placeholder = { Text("17:30") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    "Điền ít nhất một trong hai giờ theo định dạng HH:mm.",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = state.corrReason,
                    onValueChange = { vm.setCorrReason(it) },
                    label = { Text("Lý do chỉnh công") },
                    placeholder = { Text("Ví dụ: Quên chấm công khi đến sớm…") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (state.corrError != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        state.corrError,
                        style = MaterialTheme.typography.bodySmall,
                        color = DangerRed,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !state.corrSubmitting,
                onClick = { vm.submitCorrection() },
            ) {
                if (state.corrSubmitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = BrandBlue,
                    )
                } else {
                    Text("Gửi yêu cầu", color = BrandBlue)
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Đóng") }
        },
    )
    if (picking) {
        DatePickDialog(
            initial = state.corrDate ?: Format.today(),
            onDismiss = { picking = false },
            onPick = {
                vm.setCorrDate(it)
                picking = false
            },
        )
    }
}

@Composable
private fun ShiftDateField(label: String, value: LocalDate?, onClick: () -> Unit) {
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DatePickDialog(
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
// Tiện ích hiển thị
// ----------------------------------------------------------------------

@Composable
fun ApprovalStatusChip(status: String?) {
    val (label, bg, fg) = when (status) {
        "pending" -> Triple("Chờ quản lý duyệt", Color(0xFFFFFAEB), WarningAmber)
        "manager_approved" -> Triple("Chờ HR duyệt", BrandBlueSoft, BrandBlueDark)
        "approved" -> Triple("Đã duyệt", Color(0xFFECFDF3), SuccessGreen)
        "rejected" -> Triple("Bị từ chối", Color(0xFFFEF3F2), DangerRed)
        null -> Triple("—", Color(0xFFF2F4F7), InkMuted)
        else -> Triple(status, Color(0xFFF2F4F7), InkMuted)
    }
    StatusChip(label, bg, fg)
}

/** 2.0 -> "2", 2.5 -> "2,5". */
private fun formatHours(value: Double?): String {
    if (value == null) return "0"
    return if (value % 1.0 == 0.0) {
        value.toInt().toString()
    } else {
        value.toString().replace('.', ',')
    }
}
