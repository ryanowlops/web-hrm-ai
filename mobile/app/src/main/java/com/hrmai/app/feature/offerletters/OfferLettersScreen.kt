package com.hrmai.app.feature.offerletters

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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberDatePickerState
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
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.InitialAvatar
import com.hrmai.app.core.ui.SkeletonBlock
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BorderGray
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.BrandBlueDark
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.DangerRed
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format
import com.hrmai.app.core.util.stripDiacritics
import com.hrmai.app.feature.recruitment.CandidateDto
import com.hrmai.app.feature.recruitment.JobPostingDto
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.Locale

// ---------------------------------------------------------------------------
// Thư mời nhận việc — danh sách + tạo mới + xem thư + gửi / ghi nhận phản
// hồi / thu hồi. Chỉ admin/hr (route đã chặn ở HrmNavHost; nút tạo và nút
// hành động ẩn hẳn khi role không có quyền, không hiện banner lỗi).
// Nhãn + luật trạng thái khớp bản web OfferLettersPage.jsx.
// ---------------------------------------------------------------------------

@Composable
fun OfferLettersRoute(container: AppContainer) {
    val vm: OfferLettersViewModel = viewModel(
        factory = OfferLettersViewModel.Factory(
            api = container.api(OfferLettersApi::class.java),
            sessionStore = container.sessionStore,
        ),
    )
    val state by vm.state.collectAsState()
    val session by container.sessionStore.sessionFlow.collectAsState()
    val role = session?.user?.role
    OfferLettersScreen(
        state = state,
        vm = vm,
        canManage = role == "hr" || role == "admin",
    )
}

private data class PendingOfferAction(val type: String, val offer: OfferLetterDto)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OfferLettersScreen(
    state: OfferLettersUiState,
    vm: OfferLettersViewModel,
    canManage: Boolean,
) {
    val snackbarHostState = remember { SnackbarHostState() }
    var pendingAction by remember { mutableStateOf<PendingOfferAction?>(null) }

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
                            "Thư mời nhận việc",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            "Soạn, gửi và theo dõi thư mời nhận việc cho ứng viên " +
                                "trúng tuyển — nội dung thư do hệ thống sinh từ mẫu tiếng Việt.",
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                }
                if (canManage) {
                    item {
                        Button(
                            onClick = { vm.openCreate() },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("Tạo thư mời")
                        }
                    }
                }
                item { OfferSummaryCard(state.offers) }
                item {
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        FilterChip(
                            selected = state.statusFilter == null,
                            onClick = { vm.setStatusFilter(null) },
                            label = { Text("Tất cả") },
                        )
                        OFFER_STATUSES.forEach { status ->
                            FilterChip(
                                selected = state.statusFilter == status,
                                onClick = { vm.setStatusFilter(status) },
                                label = { Text(offerStatusLabel(status)) },
                            )
                        }
                    }
                }
                when {
                    state.loading && state.offers.isEmpty() -> {
                        items(3) { SkeletonBlock(heightDp = 132) }
                    }
                    state.forbidden && state.offers.isEmpty() -> {
                        item { EmptyState("Tính năng dành cho HR") }
                    }
                    state.error != null && state.offers.isEmpty() -> {
                        item {
                            ErrorState(
                                message = state.error
                                    ?: "Không tải được danh sách thư mời.",
                                onRetry = { vm.load() },
                            )
                        }
                    }
                    state.offers.isEmpty() -> {
                        item {
                            EmptyState(
                                "Chưa có thư mời nhận việc nào.\n" +
                                    "Khi ứng viên trúng tuyển, HR tạo thư mời ở đây — " +
                                    "hệ thống tự soạn nội dung thư từ mẫu tiếng Việt, " +
                                    "HR chỉ cần gửi đi.",
                            )
                        }
                    }
                    else -> {
                        items(state.offers, key = { it.id ?: 0 }) { offer ->
                            OfferCard(
                                offer = offer,
                                acting = state.actingId == offer.id,
                                canManage = canManage,
                                onPreview = { vm.openPreview(offer) },
                                onAction = { type -> pendingAction = PendingOfferAction(type, offer) },
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

    if (state.creating) {
        CreateOfferDialog(state = state, vm = vm)
    }

    state.preview?.let { offer ->
        OfferPreviewDialog(offer = offer, onDismiss = { vm.closePreview() })
    }

    pendingAction?.let { action ->
        OfferActionDialog(
            action = action,
            acting = state.actingId == action.offer.id,
            onDismiss = { pendingAction = null },
            onConfirm = {
                when (action.type) {
                    "send" -> vm.send(action.offer)
                    "accepted", "declined" -> vm.respond(action.offer, action.type)
                    else -> vm.withdraw(action.offer)
                }
                pendingAction = null
            },
        )
    }
}

@Composable
private fun OfferSummaryCard(offers: List<OfferLetterDto>) {
    val total = offers.size
    val sent = offers.count { it.status == "sent" }
    val accepted = offers.count { it.status == "accepted" }
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            OfferStat(total.toString(), "Tổng số thư mời", MaterialTheme.colorScheme.onSurface)
            OfferStat(sent.toString(), "Đang chờ phản hồi", BrandBlue)
            OfferStat(accepted.toString(), "Đã chấp nhận", SuccessGreen)
        }
    }
}

@Composable
private fun OfferStat(value: String, label: String, valueColor: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            value,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            color = valueColor,
        )
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = InkMuted,
        )
    }
}

@Composable
private fun OfferCard(
    offer: OfferLetterDto,
    acting: Boolean,
    canManage: Boolean,
    onPreview: () -> Unit,
    onAction: (String) -> Unit,
) {
    HrmCard(
        modifier = Modifier.fillMaxWidth().clickable { onPreview() },
    ) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                InitialAvatar(offer.candidateName, 42)
                Column(modifier = Modifier.padding(start = 10.dp).weight(1f)) {
                    Text(
                        offer.candidateName ?: "Ứng viên",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (!offer.candidateEmail.isNullOrBlank()) {
                        Text(
                            offer.candidateEmail,
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                }
                Spacer(Modifier.width(8.dp))
                OfferStatusChip(offer.status)
            }
            val meta = listOfNotNull(
                offer.jobTitle?.takeIf { it.isNotBlank() },
                offer.salary?.let { "Lương ${formatSalary(it)}" },
                offer.startDate?.let { "Bắt đầu ${Format.date(it)}" },
                offer.deadline?.let { "Hạn trả lời ${Format.date(it)}" },
            ).filter { it.isNotBlank() }.joinToString(" · ")
            if (meta.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(meta, style = MaterialTheme.typography.bodySmall, color = InkMuted)
            }

            Spacer(Modifier.height(10.dp))
            if (acting) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = BrandBlue,
                    )
                }
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = onPreview) {
                        Text("Xem thư", color = BrandBlue)
                    }
                    if (canManage) {
                        when (offer.status) {
                            "draft" -> {
                                TextButton(onClick = { onAction("send") }) {
                                    Text("Gửi", color = BrandBlue)
                                }
                                TextButton(onClick = { onAction("withdraw") }) {
                                    Text("Thu hồi", color = DangerRed)
                                }
                            }
                            "sent" -> {
                                TextButton(onClick = { onAction("accepted") }) {
                                    Text("Chấp nhận", color = BrandBlue)
                                }
                                TextButton(onClick = { onAction("declined") }) {
                                    Text("Từ chối", color = DangerRed)
                                }
                                TextButton(onClick = { onAction("withdraw") }) {
                                    Text("Thu hồi", color = DangerRed)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun OfferStatusChip(status: String?) {
    val (label, bg, fg) = when (status) {
        "draft" -> Triple("Nháp", Color(0xFFF2F4F7), InkMuted)
        "sent" -> Triple("Đã gửi", BrandBlueSoft, BrandBlueDark)
        "accepted" -> Triple("Đã chấp nhận", Color(0xFFECFDF3), SuccessGreen)
        "declined" -> Triple("Từ chối", Color(0xFFFEF3F2), DangerRed)
        "withdrawn" -> Triple("Thu hồi", Color(0xFFF2F4F7), InkMuted)
        "expired" -> Triple("Hết hạn", Color(0xFFFFFAEB), WarningAmber)
        null -> Triple("—", Color(0xFFF2F4F7), InkMuted)
        else -> Triple(status, Color(0xFFF2F4F7), InkMuted)
    }
    StatusChip(label, bg, fg)
}

// ---------------------------------------------------------------------------
// Form tạo thư mời (khớp modal tạo bên web).
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreateOfferDialog(state: OfferLettersUiState, vm: OfferLettersViewModel) {
    var candidate by remember { mutableStateOf<CandidateDto?>(null) }
    var job by remember { mutableStateOf<JobPostingDto?>(null) }
    var salary by remember { mutableStateOf("") }
    var startDate by remember { mutableStateOf<LocalDate?>(null) }
    var deadline by remember { mutableStateOf<LocalDate?>(null) }
    var pickingDate by remember { mutableStateOf<String?>(null) } // "start" | "deadline"
    var pickingCandidate by remember { mutableStateOf(false) }
    var pickingJob by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = { if (!state.submitting) vm.closeCreate() }) {
        HrmCard(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
            ) {
                Text(
                    "Tạo thư mời nhận việc",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    "Hệ thống tự soạn nội dung thư từ mẫu tiếng Việt — HR chỉ cần " +
                        "điền thông tin, thư mới tạo ở trạng thái nháp.",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                if (state.formError != null) {
                    Spacer(Modifier.height(12.dp))
                    Text(
                        state.formError,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                Spacer(Modifier.height(16.dp))
                SelectField(
                    label = "Ứng viên",
                    value = candidate?.let {
                        it.fullName ?: "Ứng viên"
                    } ?: "— Chọn ứng viên —",
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { pickingCandidate = true },
                )
                Spacer(Modifier.height(12.dp))
                SelectField(
                    label = "Vị trí (không bắt buộc)",
                    value = job?.title ?: "Theo vị trí ứng viên đã ứng tuyển",
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { pickingJob = true },
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = salary,
                    onValueChange = { salary = it.filter { ch -> ch.isDigit() } },
                    label = { Text("Lương (VNĐ/tháng)") },
                    placeholder = { Text("Ví dụ: 12000000") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    DateField(
                        label = "Ngày bắt đầu",
                        value = startDate,
                        modifier = Modifier.weight(1f),
                        onClick = { pickingDate = "start" },
                    )
                    DateField(
                        label = "Hạn trả lời (không bắt buộc)",
                        value = deadline,
                        modifier = Modifier.weight(1f),
                        onClick = { pickingDate = "deadline" },
                    )
                }
                Spacer(Modifier.height(20.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(
                        onClick = { vm.closeCreate() },
                        enabled = !state.submitting,
                    ) { Text("Huỷ") }
                    Spacer(Modifier.width(8.dp))
                    Button(
                        onClick = {
                            vm.create(
                                candidateId = candidate?.id,
                                jobId = job?.id,
                                salaryText = salary,
                                startDate = startDate,
                                deadline = deadline,
                            )
                        },
                        enabled = !state.submitting,
                    ) {
                        if (state.submitting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = Color.White,
                            )
                        } else {
                            Text("Tạo thư mời")
                        }
                    }
                }
            }
        }
    }

    if (pickingCandidate) {
        CandidatePickerDialog(
            state = state,
            onDismiss = { pickingCandidate = false },
            onSelect = { candidate = it; pickingCandidate = false },
        )
    }
    if (pickingJob) {
        JobPickerDialog(
            state = state,
            onDismiss = { pickingJob = false },
            onSelect = { job = it; pickingJob = false },
        )
    }

    pickingDate?.let { which ->
        val initial = (if (which == "start") startDate else deadline) ?: Format.today()
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = initial.toUtcMillis(),
        )
        DatePickerDialog(
            onDismissRequest = { pickingDate = null },
            confirmButton = {
                TextButton(
                    onClick = {
                        pickerState.selectedDateMillis?.let { millis ->
                            val date = millis.toLocalDateUtc()
                            if (which == "start") startDate = date else deadline = date
                        }
                        pickingDate = null
                    },
                ) { Text("Chọn") }
            },
            dismissButton = {
                TextButton(onClick = { pickingDate = null }) { Text("Huỷ") }
            },
        ) {
            DatePicker(state = pickerState)
        }
    }
}

/** Ô chọn dạng hộp (giống DateField bên LeaveScreen) mở hộp thoại chọn. */
@Composable
private fun SelectField(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, BorderGray, RoundedCornerShape(12.dp))
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = InkMuted)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                value,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.weight(1f),
            )
            Icon(
                Icons.Filled.ArrowDropDown,
                contentDescription = label,
                tint = InkMuted,
            )
        }
    }
}

/** Ô ngày read-only mở DatePicker (y hệt LeaveScreen). */
@Composable
private fun DateField(
    label: String,
    value: LocalDate?,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, BorderGray, RoundedCornerShape(12.dp))
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = InkMuted)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.Filled.CalendarToday,
                contentDescription = label,
                tint = BrandBlue,
                modifier = Modifier.size(18.dp),
            )
            Text(
                value?.let { Format.dateOf(it) } ?: "Chọn ngày",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(start = 8.dp),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Hộp thoại chọn ứng viên / vị trí (mẫu EmployeePickerDialog bên Kudos).
// ---------------------------------------------------------------------------

@Composable
private fun CandidatePickerDialog(
    state: OfferLettersUiState,
    onDismiss: () -> Unit,
    onSelect: (CandidateDto) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val filtered = remember(state.candidates, query) {
        if (query.isBlank()) {
            state.candidates
        } else {
            val q = query.trim().stripDiacritics()
            state.candidates.filter { cand ->
                (cand.fullName ?: "").stripDiacritics().contains(q) ||
                    (cand.email ?: "").stripDiacritics().contains(q) ||
                    (cand.job?.title ?: "").stripDiacritics().contains(q)
            }
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Chọn ứng viên") },
        text = {
            Column {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text("Tìm theo tên, email, vị trí…") },
                    leadingIcon = {
                        Icon(Icons.Outlined.Search, contentDescription = null)
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                when {
                    state.candidatesLoading -> {
                        Box(
                            modifier = Modifier.fillMaxWidth().padding(24.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(color = BrandBlue)
                        }
                    }
                    filtered.isEmpty() -> {
                        Text(
                            "Không tìm thấy ứng viên phù hợp.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = InkMuted,
                        )
                    }
                    else -> {
                        LazyColumn(modifier = Modifier.heightIn(max = 340.dp)) {
                            items(filtered, key = { it.id ?: 0 }) { cand ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { onSelect(cand) }
                                        .padding(vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    InitialAvatar(name = cand.fullName, sizeDp = 38)
                                    Spacer(Modifier.width(10.dp))
                                    Column {
                                        Text(
                                            cand.fullName ?: "Ứng viên",
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.Medium,
                                        )
                                        val sub = listOfNotNull(
                                            cand.email?.takeIf { it.isNotBlank() },
                                            cand.job?.title?.takeIf { it.isNotBlank() },
                                        ).joinToString(" · ")
                                        if (sub.isNotBlank()) {
                                            Text(
                                                sub,
                                                style = MaterialTheme.typography.bodySmall,
                                                color = InkMuted,
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Huỷ") }
        },
    )
}

@Composable
private fun JobPickerDialog(
    state: OfferLettersUiState,
    onDismiss: () -> Unit,
    onSelect: (JobPostingDto) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val filtered = remember(state.jobs, query) {
        if (query.isBlank()) {
            state.jobs
        } else {
            val q = query.trim().stripDiacritics()
            state.jobs.filter { job ->
                (job.title ?: "").stripDiacritics().contains(q) ||
                    (job.departmentName ?: "").stripDiacritics().contains(q)
            }
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Chọn vị trí") },
        text = {
            Column {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text("Tìm theo tên vị trí, phòng ban…") },
                    leadingIcon = {
                        Icon(Icons.Outlined.Search, contentDescription = null)
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                when {
                    state.jobsLoading -> {
                        Box(
                            modifier = Modifier.fillMaxWidth().padding(24.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(color = BrandBlue)
                        }
                    }
                    filtered.isEmpty() -> {
                        Text(
                            "Không tìm thấy vị trí phù hợp.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = InkMuted,
                        )
                    }
                    else -> {
                        LazyColumn(modifier = Modifier.heightIn(max = 340.dp)) {
                            items(filtered, key = { it.id ?: 0 }) { job ->
                                Column(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { onSelect(job) }
                                        .padding(vertical = 8.dp),
                                ) {
                                    Text(
                                        job.title ?: "Vị trí",
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Medium,
                                    )
                                    val sub = listOfNotNull(
                                        job.departmentName?.takeIf { it.isNotBlank() },
                                        job.deadline?.let { "Hạn nộp ${Format.date(it)}" },
                                    ).joinToString(" · ")
                                    if (sub.isNotBlank()) {
                                        Text(
                                            sub,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = InkMuted,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Huỷ") }
        },
    )
}

// ---------------------------------------------------------------------------
// Xem nội dung thư mời (khớp modal "Xem thư" bên web).
// ---------------------------------------------------------------------------

@Composable
private fun OfferPreviewDialog(offer: OfferLetterDto, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        HrmCard(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
            ) {
                Text(
                    "Thư mời — ${offer.candidateName ?: "Ứng viên"}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                val meta = listOfNotNull(
                    offer.jobTitle?.takeIf { it.isNotBlank() },
                    offer.salary?.let { "Lương ${formatSalary(it)}" },
                    offer.startDate?.let { "Bắt đầu ${Format.date(it)}" },
                ).joinToString(" · ")
                if (meta.isNotBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(meta, style = MaterialTheme.typography.bodySmall, color = InkMuted)
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    offer.letterBody?.takeIf { it.isNotBlank() } ?: "Chưa có nội dung thư.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(16.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    TextButton(onClick = onDismiss) { Text("Đóng") }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Hộp thoại xác nhận gửi / ghi nhận phản hồi / thu hồi (khớp ConfirmDialog web).
// ---------------------------------------------------------------------------

@Composable
private fun OfferActionDialog(
    action: PendingOfferAction,
    acting: Boolean,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    val offer = action.offer
    val (title, description, danger) = when (action.type) {
        "send" -> Triple(
            "Gửi thư mời",
            "Gửi thư mời cho ${offer.candidateName ?: "ứng viên"} " +
                "(${offer.jobTitle ?: "—"})? Sau khi gửi, thư chuyển sang " +
                "trạng thái \"Đã gửi\".",
            false,
        )
        "accepted" -> Triple(
            "Ghi nhận chấp nhận",
            "Ghi nhận ${offer.candidateName ?: "ứng viên"} ĐÃ CHẤP NHẬN thư mời?",
            false,
        )
        "declined" -> Triple(
            "Ghi nhận từ chối",
            "Ghi nhận ${offer.candidateName ?: "ứng viên"} ĐÃ TỪ CHỐI thư mời?",
            true,
        )
        else -> Triple(
            "Thu hồi thư mời",
            "Thu hồi thư mời của ${offer.candidateName ?: "ứng viên"}? Thư sẽ " +
                "chuyển sang trạng thái \"Thu hồi\" và không dùng được nữa.",
            true,
        )
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(description) },
        confirmButton = {
            TextButton(
                enabled = !acting,
                onClick = onConfirm,
            ) {
                Text("Xác nhận", color = if (danger) DangerRed else BrandBlue)
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

private val vndFormat = NumberFormat.getInstance(Locale("vi", "VN"))

/** 12000000 -> "12.000.000 VNĐ/tháng" (khớp formatSalary bên web). */
private fun formatSalary(value: Long?): String =
    if (value == null) "—" else "${vndFormat.format(value)} VNĐ/tháng"

private fun LocalDate.toUtcMillis(): Long =
    atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

private fun Long.toLocalDateUtc(): LocalDate =
    Instant.ofEpochMilli(this).atZone(ZoneOffset.UTC).toLocalDate()
