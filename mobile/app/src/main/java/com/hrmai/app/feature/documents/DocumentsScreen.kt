package com.hrmai.app.feature.documents

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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

@Composable
fun DocumentsRoute(container: AppContainer) {
    val vm: DocumentsViewModel = viewModel(
        factory = DocumentsViewModel.Factory(
            container.api(DocumentsApi::class.java),
            container.sessionStore,
        ),
    )
    DocumentsScreen(vm)
}

private data class CertDecisionTarget(val cert: CertificateDto, val approved: Boolean)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DocumentsScreen(vm: DocumentsViewModel) {
    val state by vm.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    var showCreateDialog by remember { mutableStateOf(false) }
    var decisionTarget by remember { mutableStateOf<CertDecisionTarget?>(null) }
    var issuedTarget by remember { mutableStateOf<CertificateDto?>(null) }

    LaunchedEffect(state.message) {
        val msg = state.message ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(msg)
        vm.consumeMessage()
    }

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        Column(modifier = Modifier.fillMaxSize()) {
            val tabs = if (state.canDecide) {
                listOf("Tài liệu", "Giấy xác nhận", "Duyệt giấy")
            } else {
                listOf("Tài liệu", "Giấy xác nhận")
            }
            TabRow(selectedTabIndex = state.tab.coerceAtMost(tabs.lastIndex)) {
                tabs.forEachIndexed { index, label ->
                    Tab(
                        selected = state.tab == index,
                        onClick = { vm.selectTab(index) },
                        text = { Text(label) },
                    )
                }
            }
            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                when (state.tab) {
                    0 -> DocumentsTab(state, vm)
                    1 -> MyCertsTab(
                        state = state,
                        vm = vm,
                        onNewRequest = { showCreateDialog = true },
                        onViewIssued = { issuedTarget = it },
                    )
                    2 -> CertQueueTab(
                        state = state,
                        vm = vm,
                        onDecide = { cert, approved ->
                            decisionTarget = CertDecisionTarget(cert, approved)
                        },
                    )
                }
            }
        }
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
        )
    }

    if (showCreateDialog) {
        CreateCertificateDialog(
            state = state,
            vm = vm,
            onDismiss = { showCreateDialog = false },
            onDone = { showCreateDialog = false },
        )
    }

    decisionTarget?.let { target ->
        CertDecisionDialog(
            target = target,
            acting = state.actingId == target.cert.id,
            onDismiss = { decisionTarget = null },
            onConfirm = { note ->
                vm.decide(target.cert, target.approved, note)
                decisionTarget = null
            },
        )
    }

    issuedTarget?.let { cert ->
        AlertDialog(
            onDismissRequest = { issuedTarget = null },
            title = { Text(certTypeLabel(cert.certType)) },
            text = {
                Column(
                    modifier = Modifier
                        .heightIn(max = 420.dp)
                        .verticalScroll(rememberScrollState()),
                ) {
                    Text(
                        cert.issuedContent ?: "Chưa có nội dung giấy.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { issuedTarget = null }) { Text("Đóng") }
            },
        )
    }
}

// ----------------------------------------------------------------------
// Tab 0: Tài liệu của tôi
// ----------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DocumentsTab(state: DocumentsUiState, vm: DocumentsViewModel) {
    PullToRefreshBox(
        isRefreshing = state.docsRefreshing,
        onRefresh = { vm.refreshDocuments() },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            when {
                state.docsLoading && state.documents.isEmpty() -> {
                    items(3) { SkeletonBlock(heightDp = 96) }
                }
                state.docsError != null && state.documents.isEmpty() -> {
                    item {
                        ErrorState(
                            message = state.docsError ?: "Không tải được kho tài liệu.",
                            onRetry = { vm.loadDocuments() },
                        )
                    }
                }
                state.documents.isEmpty() -> {
                    item {
                        EmptyState(
                            "Chưa có tài liệu nào trong hồ sơ của bạn. " +
                                "HR sẽ tải lên các giấy tờ như hợp đồng, bằng cấp…",
                        )
                    }
                }
                else -> {
                    items(state.documents, key = { it.id ?: 0 }) { doc ->
                        DocumentCard(doc)
                    }
                }
            }
        }
    }
}

@Composable
private fun DocumentCard(doc: DocumentDto) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    doc.title ?: "Tài liệu",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                DocTypeChip(doc.docType)
            }
            if (!doc.originalFilename.isNullOrBlank()) {
                Text(
                    doc.originalFilename,
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            Spacer(Modifier.height(6.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Tải lên ${Format.date(doc.createdAt)}" +
                        (doc.uploadedByName?.let { " · $it" } ?: ""),
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                ExpiryChip(doc)
            }
            if (!doc.note.isNullOrBlank()) {
                Text(
                    doc.note,
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
        }
    }
}

@Composable
private fun ExpiryChip(doc: DocumentDto) {
    if (doc.expiryDate == null) return
    val days = doc.daysToExpiry
    when {
        doc.isExpired == true -> StatusChip(
            "Hết hạn ${Format.date(doc.expiryDate)}",
            Color(0xFFFEF3F2),
            DangerRed,
        )
        days != null && days <= 30 -> StatusChip(
            "Còn $days ngày",
            Color(0xFFFFFAEB),
            WarningAmber,
        )
        else -> StatusChip(
            "Hạn ${Format.date(doc.expiryDate)}",
            Color(0xFFF2F4F7),
            InkMuted,
        )
    }
}

// ----------------------------------------------------------------------
// Tab 1: Giấy xác nhận của tôi
// ----------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MyCertsTab(
    state: DocumentsUiState,
    vm: DocumentsViewModel,
    onNewRequest: () -> Unit,
    onViewIssued: (CertificateDto) -> Unit,
) {
    PullToRefreshBox(
        isRefreshing = state.certsRefreshing,
        onRefresh = { vm.refreshMyCerts() },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Button(
                    onClick = onNewRequest,
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                ) { Text("Xin giấy xác nhận") }
            }
            when {
                state.certsLoading && state.myCerts.isEmpty() -> {
                    items(3) { SkeletonBlock(heightDp = 96) }
                }
                state.certsError != null && state.myCerts.isEmpty() -> {
                    item {
                        ErrorState(
                            message = state.certsError ?: "Không tải được yêu cầu của bạn.",
                            onRetry = { vm.loadMyCerts() },
                        )
                    }
                }
                state.myCerts.isEmpty() -> {
                    item { EmptyState("Bạn chưa xin giấy xác nhận nào.") }
                }
                else -> {
                    items(state.myCerts, key = { it.id ?: 0 }) { cert ->
                        CertificateCard(
                            cert = cert,
                            showOwner = false,
                            acting = false,
                            onDecide = null,
                            onViewIssued = { onViewIssued(cert) },
                        )
                    }
                }
            }
        }
    }
}

// ----------------------------------------------------------------------
// Tab 2: Duyệt giấy (HR/Admin)
// ----------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CertQueueTab(
    state: DocumentsUiState,
    vm: DocumentsViewModel,
    onDecide: (CertificateDto, Boolean) -> Unit,
) {
    PullToRefreshBox(
        isRefreshing = state.queueRefreshing,
        onRefresh = { vm.refreshQueue() },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Text(
                    "Yêu cầu cấp giấy xác nhận đang chờ HR xử lý.",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            when {
                state.queueLoading && state.queue.isEmpty() -> {
                    items(3) { SkeletonBlock(heightDp = 120) }
                }
                state.queueError != null && state.queue.isEmpty() -> {
                    item {
                        ErrorState(
                            message = state.queueError ?: "Không tải được hàng đợi.",
                            onRetry = { vm.loadQueue() },
                        )
                    }
                }
                state.queue.isEmpty() -> {
                    item { EmptyState("Không có yêu cầu nào đang chờ duyệt. 🎉") }
                }
                else -> {
                    items(state.queue, key = { it.id ?: 0 }) { cert ->
                        CertificateCard(
                            cert = cert,
                            showOwner = true,
                            acting = state.actingId == cert.id,
                            onDecide = { approved -> onDecide(cert, approved) },
                            onViewIssued = null,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CertificateCard(
    cert: CertificateDto,
    showOwner: Boolean,
    acting: Boolean,
    onDecide: ((Boolean) -> Unit)?,
    onViewIssued: (() -> Unit)?,
) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            if (showOwner) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    InitialAvatar(cert.employeeName, 42)
                    Column(modifier = Modifier.padding(start = 10.dp).weight(1f)) {
                        Text(
                            cert.employeeName ?: "Nhân viên",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        if (!cert.departmentName.isNullOrBlank()) {
                            Text(
                                cert.departmentName,
                                style = MaterialTheme.typography.bodySmall,
                                color = InkMuted,
                            )
                        }
                    }
                    CertStatusChip(cert.status)
                }
                Spacer(Modifier.height(8.dp))
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    certTypeLabel(cert.certType),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                if (!showOwner) CertStatusChip(cert.status)
            }
            if (!cert.purpose.isNullOrBlank()) {
                Text(
                    "Mục đích: ${cert.purpose}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            if (!cert.decisionNote.isNullOrBlank()) {
                Text(
                    "Ghi chú HR: ${cert.decisionNote}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Gửi lúc ${Format.dateTime(cert.createdAt)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                if (cert.status == "approved" && !cert.issuedContent.isNullOrBlank() &&
                    onViewIssued != null
                ) {
                    TextButton(onClick = onViewIssued) { Text("Xem giấy") }
                }
            }
            if (onDecide != null) {
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = { onDecide(true) },
                        enabled = !acting,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                    ) {
                        if (acting) {
                            CircularProgressIndicator(
                                color = Color.White,
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                            )
                        } else {
                            Text("Duyệt cấp")
                        }
                    }
                    OutlinedButton(
                        onClick = { onDecide(false) },
                        enabled = !acting,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = DangerRed),
                    ) { Text("Từ chối") }
                }
            }
        }
    }
}

// ----------------------------------------------------------------------
// Hộp thoại xin giấy + duyệt giấy
// ----------------------------------------------------------------------

@Composable
private fun CreateCertificateDialog(
    state: DocumentsUiState,
    vm: DocumentsViewModel,
    onDismiss: () -> Unit,
    onDone: () -> Unit,
) {
    LaunchedEffect(state.submitted) {
        if (state.submitted) {
            vm.consumeSubmitted()
            onDone()
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Xin giấy xác nhận") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                Text(
                    "Loại giấy",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    listOf("employment" to "Xác nhận công tác", "salary" to "Xác nhận lương")
                        .forEach { (value, label) ->
                            FilterChip(
                                selected = state.formCertType == value,
                                onClick = { vm.setFormCertType(value) },
                                label = { Text(label) },
                            )
                        }
                }
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(
                    value = state.formPurpose,
                    onValueChange = { vm.setFormPurpose(it) },
                    label = { Text("Mục đích xin giấy") },
                    placeholder = {
                        Text("Ví dụ: Bổ sung hồ sơ vay ngân hàng, làm visa…")
                    },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (state.formError != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        state.formError,
                        style = MaterialTheme.typography.bodySmall,
                        color = DangerRed,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !state.submitting,
                onClick = { vm.submitCertificate() },
            ) {
                if (state.submitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = BrandBlue,
                    )
                } else {
                    Text("Gửi yêu cầu", color = BrandBlue)
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Đóng") }
        },
    )
}

@Composable
private fun CertDecisionDialog(
    target: CertDecisionTarget,
    acting: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var note by remember(target) { mutableStateOf("") }
    val cert = target.cert
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                if (target.approved) {
                    "Duyệt cấp giấy xác nhận"
                } else {
                    "Từ chối yêu cầu cấp giấy"
                },
            )
        },
        text = {
            Column {
                Text(
                    "${cert.employeeName ?: "Nhân viên"} · ${certTypeLabel(cert.certType)}",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                if (!cert.purpose.isNullOrBlank()) {
                    Text(
                        "Mục đích: ${cert.purpose}",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Ghi chú (tuỳ chọn)") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (target.approved) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Khi duyệt, hệ thống tự sinh nội dung giấy để nhân viên xem/tải.",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !acting,
                onClick = { onConfirm(note) },
            ) {
                Text(
                    if (target.approved) "Xác nhận duyệt" else "Xác nhận từ chối",
                    color = if (target.approved) BrandBlue else DangerRed,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Đóng") }
        },
    )
}

// ----------------------------------------------------------------------
// Tiện ích hiển thị
// ----------------------------------------------------------------------

@Composable
fun DocTypeChip(docType: String?) {
    val (label, bg, fg) = when (docType) {
        "contract" -> Triple("Hợp đồng", BrandBlueSoft, BrandBlueDark)
        "cccd" -> Triple("CCCD", Color(0xFFF4EBFF), Color(0xFF6941C6))
        "degree" -> Triple("Bằng cấp", Color(0xFFECFDF3), SuccessGreen)
        "certificate" -> Triple("Chứng chỉ", Color(0xFFFFFAEB), WarningAmber)
        null -> Triple("—", Color(0xFFF2F4F7), InkMuted)
        else -> Triple("Khác", Color(0xFFF2F4F7), InkMuted)
    }
    StatusChip(label, bg, fg)
}

@Composable
fun CertStatusChip(status: String?) {
    val (label, bg, fg) = when (status) {
        "pending" -> Triple("Chờ HR duyệt", Color(0xFFFFFAEB), WarningAmber)
        "approved" -> Triple("Đã cấp", Color(0xFFECFDF3), SuccessGreen)
        "rejected" -> Triple("Bị từ chối", Color(0xFFFEF3F2), DangerRed)
        null -> Triple("—", Color(0xFFF2F4F7), InkMuted)
        else -> Triple(status, Color(0xFFF2F4F7), InkMuted)
    }
    StatusChip(label, bg, fg)
}

private fun certTypeLabel(certType: String?): String = when (certType) {
    "salary" -> "Giấy xác nhận lương"
    "employment" -> "Giấy xác nhận công tác"
    null -> "Giấy xác nhận"
    else -> certType
}
