package com.hrmai.app.feature.jobs

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Group
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.SkeletonBlock
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BrandBlueDark
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.util.Format

private val OpenBadgeBg = Color(0xFFECFDF3)

@Composable
fun JobsRoute(container: AppContainer, onOpenJob: (Int) -> Unit) {
    val vm: JobsViewModel = viewModel(
        factory = JobsViewModel.Factory(container.api(JobsApi::class.java))
    )
    val state by vm.state.collectAsState()

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        Column(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp)) {
                Text(
                    text = "Việc làm đang mở",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Các vị trí công ty đang tuyển — chạm để xem mô tả chi tiết",
                    style = MaterialTheme.typography.bodyMedium,
                    color = InkMuted,
                )
            }
            when {
                state.loading -> Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    repeat(3) { SkeletonBlock() }
                }
                state.error != null -> ErrorState(
                    message = state.error ?: "Đã có lỗi xảy ra.",
                    onRetry = vm::load,
                )
                state.jobs.isEmpty() -> EmptyState(
                    message = "Hiện chưa có vị trí nào đang tuyển. Quay lại sau nhé.",
                )
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(state.jobs, key = { it.id }) { job ->
                        JobCard(job = job, onClick = { onOpenJob(job.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun JobCard(job: JobPostingDto, onClick: () -> Unit) {
    HrmCard(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
    ) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = job.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                StatusChip(text = "Đang tuyển", bg = OpenBadgeBg, fg = SuccessGreen)
            }
            if (!job.departmentName.isNullOrBlank()) {
                Spacer(Modifier.height(8.dp))
                StatusChip(
                    text = job.departmentName,
                    bg = BrandBlueSoft,
                    fg = BrandBlueDark,
                )
            }
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.CalendarToday,
                    contentDescription = null,
                    tint = InkMuted,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = job.deadline?.let { "Hạn nộp: ${Format.date(it)}" }
                        ?: "Hạn nộp: liên hệ HR",
                    style = MaterialTheme.typography.bodyMedium,
                    color = InkMuted,
                )
                if (job.quantity != null) {
                    Spacer(Modifier.width(16.dp))
                    Icon(
                        Icons.Filled.Group,
                        contentDescription = null,
                        tint = InkMuted,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = "Tuyển ${job.quantity} người",
                        style = MaterialTheme.typography.bodyMedium,
                        color = InkMuted,
                    )
                }
            }
        }
    }
}

@Composable
fun JobDetailRoute(container: AppContainer, jobId: Int, onBack: () -> Unit) {
    val vm: JobDetailViewModel = viewModel(
        factory = JobDetailViewModel.Factory(container.api(JobsApi::class.java), jobId)
    )
    val state by vm.state.collectAsState()

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.padding(start = 4.dp, end = 16.dp, top = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Filled.ArrowBack, contentDescription = "Quay lại")
                }
                Text(
                    text = "Chi tiết việc làm",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
            }
            when {
                state.loading -> Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SkeletonBlock(heightDp = 120)
                    SkeletonBlock(heightDp = 200)
                }
                state.error != null -> ErrorState(
                    message = state.error ?: "Đã có lỗi xảy ra.",
                    onRetry = vm::load,
                )
                state.job == null -> EmptyState(message = "Không tìm thấy tin tuyển dụng này.")
                else -> {
                    val job = state.job!!
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(16.dp),
                    ) {
                        Text(
                            text = job.title,
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                        )
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            StatusChip(text = "Đang tuyển", bg = OpenBadgeBg, fg = SuccessGreen)
                            if (!job.departmentName.isNullOrBlank()) {
                                StatusChip(
                                    text = job.departmentName,
                                    bg = BrandBlueSoft,
                                    fg = BrandBlueDark,
                                )
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                        JobMetaLine(
                            label = "Hạn nộp hồ sơ",
                            value = job.deadline?.let { Format.date(it) } ?: "Liên hệ HR",
                        )
                        if (job.quantity != null) {
                            JobMetaLine(label = "Số lượng tuyển", value = "${job.quantity} người")
                        }
                        if (job.createdAt != null) {
                            JobMetaLine(label = "Ngày đăng", value = Format.dateTime(job.createdAt))
                        }
                        if (!job.description.isNullOrBlank()) {
                            Spacer(Modifier.height(20.dp))
                            SectionHeader(title = "Mô tả công việc")
                            Spacer(Modifier.height(8.dp))
                            HrmCard(modifier = Modifier.fillMaxWidth()) {
                                Text(
                                    text = job.description,
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        }
                        if (!job.requirements.isNullOrBlank()) {
                            Spacer(Modifier.height(20.dp))
                            SectionHeader(title = "Yêu cầu ứng viên")
                            Spacer(Modifier.height(8.dp))
                            HrmCard(modifier = Modifier.fillMaxWidth()) {
                                Text(
                                    text = job.requirements,
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        }
                        Spacer(Modifier.height(24.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun JobMetaLine(label: String, value: String) {
    Row(modifier = Modifier.padding(vertical = 3.dp)) {
        Text(
            text = "$label: ",
            style = MaterialTheme.typography.bodyMedium,
            color = InkMuted,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}
