package com.hrmai.app.feature.journey

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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.LocalFireDepartment
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.InitialAvatar
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.SkeletonBlock
import com.hrmai.app.core.ui.theme.BorderGray
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format
import com.hrmai.app.feature.kudos.BadgeDto
import com.hrmai.app.feature.kudos.PointsLeaderboardItemDto
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

@Composable
fun JourneyRoute(container: AppContainer) {
    val vm: JourneyViewModel = viewModel(
        factory = JourneyViewModel.Factory(
            container.api(JourneyApi::class.java),
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
        JourneyScreen(state = state, vm = vm)
        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun JourneyScreen(state: JourneyUiState, vm: JourneyViewModel) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "Hành trình của tôi",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp),
        )
        Text(
            text = "Nhìn lại một năm chuyên cần và những huy hiệu đã đạt",
            style = MaterialTheme.typography.bodyMedium,
            color = InkMuted,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp),
        )

        when {
            state.loading -> {
                Column(
                    modifier = Modifier.fillMaxSize().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SkeletonBlock(heightDp = 96)
                    SkeletonBlock(heightDp = 190)
                    SkeletonBlock(heightDp = 140)
                }
            }
            state.error != null && state.yearData == null -> {
                ErrorState(message = state.error, onRetry = { vm.load() })
            }
            else -> {
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
                        item { StreakSummaryCard(state = state) }
                        item { HeatmapCard(state = state, vm = vm) }
                        item { DayDetailCard(state = state) }
                        if (state.badges.isNotEmpty()) {
                            item { BadgesCard(badges = state.badges) }
                        }
                        item {
                            LeaderboardPositionCard(
                                state = state,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StreakSummaryCard(state: JourneyUiState) {
    val summary = state.yearData?.summary
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.LocalFireDepartment,
                    contentDescription = null,
                    tint = WarningAmber,
                    modifier = Modifier.size(22.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = "Chuỗi ngày đúng giờ",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(Modifier.height(12.dp))
            Row(modifier = Modifier.fillMaxWidth()) {
                StatColumn(
                    modifier = Modifier.weight(1f),
                    value = "${summary?.currentStreak ?: 0}",
                    label = "Chuỗi hiện tại (ngày)",
                    highlight = true,
                )
                StatColumn(
                    modifier = Modifier.weight(1f),
                    value = "${summary?.bestStreak ?: 0}",
                    label = "Chuỗi dài nhất (ngày)",
                )
                StatColumn(
                    modifier = Modifier.weight(1f),
                    value = "${summary?.totalDays ?: 0}",
                    label = "Tổng ngày công",
                )
            }
            Spacer(Modifier.height(10.dp))
            Row(modifier = Modifier.fillMaxWidth()) {
                StatColumn(
                    modifier = Modifier.weight(1f),
                    value = "${summary?.onTimeDays ?: 0}",
                    label = "Ngày đúng giờ",
                )
                StatColumn(
                    modifier = Modifier.weight(1f),
                    value = "${summary?.lateDays ?: 0}",
                    label = "Ngày đi muộn",
                )
                StatColumn(
                    modifier = Modifier.weight(1f),
                    value = "${state.points?.balance ?: 0}",
                    label = "Điểm hiện có",
                )
            }
        }
    }
}

@Composable
private fun StatColumn(
    modifier: Modifier = Modifier,
    value: String,
    label: String,
    highlight: Boolean = false,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = value,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = if (highlight) BrandBlue else MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = InkMuted,
            textAlign = TextAlign.Center,
        )
    }
}

/** Một ô trong lưới nhiệt: ngày + trạng thái (null = không có bản ghi). */
private data class HeatCell(val date: LocalDate, val status: String?)

/** Màu ô theo trạng thái — phẳng, không dùng gradient. */
private fun heatColor(status: String?, isFuture: Boolean): Color = when {
    isFuture -> Color(0xFFF9FAFB)
    status == AttendanceDayStatus.PRESENT -> SuccessGreen
    status == AttendanceDayStatus.LATE -> Color(0xFFF79009)
    status == AttendanceDayStatus.ABSENT -> Color(0xFFF04438)
    status == AttendanceDayStatus.ON_LEAVE -> Color(0xFF84ADFF)
    else -> Color(0xFFEAECF0)
}

@Composable
private fun HeatmapCard(state: JourneyUiState, vm: JourneyViewModel) {
    val year = state.year
    val today = Format.today()
    val dayStatus = remember(state.yearData) {
        val map = HashMap<LocalDate, JourneyDayDto>()
        state.yearData?.days.orEmpty().forEach { day ->
            Format.parseDate(day.date)?.let { map[it] = day }
        }
        map
    }
    // Lưới kiểu GitHub: cột = tuần (bắt đầu thứ 2), hàng = 7 ngày trong tuần.
    val weeks = remember(year, dayStatus) {
        val jan1 = LocalDate.of(year, 1, 1)
        val start = jan1.minusDays((jan1.dayOfWeek.value - DayOfWeek.MONDAY.value).toLong())
        val dec31 = LocalDate.of(year, 12, 31)
        val totalDays = ChronoUnit.DAYS.between(start, dec31).toInt() + 1
        val weekCount = (totalDays + 6) / 7
        (0 until weekCount).map { w ->
            (0 until 7).map { d ->
                val date = start.plusDays((w * 7 + d).toLong())
                HeatCell(date = date, status = dayStatus[date]?.status)
            }
        }
    }
    val listState = rememberLazyListState()
    LaunchedEffect(year, weeks) {
        if (year == today.year) {
            val jan1 = LocalDate.of(year, 1, 1)
            val start = jan1.minusDays((jan1.dayOfWeek.value - DayOfWeek.MONDAY.value).toLong())
            val currentWeek = (ChronoUnit.DAYS.between(start, today) / 7).toInt()
            val target = (currentWeek - 3).coerceAtLeast(0)
            if (target in weeks.indices) listState.scrollToItem(target)
        }
    }

    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Bản đồ chuyên cần",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { vm.changeYear(-1) }) {
                    Icon(
                        Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                        contentDescription = "Năm trước",
                    )
                }
                Text(
                    text = "$year",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = BrandBlue,
                )
                IconButton(
                    onClick = { vm.changeYear(1) },
                    enabled = year < today.year,
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.KeyboardArrowRight,
                        contentDescription = "Năm sau",
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            LazyRow(
                state = listState,
                horizontalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                itemsIndexed(weeks) { _, week ->
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        week.forEach { cell ->
                            val inYear = cell.date.year == year
                            val isFuture = cell.date.isAfter(today)
                            val selected = state.selectedDate == cell.date
                            Box(
                                modifier = Modifier
                                    .size(11.dp)
                                    .clip(RoundedCornerShape(2.dp))
                                    .background(
                                        if (inYear) {
                                            heatColor(cell.status, isFuture)
                                        } else {
                                            Color.Transparent
                                        }
                                    )
                                    .then(
                                        if (selected) {
                                            Modifier.border(
                                                1.5.dp,
                                                BrandBlue,
                                                RoundedCornerShape(2.dp),
                                            )
                                        } else {
                                            Modifier
                                        }
                                    )
                                    .clickable(enabled = inYear) {
                                        vm.selectDay(cell.date, dayStatus[cell.date])
                                    },
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                LegendDot(heatColor(AttendanceDayStatus.PRESENT, false), "Đúng giờ")
                LegendDot(heatColor(AttendanceDayStatus.LATE, false), "Muộn")
                LegendDot(heatColor(AttendanceDayStatus.ABSENT, false), "Vắng")
                LegendDot(heatColor(AttendanceDayStatus.ON_LEAVE, false), "Nghỉ phép")
                LegendDot(heatColor(null, false), "Không có dữ liệu")
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Chạm vào một ô để xem chi tiết ngày đó.",
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
        }
    }
}

@Composable
private fun LegendDot(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(color),
        )
        Spacer(Modifier.width(4.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = InkMuted,
        )
    }
}

@Composable
private fun DayDetailCard(state: JourneyUiState) {
    val date = state.selectedDate ?: return
    val day = state.selectedDay
    val weekdayFmt = remember { DateTimeFormatter.ofPattern("EEEE", java.util.Locale("vi", "VN")) }
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Text(
                text = "${date.format(weekdayFmt).replaceFirstChar { it.uppercase() }}, " +
                    Format.dateOf(date),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(6.dp))
            if (day == null) {
                Text(
                    text = "Không có bản ghi chấm công trong ngày này.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = InkMuted,
                )
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(12.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(heatColor(day.status, false)),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = AttendanceDayStatus.labelOf(day.status),
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium,
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Giờ vào: ${Format.time(day.checkIn)} · Giờ ra: ${Format.time(day.checkOut)}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = InkMuted,
                )
            }
        }
    }
}

@Composable
private fun BadgesCard(badges: List<BadgeDto>) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            SectionHeader("Huy hiệu")
            Spacer(Modifier.height(10.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(badges, key = { it.key ?: it.name ?: "" }) { badge ->
                    BadgeItem(badge = badge)
                }
            }
        }
    }
}

@Composable
private fun BadgeItem(badge: BadgeDto) {
    val earned = badge.earned == true
    Column(
        modifier = Modifier
            .width(100.dp)
            .clip(RoundedCornerShape(12.dp))
            .border(
                1.dp,
                if (earned) BrandBlue else BorderGray,
                RoundedCornerShape(12.dp),
            )
            .background(if (earned) Color.White else Color(0xFFF2F4F7))
            .padding(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = badge.emoji ?: "🏅",
            style = MaterialTheme.typography.headlineMedium,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = badge.name ?: "",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = if (earned) MaterialTheme.colorScheme.onSurface else InkMuted,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = if (earned) "Đã đạt" else (badge.progressText ?: ""),
            style = MaterialTheme.typography.labelSmall,
            color = if (earned) SuccessGreen else InkMuted,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun LeaderboardPositionCard(state: JourneyUiState) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            SectionHeader("Bảng xếp hạng điểm")
            Spacer(Modifier.height(10.dp))
            when {
                state.myRank != null -> {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(BrandBlue),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = "#${state.myRank}",
                                color = Color.White,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "Hạng của bạn: ${state.myRank}",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                text = "Tổng điểm đã kiếm: ${state.leaderboard.firstOrNull { it.employee?.id == state.myEmployeeId }?.totalEarned ?: state.points?.totalEarned ?: 0}",
                                style = MaterialTheme.typography.bodySmall,
                                color = InkMuted,
                            )
                        }
                    }
                }
                else -> {
                    Text(
                        text = "Bạn chưa có mặt trong bảng xếp hạng. Nhận kudos hoặc " +
                            "hoàn thành khoá học để bắt đầu tích điểm nhé!",
                        style = MaterialTheme.typography.bodyMedium,
                        color = InkMuted,
                    )
                }
            }
            if (state.leaderboard.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                state.leaderboard.take(5).forEachIndexed { index, item ->
                    JourneyRankRow(
                        rank = index + 1,
                        item = item,
                        isMe = item.employee?.id != null && item.employee?.id == state.myEmployeeId,
                    )
                }
                if (state.leaderboard.size > 5) {
                    Text(
                        text = "… và ${state.leaderboard.size - 5} đồng nghiệp khác",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
            } else {
                Spacer(Modifier.height(4.dp))
                EmptyState("Chưa có dữ liệu xếp hạng điểm.")
            }
        }
    }
}

@Composable
private fun JourneyRankRow(rank: Int, item: PointsLeaderboardItemDto, isMe: Boolean) {
    val rankBg = when (rank) {
        1 -> Color(0xFFFDB022)
        2 -> Color(0xFFD0D5DD)
        3 -> Color(0xFFF79009)
        else -> Color(0xFFF2F4F7)
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(if (isMe) BrandBlueSoft else Color.Transparent)
            .padding(horizontal = 6.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size(26.dp).clip(CircleShape).background(rankBg),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "$rank",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
                color = if (rank <= 3) Color.White else InkMuted,
            )
        }
        Spacer(Modifier.width(10.dp))
        InitialAvatar(name = item.employee?.fullName, sizeDp = 34)
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = (item.employee?.fullName ?: "—") + if (isMe) " (bạn)" else "",
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = if (isMe || rank <= 3) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val dept = item.department ?: item.employee?.departmentName
            if (!dept.isNullOrBlank()) {
                Text(
                    text = dept,
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Text(
            text = "${item.totalEarned ?: 0} điểm",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = BrandBlue,
        )
    }
}
