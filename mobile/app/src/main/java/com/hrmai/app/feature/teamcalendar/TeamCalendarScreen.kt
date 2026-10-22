package com.hrmai.app.feature.teamcalendar

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.InitialAvatar
import com.hrmai.app.core.ui.LoadingState
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BorderGray
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun TeamCalendarRoute(container: AppContainer) {
    val vm: TeamCalendarViewModel = viewModel(
        factory = TeamCalendarViewModel.Factory(
            container.api(TeamCalendarApi::class.java),
        ),
    )
    TeamCalendarScreen(vm)
}

@Composable
private fun TeamCalendarScreen(vm: TeamCalendarViewModel) {
    val state by vm.state.collectAsState()
    Column(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        Column(modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp)) {
            SectionHeader(title = "Lịch nhóm")
            Spacer(Modifier.height(4.dp))
            Text(
                "Ai đang nghỉ phép trong tuần — phạm vi theo vai trò của bạn (quản lý/HR xem cả nhóm, nhân viên xem phòng mình).",
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
            Spacer(Modifier.height(12.dp))
            WeekNavigator(state, vm)
        }
        when {
            state.loading && state.days.isEmpty() -> LoadingState()
            state.forbidden && state.days.isEmpty() -> {
                EmptyState("Tính năng dành cho quản lý/HR hoặc thành viên cùng phòng ban.")
            }
            state.error != null && state.days.isEmpty() -> {
                ErrorState(
                    message = state.error ?: "Không tải được lịch nhóm.",
                    onRetry = { vm.load() },
                )
            }
            else -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item {
                        WeekStrip(
                            state = state,
                            onSelect = { vm.selectDate(it) },
                        )
                    }
                    item {
                        SectionHeader(
                            title = "Nghỉ phép ngày ${Format.dateOf(state.selectedDate)}",
                        )
                    }
                    if (state.loading) {
                        item { LoadingState() }
                    } else if (state.selectedEntries.isEmpty()) {
                        item {
                            EmptyState("Không có ai nghỉ phép vào ngày này. Cả nhóm đều đi làm. 🎉")
                        }
                    } else {
                        items(state.selectedEntries, key = { it.id ?: 0 }) { entry ->
                            LeaveEntryCard(entry)
                        }
                    }
                    item {
                        WeekOverview(state)
                    }
                }
            }
        }
    }
}

@Composable
private fun WeekNavigator(state: TeamCalendarUiState, vm: TeamCalendarViewModel) {
    val weekEnd = state.weekStart.plusDays(6)
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        IconButton(onClick = { vm.previousWeek() }) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Tuần trước")
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                "${Format.dateOf(state.weekStart)} – ${Format.dateOf(weekEnd)}",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                Format.monthLabel(state.weekStart),
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { vm.goToToday() }) { Text("Hôm nay") }
            IconButton(onClick = { vm.nextWeek() }) {
                Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "Tuần sau")
            }
        }
    }
}

@Composable
private fun WeekStrip(state: TeamCalendarUiState, onSelect: (LocalDate) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        state.days.forEach { day ->
            val selected = day.date == state.selectedDate
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (selected) BrandBlue else Color.White)
                    .border(
                        1.dp,
                        if (selected) BrandBlue else BorderGray,
                        RoundedCornerShape(12.dp),
                    )
                    .clickable { onSelect(day.date) }
                    .padding(vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    day.date.format(WEEKDAY_FORMATTER),
                    style = MaterialTheme.typography.labelSmall,
                    color = if (selected) Color.White else InkMuted,
                    textAlign = TextAlign.Center,
                )
                Text(
                    day.date.dayOfMonth.toString(),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (selected) Color.White else MaterialTheme.colorScheme.onSurface,
                    textAlign = TextAlign.Center,
                )
                Text(
                    when {
                        day.entries.isEmpty() -> "—"
                        else -> "${day.entries.size} nghỉ"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = if (selected) Color.White else WarningAmber,
                    fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.Center,
                )
                if (day.isToday && !selected) {
                    Text(
                        "Hôm nay",
                        style = MaterialTheme.typography.labelSmall,
                        color = BrandBlue,
                        fontWeight = FontWeight.SemiBold,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

@Composable
private fun LeaveEntryCard(entry: TeamLeaveEntryDto) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            InitialAvatar(entry.employeeName, 42)
            Column(modifier = Modifier.padding(start = 10.dp).weight(1f)) {
                Text(
                    entry.employeeName ?: "Nhân viên",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    "${Format.date(entry.fromDate)} → ${Format.date(entry.toDate)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                if (!entry.reason.isNullOrBlank()) {
                    Text(
                        "Lý do: ${entry.reason}",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
            }
            StatusChip(
                entry.leaveTypeName ?: "Nghỉ phép",
                Color(0xFFFFFAEB),
                WarningAmber,
            )
        }
    }
}

/** Tổng kết cả tuần: mỗi người + tổng số ngày nghỉ trong tuần đang xem. */
@Composable
private fun WeekOverview(state: TeamCalendarUiState) {
    val counts = state.days
        .flatMap { it.entries }
        .groupBy { it.employeeName ?: "Nhân viên" }
        .mapValues { (_, entries) -> entries.size }
    if (counts.isEmpty()) return
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            SectionHeader(title = "Tổng kết tuần")
            Spacer(Modifier.height(8.dp))
            Text(
                counts.entries
                    .sortedByDescending { it.value }
                    .joinToString("\n") { (name, count) -> "• $name: nghỉ $count ngày trong tuần" },
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                "Mỗi ngày vắng được tính theo đơn nghỉ đã duyệt.",
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
        }
    }
}

private val WEEKDAY_FORMATTER: DateTimeFormatter =
    DateTimeFormatter.ofPattern("EEE", Locale("vi", "VN"))
