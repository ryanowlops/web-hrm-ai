package com.hrmai.app.feature.cvcheck

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.feature.jobs.JobsApi

private val MatchedBg = Color(0xFFECFDF3)
private val MissingBg = Color(0xFFFFFAEB)

@Composable
fun CvCheckRoute(container: AppContainer) {
    val vm: CvCheckViewModel = viewModel(
        factory = CvCheckViewModel.Factory(
            container.api(JobsApi::class.java),
            container.api(CvCheckApi::class.java),
        )
    )
    val state by vm.state.collectAsState()

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            Text(
                text = "Kiểm tra CV bằng AI",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Chọn vị trí và dán nội dung CV — hệ thống chấm độ phù hợp " +
                    "ngay. CV chỉ phân tích tức thời, không được lưu lại.",
                style = MaterialTheme.typography.bodyMedium,
                color = InkMuted,
            )

            Spacer(Modifier.height(20.dp))
            SectionHeader(title = "1. Chọn vị trí ứng tuyển")
            Spacer(Modifier.height(8.dp))
            when {
                state.jobsLoading -> SkeletonBlock(heightDp = 120)
                state.jobsError != null -> ErrorState(
                    message = state.jobsError ?: "Đã có lỗi xảy ra.",
                    onRetry = vm::loadJobs,
                )
                state.jobs.isEmpty() -> EmptyState(
                    message = "Hiện chưa có vị trí nào đang tuyển để kiểm tra CV.",
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

            Spacer(Modifier.height(20.dp))
            SectionHeader(title = "2. Dán nội dung CV của bạn")
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = state.cvText,
                onValueChange = vm::onCvTextChange,
                modifier = Modifier.fillMaxWidth(),
                placeholder = {
                    Text("Dán toàn bộ nội dung CV dạng chữ vào đây...")
                },
                minLines = 8,
                maxLines = 14,
            )
            Text(
                text = "${state.cvText.length}/$MAX_CV_CHARS ký tự",
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
                textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
            )

            if (state.error != null) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = state.error!!,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            Spacer(Modifier.height(16.dp))
            Button(
                onClick = vm::submit,
                enabled = !state.submitting,
                modifier = Modifier.fillMaxWidth().height(50.dp),
            ) {
                if (state.submitting) {
                    CircularProgressIndicator(
                        color = Color.White,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text("Đang phân tích...")
                } else {
                    Text("Phân tích CV")
                }
            }

            state.result?.let { result ->
                Spacer(Modifier.height(24.dp))
                CvResultCard(result)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CvResultCard(result: CvCheckResultDto) {
    Column {
        SectionHeader(title = "Kết quả kiểm tra")
        Spacer(Modifier.height(8.dp))
        HrmCard(modifier = Modifier.fillMaxWidth()) {
            Column {
                if (!result.jobTitle.isNullOrBlank()) {
                    Text(
                        text = "Vị trí: ${result.jobTitle}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = InkMuted,
                    )
                    Spacer(Modifier.height(8.dp))
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "${result.score}",
                        style = MaterialTheme.typography.displaySmall,
                        fontWeight = FontWeight.Bold,
                        color = BrandBlue,
                    )
                    Text(
                        text = "/100 điểm phù hợp",
                        style = MaterialTheme.typography.titleMedium,
                        color = InkMuted,
                        modifier = Modifier.padding(start = 6.dp, top = 10.dp),
                    )
                    Spacer(Modifier.weight(1f))
                    SourceChip(result.source)
                }
                if (!result.verdict.isNullOrBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = result.verdict,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }

        if (result.strengths.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            FeedbackSection(title = "Điểm mạnh", items = result.strengths)
        }
        if (result.improvements.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            FeedbackSection(title = "Cần cải thiện", items = result.improvements)
        }
        if (result.matchedKeywords.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            Text(
                text = "Từ khoá đã có trong CV",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                result.matchedKeywords.forEach { keyword ->
                    StatusChip(text = keyword, bg = MatchedBg, fg = SuccessGreen)
                }
            }
        }
        if (result.missingKeywords.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            Text(
                text = "Từ khoá JD có mà CV còn thiếu",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(8.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                result.missingKeywords.forEach { keyword ->
                    StatusChip(text = keyword, bg = MissingBg, fg = WarningAmber)
                }
            }
        }
    }
}

@Composable
private fun FeedbackSection(title: String, items: List<String>) {
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
                        Text(
                            text = item,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SourceChip(source: String?) {
    when (source) {
        "ai" -> StatusChip(text = "Phân tích bằng AI", bg = BrandBlueSoft, fg = BrandBlueDark)
        "heuristic" -> StatusChip(
            text = "Chấm tự động theo từ khoá",
            bg = MissingBg,
            fg = WarningAmber,
        )
        else -> Unit
    }
}
