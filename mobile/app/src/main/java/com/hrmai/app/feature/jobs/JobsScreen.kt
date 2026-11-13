package com.hrmai.app.feature.jobs

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.SkeletonBlock
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.listItemEnter
import com.hrmai.app.core.ui.pressable
import com.hrmai.app.core.ui.sharedContent
import com.hrmai.app.core.ui.theme.BorderGray
import com.hrmai.app.core.ui.theme.BrandBlueDark
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.util.Format
import com.hrmai.app.core.util.stripDiacritics
import java.time.LocalDate

private val OpenBadgeBg = Color(0xFFECFDF3)
private const val UnknownDepartment = "Chưa rõ phòng ban"

/** Quy trình ứng tuyển thật của hệ thống — cùng nội dung với trang web /jobs. */
private val ProcessSteps = listOf(
    "Nộp CV" to "Điền thông tin liên hệ và đính kèm CV PDF, tối đa 5 MB.",
    "AI kiểm tra CV" to "Xem mức phù hợp của CV với vị trí trước khi nộp hồ sơ.",
    "Luyện phỏng vấn với AI" to "Tập trả lời phỏng vấn thử với AI, không cần đặt lịch.",
    "HR xem xét và liên hệ" to "Đội ngũ HR xem xét hồ sơ và liên hệ qua email hoặc điện thoại nếu phù hợp.",
)

private fun departmentNameOf(job: JobPostingDto): String =
    job.departmentName?.takeIf { it.isNotBlank() } ?: UnknownDepartment

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun JobsRoute(
    container: AppContainer,
    onOpenJob: (Int) -> Unit,
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedVisibilityScope: AnimatedVisibilityScope? = null,
) {
    val vm: JobsViewModel = viewModel(
        factory = JobsViewModel.Factory(container.api(JobsApi::class.java))
    )
    val state by vm.state.collectAsState()

    // Lọc client-side, giữ trong composable — không chạm ViewModel/API.
    var keyword by remember { mutableStateOf("") }
    var selectedDept by remember { mutableStateOf<String?>(null) }

    // Phòng ban đang tuyển (tên + số tin) — tính từ dữ liệu thật.
    val departments = remember(state.jobs) {
        state.jobs.groupingBy { departmentNameOf(it) }.eachCount().toList()
            .sortedWith(compareByDescending<Pair<String, Int>> { it.second }.thenBy { it.first })
    }
    // Dải số liệu — chỉ dùng dữ liệu đã tải về, không bịa số.
    // Hạn nộp so sánh dạng chuỗi "yyyy-MM-dd" với ngày hôm nay.
    val stats = remember(state.jobs) {
        if (state.jobs.isEmpty()) {
            null
        } else {
            val today = LocalDate.now().toString()
            val nearest = state.jobs.mapNotNull { it.deadline }
                .filter { it >= today }.minOrNull()
            Triple(state.jobs.size, departments.size, nearest)
        }
    }
    val filteredJobs = remember(state.jobs, keyword, selectedDept) {
        // Tìm không dấu cả 2 phía, giống ⌘K bên web (77fab75): gõ "ky su"
        // hay "kỹ sư" đều khớp "Kỹ sư".
        val kw = keyword.trim().stripDiacritics()
        state.jobs.filter { job ->
            val deptOk = selectedDept == null || departmentNameOf(job) == selectedDept
            val kwOk = kw.isEmpty() ||
                job.title.stripDiacritics().contains(kw) ||
                (job.departmentName?.stripDiacritics()?.contains(kw) == true) ||
                (job.description?.stripDiacritics()?.contains(kw) == true)
            deptOk && kwOk
        }
    }
    val filtersActive = keyword.isNotBlank() || selectedDept != null

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
                    stats?.let { (openCount, deptCount, nearest) ->
                        item {
                            JobsStatsCard(
                                openCount = openCount,
                                deptCount = deptCount,
                                nearestDeadline = nearest,
                            )
                        }
                    }
                    item {
                        OutlinedTextField(
                            value = keyword,
                            onValueChange = { keyword = it },
                            placeholder = { Text("Tìm theo tên vị trí, phòng ban…") },
                            leadingIcon = {
                                Icon(Icons.Filled.Search, contentDescription = "Tìm kiếm", tint = InkMuted)
                            },
                            trailingIcon = if (keyword.isNotEmpty()) {
                                {
                                    IconButton(onClick = { keyword = "" }) {
                                        Icon(Icons.Filled.Close, contentDescription = "Xóa tìm kiếm", tint = InkMuted)
                                    }
                                }
                            } else {
                                null
                            },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    if (departments.size >= 2) {
                        item {
                            DepartmentChipsRow(
                                departments = departments,
                                totalCount = state.jobs.size,
                                selected = selectedDept,
                                onSelect = { selectedDept = it },
                            )
                        }
                    }
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = if (filteredJobs.isNotEmpty()) {
                                    "Đang hiển thị ${filteredJobs.size} vị trí đang tuyển"
                                } else {
                                    "Không có vị trí nào khớp với tìm kiếm"
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = InkMuted,
                            )
                            if (filtersActive) {
                                TextButton(
                                    onClick = { keyword = ""; selectedDept = null },
                                    contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp),
                                ) {
                                    Text("Xóa bộ lọc")
                                }
                            }
                        }
                    }
                    if (filteredJobs.isEmpty()) {
                        item {
                            EmptyState(
                                message = "Không tìm thấy vị trí phù hợp. Thử đổi từ khóa ngắn hơn hoặc chọn phòng ban khác.",
                            )
                        }
                    } else {
                        itemsIndexed(filteredJobs, key = { _, job -> job.id }) { index, job ->
                            JobCard(
                                job = job,
                                onClick = { onOpenJob(job.id) },
                                modifier = Modifier.listItemEnter(index),
                                sharedTransitionScope = sharedTransitionScope,
                                animatedVisibilityScope = animatedVisibilityScope,
                            )
                        }
                        item {
                            Spacer(Modifier.height(4.dp))
                            ApplyProcessSection()
                        }
                    }
                }
            }
        }
    }
}

/** Dải số liệu thật: số vị trí, số phòng ban, hạn nộp gần nhất (dạng ngắn dd/MM). */
@Composable
private fun JobsStatsCard(openCount: Int, deptCount: Int, nearestDeadline: String?) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            JobsStatCell(
                value = openCount.toString(),
                label = "Vị trí đang mở",
                modifier = Modifier.weight(1f),
            )
            Box(modifier = Modifier.width(1.dp).height(36.dp).background(BorderGray))
            JobsStatCell(
                value = deptCount.toString(),
                label = "Phòng ban đang tuyển",
                modifier = Modifier.weight(1f),
            )
            Box(modifier = Modifier.width(1.dp).height(36.dp).background(BorderGray))
            JobsStatCell(
                value = nearestDeadline?.let {
                    Format.date(it).split("/").take(2).joinToString("/")
                } ?: "—",
                label = "Hạn nộp gần nhất",
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun JobsStatCell(value: String, label: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = InkMuted,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun DepartmentChipsRow(
    departments: List<Pair<String, Int>>,
    totalCount: Int,
    selected: String?,
    onSelect: (String?) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        DeptFilterChip(
            label = "Tất cả ($totalCount)",
            selected = selected == null,
            onClick = { onSelect(null) },
        )
        departments.forEach { (name, count) ->
            DeptFilterChip(
                label = "$name ($count)",
                selected = selected == name,
                onClick = { onSelect(name) },
            )
        }
    }
}

@Composable
private fun DeptFilterChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val borderModifier = if (selected) {
        Modifier
    } else {
        Modifier.border(1.dp, BorderGray, RoundedCornerShape(50))
    }
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(if (selected) BrandBlueDark else Color.White)
            .then(borderModifier)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 7.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = if (selected) Color.White else InkMuted,
            fontWeight = FontWeight.Medium,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalSharedTransitionApi::class)
@Composable
private fun JobCard(
    job: JobPostingDto,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedVisibilityScope: AnimatedVisibilityScope? = null,
) {
    HrmCard(
        modifier = modifier.fillMaxWidth().pressable { onClick() },
    ) {
        Column {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (!job.departmentName.isNullOrBlank()) {
                    StatusChip(
                        text = job.departmentName,
                        bg = BrandBlueSoft,
                        fg = BrandBlueDark,
                    )
                }
                StatusChip(
                    text = job.deadline?.let { "Hạn nộp: ${Format.date(it)}" }
                        ?: "Hạn nộp: liên hệ HR",
                    bg = OpenBadgeBg,
                    fg = SuccessGreen,
                )
                StatusChip(text = "Đang tuyển", bg = OpenBadgeBg, fg = SuccessGreen)
            }
            Spacer(Modifier.height(10.dp))
            Text(
                text = job.title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.sharedContent(
                    sharedTransitionScope,
                    animatedVisibilityScope,
                    key = "job-title-${job.id}",
                ),
            )
            if (job.quantity != null) {
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
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
            if (!job.description.isNullOrBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = job.description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = InkMuted,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Xem chi tiết",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = BrandBlueDark,
                )
                Icon(
                    Icons.Filled.ChevronRight,
                    contentDescription = null,
                    tint = BrandBlueDark,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}

/** Quy trình ứng tuyển 4 bước, dạng dọc gọn cho điện thoại. */
@Composable
private fun ApplyProcessSection() {
    Column {
        SectionHeader(title = "Quy trình ứng tuyển")
        Spacer(Modifier.height(8.dp))
        HrmCard(modifier = Modifier.fillMaxWidth()) {
            Column {
                ProcessSteps.forEachIndexed { index, (title, desc) ->
                    Row(verticalAlignment = Alignment.Top) {
                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .clip(CircleShape)
                                .background(BrandBlueSoft),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = "${index + 1}",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = BrandBlueDark,
                            )
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = title,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                text = desc,
                                style = MaterialTheme.typography.bodySmall,
                                color = InkMuted,
                            )
                        }
                    }
                    if (index < ProcessSteps.lastIndex) {
                        Box(
                            modifier = Modifier
                                .padding(start = 13.dp)
                                .width(2.dp)
                                .height(12.dp)
                                .background(BorderGray),
                        )
                        Spacer(Modifier.height(10.dp))
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun JobDetailRoute(
    container: AppContainer,
    jobId: Int,
    onBack: () -> Unit,
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedVisibilityScope: AnimatedVisibilityScope? = null,
) {
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
                            modifier = Modifier.sharedContent(
                                sharedTransitionScope,
                                animatedVisibilityScope,
                                key = "job-title-${job.id}",
                            ),
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
                        HrmCard(modifier = Modifier.fillMaxWidth()) {
                            Column {
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
                            }
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
