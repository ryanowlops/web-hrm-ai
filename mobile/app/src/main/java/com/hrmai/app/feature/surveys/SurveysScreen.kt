package com.hrmai.app.feature.surveys

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.LoadingState
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BorderGray
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.DangerRed
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format
import java.util.Locale

@Composable
fun SurveysRoute(container: AppContainer) {
    val vm: SurveysViewModel = viewModel(
        factory = SurveysViewModel.Factory(
            container.api(SurveysApi::class.java),
            container.sessionStore,
        ),
    )
    SurveysScreen(vm)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SurveysScreen(vm: SurveysViewModel) {
    val state by vm.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

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
            when {
                state.loading -> LoadingState()
                state.error != null -> ErrorState(state.error, onRetry = { vm.load() })
                state.surveys.isEmpty() -> EmptyState(
                    "Hiện chưa có khảo sát nào đang mở. Khi HR mở khảo sát mới, khảo sát sẽ hiện ở đây.",
                )
                else -> LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item {
                        Text(
                            text = "Câu trả lời của bạn hoàn toàn ẩn danh — hệ thống " +
                                "chỉ ghi nhận bạn đã tham gia, không gắn đáp án với cá nhân.",
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                    items(state.surveys, key = { it.id ?: 0 }) { survey ->
                        SurveyCard(survey = survey, state = state, vm = vm)
                    }
                }
            }
        }
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
        )
    }
}

// ---------------------------------------------------------------------------
// Thẻ khảo sát
// ---------------------------------------------------------------------------

@Composable
private fun SurveyCard(survey: SurveyDto, state: SurveysUiState, vm: SurveysViewModel) {
    val isActive = survey.status == "active"
    val responded = survey.responded == true
    val answering = state.answeringId == survey.id

    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = survey.title ?: "Khảo sát",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                StatusChip(
                    text = surveyStatusLabel(survey.status),
                    bg = if (isActive) Color(0xFFECFDF3) else Color(0xFFF2F4F7),
                    fg = if (isActive) SuccessGreen else InkMuted,
                )
                if (responded) {
                    Spacer(Modifier.width(6.dp))
                    StatusChip("Đã trả lời", BrandBlueSoft, BrandBlue)
                }
            }
            val meta = listOfNotNull(
                survey.createdByName?.let { "Tạo bởi $it" },
                survey.endsAt?.let { "Hết hạn ${Format.dateTime(it)}" },
                survey.responseCount?.let { "$it lượt trả lời" },
            )
            if (meta.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = meta.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            survey.description?.takeIf { it.isNotBlank() }?.let { desc ->
                Spacer(Modifier.height(6.dp))
                Text(text = desc, style = MaterialTheme.typography.bodyMedium)
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (isActive && !responded) {
                    Button(onClick = { vm.toggleAnswerForm(survey) }) {
                        Text(if (answering) "Đóng form" else "Trả lời khảo sát")
                    }
                }
                if (state.canSeeResults) {
                    OutlinedButton(onClick = { vm.toggleResults(survey) }) {
                        Text(
                            if (state.resultsOpenId == survey.id) {
                                "Ẩn kết quả"
                            } else {
                                "Xem kết quả"
                            },
                        )
                    }
                }
            }
            if (answering && isActive && !responded) {
                Spacer(Modifier.height(12.dp))
                AnswerForm(survey = survey, state = state, vm = vm)
            }
            if (state.resultsOpenId == survey.id && state.canSeeResults) {
                Spacer(Modifier.height(12.dp))
                ResultsSection(surveyId = survey.id ?: 0, state = state)
            }
        }
    }
}

private fun surveyStatusLabel(status: String?): String = when (status) {
    "active" -> "Đang mở"
    "closed" -> "Đã đóng"
    "draft" -> "Bản nháp"
    else -> "—"
}

// ---------------------------------------------------------------------------
// Form trả lời theo loại câu hỏi
// ---------------------------------------------------------------------------

@Composable
private fun AnswerForm(survey: SurveyDto, state: SurveysUiState, vm: SurveysViewModel) {
    Column {
        survey.questions.orEmpty().forEachIndexed { index, question ->
            if (index > 0) Spacer(Modifier.height(14.dp))
            Text(
                text = "${index + 1}. ${question.text ?: ""}",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(8.dp))
            val qid = question.id
            if (qid != null) {
                when (question.type) {
                    "enps" -> EnpsPicker(
                        selected = state.answers[qid] as? Int,
                        onSelect = { vm.setAnswer(qid, it) },
                    )
                    "scale" -> ScalePicker(
                        selected = state.answers[qid] as? Int,
                        onSelect = { vm.setAnswer(qid, it) },
                    )
                    "single" -> SinglePicker(
                        options = question.options.orEmpty(),
                        selected = state.answers[qid] as? String,
                        onSelect = { vm.setAnswer(qid, it) },
                    )
                    else -> OutlinedTextField(
                        value = state.answers[qid] as? String ?: "",
                        onValueChange = { vm.setAnswer(qid, it) },
                        placeholder = { Text("Chia sẻ thêm (không bắt buộc)") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2,
                    )
                }
            }
        }
        state.formError?.let { error ->
            Spacer(Modifier.height(10.dp))
            Text(
                text = error,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = { vm.submit(survey) },
            enabled = !state.submitting,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (state.submitting) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    color = Color.White,
                    strokeWidth = 2.dp,
                )
                Spacer(Modifier.width(8.dp))
            }
            Text("Gửi trả lời ẩn danh")
        }
    }
}

/** eNPS: chọn 0..10 (0 = rất không sẵn lòng giới thiệu, 10 = rất sẵn lòng). */
@Composable
private fun EnpsPicker(selected: Int?, onSelect: (Int) -> Unit) {
    Column {
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            (0..10).forEach { value ->
                NumberCell(value = value, selected = selected == value, onClick = { onSelect(value) })
            }
        }
        Spacer(Modifier.height(4.dp))
        Text(
            text = "0 = rất không sẵn lòng · 10 = rất sẵn lòng giới thiệu công ty",
            style = MaterialTheme.typography.bodySmall,
            color = InkMuted,
        )
    }
}

/** Scale: chọn 1..5. */
@Composable
private fun ScalePicker(selected: Int?, onSelect: (Int) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        (1..5).forEach { value ->
            NumberCell(value = value, selected = selected == value, onClick = { onSelect(value) })
        }
    }
}

@Composable
private fun NumberCell(value: Int, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) BrandBlue else Color.White)
            .border(1.dp, if (selected) BrandBlue else BorderGray, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = value.toString(),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = if (selected) Color.White else MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun SinglePicker(options: List<String>, selected: String?, onSelect: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        options.forEach { option ->
            FilterChip(
                selected = selected == option,
                onClick = { onSelect(option) },
                label = { Text(option) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Kết quả tổng hợp (HR/Admin)
// ---------------------------------------------------------------------------

@Composable
private fun ResultsSection(surveyId: Int, state: SurveysUiState) {
    when {
        state.resultsLoadingId == surveyId -> LoadingState()
        state.resultsError != null -> Text(
            text = state.resultsError,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
        )
        else -> {
            val results = state.results[surveyId] ?: return
            Column {
                SectionHeader(title = "Kết quả tổng hợp")
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "${results.totalResponses ?: 0} lượt trả lời (ẩn danh)",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                results.questions.orEmpty().forEachIndexed { index, question ->
                    if (index > 0) Spacer(Modifier.height(14.dp))
                    Spacer(Modifier.height(10.dp))
                    QuestionResult(question)
                }
            }
        }
    }
}

@Composable
private fun QuestionResult(question: QuestionResultDto) {
    Column {
        Text(
            text = question.text ?: "Câu hỏi",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
        Text(
            text = "${question.answered ?: 0} câu trả lời",
            style = MaterialTheme.typography.bodySmall,
            color = InkMuted,
        )
        Spacer(Modifier.height(6.dp))
        when (question.type) {
            "enps" -> {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "Điểm eNPS: ",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Text(
                        text = question.enpsScore?.toString() ?: "—",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = BrandBlue,
                    )
                    question.average?.let { avg ->
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "(trung bình ${formatNumber(avg)}/10)",
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                }
                Spacer(Modifier.height(6.dp))
                PctBar("Ủng hộ (9–10)", question.promoterPct, SuccessGreen)
                PctBar("Trung lập (7–8)", question.passivePct, WarningAmber)
                PctBar("Chưa hài lòng (0–6)", question.detractorPct, DangerRed)
            }
            "scale" -> {
                question.average?.let { avg ->
                    Text(
                        text = "Điểm trung bình: ${formatNumber(avg)}/5",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(6.dp))
                }
                val dist = question.distribution.orEmpty()
                val total = dist.values.sum().coerceAtLeast(1)
                (1..5).forEach { score ->
                    val count = dist[score.toString()] ?: 0
                    PctBar("Mức $score", count * 100.0 / total, BrandBlue, suffix = "$count")
                }
            }
            "single" -> {
                val counts = question.counts.orEmpty()
                val total = counts.values.sum().coerceAtLeast(1)
                question.options.orEmpty().forEach { option ->
                    val count = counts[option] ?: 0
                    PctBar(option, count * 100.0 / total, BrandBlue, suffix = "$count")
                }
            }
            "text" -> {
                val answers = question.answers.orEmpty()
                if (answers.isEmpty()) {
                    Text(
                        text = "Chưa có chia sẻ nào.",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                } else {
                    answers.forEach { answer ->
                        Text(
                            text = "• $answer",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(vertical = 2.dp),
                        )
                    }
                }
            }
        }
    }
}

/** Thanh tỉ lệ ngang kèm nhãn và % (hoặc hậu tố tuỳ chọn như số lượng). */
@Composable
private fun PctBar(label: String, pct: Double?, color: Color, suffix: String? = null) {
    val value = (pct ?: 0.0).coerceIn(0.0, 100.0)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(vertical = 2.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.width(140.dp),
        )
        LinearProgressIndicator(
            progress = { (value / 100.0).toFloat() },
            modifier = Modifier.weight(1f),
            color = color,
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = suffix ?: "${formatNumber(value)}%",
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
        )
    }
}

private fun formatNumber(value: Double): String =
    if (value % 1.0 == 0.0) {
        value.toInt().toString()
    } else {
        String.format(Locale.US, "%.1f", value)
    }
