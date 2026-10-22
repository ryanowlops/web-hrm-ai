package com.hrmai.app.feature.recruitment

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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

// ---------------------------------------------------------------------------
// Danh sách tin tuyển dụng
// ---------------------------------------------------------------------------

@Composable
fun RecruitmentRoute(container: AppContainer, onOpenJob: (Int) -> Unit) {
    val vm: RecruitmentViewModel = viewModel(
        factory = RecruitmentViewModel.Factory(
            api = container.api(RecruitmentApi::class.java),
            sessionStore = container.sessionStore,
        ),
    )
    val state by vm.state.collectAsState()
    RecruitmentScreen(state = state, vm = vm, onOpenJob = onOpenJob)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RecruitmentScreen(
    state: RecruitmentUiState,
    vm: RecruitmentViewModel,
    onOpenJob: (Int) -> Unit,
) {
    PullToRefreshBox(
        isRefreshing = state.refreshing,
        onRefresh = { vm.refresh() },
        modifier = Modifier.fillMaxSize().background(CanvasGray),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Column {
                    Text(
                        "Tuyển dụng",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        "Quản lý tin tuyển dụng và ứng viên theo từng vị trí.",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
            }
            when {
                state.loading && state.jobs.isEmpty() -> {
                    items(3) { SkeletonBlock(heightDp = 104) }
                }
                state.forbidden && state.jobs.isEmpty() -> {
                    item { EmptyState("Tính năng dành cho HR/quản lý") }
                }
                state.error != null && state.jobs.isEmpty() -> {
                    item {
                        ErrorState(
                            message = state.error ?: "Không tải được danh sách tin tuyển dụng.",
                            onRetry = { vm.load() },
                        )
                    }
                }
                state.jobs.isEmpty() -> {
                    item {
                        EmptyState(
                            "Chưa có tin tuyển dụng nào.\n" +
                                "Tạo tin mới trên bản web (mục Tuyển dụng) nhé.",
                        )
                    }
                }
                else -> {
                    items(state.jobs, key = { it.id ?: 0 }) { job ->
                        JobCard(job = job, onClick = { job.id?.let(onOpenJob) })
                    }
                }
            }
        }
    }
}

@Composable
private fun JobCard(job: JobPostingDto, onClick: () -> Unit) {
    HrmCard(
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
    ) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Text(
                    job.title ?: "Tin tuyển dụng",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                JobStatusChip(job.status)
            }
            val meta = listOfNotNull(
                job.departmentName,
                job.quantity?.let { "Tuyển $it người" },
                job.deadline?.let { "Hạn nộp ${Format.date(it)}" },
            ).filter { it.isNotBlank() }.joinToString(" · ")
            if (meta.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(meta, style = MaterialTheme.typography.bodySmall, color = InkMuted)
            }
            if (job.candidatesCount != null) {
                Spacer(Modifier.height(6.dp))
                Text(
                    "${job.candidatesCount} ứng viên đã nộp hồ sơ",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Medium,
                    color = BrandBlueDark,
                )
            }
        }
    }
}

@Composable
private fun JobStatusChip(status: String?) {
    val (label, bg, fg) = when (status) {
        "open" -> Triple("Đang tuyển", Color(0xFFECFDF3), SuccessGreen)
        "closed" -> Triple("Đã đóng", Color(0xFFF2F4F7), InkMuted)
        null -> Triple("—", Color(0xFFF2F4F7), InkMuted)
        else -> Triple(status, Color(0xFFF2F4F7), InkMuted)
    }
    StatusChip(label, bg, fg)
}

// ---------------------------------------------------------------------------
// Chi tiết tin + ứng viên
// ---------------------------------------------------------------------------

@Composable
fun RecruitmentJobRoute(container: AppContainer, jobId: Int, onBack: () -> Unit) {
    val vm: JobDetailViewModel = viewModel(
        factory = JobDetailViewModel.Factory(
            api = container.api(RecruitmentApi::class.java),
            sessionStore = container.sessionStore,
            jobId = jobId,
        ),
    )
    val state by vm.state.collectAsState()
    JobDetailScreen(state = state, vm = vm, onBack = onBack)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun JobDetailScreen(
    state: JobDetailUiState,
    vm: JobDetailViewModel,
    onBack: () -> Unit,
) {
    val snackbarHostState = remember { SnackbarHostState() }
    var statusTarget by remember { mutableStateOf<CandidateDto?>(null) }

    LaunchedEffect(state.message) {
        val msg = state.message ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(msg)
        vm.consumeMessage()
    }

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Quay lại",
                        tint = BrandBlue,
                    )
                }
                Text(
                    "Chi tiết tin tuyển dụng",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            PullToRefreshBox(
                isRefreshing = state.refreshing,
                onRefresh = { vm.refresh() },
                modifier = Modifier.weight(1f).fillMaxWidth(),
            ) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item { JobInfoSection(state, vm) }
                    item {
                        SectionHeader(
                            title = if (state.candidates.isNotEmpty()) {
                                "Ứng viên (${state.candidates.size})"
                            } else {
                                "Ứng viên"
                            },
                        )
                    }
                    when {
                        state.candidatesLoading && state.candidates.isEmpty() -> {
                            items(3) { SkeletonBlock(heightDp = 132) }
                        }
                        state.candidatesForbidden -> {
                            item { EmptyState("Tính năng dành cho HR/quản lý") }
                        }
                        state.candidatesError != null && state.candidates.isEmpty() -> {
                            item {
                                ErrorState(
                                    message = state.candidatesError
                                        ?: "Không tải được danh sách ứng viên.",
                                    onRetry = { vm.loadCandidates() },
                                )
                            }
                        }
                        state.candidates.isEmpty() -> {
                            item {
                                EmptyState("Chưa có ứng viên nào nộp hồ sơ cho vị trí này.")
                            }
                        }
                        else -> {
                            items(state.candidates, key = { it.id ?: 0 }) { candidate ->
                                CandidateCard(
                                    candidate = candidate,
                                    acting = state.actingId == candidate.id,
                                    onChangeStatus = { statusTarget = candidate },
                                )
                            }
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

    statusTarget?.let { candidate ->
        CandidateStatusDialog(
            candidate = candidate,
            acting = state.actingId == candidate.id,
            onDismiss = { statusTarget = null },
            onConfirm = { newStatus, note ->
                vm.changeStatus(candidate, newStatus, note)
                statusTarget = null
            },
        )
    }
}

@Composable
private fun JobInfoSection(state: JobDetailUiState, vm: JobDetailViewModel) {
    when {
        state.jobLoading && state.job == null -> HrmCard(modifier = Modifier.fillMaxWidth()) {
            LoadingState()
        }
        state.jobError != null && state.job == null -> HrmCard(modifier = Modifier.fillMaxWidth()) {
            ErrorState(
                message = state.jobError ?: "Không tải được chi tiết tin tuyển dụng.",
                onRetry = { vm.loadJob() },
            )
        }
        state.job == null -> HrmCard(modifier = Modifier.fillMaxWidth()) {
            EmptyState("Không tìm thấy tin tuyển dụng này.")
        }
        else -> {
            val job = state.job
            HrmCard(modifier = Modifier.fillMaxWidth()) {
                Column {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Top,
                    ) {
                        Text(
                            job.title ?: "Tin tuyển dụng",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(1f),
                        )
                        Spacer(Modifier.width(8.dp))
                        JobStatusChip(job.status)
                    }
                    val meta = listOfNotNull(
                        job.departmentName,
                        job.quantity?.let { "Tuyển $it người" },
                        job.deadline?.let { "Hạn nộp ${Format.date(it)}" },
                        job.candidatesCount?.let { "$it ứng viên" },
                    ).filter { it.isNotBlank() }.joinToString(" · ")
                    if (meta.isNotBlank()) {
                        Spacer(Modifier.height(4.dp))
                        Text(meta, style = MaterialTheme.typography.bodySmall, color = InkMuted)
                    }
                    if (!job.description.isNullOrBlank()) {
                        Spacer(Modifier.height(12.dp))
                        Text(
                            "Mô tả công việc",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            job.description,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                    if (!job.requirements.isNullOrBlank()) {
                        Spacer(Modifier.height(12.dp))
                        Text(
                            "Yêu cầu",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            job.requirements,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CandidateCard(
    candidate: CandidateDto,
    acting: Boolean,
    onChangeStatus: () -> Unit,
) {
    val analysis = candidate.latestAnalysis
    val score = candidate.matchScore ?: analysis?.matchScore
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                InitialAvatar(candidate.fullName, 42)
                Column(modifier = Modifier.padding(start = 10.dp).weight(1f)) {
                    Text(
                        candidate.fullName ?: "Ứng viên",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    val contact = listOfNotNull(candidate.email, candidate.phone)
                        .filter { it.isNotBlank() }.joinToString(" · ")
                    if (contact.isNotBlank()) {
                        Text(
                            contact,
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                }
                CandidateStatusChip(candidate.status)
            }

            if (score != null) {
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Điểm CV (AI): ",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                    Text(
                        "$score/100",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = scoreColor(score),
                    )
                    val years = analysis?.experienceYearsEstimate
                    if (years != null) {
                        Text(
                            " · KN ước tính ${formatYears(years)} năm",
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                }
            }
            if (analysis != null) {
                val matched = anyToList(analysis.matchedSkills)
                if (matched.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    SkillChips(
                        label = "Kỹ năng khớp",
                        skills = matched,
                        bg = Color(0xFFECFDF3),
                        fg = SuccessGreen,
                    )
                }
                val missing = anyToList(analysis.missingSkills)
                if (missing.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    SkillChips(
                        label = "Còn thiếu",
                        skills = missing,
                        bg = Color(0xFFFEF3F2),
                        fg = DangerRed,
                    )
                }
                if (!analysis.summary.isNullOrBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        analysis.summary,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                val strengths = anyToText(analysis.strengths)
                if (strengths != null) {
                    Text(
                        "Điểm mạnh: $strengths",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
                val concerns = anyToText(analysis.concerns)
                if (concerns != null) {
                    Text(
                        "Lưu ý: $concerns",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
            } else if (score == null) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Chưa có phân tích CV bằng AI cho ứng viên này.",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }

            if (!candidate.hrNote.isNullOrBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Ghi chú HR: ${candidate.hrNote}",
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
                    "Nộp lúc ${Format.dateTime(candidate.createdAt)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                TextButton(onClick = onChangeStatus, enabled = !acting) {
                    if (acting) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                            color = BrandBlue,
                        )
                    } else {
                        Text("Đổi trạng thái", color = BrandBlue)
                    }
                }
            }
        }
    }
}

@Composable
private fun SkillChips(label: String, skills: List<String>, bg: Color, fg: Color) {
    Row(
        modifier = Modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "$label:",
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
            color = InkMuted,
        )
        skills.forEach { skill -> StatusChip(skill, bg, fg) }
    }
}

@Composable
private fun CandidateStatusChip(status: String?) {
    val (bg, fg) = when (status) {
        "new" -> BrandBlueSoft to BrandBlueDark
        "reviewing" -> Color(0xFFFFFAEB) to WarningAmber
        "interview" -> Color(0xFFF4F3FF) to Color(0xFF6941C6)
        "passed" -> Color(0xFFECFDF3) to SuccessGreen
        "rejected" -> Color(0xFFFEF3F2) to DangerRed
        else -> Color(0xFFF2F4F7) to InkMuted
    }
    StatusChip(candidateStatusLabel(status), bg, fg)
}

/** Hộp thoại xác nhận đổi trạng thái ứng viên TRƯỚC khi gọi API. */
@Composable
private fun CandidateStatusDialog(
    candidate: CandidateDto,
    acting: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (String, String) -> Unit,
) {
    var selected by remember(candidate) { mutableStateOf(candidate.status ?: "new") }
    var note by remember(candidate) { mutableStateOf(candidate.hrNote ?: "") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Đổi trạng thái ứng viên") },
        text = {
            Column {
                Text(
                    candidate.fullName ?: "Ứng viên",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    "Trạng thái hiện tại: ${candidateStatusLabel(candidate.status)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                Spacer(Modifier.height(12.dp))
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    CANDIDATE_STATUSES.forEach { status ->
                        FilterChip(
                            selected = selected == status,
                            onClick = { selected = status },
                            label = { Text(candidateStatusLabel(status)) },
                        )
                    }
                }
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Ghi chú HR (tuỳ chọn)") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = !acting,
                onClick = { onConfirm(selected, note) },
            ) {
                Text("Xác nhận đổi", color = BrandBlue)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Huỷ") }
        },
    )
}

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------

private fun scoreColor(score: Int): Color = when {
    score >= 75 -> SuccessGreen
    score >= 50 -> WarningAmber
    else -> DangerRed
}

/** 3.0 -> "3"; 2.5 -> "2,5". */
private fun formatYears(value: Double): String =
    if (value % 1.0 == 0.0) value.toInt().toString() else value.toString().replace('.', ',')

/** Trường Raw của server (list/chuỗi/JSON) -> danh sách chuỗi hiển thị. */
private fun anyToList(value: Any?): List<String> = when (value) {
    is List<*> -> value.mapNotNull { it?.toString() }.filter { it.isNotBlank() }
    is String -> value.split(",").map { it.trim() }.filter { it.isNotBlank() }
    else -> emptyList()
}

/** Trường Raw của server -> một dòng text (null nếu rỗng). */
private fun anyToText(value: Any?): String? = when (value) {
    null -> null
    is String -> value.takeIf { it.isNotBlank() }
    is List<*> -> value.mapNotNull { it?.toString() }
        .filter { it.isNotBlank() }
        .joinToString(" · ")
        .takeIf { it.isNotBlank() }
    else -> value.toString()
}
