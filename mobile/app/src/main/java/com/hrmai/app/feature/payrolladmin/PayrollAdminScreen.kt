package com.hrmai.app.feature.payrolladmin

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.DangerRed
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format
import java.util.Locale

@Composable
fun PayrollAdminRoute(container: AppContainer) {
    val vm: PayrollAdminViewModel = viewModel(
        factory = PayrollAdminViewModel.Factory(
            api = container.api(PayrollAdminApi::class.java),
            sessionStore = container.sessionStore,
        ),
    )
    val state by vm.state.collectAsState()
    PayrollAdminScreen(state = state, vm = vm)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PayrollAdminScreen(state: PayrollAdminUiState, vm: PayrollAdminViewModel) {
    val snackbarHostState = remember { SnackbarHostState() }
    var calcTarget by remember { mutableStateOf<AdminPeriodDto?>(null) }
    var lockTarget by remember { mutableStateOf<AdminPeriodDto?>(null) }

    LaunchedEffect(state.message) {
        val msg = state.message ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(msg)
        vm.consumeMessage()
    }

    val selected = state.periods.firstOrNull { it.id == state.selectedPeriodId }

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
                            "Quản lý lương",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            "Tính lương, chốt kỳ và xem bảng lương toàn công ty.",
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                }

                when {
                    state.periodsLoading && state.periods.isEmpty() -> {
                        items(3) { SkeletonBlock(heightDp = 110) }
                    }
                    state.forbidden && state.periods.isEmpty() -> {
                        item { EmptyState("Tính năng dành cho HR/quản lý") }
                    }
                    state.periodsError != null && state.periods.isEmpty() -> {
                        item {
                            ErrorState(
                                message = state.periodsError ?: "Không tải được danh sách kỳ lương.",
                                onRetry = { vm.loadPeriods() },
                            )
                        }
                    }
                    state.periods.isEmpty() -> {
                        item {
                            EmptyState(
                                "Chưa có kỳ lương nào.\n" +
                                    "Tạo kỳ lương mới trên bản web (mục Lương) nhé.",
                            )
                        }
                    }
                    else -> {
                        item {
                            Column {
                                SectionHeader(title = "Chọn kỳ lương")
                                Spacer(Modifier.height(8.dp))
                                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    items(state.periods, key = { it.id ?: 0 }) { period ->
                                        val id = period.id ?: return@items
                                        FilterChip(
                                            selected = state.selectedPeriodId == id,
                                            onClick = { vm.selectPeriod(id) },
                                            label = {
                                                Text(periodLabel(period.month, period.year))
                                            },
                                        )
                                    }
                                }
                            }
                        }

                        if (selected != null) {
                            item {
                                PeriodDetailCard(
                                    period = selected,
                                    itemCount = state.items.size,
                                    itemsLoading = state.itemsLoading,
                                    totalSalary = state.items.sumOf { it.totalSalary ?: 0L },
                                    acting = if (state.actingPeriodId == selected.id) {
                                        state.acting
                                    } else {
                                        null
                                    },
                                    onCalculate = { calcTarget = selected },
                                    onLock = { lockTarget = selected },
                                )
                            }

                            item {
                                SectionHeader(
                                    title = "Bảng lương ${periodLabel(selected.month, selected.year)}",
                                )
                            }

                            when {
                                state.itemsLoading && state.items.isEmpty() -> {
                                    items(4) { SkeletonBlock(heightDp = 96) }
                                }
                                state.itemsError != null && state.items.isEmpty() -> {
                                    item {
                                        ErrorState(
                                            message = state.itemsError
                                                ?: "Không tải được bảng lương.",
                                            onRetry = { vm.reloadItems() },
                                        )
                                    }
                                }
                                state.items.isEmpty() -> {
                                    item {
                                        EmptyState(
                                            if (selected.status == "locked") {
                                                "Kỳ này chưa có dòng lương nào."
                                            } else {
                                                "Chưa có dòng lương cho kỳ này.\n" +
                                                    "Bấm \"Tính lương\" ở trên để tạo bảng lương."
                                            },
                                        )
                                    }
                                }
                                else -> {
                                    items(state.items, key = { it.id ?: 0 }) { item ->
                                        PayrollItemRow(item)
                                    }
                                    item {
                                        Text(
                                            "Số liệu đồng bộ với bảng lương trên bản web.",
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
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
        )
    }

    // --- Hộp thoại xác nhận TRƯỚC khi gọi API ---
    calcTarget?.let { period ->
        AlertDialog(
            onDismissRequest = { calcTarget = null },
            title = { Text("Tính lương ${periodLabel(period.month, period.year)}?") },
            text = {
                Text(
                    "Hệ thống sẽ tính (hoặc tính lại) lương cho toàn bộ nhân viên " +
                        "có hợp đồng hiệu lực trong kỳ này, dựa trên ngày công và " +
                        "nghỉ phép đã duyệt. Khấu trừ khác đã nhập tay sẽ được giữ nguyên.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        vm.calculate(period)
                        calcTarget = null
                    },
                ) { Text("Tính lương", color = BrandBlue) }
            },
            dismissButton = {
                TextButton(onClick = { calcTarget = null }) { Text("Huỷ") }
            },
        )
    }

    lockTarget?.let { period ->
        AlertDialog(
            onDismissRequest = { lockTarget = null },
            title = { Text("Chốt kỳ lương ${periodLabel(period.month, period.year)}?") },
            text = {
                Text(
                    "Sau khi chốt, kỳ lương sẽ KHÔNG tính lại được và nhân viên " +
                        "sẽ xem được phiếu lương của mình ngay. Hãy chắc chắn bảng " +
                        "lương đã đúng trước khi chốt.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        vm.lock(period)
                        lockTarget = null
                    },
                ) { Text("Chốt kỳ", color = DangerRed) }
            },
            dismissButton = {
                TextButton(onClick = { lockTarget = null }) { Text("Để sau") }
            },
        )
    }

    // --- Hộp thoại tổng kết kết quả tính lương ---
    state.calcResult?.let { summary ->
        AlertDialog(
            onDismissRequest = { vm.dismissCalcResult() },
            title = {
                Text("Đã tính lương ${periodLabel(summary.month, summary.year)}")
            },
            text = {
                Column {
                    SummaryRow("Dòng lương mới tạo", "${summary.itemsCreated ?: 0}")
                    SummaryRow("Dòng lương cập nhật", "${summary.itemsUpdated ?: 0}")
                    if ((summary.skippedNoContract ?: 0) > 0) {
                        SummaryRow(
                            "Bỏ qua (chưa có hợp đồng)",
                            "${summary.skippedNoContract}",
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    SummaryRow(
                        "Tổng quỹ lương",
                        Format.money(summary.totalSalary),
                        bold = true,
                    )
                    Text(
                        "Kiểm tra bảng lương bên dưới, nếu đúng thì bấm \"Chốt kỳ\" " +
                            "để nhân viên xem được phiếu lương.",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { vm.dismissCalcResult() }) { Text("Đã hiểu") }
            },
        )
    }
}

@Composable
private fun PeriodDetailCard(
    period: AdminPeriodDto,
    itemCount: Int,
    itemsLoading: Boolean,
    totalSalary: Long,
    acting: PeriodAction?,
    onCalculate: () -> Unit,
    onLock: () -> Unit,
) {
    val locked = period.status == "locked"
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Kỳ lương ${periodLabel(period.month, period.year)}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                PeriodStatusChip(period.status)
            }
            Spacer(Modifier.height(8.dp))
            val standard = period.standardWorkdays
            if (standard != null) {
                DetailRow("Ngày công chuẩn", "${formatDays(standard)} ngày")
            }
            if (!period.lockedAt.isNullOrBlank()) {
                DetailRow("Đã chốt lúc", Format.dateTime(period.lockedAt))
            }
            if (!itemsLoading) {
                DetailRow("Số nhân viên có lương", "$itemCount")
                DetailRow("Tổng quỹ lương", Format.money(totalSalary))
            } else {
                Spacer(Modifier.height(6.dp))
                LoadingState()
            }

            if (!locked) {
                Spacer(Modifier.height(12.dp))
                HorizontalDivider()
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = onCalculate,
                        enabled = acting == null,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                    ) {
                        if (acting == PeriodAction.CALCULATE) {
                            CircularProgressIndicator(
                                color = Color.White,
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                            )
                        } else {
                            Text("Tính lương")
                        }
                    }
                    OutlinedButton(
                        onClick = onLock,
                        enabled = acting == null,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = DangerRed),
                    ) {
                        if (acting == PeriodAction.LOCK) {
                            CircularProgressIndicator(
                                color = DangerRed,
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                            )
                        } else {
                            Text("Chốt kỳ")
                        }
                    }
                }
                Text(
                    "Chốt kỳ xong, nhân viên sẽ xem được phiếu lương của mình.",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
        }
    }
}

@Composable
private fun PayrollItemRow(item: AdminPayrollItemDto) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                InitialAvatar(item.employeeName, 40)
                Column(modifier = Modifier.padding(start = 10.dp).weight(1f)) {
                    Text(
                        item.employeeName ?: "Nhân viên",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    val sub = listOfNotNull(item.employeeCode, item.departmentName)
                        .filter { it.isNotBlank() }.joinToString(" · ")
                    if (sub.isNotBlank()) {
                        Text(sub, style = MaterialTheme.typography.bodySmall, color = InkMuted)
                    }
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        Format.money(item.totalSalary),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = BrandBlue,
                    )
                    Text("thực lĩnh", style = MaterialTheme.typography.bodySmall, color = InkMuted)
                }
            }
            Spacer(Modifier.height(8.dp))
            val parts = mutableListOf<String>()
            item.workdaysPaid?.let { parts.add("Công ${formatDays(it)} ngày") }
            item.baseSalary?.let { parts.add("CB ${Format.money(it)}") }
            if ((item.allowance ?: 0L) != 0L) {
                parts.add("PC ${Format.money(item.allowance)}")
            }
            if ((item.insuranceDeduction ?: 0L) != 0L) {
                parts.add("BH −${Format.money(item.insuranceDeduction)}")
            }
            if ((item.otherDeduction ?: 0L) != 0L) {
                parts.add("Khác −${Format.money(item.otherDeduction)}")
            }
            Text(
                parts.joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
        }
    }
}

@Composable
private fun PeriodStatusChip(status: String?) {
    val (label, bg, fg) = when (status) {
        "locked" -> Triple("Đã chốt", Color(0xFFECFDF3), SuccessGreen)
        "draft" -> Triple("Bản nháp", Color(0xFFFFFAEB), WarningAmber)
        null -> Triple("—", Color(0xFFF2F4F7), InkMuted)
        else -> Triple(status, Color(0xFFF2F4F7), InkMuted)
    }
    StatusChip(label, bg, fg)
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = InkMuted)
        Spacer(Modifier.width(12.dp))
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun SummaryRow(label: String, value: String, bold: Boolean = false) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = InkMuted)
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (bold) FontWeight.Bold else FontWeight.Medium,
        )
    }
}

private fun periodLabel(month: Int?, year: Int?): String =
    if (month != null && year != null) "Tháng $month/$year" else "kỳ gần nhất"

/** 22.0 -> "22"; 21.5 -> "21,5". */
private fun formatDays(value: Double): String =
    if (value % 1.0 == 0.0) value.toInt().toString()
    else String.format(Locale("vi", "VN"), "%.1f", value)
