package com.hrmai.app.feature.mockinterview

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.hrmai.app.core.ui.InitialAvatar
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.SkeletonBlock
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.BrandBlueDark
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.feature.jobs.JobsApi

@Composable
fun MockInterviewRoute(container: AppContainer) {
    val vm: MockInterviewViewModel = viewModel(
        factory = MockInterviewViewModel.Factory(
            container.api(JobsApi::class.java),
            container.api(MockInterviewApi::class.java),
            container.sessionStore,
        )
    )
    val state by vm.state.collectAsState()

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        when (state.phase) {
            InterviewPhase.SETUP -> SetupPane(state, vm)
            InterviewPhase.IN_PROGRESS -> InterviewPane(state, vm)
            InterviewPhase.REPORT -> state.report?.let { ReportPane(it, vm) }
                ?: SetupPane(state, vm)
        }
    }
}

// ---------------------------------------------------------------------------
// Bước 1: chọn vị trí (+ thông tin khách nếu chưa đăng nhập)
// ---------------------------------------------------------------------------

@Composable
private fun SetupPane(state: MockInterviewUiState, vm: MockInterviewViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        Text(
            text = "Phỏng vấn thử với AI",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = "Chọn một vị trí đang tuyển, HR ảo sẽ hỏi lần lượt và chấm " +
                "điểm từng câu trả lời kèm báo cáo tổng kết.",
            style = MaterialTheme.typography.bodyMedium,
            color = InkMuted,
        )

        Spacer(Modifier.height(20.dp))
        SectionHeader(title = "Chọn vị trí phỏng vấn")
        Spacer(Modifier.height(8.dp))
        when {
            state.jobsLoading -> SkeletonBlock(heightDp = 120)
            state.jobsError != null -> ErrorState(
                message = state.jobsError ?: "Đã có lỗi xảy ra.",
                onRetry = vm::loadJobs,
            )
            state.jobs.isEmpty() -> EmptyState(
                message = "Hiện chưa có vị trí nào đang tuyển để luyện phỏng vấn.",
            )
            else -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                state.jobs.forEach { job ->
                    val selected = job.id == state.selectedJobId
                    HrmCard(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { vm.selectJob(job.id) },
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = job.title,
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                if (!job.departmentName.isNullOrBlank()) {
                                    Text(
                                        text = job.departmentName,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = InkMuted,
                                    )
                                }
                            }
                            if (selected) {
                                StatusChip(
                                    text = "Đã chọn",
                                    bg = BrandBlueSoft,
                                    fg = BrandBlueDark,
                                )
                            }
                        }
                    }
                }
            }
        }

        if (state.isGuest) {
            Spacer(Modifier.height(20.dp))
            SectionHeader(title = "Thông tin của bạn")
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = state.guestName,
                onValueChange = vm::onGuestNameChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Họ tên") },
                singleLine = true,
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = state.guestEmail,
                onValueChange = vm::onGuestEmailChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Email liên hệ") },
                singleLine = true,
            )
        }

        if (state.error != null) {
            Spacer(Modifier.height(12.dp))
            Text(
                text = state.error!!,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }

        Spacer(Modifier.height(20.dp))
        Button(
            onClick = vm::start,
            enabled = !state.starting,
            modifier = Modifier.fillMaxWidth().height(50.dp),
        ) {
            if (state.starting) {
                CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text("Đang chuẩn bị câu hỏi...")
            } else {
                Text("Bắt đầu phỏng vấn")
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Bước 2: hội thoại hỏi — đáp
// ---------------------------------------------------------------------------

@Composable
private fun InterviewPane(state: MockInterviewUiState, vm: MockInterviewViewModel) {
    val listState = rememberLazyListState()
    LaunchedEffect(state.turns.size, state.sending) {
        val last = state.turns.lastIndex
        if (last >= 0) listState.animateScrollToItem(last)
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.SmartToy,
                    contentDescription = null,
                    tint = BrandBlue,
                    modifier = Modifier.size(24.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = "Phỏng vấn thử",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.weight(1f))
                StatusChip(
                    text = "Đã trả lời ${state.answeredCount}/${state.totalQuestions}",
                    bg = BrandBlueSoft,
                    fg = BrandBlueDark,
                )
            }
            if (!state.jobTitle.isNullOrBlank()) {
                Text(
                    text = "Vị trí: ${state.jobTitle}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = InkMuted,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }

        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(state.turns) { turn ->
                InterviewBubble(turn)
            }
            if (state.sending || state.finishing) {
                item {
                    Text(
                        text = if (state.finishing) "Đang tổng hợp báo cáo..." else "HR ảo đang đọc câu trả lời...",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
            }
        }

        if (state.error != null) {
            Text(
                text = state.error!!,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }

        if (!state.allAnswered) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedTextField(
                    value = state.draft,
                    onValueChange = vm::onDraftChange,
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Nhập câu trả lời của bạn...") },
                    maxLines = 4,
                )
                Spacer(Modifier.width(8.dp))
                IconButton(
                    onClick = vm::sendAnswer,
                    enabled = !state.sending && state.draft.isNotBlank(),
                ) {
                    Icon(
                        Icons.Filled.Send,
                        contentDescription = "Gửi câu trả lời",
                        tint = BrandBlue,
                    )
                }
            }
        } else if (!state.finishing) {
            Button(
                onClick = vm::finish,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .height(50.dp),
            ) { Text("Xem báo cáo tổng kết") }
        }

        if (!state.allAnswered) {
            OutlinedButton(
                onClick = vm::finish,
                enabled = !state.finishing && !state.sending,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 12.dp),
            ) { Text("Kết thúc sớm & xem báo cáo") }
        }
    }
}

@Composable
private fun InterviewBubble(turn: InterviewTurn) {
    if (turn.fromInterviewer) {
        Row(modifier = Modifier.fillMaxWidth()) {
            InitialAvatar(name = "HR", sizeDp = 32)
            Spacer(Modifier.width(8.dp))
            Box(
                modifier = Modifier
                    .widthIn(max = 280.dp)
                    .clip(RoundedCornerShape(4.dp, 16.dp, 16.dp, 16.dp))
                    .background(Color.White)
                    .padding(12.dp),
            ) {
                Text(text = turn.text, style = MaterialTheme.typography.bodyMedium)
            }
        }
    } else {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
        ) {
            Box(
                modifier = Modifier
                    .widthIn(max = 280.dp)
                    .clip(RoundedCornerShape(16.dp, 4.dp, 16.dp, 16.dp))
                    .background(BrandBlue)
                    .padding(12.dp),
            ) {
                Text(
                    text = turn.text,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White,
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Bước 3: báo cáo tổng kết
// ---------------------------------------------------------------------------

@Composable
private fun ReportPane(report: InterviewSessionDto, vm: MockInterviewViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        Text(
            text = "Báo cáo phỏng vấn thử",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
        )
        if (report.job?.title != null) {
            Text(
                text = "Vị trí: ${report.job.title}",
                style = MaterialTheme.typography.bodyMedium,
                color = InkMuted,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        Spacer(Modifier.height(16.dp))
        HrmCard(modifier = Modifier.fillMaxWidth()) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = formatScore(report.overallScore),
                        style = MaterialTheme.typography.displaySmall,
                        fontWeight = FontWeight.Bold,
                        color = BrandBlue,
                    )
                    Text(
                        text = "/100 điểm tổng",
                        style = MaterialTheme.typography.titleMedium,
                        color = InkMuted,
                        modifier = Modifier.padding(start = 6.dp, top = 10.dp),
                    )
                    Spacer(Modifier.weight(1f))
                    when (report.summary?.source) {
                        "ai" -> StatusChip(
                            text = "Chấm bằng AI",
                            bg = BrandBlueSoft,
                            fg = BrandBlueDark,
                        )
                        "heuristic" -> StatusChip(
                            text = "Chấm tự động theo từ khoá",
                            bg = Color(0xFFFFFAEB),
                            fg = WarningAmber,
                        )
                    }
                }
                if (!report.summary?.verdict.isNullOrBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = report.summary!!.verdict!!,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }

        val strengths = report.summary?.strengths.orEmpty()
        if (strengths.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            SummaryListSection(title = "Điểm mạnh", items = strengths)
        }
        val improvements = report.summary?.improvements.orEmpty()
        if (improvements.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            SummaryListSection(title = "Cần cải thiện", items = improvements)
        }

        if (report.questions.isNotEmpty()) {
            Spacer(Modifier.height(20.dp))
            SectionHeader(title = "Chi tiết từng câu")
            Spacer(Modifier.height(8.dp))
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                report.questions.forEach { qa ->
                    HrmCard(modifier = Modifier.fillMaxWidth()) {
                        Column {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = "Câu ${qa.orderNo}",
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                if (qa.score != null) {
                                    StatusChip(
                                        text = "${formatScore(qa.score)}/10",
                                        bg = Color(0xFFECFDF3),
                                        fg = SuccessGreen,
                                    )
                                }
                            }
                            Spacer(Modifier.height(6.dp))
                            Text(
                                text = qa.question,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium,
                            )
                            Spacer(Modifier.height(6.dp))
                            Text(
                                text = "Trả lời: ${qa.answer?.takeIf { it.isNotBlank() } ?: "(chưa trả lời)"}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = InkMuted,
                            )
                            if (!qa.comment.isNullOrBlank()) {
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    text = "Nhận xét: ${qa.comment}",
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(24.dp))
        Button(
            onClick = vm::restart,
            modifier = Modifier.fillMaxWidth().height(50.dp),
        ) { Text("Luyện phỏng vấn lại") }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun SummaryListSection(title: String, items: List<String>) {
    Column {
        Text(
            text = title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(8.dp))
        HrmCard(modifier = Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items.forEach { item ->
                    Row {
                        Text(
                            text = "•",
                            style = MaterialTheme.typography.bodyMedium,
                            color = BrandBlue,
                            fontWeight = FontWeight.Bold,
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(text = item, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
    }
}

private fun formatScore(value: Double?): String {
    if (value == null) return "—"
    return if (value % 1.0 == 0.0) value.toInt().toString()
    else String.format("%.1f", value)
}
