package com.hrmai.app.feature.briefing

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
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.LoadingState
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.BrandBlueDark
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.util.Format
import java.util.Locale

@Composable
fun BriefingRoute(container: AppContainer) {
    val vm: BriefingViewModel = viewModel(
        factory = BriefingViewModel.Factory(
            container.api(BriefingApi::class.java),
            container.sessionStore,
        ),
    )
    BriefingScreen(vm)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BriefingScreen(vm: BriefingViewModel) {
    val state by vm.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.message) {
        val msg = state.message ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(msg)
        vm.consumeMessage()
    }

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        when {
            !state.roleKnown -> LoadingState()

            !state.canView -> EmptyState(
                message = "Báo cáo điều hành chỉ dành cho Admin và HR. " +
                    "Nếu bạn cần số liệu tổng hợp, liên hệ phòng nhân sự nhé.",
                modifier = Modifier.padding(top = 48.dp),
            )

            else -> BriefingContent(state, vm)
        }
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BriefingContent(state: BriefingUiState, vm: BriefingViewModel) {
    PullToRefreshBox(
        isRefreshing = state.loading || state.historyLoading,
        onRefresh = { vm.retry() },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
        // Chọn kỳ báo cáo
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = state.period == "week",
                    onClick = { vm.selectPeriod("week") },
                    label = { Text("Theo tuần") },
                )
                FilterChip(
                    selected = state.period == "month",
                    onClick = { vm.selectPeriod("month") },
                    label = { Text("Theo tháng") },
                )
            }
        }

        // Nút tạo báo cáo + trạng thái đang tạo
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { vm.generate() },
                    enabled = !state.generating,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (state.generating) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            color = Color.White,
                            strokeWidth = 2.dp,
                        )
                        Spacer(Modifier.width(8.dp))
                    }
                    Text(if (state.generating) "Đang tạo báo cáo…" else "Tạo báo cáo mới")
                }
                if (state.generating) {
                    HrmCard(modifier = Modifier.fillMaxWidth()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = BrandBlue,
                                strokeWidth = 2.dp,
                            )
                            Spacer(Modifier.width(12.dp))
                            Text(
                                text = "Đang gom số liệu và viết báo cáo, có thể mất tới một phút…",
                                style = MaterialTheme.typography.bodyMedium,
                                color = InkMuted,
                            )
                        }
                    }
                }
            }
        }

        // Báo cáo đang xem
        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SectionHeader(title = if (state.period == "week") "Báo cáo tuần" else "Báo cáo tháng")
                when {
                    state.loading -> LoadingState()
                    state.error != null -> ErrorState(
                        message = state.error,
                        onRetry = { vm.retry() },
                    )
                    state.current == null -> HrmCard(modifier = Modifier.fillMaxWidth()) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            EmptyState(
                                message = "Chưa có báo cáo nào cho kỳ này. " +
                                    "Tạo báo cáo đầu tiên để AI gom số liệu và viết bản tin điều hành nhé.",
                            )
                            Button(
                                onClick = { vm.generate() },
                                enabled = !state.generating,
                            ) { Text("Tạo báo cáo đầu tiên") }
                        }
                    }
                    else -> BriefingCard(state.current)
                }
            }
        }

        // Lưới số liệu gốc đối chiếu
        val numbers = state.current?.numbers
        if (numbers != null) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    SectionHeader(title = "Số liệu gốc để đối chiếu")
                    NumbersGrid(numbers)
                }
            }
        }

        // Lịch sử các kỳ trước
        item {
            SectionHeader(title = "Lịch sử báo cáo")
        }
        if (state.historyLoading && state.history.isEmpty()) {
            item { LoadingState() }
        } else if (state.history.isEmpty()) {
            item {
                EmptyState(message = "Chưa có báo cáo nào trong lịch sử của kỳ này.")
            }
        } else {
            items(state.history, key = { it.id ?: 0 }) { item ->
                HistoryRow(
                    item = item,
                    viewing = item.id != null && item.id == state.current?.id,
                    onClick = { vm.selectBriefing(item) },
                )
            }
        }
        }
    }
}

@Composable
private fun BriefingCard(briefing: BriefingDto) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                SourceChip(briefing.source)
                Text(
                    text = periodRangeText(briefing),
                    style = MaterialTheme.typography.labelLarge,
                    color = InkMuted,
                )
            }
            Text(
                text = briefing.prose?.takeIf { it.isNotBlank() } ?: "Báo cáo chưa có nội dung.",
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                text = "Tạo bởi ${briefing.createdByName ?: "hệ thống"} · ${Format.dateTime(briefing.createdAt)}",
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
        }
    }
}

@Composable
private fun SourceChip(source: String?) {
    if (source == "ai") {
        StatusChip(text = "Viết bởi AI", bg = BrandBlueSoft, fg = BrandBlueDark)
    } else {
        StatusChip(text = "Bản mẫu tự động", bg = Color(0xFFF2F4F7), fg = InkMuted)
    }
}

@Composable
private fun NumbersGrid(numbers: BriefingNumbersDto) {
    val enps = numbers.engagement?.enps
    val stats = listOf(
        StatItem("Tổng nhân sự", numbers.headcountTotal?.toString() ?: "—"),
        StatItem("Vào mới", numbers.newHires?.toString() ?: "—"),
        StatItem("Nghỉ việc", numbers.departures?.toString() ?: "—"),
        StatItem(
            "Tỉ lệ đúng giờ",
            numbers.attendance?.onTimeRate?.let { formatRate(it) } ?: "Chưa có dữ liệu",
        ),
        StatItem("Đơn chờ duyệt", numbers.leave?.pendingRequests?.toString() ?: "—"),
        StatItem("Tin tuyển mở", numbers.recruitment?.openJobPostings?.toString() ?: "—"),
        StatItem("Ứng viên mới", numbers.recruitment?.newCandidates?.toString() ?: "—"),
        StatItem("Lượt vinh danh", numbers.engagement?.kudosInPeriod?.toString() ?: "—"),
        StatItem(
            "eNPS",
            enps?.score?.toString() ?: "Chưa có dữ liệu",
            sub = enps?.let { "${it.responses ?: 0} phản hồi" },
        ),
        StatItem(
            "Nguy cơ cao",
            numbers.attritionHighRisk?.toString() ?: "—",
            sub = numbers.attritionWindowDays?.let { "trong $it ngày tới" },
        ),
    )
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        stats.chunked(2).forEach { rowItems ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                rowItems.forEach { stat ->
                    StatCard(stat, Modifier.weight(1f))
                }
                if (rowItems.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

private data class StatItem(val label: String, val value: String, val sub: String? = null)

@Composable
private fun StatCard(stat: StatItem, modifier: Modifier = Modifier) {
    HrmCard(modifier = modifier, contentPadding = PaddingValues(12.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = stat.label,
                style = MaterialTheme.typography.labelMedium,
                color = InkMuted,
            )
            Text(
                text = stat.value,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            if (stat.sub != null) {
                Text(
                    text = stat.sub,
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
        }
    }
}

@Composable
private fun HistoryRow(item: BriefingDto, viewing: Boolean, onClick: () -> Unit) {
    HrmCard(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        contentPadding = PaddingValues(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (item.period == "week") "Báo cáo tuần" else "Báo cáo tháng",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = "${periodRangeText(item)} · tạo ${Format.dateTime(item.createdAt)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                if (!item.createdByName.isNullOrBlank()) {
                    Text(
                        text = "Bởi ${item.createdByName}",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
            }
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                SourceChip(item.source)
                if (viewing) {
                    StatusChip(text = "Đang xem", bg = BrandBlueSoft, fg = BrandBlue)
                }
            }
        }
    }
}

/** "01/10/2026 – 31/10/2026" từ period_start/period_end của báo cáo. */
private fun periodRangeText(briefing: BriefingDto): String {
    val start = briefing.periodStart ?: briefing.numbers?.periodStart
    val end = briefing.periodEnd ?: briefing.numbers?.periodEnd
    return "${Format.date(start)} – ${Format.date(end)}"
}

/** 77.8 -> "77,8%", 100.0 -> "100%". */
private fun formatRate(rate: Double): String =
    if (rate == rate.toLong().toDouble()) {
        "${rate.toLong()}%"
    } else {
        String.format(Locale("vi", "VN"), "%.1f%%", rate)
    }
