package com.hrmai.app.feature.disciplinary

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.InitialAvatar
import com.hrmai.app.core.ui.LoadingState
import com.hrmai.app.core.ui.SkeletonBlock
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BorderGray
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.DangerRed
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format
import com.hrmai.app.core.util.stripDiacritics
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

@Composable
fun DisciplinaryRoute(container: AppContainer) {
    val vm: DisciplinaryViewModel = viewModel(
        factory = DisciplinaryViewModel.Factory(
            container.api(DisciplinaryApi::class.java),
            container.sessionStore,
        ),
    )
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
                RecordDetailView(state, vm)
            }
            !state.roleKnown -> LoadingState(modifier = Modifier.fillMaxSize())
            else -> RecordListView(state, vm)
        }
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
        )
    }

    if (state.showCreateForm) {
        CreateRecordDialog(state, vm)
    }
    if (state.showEmployeePicker) {
        EmployeePickerDialog(state, vm)
    }
    if (state.resolvingRecord != null) {
        ResolveDialog(state, vm)
    }
}

// ----------------------------------------------------------------------
// Danh sách biên bản
// ----------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RecordListView(state: DisciplinaryUiState, vm: DisciplinaryViewModel) {
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
                        "Kỷ luật nhân viên",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        "Theo dõi các biên bản kỷ luật: khiển trách, cảnh cáo, " +
                            "đình chỉ — và giải quyết khi nhân viên đã khắc phục.",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
            }
            item {
                val total = state.records.size
                val active = state.records.count { it.status == "active" }
                val resolved = state.records.count { it.status == "resolved" }
                HrmCard(modifier = Modifier.fillMaxWidth()) {
                    Row(modifier = Modifier.fillMaxWidth()) {
                        SummaryStat("Tổng biên bản", total, MaterialTheme.colorScheme.onSurface, Modifier.weight(1f))
                        SummaryStat("Đang hiệu lực", active, DangerRed, Modifier.weight(1f))
                        SummaryStat("Đã giải quyết", resolved, SuccessGreen, Modifier.weight(1f))
                    }
                }
            }
            if (state.canWrite) {
                item {
                    Button(
                        onClick = { vm.openCreateForm() },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Thêm biên bản") }
                }
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Trạng thái",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        item {
                            FilterChip(
                                selected = state.statusFilter.isBlank(),
                                onClick = { vm.setStatusFilter("") },
                                label = { Text("Tất cả") },
                            )
                        }
                        item {
                            FilterChip(
                                selected = state.statusFilter == "active",
                                onClick = { vm.setStatusFilter("active") },
                                label = { Text("Đang hiệu lực") },
                            )
                        }
                        item {
                            FilterChip(
                                selected = state.statusFilter == "resolved",
                                onClick = { vm.setStatusFilter("resolved") },
                                label = { Text("Đã giải quyết") },
                            )
                        }
                    }
                    Text(
                        "Mức độ",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        item {
                            FilterChip(
                                selected = state.severityFilter.isBlank(),
                                onClick = { vm.setSeverityFilter("") },
                                label = { Text("Tất cả") },
                            )
                        }
                        DisciplinarySeverities.options.forEach { (value, label) ->
                            item {
                                FilterChip(
                                    selected = state.severityFilter == value,
                                    onClick = { vm.setSeverityFilter(value) },
                                    label = { Text(label) },
                                )
                            }
                        }
                    }
                }
            }
            when {
                state.loading && state.records.isEmpty() -> {
                    items(3) { SkeletonBlock(heightDp = 120) }
                }
                state.forbidden -> {
                    item {
                        HrmCard(modifier = Modifier.fillMaxWidth()) {
                            EmptyState(
                                "Bạn không có quyền xem dữ liệu kỷ luật trong " +
                                    "phạm vi hiện tại. Liên hệ phòng HR nếu cần hỗ trợ.",
                            )
                        }
                    }
                }
                state.error != null && state.records.isEmpty() -> {
                    item {
                        ErrorState(
                            message = state.error ?: "Không tải được danh sách.",
                            onRetry = { vm.loadRecords() },
                        )
                    }
                }
                state.records.isEmpty() -> {
                    item {
                        EmptyState(
                            if (state.canWrite) {
                                "Chưa có biên bản kỷ luật nào. Khi có vi phạm cần " +
                                    "lập biên bản, bấm “Thêm biên bản” để ghi nhận."
                            } else {
                                "Chưa có biên bản kỷ luật nào trong phạm vi của bạn."
                            },
                        )
                    }
                }
                else -> {
                    items(state.records, key = { it.id ?: 0 }) { record ->
                        RecordCard(
                            record = record,
                            canWrite = state.canWrite,
                            expanded = false,
                            onOpen = { record.id?.let { vm.openRecord(it) } },
                            onResolve = { vm.openResolve(record) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryStat(label: String, value: Int, color: Color, modifier: Modifier) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "$value",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = color,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = InkMuted,
        )
    }
}

@Composable
private fun RecordCard(
    record: DisciplinaryRecordDto,
    canWrite: Boolean,
    expanded: Boolean,
    onOpen: (() -> Unit)?,
    onResolve: () -> Unit,
) {
    val cardModifier = Modifier.fillMaxWidth()
    val clickableModifier = if (onOpen != null) {
        cardModifier.clickable { onOpen() }
    } else {
        cardModifier
    }
    HrmCard(modifier = clickableModifier) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                InitialAvatar(record.employeeName, 42)
                Column(modifier = Modifier.padding(start = 10.dp).weight(1f)) {
                    Text(
                        record.employeeName ?: "Nhân viên",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        listOfNotNull(record.employeeCode, record.departmentName)
                            .joinToString(" · ")
                            .ifBlank { "—" },
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
                RecordStatusChip(record.status)
            }
            Spacer(Modifier.height(8.dp))
            Text(
                record.title ?: "Biên bản kỷ luật",
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                RecordTypeChip(record.type)
                RecordSeverityChip(record.severity)
            }
            if (!record.description.isNullOrBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    record.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                    maxLines = if (expanded) Int.MAX_VALUE else 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (!record.actionTaken.isNullOrBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    "Biện pháp đã xử lý: ${record.actionTaken}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                    maxLines = if (expanded) Int.MAX_VALUE else 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (record.status == "resolved" && !record.resolvedNote.isNullOrBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    "Ghi chú giải quyết: ${record.resolvedNote}",
                    style = MaterialTheme.typography.bodySmall,
                    color = SuccessGreen,
                    maxLines = if (expanded) Int.MAX_VALUE else 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Ngày lập: ${Format.date(record.issuedDate)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                    if (!record.issuedByName.isNullOrBlank()) {
                        Text(
                            "Lập bởi: ${record.issuedByName}",
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                    if (expanded && record.createdAt != null) {
                        Text(
                            "Tạo lúc: ${Format.dateTime(record.createdAt)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                }
                if (canWrite && record.status == "active") {
                    OutlinedButton(onClick = onResolve) { Text("Giải quyết") }
                }
            }
        }
    }
}

// ----------------------------------------------------------------------
// Chi tiết 1 biên bản
// ----------------------------------------------------------------------

@Composable
private fun RecordDetailView(state: DisciplinaryUiState, vm: DisciplinaryViewModel) {
    val record = state.detail
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp),
        ) {
            IconButton(onClick = { vm.closeDetail() }) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Quay lại",
                    tint = BrandBlue,
                )
            }
            Text(
                record?.employeeName ?: "Chi tiết kỷ luật",
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
                    onRetry = { vm.closeDetail() },
                )
            }
            record != null -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item {
                        RecordCard(
                            record = record,
                            canWrite = state.canWrite,
                            expanded = true,
                            onOpen = null,
                            onResolve = { vm.openResolve(record) },
                        )
                    }
                    if (record.status == "resolved") {
                        item {
                            Text(
                                "Biên bản đã được giải quyết — vẫn lưu trong hồ sơ " +
                                    "nhân viên để tra cứu.",
                                style = MaterialTheme.typography.bodySmall,
                                color = SuccessGreen,
                            )
                        }
                    }
                }
            }
        }
    }
}

// ----------------------------------------------------------------------
// Form lập biên bản mới
// ----------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreateRecordDialog(state: DisciplinaryUiState, vm: DisciplinaryViewModel) {
    var pickingDate by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = { if (!state.creating) vm.closeCreateForm() },
        title = { Text("Lập biên bản kỷ luật") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    "Biên bản được lưu vào hồ sơ nhân viên và không thể xóa — " +
                        "chỉ giải quyết khi đã khắc phục.",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                state.createError?.let { err ->
                    Text(
                        text = err,
                        style = MaterialTheme.typography.bodySmall,
                        color = DangerRed,
                    )
                }
                Text(
                    text = "Nhân viên",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .border(1.dp, BorderGray, RoundedCornerShape(12.dp))
                        .clickable { vm.openEmployeePicker() }
                        .padding(horizontal = 12.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = state.selectedEmployee?.fullName ?: "Chọn nhân viên…",
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (state.selectedEmployee == null) {
                            InkMuted
                        } else {
                            MaterialTheme.colorScheme.onSurface
                        },
                        modifier = Modifier.weight(1f),
                    )
                    Icon(
                        Icons.Filled.ArrowDropDown,
                        contentDescription = "Chọn nhân viên",
                        tint = InkMuted,
                    )
                }
                Text(
                    text = "Loại kỷ luật",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DisciplinaryTypes.options.forEach { (value, label) ->
                        item {
                            FilterChip(
                                selected = state.formType == value,
                                onClick = { vm.onFormTypeChange(value) },
                                label = { Text(label) },
                            )
                        }
                    }
                }
                Text(
                    text = "Mức độ",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DisciplinarySeverities.options.forEach { (value, label) ->
                        item {
                            FilterChip(
                                selected = state.formSeverity == value,
                                onClick = { vm.onFormSeverityChange(value) },
                                label = { Text(label) },
                            )
                        }
                    }
                }
                OutlinedTextField(
                    value = state.formTitle,
                    onValueChange = { vm.onFormTitleChange(it) },
                    label = { Text("Tiêu đề") },
                    placeholder = { Text("Ví dụ: Đi muộn nhiều lần trong tháng") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.formDescription,
                    onValueChange = { vm.onFormDescriptionChange(it) },
                    label = { Text("Mô tả vi phạm (không bắt buộc)") },
                    placeholder = { Text("Mô tả hành vi vi phạm, thời gian, địa điểm…") },
                    minLines = 3,
                    maxLines = 5,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.formActionTaken,
                    onValueChange = { vm.onFormActionTakenChange(it) },
                    label = { Text("Biện pháp đã xử lý (không bắt buộc)") },
                    placeholder = { Text("Ví dụ: Nhắc nhở bằng văn bản, trừ điểm chuyên cần…") },
                    minLines = 2,
                    maxLines = 4,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    text = "Ngày lập",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .border(1.dp, BorderGray, RoundedCornerShape(12.dp))
                        .clickable { pickingDate = true }
                        .padding(horizontal = 12.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = Format.dateOf(state.formIssuedDate),
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.weight(1f),
                    )
                    Icon(
                        Icons.Filled.ArrowDropDown,
                        contentDescription = "Chọn ngày lập",
                        tint = InkMuted,
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { vm.submitCreate() },
                enabled = !state.creating,
            ) {
                if (state.creating) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        color = Color.White,
                        strokeWidth = 2.dp,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text("Đang lưu…")
                } else {
                    Text("Lập biên bản")
                }
            }
        },
        dismissButton = {
            TextButton(
                onClick = { vm.closeCreateForm() },
                enabled = !state.creating,
            ) { Text("Huỷ") }
        },
    )

    if (pickingDate) {
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = state.formIssuedDate.toUtcMillis(),
        )
        DatePickerDialog(
            onDismissRequest = { pickingDate = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        pickerState.selectedDateMillis?.let { millis ->
                            vm.onFormIssuedDateChange(millis.toLocalDateUtc())
                        }
                        pickingDate = false
                    },
                ) { Text("Chọn") }
            },
            dismissButton = {
                TextButton(onClick = { pickingDate = false }) { Text("Huỷ") }
            },
        ) {
            DatePicker(state = pickerState, showModeToggle = false)
        }
    }
}

// ----------------------------------------------------------------------
// Chọn nhân viên (tìm không dấu, giống ⌘K bên web)
// ----------------------------------------------------------------------

@Composable
private fun EmployeePickerDialog(state: DisciplinaryUiState, vm: DisciplinaryViewModel) {
    var query by remember { mutableStateOf("") }
    val filtered = remember(state.employees, query) {
        if (query.isBlank()) {
            state.employees
        } else {
            val q = query.trim().stripDiacritics()
            state.employees.filter { emp ->
                (emp.fullName ?: "").stripDiacritics().contains(q) ||
                    (emp.code ?: "").stripDiacritics().contains(q) ||
                    (emp.departmentName ?: "").stripDiacritics().contains(q)
            }
        }
    }
    AlertDialog(
        onDismissRequest = { vm.closeEmployeePicker() },
        title = { Text("Chọn nhân viên") },
        text = {
            Column {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text("Tìm theo tên, mã, phòng ban…") },
                    leadingIcon = {
                        Icon(Icons.Outlined.Search, contentDescription = null)
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                when {
                    state.employeesLoading -> {
                        Box(
                            modifier = Modifier.fillMaxWidth().padding(24.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(color = BrandBlue)
                        }
                    }
                    filtered.isEmpty() -> {
                        Text(
                            text = "Không tìm thấy nhân viên phù hợp.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = InkMuted,
                        )
                    }
                    else -> {
                        LazyColumn(modifier = Modifier.heightIn(max = 340.dp)) {
                            items(filtered, key = { it.id ?: 0 }) { emp ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { vm.selectEmployee(emp) }
                                        .padding(vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    InitialAvatar(name = emp.fullName, sizeDp = 38)
                                    Spacer(Modifier.width(10.dp))
                                    Column {
                                        Text(
                                            text = emp.fullName ?: "—",
                                            style = MaterialTheme.typography.bodyLarge,
                                            fontWeight = FontWeight.Medium,
                                        )
                                        val sub = listOfNotNull(
                                            emp.code,
                                            emp.departmentName,
                                        ).joinToString(" · ")
                                        if (sub.isNotBlank()) {
                                            Text(
                                                text = sub,
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
            TextButton(onClick = { vm.closeEmployeePicker() }) { Text("Đóng") }
        },
    )
}

// ----------------------------------------------------------------------
// Giải quyết biên bản
// ----------------------------------------------------------------------

@Composable
private fun ResolveDialog(state: DisciplinaryUiState, vm: DisciplinaryViewModel) {
    val record = state.resolvingRecord ?: return
    AlertDialog(
        onDismissRequest = { if (!state.resolving) vm.closeResolve() },
        title = { Text("Giải quyết biên bản") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = "“${record.title ?: "Biên bản kỷ luật"}” · " +
                        (record.employeeName ?: "Nhân viên"),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                state.resolveError?.let { err ->
                    Text(
                        text = err,
                        style = MaterialTheme.typography.bodySmall,
                        color = DangerRed,
                    )
                }
                OutlinedTextField(
                    value = state.resolvedNote,
                    onValueChange = { vm.onResolvedNoteChange(it) },
                    label = { Text("Ghi chú giải quyết (không bắt buộc)") },
                    placeholder = {
                        Text("Ví dụ: Nhân viên đã cam kết không tái phạm, theo dõi thêm 1 tháng…")
                    },
                    minLines = 3,
                    maxLines = 5,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    text = "Sau khi giải quyết, biên bản chuyển sang trạng thái " +
                        "“Đã giải quyết” và vẫn lưu trong hồ sơ nhân viên để tra cứu.",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { vm.submitResolve() },
                enabled = !state.resolving,
            ) {
                if (state.resolving) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        color = Color.White,
                        strokeWidth = 2.dp,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text("Đang lưu…")
                } else {
                    Text("Giải quyết")
                }
            }
        },
        dismissButton = {
            TextButton(
                onClick = { vm.closeResolve() },
                enabled = !state.resolving,
            ) { Text("Huỷ") }
        },
    )
}

// ----------------------------------------------------------------------
// Tiện ích hiển thị
// ----------------------------------------------------------------------

@Composable
private fun RecordTypeChip(type: String?) {
    val (label, bg, fg) = when (type) {
        "verbal" -> Triple("Khiển trách bằng lời", Color(0xFFF2F4F7), InkMuted)
        "written" -> Triple("Khiển trách bằng văn bản", Color(0xFFFEF0C7), WarningAmber)
        "final" -> Triple("Cảnh cáo cuối", Color(0xFFFEF0C7), WarningAmber)
        "suspension" -> Triple("Đình chỉ", Color(0xFFFEF3F2), DangerRed)
        else -> Triple(type ?: "—", Color(0xFFF2F4F7), InkMuted)
    }
    StatusChip(label, bg, fg)
}

@Composable
private fun RecordSeverityChip(severity: String?) {
    val (label, bg, fg) = when (severity) {
        "low" -> Triple("Nhẹ", Color(0xFFECFDF3), SuccessGreen)
        "medium" -> Triple("Trung bình", Color(0xFFFEF0C7), WarningAmber)
        "high" -> Triple("Nghiêm trọng", Color(0xFFFEF3F2), DangerRed)
        else -> Triple(severity ?: "—", Color(0xFFF2F4F7), InkMuted)
    }
    StatusChip(label, bg, fg)
}

@Composable
private fun RecordStatusChip(status: String?) {
    val (label, bg, fg) = when (status) {
        "active" -> Triple("Đang hiệu lực", Color(0xFFFEF3F2), DangerRed)
        "resolved" -> Triple("Đã giải quyết", Color(0xFFECFDF3), SuccessGreen)
        else -> Triple(status ?: "—", Color(0xFFF2F4F7), InkMuted)
    }
    StatusChip(label, bg, fg)
}

private fun LocalDate.toUtcMillis(): Long =
    atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

private fun Long.toLocalDateUtc(): LocalDate =
    Instant.ofEpochMilli(this).atZone(ZoneOffset.UTC).toLocalDate()
