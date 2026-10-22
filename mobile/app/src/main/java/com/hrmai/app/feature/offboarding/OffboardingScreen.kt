package com.hrmai.app.feature.offboarding

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
import com.hrmai.app.core.ui.LoadingState
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.SkeletonBlock
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.BrandBlueDark
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format
import com.hrmai.app.feature.performance.ProgressBar

@Composable
fun OffboardingRoute(container: AppContainer) {
    val vm: OffboardingViewModel = viewModel(
        factory = OffboardingViewModel.Factory(
            container.api(OffboardingApi::class.java),
            container.sessionStore,
        ),
    )
    OffboardingScreen(vm)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OffboardingScreen(vm: OffboardingViewModel) {
    val state by vm.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.message) {
        val msg = state.message ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(msg)
        vm.consumeMessage()
    }

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        when {
            state.detail != null || state.detailLoading || state.detailError != null -> {
                ProcessDetailView(state, vm)
            }
            !state.roleKnown -> LoadingState(modifier = Modifier.fillMaxSize())
            !state.canAccess -> RestrictedView(state)
            else -> ProcessListView(state, vm)
        }
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
        )
    }
}

/** Nhân viên thường: mục này chỉ dành cho HR/quản lý — giải thích thân thiện. */
@Composable
private fun RestrictedView(state: OffboardingUiState) {
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            "Quy trình nghỉ việc",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
        )
        HrmCard(modifier = Modifier.fillMaxWidth()) {
            EmptyState(
                "Mục này chỉ dành cho HR và quản lý để theo dõi bàn giao " +
                    "khi có nhân viên nghỉ việc. Nếu bạn cần hỗ trợ về thủ tục " +
                    "nghỉ việc, liên hệ phòng HR giúp em nhé.",
            )
        }
    }
}

// ----------------------------------------------------------------------
// Danh sách quy trình
// ----------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProcessListView(state: OffboardingUiState, vm: OffboardingViewModel) {
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
                        "Quy trình nghỉ việc",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        "Danh sách nhân viên đang/đã làm thủ tục nghỉ việc " +
                            "trong phạm vi bạn phụ trách, kèm tiến độ bàn giao.",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
            }
            when {
                state.loading && state.processes.isEmpty() -> {
                    items(3) { SkeletonBlock(heightDp = 120) }
                }
                state.forbidden -> {
                    item {
                        HrmCard(modifier = Modifier.fillMaxWidth()) {
                            EmptyState(
                                "Tài khoản của bạn không có quyền xem dữ liệu " +
                                    "nghỉ việc. Chỉ HR và quản lý phụ trách mới " +
                                    "truy cập được mục này.",
                            )
                        }
                    }
                }
                state.error != null && state.processes.isEmpty() -> {
                    item {
                        ErrorState(
                            message = state.error ?: "Không tải được danh sách.",
                            onRetry = { vm.loadProcesses() },
                        )
                    }
                }
                state.processes.isEmpty() -> {
                    item {
                        EmptyState("Hiện không có quy trình nghỉ việc nào. 🎉")
                    }
                }
                else -> {
                    items(state.processes, key = { it.id ?: 0 }) { process ->
                        ProcessCard(
                            process = process,
                            onOpen = { process.id?.let { vm.openProcess(it) } },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ProcessCard(process: OffboardingProcessDto, onOpen: () -> Unit) {
    val percent = process.progressPercent ?: 0
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                InitialAvatar(process.employeeName, 42)
                Column(modifier = Modifier.padding(start = 10.dp).weight(1f)) {
                    Text(
                        process.employeeName ?: "Nhân viên",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        listOfNotNull(process.positionTitle, process.departmentName)
                            .joinToString(" · ")
                            .ifBlank { "—" },
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
                ProcessStatusChip(process.status)
            }
            Spacer(Modifier.height(8.dp))
            val details = mutableListOf<String>()
            process.lastWorkingDay?.let { details.add("Ngày làm cuối: ${Format.date(it)}") }
            process.initiatedByName?.let { details.add("Khởi tạo: $it") }
            if (details.isNotEmpty()) {
                Text(
                    details.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            if (!process.reason.isNullOrBlank()) {
                Text(
                    "Lý do: ${process.reason}",
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
                    "Bàn giao ${process.doneTasks ?: 0}/${process.totalTasks ?: 0} bước",
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
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                TextButton(onClick = onOpen) {
                    Text("Xem checklist", color = BrandBlue)
                }
            }
        }
    }
}

// ----------------------------------------------------------------------
// Chi tiết: checklist bàn giao theo nhóm
// ----------------------------------------------------------------------

@Composable
private fun ProcessDetailView(state: OffboardingUiState, vm: OffboardingViewModel) {
    val process = state.detail
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp),
        ) {
            IconButton(onClick = { vm.closeProcess() }) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Quay lại",
                    tint = BrandBlue,
                )
            }
            Text(
                process?.employeeName ?: "Chi tiết nghỉ việc",
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
                    SkeletonBlock(heightDp = 120)
                    SkeletonBlock(heightDp = 72)
                    SkeletonBlock(heightDp = 72)
                }
            }
            state.detailError != null -> {
                ErrorState(
                    message = state.detailError ?: "Không tải được chi tiết.",
                    onRetry = { vm.closeProcess() },
                )
            }
            process != null -> {
                val tasks = process.tasks ?: emptyList()
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item { ProcessCard(process = process, onOpen = {}) }
                    if (process.status != "in_progress") {
                        item {
                            Text(
                                "Quy trình đã kết thúc — checklist chỉ để xem, " +
                                    "không sửa được nữa.",
                                style = MaterialTheme.typography.bodySmall,
                                color = WarningAmber,
                            )
                        }
                    }
                    if (tasks.isEmpty()) {
                        item { EmptyState("Quy trình này chưa có bước bàn giao nào.") }
                    } else {
                        CATEGORY_ORDER.forEach { category ->
                            val group = tasks.filter { it.category == category }
                            if (group.isNotEmpty()) {
                                item { SectionHeader(title = categoryLabel(category)) }
                                items(group, key = { it.id ?: 0 }) { task ->
                                    OffboardingTaskRow(
                                        task = task,
                                        acting = state.actingTaskId == task.id,
                                        editable = process.status == "in_progress",
                                        onToggle = { vm.toggleTask(task) },
                                    )
                                }
                            }
                        }
                        val others = tasks.filter { it.category !in CATEGORY_ORDER }
                        if (others.isNotEmpty()) {
                            item { SectionHeader(title = "Khác") }
                            items(others, key = { it.id ?: 0 }) { task ->
                                OffboardingTaskRow(
                                    task = task,
                                    acting = state.actingTaskId == task.id,
                                    editable = process.status == "in_progress",
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
private fun OffboardingTaskRow(
    task: OffboardingTaskDto,
    acting: Boolean,
    editable: Boolean,
    onToggle: () -> Unit,
) {
    val done = task.isDone ?: false
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
                        enabled = editable,
                        colors = CheckboxDefaults.colors(checkedColor = BrandBlue),
                    )
                }
            }
            Column(modifier = Modifier.weight(1f).padding(top = 8.dp)) {
                Text(
                    task.title ?: "Bước bàn giao",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    textDecoration = if (done) TextDecoration.LineThrough else null,
                    color = if (done) InkMuted else MaterialTheme.colorScheme.onSurface,
                )
                val details = mutableListOf<String>()
                assigneeRoleLabel(task.assigneeRole)?.let { details.add("Phụ trách: $it") }
                if (done && !task.doneByName.isNullOrBlank()) {
                    details.add(
                        "Đã tick: ${task.doneByName}" +
                            (task.doneAt?.let { " · ${Format.dateTime(it)}" } ?: ""),
                    )
                }
                if (details.isNotEmpty()) {
                    Text(
                        details.joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = if (done) SuccessGreen else InkMuted,
                    )
                }
                if (!task.note.isNullOrBlank()) {
                    Text(
                        "Ghi chú: ${task.note}",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
            }
        }
    }
}

// ----------------------------------------------------------------------
// Tiện ích hiển thị
// ----------------------------------------------------------------------

private val CATEGORY_ORDER = listOf("knowledge", "assets", "it", "finance", "hr", "other")

private fun categoryLabel(category: String?): String = when (category) {
    "knowledge" -> "Bàn giao công việc & kiến thức"
    "assets" -> "Tài sản & thiết bị"
    "it" -> "IT & tài khoản"
    "finance" -> "Tài chính & quyết toán"
    "hr" -> "Hồ sơ nhân sự"
    "other" -> "Khác"
    else -> category ?: "Bàn giao"
}

private fun assigneeRoleLabel(role: String?): String? = when (role) {
    "hr" -> "HR"
    "manager" -> "Quản lý"
    "employee" -> "Nhân viên nghỉ việc"
    "it" -> "IT"
    else -> role
}

@Composable
private fun ProcessStatusChip(status: String?) {
    val (label, bg, fg) = when (status) {
        "in_progress" -> Triple("Đang xử lý", Color(0xFFFFFAEB), WarningAmber)
        "completed" -> Triple("Đã hoàn tất", Color(0xFFECFDF3), SuccessGreen)
        "cancelled" -> Triple("Đã huỷ", Color(0xFFF2F4F7), InkMuted)
        null -> Triple("—", Color(0xFFF2F4F7), InkMuted)
        else -> Triple(status, Color(0xFFF2F4F7), InkMuted)
    }
    StatusChip(label, bg, fg)
}
