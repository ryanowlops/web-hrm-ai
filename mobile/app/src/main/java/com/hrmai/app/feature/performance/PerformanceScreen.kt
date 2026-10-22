package com.hrmai.app.feature.performance

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.input.KeyboardType
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

@Composable
fun PerformanceRoute(container: AppContainer) {
    val vm: PerformanceViewModel = viewModel(
        factory = PerformanceViewModel.Factory(
            container.api(PerformanceApi::class.java),
            container.sessionStore,
        ),
    )
    PerformanceScreen(vm)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PerformanceScreen(vm: PerformanceViewModel) {
    val state by vm.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    var checkInTarget by remember { mutableStateOf<KeyResultDto?>(null) }

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
                    Column {
                        Text(
                            "Hiệu suất & mục tiêu",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            "KPI/OKR của bạn theo từng kỳ đánh giá.",
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                }
                if (state.cycles.isNotEmpty()) {
                    item { CycleFilterRow(state, vm) }
                }
                item { SectionHeader(title = "Mục tiêu của tôi") }
                when {
                    state.objectivesLoading && state.objectives.isEmpty() -> {
                        items(2) { SkeletonBlock(heightDp = 150) }
                    }
                    state.objectivesError != null && state.objectives.isEmpty() -> {
                        item {
                            ErrorState(
                                message = state.objectivesError
                                    ?: "Không tải được mục tiêu.",
                                onRetry = { vm.loadObjectives() },
                            )
                        }
                    }
                    state.objectives.isEmpty() -> {
                        item {
                            EmptyState(
                                "Bạn chưa có mục tiêu nào trong kỳ này. " +
                                    "Mục tiêu do bạn hoặc quản lý tạo trên bản web nhé.",
                            )
                        }
                    }
                    else -> {
                        items(state.objectives, key = { it.id ?: 0 }) { objective ->
                            ObjectiveCard(
                                objective = objective,
                                cycleName = state.cycles
                                    .firstOrNull { it.id == objective.cycleId }?.name,
                                checkingInId = state.checkingInId,
                                onCheckIn = { checkInTarget = it },
                            )
                        }
                    }
                }
                item { SectionHeader(title = "Đánh giá của tôi") }
                when {
                    state.reviewsLoading && state.reviews.isEmpty() -> {
                        items(2) { SkeletonBlock(heightDp = 92) }
                    }
                    state.reviewsError != null && state.reviews.isEmpty() -> {
                        item {
                            ErrorState(
                                message = state.reviewsError
                                    ?: "Không tải được đánh giá.",
                                onRetry = { vm.loadReviews() },
                            )
                        }
                    }
                    state.reviews.isEmpty() -> {
                        item {
                            EmptyState("Chưa có bản đánh giá nào cho bạn trong kỳ này.")
                        }
                    }
                    else -> {
                        items(state.reviews, key = { it.id ?: 0 }) { review ->
                            ReviewCard(
                                review = review,
                                cycleName = state.cycles
                                    .firstOrNull { it.id == review.cycleId }?.name,
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

    checkInTarget?.let { kr ->
        CheckInDialog(
            keyResult = kr,
            submitting = state.checkingInId == kr.id,
            onDismiss = { checkInTarget = null },
            onConfirm = { value, note ->
                vm.checkIn(kr, value, note)
                checkInTarget = null
            },
        )
    }
}

@Composable
private fun CycleFilterRow(state: PerformanceUiState, vm: PerformanceViewModel) {
    Row(
        modifier = Modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        FilterChip(
            selected = state.selectedCycleId == null,
            onClick = { vm.selectCycle(null) },
            label = { Text("Tất cả các kỳ") },
        )
        state.cycles.forEach { cycle ->
            FilterChip(
                selected = state.selectedCycleId == cycle.id,
                onClick = { vm.selectCycle(cycle.id) },
                label = { Text(cycle.name ?: "Kỳ đánh giá") },
            )
        }
    }
}

@Composable
private fun ObjectiveCard(
    objective: ObjectiveDto,
    cycleName: String?,
    checkingInId: Int?,
    onCheckIn: (KeyResultDto) -> Unit,
) {
    val percent = objective.progressPercent ?: objective.score ?: 0.0
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    objective.title ?: "Mục tiêu",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                ObjectiveStatusChip(objective.status)
            }
            val meta = listOfNotNull(
                cycleName,
                objective.departmentName,
                objective.creatorName?.let { "Người tạo: $it" },
            )
            if (meta.isNotEmpty()) {
                Text(
                    meta.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            if (!objective.description.isNullOrBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    objective.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Tiến độ chung",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    formatPercent(percent),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = BrandBlueDark,
                )
            }
            Spacer(Modifier.height(6.dp))
            ProgressBar(percent = percent, heightDp = 8)
            val keyResults = objective.keyResults ?: emptyList()
            if (keyResults.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                keyResults.forEachIndexed { index, kr ->
                    if (index > 0) Spacer(Modifier.height(12.dp))
                    KeyResultRow(
                        keyResult = kr,
                        canCheckIn = objective.status != "cancelled" &&
                            objective.status != "completed",
                        checkingIn = checkingInId == kr.id,
                        onCheckIn = { onCheckIn(kr) },
                    )
                }
            }
        }
    }
}

@Composable
private fun KeyResultRow(
    keyResult: KeyResultDto,
    canCheckIn: Boolean,
    checkingIn: Boolean,
    onCheckIn: () -> Unit,
) {
    val percent = keyResult.progressPercent
        ?: keyResult.progress?.let { it * 100 }
        ?: 0.0
    val unit = keyResult.unit?.takeIf { it.isNotBlank() }?.let { " $it" } ?: ""
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                keyResult.title ?: "Chỉ số",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.weight(1f),
            )
            Text(
                formatPercent(percent),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = BrandBlueDark,
            )
        }
        Spacer(Modifier.height(4.dp))
        ProgressBar(percent = percent, heightDp = 6)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "Hiện tại ${formatNumber(keyResult.currentValue)}$unit / " +
                    "mục tiêu ${formatNumber(keyResult.targetValue)}$unit" +
                    if (keyResult.direction == "decrease") " (càng thấp càng tốt)" else "",
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
            if (canCheckIn) {
                TextButton(onClick = onCheckIn, enabled = !checkingIn) {
                    if (checkingIn) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                            color = BrandBlue,
                        )
                    } else {
                        Text("Cập nhật")
                    }
                }
            }
        }
    }
}

@Composable
private fun ReviewCard(review: PerfReviewDto, cycleName: String?) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    when (review.reviewType) {
                        "self" -> "Tự đánh giá"
                        "manager" -> "Quản lý đánh giá"
                        else -> "Đánh giá"
                    },
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                ReviewStatusChip(review.status)
            }
            val meta = listOfNotNull(
                cycleName,
                review.reviewerName?.let { "Người đánh giá: $it" },
                review.updatedAt?.let { "Cập nhật ${Format.dateTime(it)}" },
            )
            if (meta.isNotEmpty()) {
                Text(
                    meta.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            if (review.score != null) {
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Điểm: ",
                        style = MaterialTheme.typography.bodyMedium,
                        color = InkMuted,
                    )
                    Text(
                        "${formatNumber(review.score)}/100",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = BrandBlueDark,
                    )
                }
                Spacer(Modifier.height(6.dp))
                ProgressBar(percent = review.score, heightDp = 6)
            }
            if (!review.comment.isNullOrBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Nhận xét: ${review.comment}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
        }
    }
}

@Composable
private fun CheckInDialog(
    keyResult: KeyResultDto,
    submitting: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (Double, String) -> Unit,
) {
    var valueText by remember(keyResult) {
        mutableStateOf(keyResult.currentValue?.let { formatNumber(it) } ?: "")
    }
    var note by remember(keyResult) { mutableStateOf("") }
    var error by remember(keyResult) { mutableStateOf<String?>(null) }
    val unit = keyResult.unit?.takeIf { it.isNotBlank() }?.let { " ($it)" } ?: ""
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Cập nhật tiến độ") },
        text = {
            Column {
                Text(
                    keyResult.title ?: "Chỉ số",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    "Mục tiêu: ${formatNumber(keyResult.targetValue)}$unit · " +
                        "hiện tại: ${formatNumber(keyResult.currentValue)}$unit",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = valueText,
                    onValueChange = {
                        valueText = it
                        error = null
                    },
                    label = { Text("Giá trị hiện tại$unit") },
                    isError = error != null,
                    supportingText = error?.let { msg -> { Text(msg, color = DangerRed) } },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Ghi chú (tuỳ chọn)") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = !submitting,
                onClick = {
                    val parsed = valueText.trim().replace(',', '.').toDoubleOrNull()
                    if (parsed == null) {
                        error = "Nhập một con số hợp lệ nhé (ví dụ 75 hoặc 75,5)."
                    } else {
                        onConfirm(parsed, note)
                    }
                },
            ) {
                if (submitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = BrandBlue,
                    )
                } else {
                    Text("Lưu cập nhật", color = BrandBlue)
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Huỷ") }
        },
    )
}

// ----------------------------------------------------------------------
// Tiện ích hiển thị
// ----------------------------------------------------------------------

@Composable
internal fun ProgressBar(percent: Double, heightDp: Int) {
    LinearProgressIndicator(
        progress = { (percent / 100.0).toFloat().coerceIn(0f, 1f) },
        modifier = Modifier
            .fillMaxWidth()
            .height(heightDp.dp)
            .clip(RoundedCornerShape(50)),
        color = BrandBlue,
        trackColor = BrandBlueSoft,
    )
}

@Composable
private fun ObjectiveStatusChip(status: String?) {
    val (label, bg, fg) = when (status) {
        "draft" -> Triple("Nháp", Color(0xFFF2F4F7), InkMuted)
        "pending" -> Triple("Chờ duyệt", Color(0xFFFFFAEB), WarningAmber)
        "active" -> Triple("Đang thực hiện", BrandBlueSoft, BrandBlueDark)
        "completed" -> Triple("Hoàn thành", Color(0xFFECFDF3), SuccessGreen)
        "cancelled" -> Triple("Đã huỷ", Color(0xFFFEF3F2), DangerRed)
        null -> Triple("—", Color(0xFFF2F4F7), InkMuted)
        else -> Triple(status, Color(0xFFF2F4F7), InkMuted)
    }
    StatusChip(label, bg, fg)
}

@Composable
private fun ReviewStatusChip(status: String?) {
    val (label, bg, fg) = when (status) {
        "draft" -> Triple("Bản nháp", Color(0xFFF2F4F7), InkMuted)
        "submitted" -> Triple("Đã nộp", Color(0xFFECFDF3), SuccessGreen)
        null -> Triple("—", Color(0xFFF2F4F7), InkMuted)
        else -> Triple(status, Color(0xFFF2F4F7), InkMuted)
    }
    StatusChip(label, bg, fg)
}
