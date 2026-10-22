package com.hrmai.app.feature.attrition

import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import com.hrmai.app.core.ui.InitialAvatar
import com.hrmai.app.core.ui.LoadingState
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.DangerRed
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format

@Composable
fun AttritionRoute(container: AppContainer) {
    val vm: AttritionViewModel = viewModel(
        factory = AttritionViewModel.Factory(
            container.api(AttritionApi::class.java),
            container.sessionStore,
        ),
    )
    AttritionScreen(vm)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AttritionScreen(vm: AttritionViewModel) {
    val state by vm.state.collectAsState()

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        when {
            state.forbidden -> ForbiddenState()
            state.loading && state.data == null -> LoadingState()
            state.error != null && state.data == null -> ErrorState(
                state.error ?: "Đã có lỗi xảy ra.",
                onRetry = { vm.load() },
            )
            else -> PullToRefreshBox(
                isRefreshing = state.refreshing,
                onRefresh = { vm.refresh() },
                modifier = Modifier.fillMaxSize(),
            ) {
                AttritionContent(state = state, vm = vm)
            }
        }
    }
}

/** Vai trò nhân viên: thông điệp thân thiện thay cho lỗi 403. */
@Composable
private fun ForbiddenState() {
    Box(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        HrmCard(modifier = Modifier.fillMaxWidth()) {
            Column {
                Text(
                    text = "Chỉ dành cho Quản lý và HR",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = "Điểm rủi ro nghỉ việc là công cụ hỗ trợ quản lý đội nhóm, " +
                        "nên tài khoản nhân viên không xem được mục này. Nếu bạn cần " +
                        "hỗ trợ về công việc, cứ nhắn HR hoặc hỏi Chatbot HR nhé.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = InkMuted,
                )
            }
        }
    }
}

@Composable
private fun AttritionContent(state: AttritionUiState, vm: AttritionViewModel) {
    val data = state.data
    val summary = data?.summary
    val items = data?.items.orEmpty()

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(
                text = "Điểm tính theo luật minh bạch từ chấm công, nghỉ phép, " +
                    "hiệu suất và thâm niên trong ${data?.windowDays ?: 60} ngày gần nhất — " +
                    "chỉ mang tính tham khảo để quản lý chủ động trò chuyện, không tự động quyết định.",
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
        }
        if (summary != null) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SummaryCard(
                        label = "Nguy cơ cao",
                        count = summary.high ?: 0,
                        color = DangerRed,
                        modifier = Modifier.weight(1f),
                    )
                    SummaryCard(
                        label = "Trung bình",
                        count = summary.medium ?: 0,
                        color = WarningAmber,
                        modifier = Modifier.weight(1f),
                    )
                    SummaryCard(
                        label = "Thấp",
                        count = summary.low ?: 0,
                        color = SuccessGreen,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
        data?.generatedAt?.let { generatedAt ->
            item {
                Text(
                    text = "Cập nhật lúc ${Format.dateTime(generatedAt)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
        }
        item {
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                LevelFilterChip("Tất cả", null, state.levelFilter) { vm.selectLevel(null) }
                LevelFilterChip(
                    "Cao", AttritionViewModel.LEVEL_HIGH, state.levelFilter,
                ) { vm.selectLevel(AttritionViewModel.LEVEL_HIGH) }
                LevelFilterChip(
                    "Trung bình", AttritionViewModel.LEVEL_MEDIUM, state.levelFilter,
                ) { vm.selectLevel(AttritionViewModel.LEVEL_MEDIUM) }
                LevelFilterChip(
                    "Thấp", AttritionViewModel.LEVEL_LOW, state.levelFilter,
                ) { vm.selectLevel(AttritionViewModel.LEVEL_LOW) }
            }
        }
        if (state.loading) {
            item { LoadingState() }
        } else if (items.isEmpty()) {
            item {
                EmptyState(
                    if (state.levelFilter == null) {
                        "Chưa có nhân viên nào trong phạm vi của bạn."
                    } else {
                        "Không có nhân viên nào ở mức rủi ro này."
                    },
                )
            }
        } else {
            items(items, key = { it.employee?.id ?: 0 }) { item ->
                AttritionCard(item)
            }
        }
    }
}

@Composable
private fun SummaryCard(label: String, count: Int, color: Color, modifier: Modifier) {
    HrmCard(modifier = modifier, contentPadding = PaddingValues(12.dp)) {
        Column {
            Text(
                text = count.toString(),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = color,
            )
            Text(
                text = label,
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
        }
    }
}

@Composable
private fun LevelFilterChip(
    label: String,
    level: String?,
    current: String?,
    onClick: () -> Unit,
) {
    FilterChip(
        selected = current == level,
        onClick = onClick,
        label = { Text(label) },
    )
}

@Composable
private fun AttritionCard(item: AttritionItemDto) {
    val employee = item.employee
    val score = item.score ?: 0
    val levelColor = levelColor(item.level)
    val meta = listOfNotNull(
        employee?.code,
        employee?.departmentName,
        employee?.positionName,
    ).filter { it.isNotBlank() }

    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                InitialAvatar(name = employee?.fullName, sizeDp = 44)
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = employee?.fullName ?: "Nhân viên",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (meta.isNotEmpty()) {
                        Text(
                            text = meta.joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                }
                StatusChip(
                    text = item.levelLabel ?: levelFallbackLabel(item.level),
                    bg = levelBg(item.level),
                    fg = levelColor,
                )
            }
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                LinearProgressIndicator(
                    progress = { (score / 100f).coerceIn(0f, 1f) },
                    modifier = Modifier.weight(1f),
                    color = levelColor,
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    text = "$score/100",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = levelColor,
                )
            }
            val factors = item.factors.orEmpty()
            if (factors.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                factors.forEach { factor ->
                    Text(
                        text = "• $factor",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                        modifier = Modifier.padding(vertical = 1.dp),
                    )
                }
            }
        }
    }
}

private fun levelColor(level: String?): Color = when (level) {
    AttritionViewModel.LEVEL_HIGH -> DangerRed
    AttritionViewModel.LEVEL_MEDIUM -> WarningAmber
    else -> SuccessGreen
}

private fun levelBg(level: String?): Color = when (level) {
    AttritionViewModel.LEVEL_HIGH -> Color(0xFFFEF3F2)
    AttritionViewModel.LEVEL_MEDIUM -> Color(0xFFFFFAEB)
    else -> Color(0xFFECFDF3)
}

private fun levelFallbackLabel(level: String?): String = when (level) {
    AttritionViewModel.LEVEL_HIGH -> "Cao"
    AttritionViewModel.LEVEL_MEDIUM -> "Trung bình"
    else -> "Thấp"
}
