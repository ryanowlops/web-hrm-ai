package com.hrmai.app.feature.attendance

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
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
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.SkeletonBlock
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.BrandBlueDark
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.DangerRed
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format
import kotlinx.coroutines.delay
import java.time.DayOfWeek
import java.time.YearMonth

@Composable
fun AttendanceRoute(container: AppContainer) {
    val vm: AttendanceViewModel = viewModel(
        factory = AttendanceViewModel.Factory(
            container.api(AttendanceApi::class.java),
            container.sessionStore,
        ),
    )
    AttendanceScreen(vm)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AttendanceScreen(vm: AttendanceViewModel) {
    val state by vm.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val haptic = LocalHapticFeedback.current

    LaunchedEffect(state.message) {
        val msg = state.message ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(msg)
        vm.consumeMessage()
    }
    LaunchedEffect(state.showSuccess) {
        if (state.showSuccess) {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            delay(1600)
            vm.consumeSuccess()
        }
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
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                item { TodaySection(state, vm) }
                item { MainActionSection(state, vm) }
                item { MonthHeader(state, vm) }
                when {
                    state.monthLoading -> {
                        items(3) { SkeletonBlock(heightDp = 68) }
                    }
                    state.monthError != null && state.records.isEmpty() -> {
                        item {
                            ErrorState(
                                message = state.monthError ?: "Không tải được lịch sử chấm công.",
                                onRetry = { vm.retryMonth() },
                            )
                        }
                    }
                    state.records.isEmpty() -> {
                        item { EmptyState("Chưa có dữ liệu chấm công trong tháng này.") }
                    }
                    else -> {
                        items(state.records, key = { it.id ?: it.workDate ?: "" }) { record ->
                            AttendanceRecordRow(record)
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
}

@Composable
private fun TodaySection(state: AttendanceUiState, vm: AttendanceViewModel) {
    when {
        state.todayLoading && state.today == null -> SkeletonBlock(heightDp = 132)
        state.todayError != null && state.today == null -> {
            HrmCard(modifier = Modifier.fillMaxWidth()) {
                ErrorState(
                    message = state.todayError ?: "Không tải được trạng thái hôm nay.",
                    onRetry = { vm.retryToday() },
                )
            }
        }
        else -> {
            val today = state.today
            val record = today?.data
            HrmCard(modifier = Modifier.fillMaxWidth()) {
                Column {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column {
                            Text(
                                "Hôm nay",
                                style = MaterialTheme.typography.labelLarge,
                                color = InkMuted,
                            )
                            Text(
                                Format.dateOf(Format.today()),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        if (record != null) {
                            AttendanceStatusChip(record.status)
                        } else {
                            StatusChip(
                                "Chưa chấm công",
                                Color(0xFFF2F4F7),
                                InkMuted,
                            )
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    Row(modifier = Modifier.fillMaxWidth()) {
                        TimeCell(
                            label = "Giờ vào",
                            value = record?.checkInAt?.let { Format.time(it) } ?: "Chưa chấm",
                            modifier = Modifier.weight(1f),
                        )
                        TimeCell(
                            label = "Giờ ra",
                            value = record?.checkOutAt?.let { Format.time(it) } ?: "—",
                            modifier = Modifier.weight(1f),
                        )
                        TimeCell(
                            label = "Giờ chuẩn",
                            value = today?.workStartTime ?: "08:30",
                            modifier = Modifier.weight(1f),
                        )
                    }
                    if (!record?.note.isNullOrBlank()) {
                        Spacer(Modifier.height(10.dp))
                        Text(
                            record?.note ?: "",
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TimeCell(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = InkMuted)
        Text(
            value,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun MainActionSection(state: AttendanceUiState, vm: AttendanceViewModel) {
    val today = state.today
    val hasIn = today?.hasCheckedIn == true
    val hasOut = today?.hasCheckedOut == true
    val onLeave = today?.data?.status == "on_leave"
    val enabled = !state.acting && today != null && !hasOut && !onLeave
    val label = when {
        onLeave -> "Đang nghỉ phép"
        hasOut -> "Đã chấm công đủ"
        hasIn -> "Chấm công ra"
        else -> "Chấm công vào"
    }
    val bg = when {
        hasOut || onLeave -> Color(0xFF98A2B3)
        hasIn -> BrandBlueDark
        else -> BrandBlue
    }
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Box(
                modifier = Modifier
                    .size(168.dp)
                    .clip(CircleShape)
                    .background(bg)
                    .clickable(enabled = enabled) { vm.onMainAction() },
                contentAlignment = Alignment.Center,
            ) {
                if (state.acting) {
                    CircularProgressIndicator(color = Color.White)
                } else {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Filled.Fingerprint,
                            contentDescription = label,
                            tint = Color.White,
                            modifier = Modifier.size(44.dp),
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            label,
                            color = Color.White,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }
            // Vòng tròn thành công nảy kiểu spring khi chấm công xong.
            // Dùng animateFloatAsState thay AnimatedVisibility để tránh
            // xung đột overload ColumnScope trong Box lồng nhau.
            val successScale by animateFloatAsState(
                targetValue = if (state.showSuccess) 1f else 0.3f,
                animationSpec = spring(
                    dampingRatio = Spring.DampingRatioMediumBouncy,
                    stiffness = Spring.StiffnessLow,
                ),
                label = "successScale",
            )
            val successAlpha by animateFloatAsState(
                targetValue = if (state.showSuccess) 1f else 0f,
                animationSpec = tween(200),
                label = "successAlpha",
            )
            if (state.showSuccess || successAlpha > 0.01f) {
                Box(
                    modifier = Modifier
                        .size(96.dp)
                        .scale(successScale)
                        .alpha(successAlpha)
                        .clip(CircleShape)
                        .background(SuccessGreen),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Filled.Check,
                        contentDescription = "Thành công",
                        tint = Color.White,
                        modifier = Modifier.size(54.dp),
                    )
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Text(
            when {
                onLeave -> "Hôm nay bạn có đơn nghỉ đã được duyệt."
                hasOut -> "Cảm ơn bạn, hẹn gặp lại vào ngày mai."
                hasIn -> "Nhấn để ghi nhận giờ ra khi kết thúc ngày làm việc."
                else -> "Nhấn để ghi nhận giờ vào theo giờ máy chủ."
            },
            style = MaterialTheme.typography.bodySmall,
            color = InkMuted,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun MonthHeader(state: AttendanceUiState, vm: AttendanceViewModel) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            SectionHeader(title = "Lịch sử chấm công")
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            IconButton(onClick = { vm.shiftMonth(-1) }) {
                Icon(Icons.Filled.ChevronLeft, contentDescription = "Tháng trước")
            }
            Text(
                Format.monthLabel(state.month.atDay(1)),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            IconButton(
                onClick = { vm.shiftMonth(1) },
                enabled = state.month < YearMonth.from(Format.today()),
            ) {
                Icon(Icons.Filled.ChevronRight, contentDescription = "Tháng sau")
            }
        }
        val summary = state.summary
        if (summary != null) {
            Text(
                buildString {
                    append("Ngày công: ${summary.workdays ?: summary.daysWorked ?: 0}")
                    append(" · Đúng giờ: ${summary.present ?: 0}")
                    append(" · Muộn: ${summary.lateCount ?: summary.late ?: 0}")
                    append(" · Thiếu giờ ra: ${summary.missingCheckout ?: 0}")
                    if ((summary.onLeave ?: 0) > 0) append(" · Nghỉ phép: ${summary.onLeave}")
                },
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
        }
    }
}

@Composable
private fun AttendanceRecordRow(record: AttendanceRecordDto) {
    HrmCard(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1.1f)) {
                Text(
                    Format.date(record.workDate),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    weekdayLabel(record.workDate),
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            Column(modifier = Modifier.weight(1.6f)) {
                Text(
                    "Vào ${Format.time(record.checkInAt)} · Ra ${Format.time(record.checkOutAt)}",
                    style = MaterialTheme.typography.bodyMedium,
                )
                if (!record.note.isNullOrBlank()) {
                    Text(
                        record.note,
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
            }
            AttendanceStatusChip(record.status)
        }
    }
}

@Composable
fun AttendanceStatusChip(status: String?) {
    val (label, bg, fg) = when (status) {
        "present" -> Triple("Đúng giờ", Color(0xFFECFDF3), SuccessGreen)
        "late" -> Triple("Đi muộn", Color(0xFFFFFAEB), WarningAmber)
        "absent" -> Triple("Vắng mặt", Color(0xFFFEF3F2), DangerRed)
        "on_leave" -> Triple("Nghỉ phép", BrandBlueSoft, BrandBlueDark)
        null -> Triple("Chưa chấm", Color(0xFFF2F4F7), InkMuted)
        else -> Triple(status, Color(0xFFF2F4F7), InkMuted)
    }
    StatusChip(label, bg, fg)
}

private fun weekdayLabel(rawDate: String?): String {
    val date = Format.parseDate(rawDate) ?: return ""
    return when (date.dayOfWeek) {
        DayOfWeek.MONDAY -> "Thứ 2"
        DayOfWeek.TUESDAY -> "Thứ 3"
        DayOfWeek.WEDNESDAY -> "Thứ 4"
        DayOfWeek.THURSDAY -> "Thứ 5"
        DayOfWeek.FRIDAY -> "Thứ 6"
        DayOfWeek.SATURDAY -> "Thứ 7"
        DayOfWeek.SUNDAY -> "Chủ nhật"
    }
}
