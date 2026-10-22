package com.hrmai.app.feature.skills

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
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
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import java.util.Locale

@Composable
fun SkillsRoute(container: AppContainer) {
    val vm: SkillsViewModel = viewModel(
        factory = SkillsViewModel.Factory(
            container.api(SkillsApi::class.java),
            container.sessionStore,
        ),
    )
    SkillsScreen(vm)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SkillsScreen(vm: SkillsViewModel) {
    val state by vm.state.collectAsState()

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        PullToRefreshBox(
            isRefreshing = state.refreshing,
            onRefresh = { vm.refresh() },
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item { SectionHeader(title = "Kỹ năng của tôi") }
                item { MySkillsSection(state = state, vm = vm) }
                if (state.suggestionsLoading || state.suggestions.isNotEmpty()) {
                    item { SuggestionsSection(state = state) }
                }
                item {
                    Spacer(Modifier.height(4.dp))
                    SectionHeader(title = "Tổng quan theo phòng ban")
                }
                item { DepartmentOverviewSection(state = state, vm = vm) }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Kỹ năng của tôi
// ---------------------------------------------------------------------------

@Composable
private fun MySkillsSection(state: SkillsUiState, vm: SkillsViewModel) {
    when {
        state.myLoading -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SkeletonBlock()
            SkeletonBlock()
        }
        state.sessionLoaded && state.myEmployeeId == null -> HrmCard(
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = "Tài khoản của bạn chưa gắn với hồ sơ nhân viên nên chưa có " +
                    "dữ liệu kỹ năng cá nhân.",
                style = MaterialTheme.typography.bodyMedium,
                color = InkMuted,
            )
        }
        state.myError != null -> ErrorState(state.myError, onRetry = { vm.retryMine() })
        else -> {
            val items = state.myData?.items.orEmpty()
            if (items.isEmpty()) {
                HrmCard(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = "Bạn chưa có kỹ năng nào được ghi nhận. HR sẽ cập nhật " +
                            "hồ sơ kỹ năng sau các kỳ đánh giá.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = InkMuted,
                    )
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items.forEach { skill -> MySkillRow(skill) }
                }
            }
        }
    }
}

@Composable
private fun MySkillRow(skill: EmployeeSkillDto) {
    val level = (skill.level ?: 0).coerceIn(0, 5)
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = skill.skillName ?: "Kỹ năng",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = "Mức $level/5",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = levelColor(level.toDouble()),
                )
            }
            skill.category?.takeIf { it.isNotBlank() }?.let { category ->
                Spacer(Modifier.height(2.dp))
                Text(
                    text = category,
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            Spacer(Modifier.height(8.dp))
            LevelSegments(level = level, max = 5)
        }
    }
}

/** Thanh mức độ dạng 5 đoạn (cho thang nguyên 1..5). */
@Composable
private fun LevelSegments(level: Int, max: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        (1..max).forEach { index ->
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(8.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(
                        if (index <= level) {
                            levelColor(level.toDouble())
                        } else {
                            Color(0xFFE4E7EC)
                        },
                    ),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Gợi ý khoá học
// ---------------------------------------------------------------------------

@Composable
private fun SuggestionsSection(state: SkillsUiState) {
    Column {
        SectionHeader(title = "Gợi ý khoá học")
        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            StatusChip(
                text = if (state.suggestSource == "ai") "AI gợi ý" else "Gợi ý theo từ khoá",
                bg = BrandBlueSoft,
                fg = BrandBlue,
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = "Dựa trên kỹ năng đang ở mức thấp của bạn",
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
        }
        Spacer(Modifier.height(8.dp))
        if (state.suggestionsLoading) {
            SkeletonBlock(heightDp = 72)
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                state.suggestions.forEach { suggestion ->
                    HrmCard(modifier = Modifier.fillMaxWidth()) {
                        Column {
                            Text(
                                text = suggestion.course?.title ?: "Khoá học",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            val skillLine = listOfNotNull(
                                suggestion.skill?.let { "Cho kỹ năng: $it" },
                                suggestion.currentLevel?.let { "mức hiện tại $it/5" },
                            )
                            if (skillLine.isNotEmpty()) {
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    text = skillLine.joinToString(" · "),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = InkMuted,
                                )
                            }
                            suggestion.reason?.takeIf { it.isNotBlank() }?.let { reason ->
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    text = reason,
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tổng quan theo phòng ban (ma trận kỹ năng)
// ---------------------------------------------------------------------------

@Composable
private fun DepartmentOverviewSection(state: SkillsUiState, vm: SkillsViewModel) {
    when {
        state.matrixLoading -> SkeletonBlock()
        state.matrixError != null -> ErrorState(state.matrixError, onRetry = { vm.loadMatrix() })
        else -> {
            val matrix = state.matrix
            val departments = matrix?.departments.orEmpty()
            val rows = matrix?.rows.orEmpty()
            if (departments.isEmpty() || rows.isEmpty()) {
                EmptyState("Chưa có dữ liệu bản đồ kỹ năng.")
            } else {
                Column {
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        departments.forEach { dept ->
                            val deptId = dept.id ?: return@forEach
                            FilterChip(
                                selected = state.selectedDepartmentId == deptId,
                                onClick = { vm.selectDepartment(deptId) },
                                label = { Text(dept.name ?: "Phòng ban") },
                            )
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        rows.forEach { row ->
                            DepartmentSkillRow(
                                row = row,
                                departmentId = state.selectedDepartmentId,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DepartmentSkillRow(row: MatrixRowDto, departmentId: Int?) {
    val skill = row.skill
    val cell = departmentId?.let { row.cells?.get(it.toString()) }
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = skill?.name ?: "Kỹ năng",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                skill?.category?.takeIf { it.isNotBlank() }?.let { category ->
                    StatusChip(category, Color(0xFFF2F4F7), InkMuted)
                }
            }
            Spacer(Modifier.height(8.dp))
            if (cell?.avgLevel != null) {
                val avg = cell.avgLevel
                Row(verticalAlignment = Alignment.CenterVertically) {
                    LinearProgressIndicator(
                        progress = { (avg / 5.0).toFloat().coerceIn(0f, 1f) },
                        modifier = Modifier.weight(1f),
                        color = levelColor(avg),
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        text = "TB ${formatLevel(avg)}/5",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = levelColor(avg),
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "${cell.headcount ?: 0} nhân viên có kỹ năng này trong phòng",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            } else {
                Text(
                    text = "Phòng ban này chưa có ai sở hữu kỹ năng.",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------

/** Màu theo mức độ: >= 4 tốt (xanh lá), >= 2.5 trung bình (brand), còn lại yếu (hổ phách). */
private fun levelColor(level: Double): Color = when {
    level >= 4.0 -> SuccessGreen
    level >= 2.5 -> BrandBlue
    level > 0.0 -> WarningAmber
    else -> InkMuted
}

private fun formatLevel(value: Double): String =
    if (value % 1.0 == 0.0) {
        value.toInt().toString()
    } else {
        String.format(Locale.US, "%.1f", value)
    }
