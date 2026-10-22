package com.hrmai.app.feature.onboarding

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.InitialAvatar
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
import com.hrmai.app.feature.performance.ProgressBar

@Composable
fun OnboardingRoute(container: AppContainer) {
    val vm: OnboardingViewModel = viewModel(
        factory = OnboardingViewModel.Factory(
            container.api(OnboardingApi::class.java),
            container.sessionStore,
        ),
    )
    OnboardingScreen(vm)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OnboardingScreen(vm: OnboardingViewModel) {
    val state by vm.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.message) {
        val msg = state.message ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(msg)
        vm.consumeMessage()
    }

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        Column(modifier = Modifier.fillMaxSize()) {
            if (state.canSeePlans && state.detailPlan == null) {
                val tabs = listOf("Của tôi", "Nhân viên mới")
                TabRow(selectedTabIndex = state.tab) {
                    tabs.forEachIndexed { index, label ->
                        Tab(
                            selected = state.tab == index,
                            onClick = { vm.selectTab(index) },
                            text = { Text(label) },
                        )
                    }
                }
            }
            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                when {
                    state.detailPlan != null || state.detailLoading -> {
                        PlanDetailView(state, vm)
                    }
                    state.tab == 1 && state.canSeePlans -> PlansTab(state, vm)
                    else -> MyOnboardingTab(state, vm)
                }
            }
        }
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
        )
    }
}

// ----------------------------------------------------------------------
// Tab "Của tôi": tóm tắt kế hoạch + checklist theo giai đoạn
// ----------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MyOnboardingTab(state: OnboardingUiState, vm: OnboardingViewModel) {
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
            item {
                Column {
                    Text(
                        "Hội nhập công ty",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        "Các đầu việc cần hoàn thành khi bạn mới vào công ty.",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
            }
            when {
                state.myLoading && !state.myPlanLoaded -> {
                    items(3) { SkeletonBlock(heightDp = 96) }
                }
                state.myForbidden -> {
                    item {
                        HrmCard(modifier = Modifier.fillMaxWidth()) {
                            EmptyState(
                                "Tài khoản của bạn chưa gắn với hồ sơ nhân viên " +
                                    "nên chưa xem được kế hoạch hội nhập. " +
                                    "Liên hệ HR để được hỗ trợ nhé.",
                            )
                        }
                    }
                }
                state.myError != null && state.myTasks.isEmpty() -> {
                    item {
                        ErrorState(
                            message = state.myError ?: "Không tải được dữ liệu hội nhập.",
                            onRetry = { vm.loadMine() },
                        )
                    }
                }
                else -> {
                    state.myPlan?.let { plan ->
                        item { MyPlanSummaryCard(plan) }
                    }
                    if (state.myTasks.isEmpty()) {
                        item {
                            EmptyState(
                                if (state.myPlan == null) {
                                    "Bạn chưa có kế hoạch hội nhập nào. " +
                                        "HR sẽ tạo kế hoạch khi bạn bắt đầu nhận việc nhé."
                                } else {
                                    "Chưa có đầu việc nào được giao cho bạn."
                                },
                            )
                        }
                    } else {
                        val stages = listOf("before", "first_day", "first_week")
                        stages.forEach { stage ->
                            val stageTasks = state.myTasks.filter {
                                (it.stage ?: "first_week") == stage
                            }
                            if (stageTasks.isNotEmpty()) {
                                item { SectionHeader(title = stageLabel(stage)) }
                                items(stageTasks, key = { it.id ?: 0 }) { task ->
                                    OnboardingTaskRow(
                                        task = task,
                                        acting = state.actingTaskId == task.id,
                                        showPlanOwner = task.planEmployeeId != null &&
                                            state.myPlan?.employeeId != null &&
                                            task.planEmployeeId != state.myPlan?.employeeId,
                                        onToggle = { vm.toggleTask(task) },
                                    )
                                }
                            }
                        }
                        val others = state.myTasks.filter {
                            (it.stage ?: "first_week") !in stages
                        }
                        if (others.isNotEmpty()) {
                            item { SectionHeader(title = "Việc khác") }
                            items(others, key = { it.id ?: 0 }) { task ->
                                OnboardingTaskRow(
                                    task = task,
                                    acting = state.actingTaskId == task.id,
                                    showPlanOwner = false,
                                    onToggle = { vm.toggleTask(task) },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MyPlanSummaryCard(
    plan: OnboardingPlanDto,
    title: String = "Kế hoạch hội nhập của tôi",
) {
    val percent = plan.progressPercent ?: 0
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                PlanStatusChip(plan.status)
            }
            val meta = listOfNotNull(
                plan.templateName,
                plan.startDate?.let { "Bắt đầu ${Format.date(it)}" },
                plan.departmentName,
            )
            if (meta.isNotEmpty()) {
                Text(
                    meta.joinToString(" · "),
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
                    "Đã xong ${plan.doneTasks ?: 0}/${plan.totalTasks ?: 0} việc",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    "$percent%",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = BrandBlueDark,
                )
            }
            Spacer(Modifier.height(6.dp))
            ProgressBar(percent = percent.toDouble(), heightDp = 8)
            if ((plan.overdueTasks ?: 0) > 0) {
                Spacer(Modifier.height(8.dp))
                StatusChip(
                    "${plan.overdueTasks} việc quá hạn",
                    Color(0xFFFEF3F2),
                    DangerRed,
                )
            }
        }
    }
}

// ----------------------------------------------------------------------
// Hàng đầu việc (dùng chung cả 2 tab)
// ----------------------------------------------------------------------

@Composable
private fun OnboardingTaskRow(
    task: OnboardingTaskDto,
    acting: Boolean,
    showPlanOwner: Boolean,
    onToggle: () -> Unit,
) {
    val done = task.isDone()
    val stored = task.storedStatus ?: task.status
    val locked = stored == "verified" || stored == "skipped"
    HrmCard(modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(12.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            Box(
                modifier = Modifier.size(40.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (acting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(22.dp),
                        strokeWidth = 2.dp,
                        color = BrandBlue,
                    )
                } else {
                    Checkbox(
                        checked = done,
                        onCheckedChange = { onToggle() },
                        enabled = !locked,
                        colors = CheckboxDefaults.colors(checkedColor = BrandBlue),
                    )
                }
            }
            Column(modifier = Modifier.weight(1f).padding(top = 8.dp)) {
                Text(
                    task.title ?: "Đầu việc",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    textDecoration = if (done) TextDecoration.LineThrough else null,
                    color = if (done) InkMuted else MaterialTheme.colorScheme.onSurface,
                )
                val details = mutableListOf<String>()
                taskTypeLabel(task.taskType)?.let { details.add(it) }
                task.dueDate?.let { details.add("Hạn: ${Format.date(it)}") }
                if (showPlanOwner && !task.planEmployeeName.isNullOrBlank()) {
                    details.add("Cho: ${task.planEmployeeName}")
                } else if (!task.assigneeName.isNullOrBlank()) {
                    details.add("Phụ trách: ${task.assigneeName}")
                }
                if (details.isNotEmpty()) {
                    Text(
                        details.joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
                if (!task.description.isNullOrBlank()) {
                    Text(
                        task.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
                if (!task.note.isNullOrBlank()) {
                    Text(
                        "Ghi chú: ${task.note}",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
                if (done && !task.completedByName.isNullOrBlank()) {
                    Text(
                        "Hoàn thành bởi ${task.completedByName}" +
                            (task.completedAt?.let { " · ${Format.dateTime(it)}" } ?: ""),
                        style = MaterialTheme.typography.bodySmall,
                        color = SuccessGreen,
                    )
                }
            }
            Column(
                horizontalAlignment = Alignment.End,
                modifier = Modifier.padding(top = 8.dp),
            ) {
                TaskStatusChip(task)
            }
        }
    }
}

// ----------------------------------------------------------------------
// Tab "Nhân viên mới": danh sách plan + chi tiết
// ----------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PlansTab(state: OnboardingUiState, vm: OnboardingViewModel) {
    PullToRefreshBox(
        isRefreshing = state.plansRefreshing,
        onRefresh = { vm.refreshPlans() },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Text(
                    "Tiến độ hội nhập của nhân viên mới trong phạm vi bạn phụ trách.",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            when {
                state.plansLoading && state.plans.isEmpty() -> {
                    items(3) { SkeletonBlock(heightDp = 110) }
                }
                state.plansForbidden -> {
                    item {
                        HrmCard(modifier = Modifier.fillMaxWidth()) {
                            EmptyState(
                                "Chỉ HR và quản lý mới xem được danh sách hội nhập. " +
                                    "Tài khoản của bạn chưa có quyền này.",
                            )
                        }
                    }
                }
                state.plansError != null && state.plans.isEmpty() -> {
                    item {
                        ErrorState(
                            message = state.plansError ?: "Không tải được danh sách.",
                            onRetry = { vm.loadPlans() },
                        )
                    }
                }
                state.plans.isEmpty() -> {
                    item { EmptyState("Chưa có nhân viên mới nào đang hội nhập.") }
                }
                else -> {
                    items(state.plans, key = { it.id ?: 0 }) { plan ->
                        PlanListCard(plan = plan, onClick = { plan.id?.let { vm.openPlan(it) } })
                    }
                }
            }
        }
    }
}

@Composable
private fun PlanListCard(plan: OnboardingPlanDto, onClick: () -> Unit) {
    val percent = plan.progressPercent ?: 0
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                InitialAvatar(plan.employeeName, 42)
                Column(modifier = Modifier.padding(start = 10.dp).weight(1f)) {
                    Text(
                        plan.employeeName ?: "Nhân viên mới",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        listOfNotNull(plan.positionTitle, plan.departmentName)
                            .joinToString(" · ")
                            .ifBlank { "—" },
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
                PlanStatusChip(plan.status)
            }
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Đã xong ${plan.doneTasks ?: 0}/${plan.totalTasks ?: 0} việc" +
                        (plan.startDate?.let { " · bắt đầu ${Format.date(it)}" } ?: ""),
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                Text(
                    "$percent%",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = BrandBlueDark,
                )
            }
            Spacer(Modifier.height(6.dp))
            ProgressBar(percent = percent.toDouble(), heightDp = 6)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if ((plan.overdueTasks ?: 0) > 0) {
                    StatusChip(
                        "${plan.overdueTasks} việc quá hạn",
                        Color(0xFFFEF3F2),
                        DangerRed,
                    )
                } else {
                    Spacer(Modifier.height(1.dp))
                }
                TextButton(onClick = onClick) {
                    Text("Xem chi tiết", color = BrandBlue)
                }
            }
        }
    }
}

@Composable
private fun PlanDetailView(state: OnboardingUiState, vm: OnboardingViewModel) {
    val plan = state.detailPlan
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp),
        ) {
            IconButton(onClick = { vm.closePlan() }) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Quay lại",
                    tint = BrandBlue,
                )
            }
            Text(
                plan?.employeeName ?: "Chi tiết hội nhập",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
        when {
            state.detailLoading -> {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SkeletonBlock(heightDp = 110)
                    SkeletonBlock(heightDp = 72)
                    SkeletonBlock(heightDp = 72)
                }
            }
            state.detailError != null -> {
                ErrorState(
                    message = state.detailError ?: "Không tải được chi tiết.",
                    onRetry = { vm.closePlan() },
                )
            }
            plan != null -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item { MyPlanSummaryCard(plan, title = "Tiến độ hội nhập") }
                    val tasks = plan.tasks ?: emptyList()
                    if (tasks.isEmpty()) {
                        item { EmptyState("Kế hoạch này chưa có đầu việc nào.") }
                    } else {
                        items(tasks, key = { it.id ?: 0 }) { task ->
                            OnboardingTaskRow(
                                task = task,
                                acting = state.actingTaskId == task.id,
                                showPlanOwner = false,
                                onToggle = { vm.toggleTask(task) },
                            )
                        }
                    }
                }
            }
        }
    }
}

// ----------------------------------------------------------------------
// Tiện ích hiển thị
// ----------------------------------------------------------------------

private fun stageLabel(stage: String?): String = when (stage) {
    "before" -> "Trước ngày đầu"
    "first_day" -> "Ngày đầu tiên"
    "first_week" -> "Tuần đầu tiên"
    else -> "Việc cần làm"
}

private fun taskTypeLabel(type: String?): String? = when (type) {
    "task" -> null // Loại mặc định, không cần gắn nhãn.
    "document" -> "Tài liệu"
    "training" -> "Đào tạo"
    "meeting" -> "Gặp gỡ"
    else -> type
}

@Composable
private fun PlanStatusChip(status: String?) {
    val (label, bg, fg) = when (status) {
        "in_progress" -> Triple("Đang hội nhập", BrandBlueSoft, BrandBlueDark)
        "completed" -> Triple("Hoàn thành", Color(0xFFECFDF3), SuccessGreen)
        "cancelled" -> Triple("Đã huỷ", Color(0xFFF2F4F7), InkMuted)
        null -> Triple("—", Color(0xFFF2F4F7), InkMuted)
        else -> Triple(status, Color(0xFFF2F4F7), InkMuted)
    }
    StatusChip(label, bg, fg)
}

@Composable
private fun TaskStatusChip(task: OnboardingTaskDto) {
    val status = task.status
    val (label, bg, fg) = when (status) {
        "done" -> Triple("Đã xong", Color(0xFFECFDF3), SuccessGreen)
        "verified" -> Triple("Đã xác nhận", Color(0xFFECFDF3), SuccessGreen)
        "overdue" -> Triple("Quá hạn", Color(0xFFFEF3F2), DangerRed)
        "in_progress" -> Triple("Đang làm", BrandBlueSoft, BrandBlueDark)
        "skipped" -> Triple("Bỏ qua", Color(0xFFF2F4F7), InkMuted)
        "pending" -> Triple("Chưa làm", Color(0xFFFFFAEB), WarningAmber)
        null -> Triple("—", Color(0xFFF2F4F7), InkMuted)
        else -> Triple(status, Color(0xFFF2F4F7), InkMuted)
    }
    StatusChip(label, bg, fg)
}
