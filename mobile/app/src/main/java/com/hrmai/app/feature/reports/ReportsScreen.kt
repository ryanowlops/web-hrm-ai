package com.hrmai.app.feature.reports

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.SkeletonBlock
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format
import java.time.YearMonth

@Composable
fun ReportsRoute(container: AppContainer) {
    val vm: ReportsViewModel = viewModel(
        factory = ReportsViewModel.Factory(
            container.api(ReportsApi::class.java),
            container.sessionStore,
        )
    )
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(state.toast) {
        state.toast?.let {
            snackbar.showSnackbar(it)
            vm.consumeToast()
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        ReportsScreen(state = state, vm = vm)
        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReportsScreen(state: ReportsUiState, vm: ReportsViewModel) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "Báo cáo",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp),
        )
        Text(
            text = if (state.role == "manager") {
                "Số liệu phòng ban của bạn trong tháng"
            } else {
                "Số liệu tổng quan toàn công ty trong tháng"
            },
            style = MaterialTheme.typography.bodyMedium,
            color = InkMuted,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp),
        )

        when {
            !state.canView && state.role != null -> {
                Box(modifier = Modifier.padding(16.dp)) {
                    HrmCard(modifier = Modifier.fillMaxWidth()) {
                        EmptyState(
                            "Báo cáo chỉ dành cho Quản lý và HR. " +
                                "Tài khoản nhân viên chưa có quyền xem mục này.",
                        )
                    }
                }
            }
            state.loading -> {
                Column(
                    modifier = Modifier.fillMaxSize().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SkeletonBlock(heightDp = 90)
                    SkeletonBlock(heightDp = 150)
                    SkeletonBlock(heightDp = 150)
                }
            }
            state.error != null && state.summary == null -> {
                ErrorState(message = state.error, onRetry = { vm.load() })
            }
            state.summary != null -> {
                val summary = state.summary
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
                        item { MonthSwitcher(state = state, vm = vm) }
                        item { HeadcountCard(summary = summary) }
                        item { AttendanceCard(summary = summary) }
                        item { LeaveCard(summary = summary) }
                        item { PayrollCard(summary = summary) }
                    }
                }
            }
        }
    }
}

@Composable
private fun MonthSwitcher(state: ReportsUiState, vm: ReportsViewModel) {
    val isCurrentMonth = YearMonth.of(state.year, state.month) ==
        YearMonth.from(Format.today())
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = { vm.changeMonth(-1) }) {
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                    contentDescription = "Tháng trước",
                )
            }
            Text(
                text = "Tháng ${state.month}/${state.year}",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = BrandBlue,
                modifier = Modifier.weight(1f),
            )
            IconButton(
                onClick = { vm.changeMonth(1) },
                enabled = !isCurrentMonth,
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = "Tháng sau",
                )
            }
        }
    }
}

/** Hàng nhãn — giá trị dùng lặp lại trong các thẻ báo cáo. */
@Composable
private fun MetricRow(label: String, value: String, valueColor: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurface) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = InkMuted,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = valueColor,
        )
    }
}

@Composable
private fun HeadcountCard(summary: ReportsSummaryDto) {
    val headcount = summary.headcount
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            SectionHeader("Nhân sự")
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    text = "${headcount?.total ?: 0}",
                    style = MaterialTheme.typography.displaySmall,
                    fontWeight = FontWeight.Bold,
                    color = BrandBlue,
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = "nhân viên đang làm việc",
                    style = MaterialTheme.typography.bodyMedium,
                    color = InkMuted,
                    modifier = Modifier.padding(bottom = 6.dp),
                )
            }
            val byDept = headcount?.byDepartment.orEmpty()
            if (byDept.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                byDept.forEach { dept ->
                    MetricRow(
                        label = dept.departmentName ?: "Chưa thuộc phòng ban",
                        value = "${dept.employeeCount ?: 0} người",
                    )
                }
            }
        }
    }
}

@Composable
private fun AttendanceCard(summary: ReportsSummaryDto) {
    val att = summary.attendance
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            SectionHeader("Chấm công")
            Spacer(Modifier.height(10.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(BrandBlueSoft, androidx.compose.foundation.shape.RoundedCornerShape(12.dp))
                    .padding(12.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "Tỷ lệ chuyên cần",
                        style = MaterialTheme.typography.bodyMedium,
                        color = InkMuted,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = "${att?.attendanceRate ?: 0.0}%",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = SuccessGreen,
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            MetricRow("Đúng giờ", "${att?.present ?: 0} lượt")
            MetricRow("Đi muộn", "${att?.late ?: 0} lượt", WarningAmber)
            MetricRow("Vắng", "${att?.absent ?: 0} lượt")
            MetricRow("Nghỉ phép", "${att?.onLeave ?: 0} lượt")
            MetricRow("Tổng bản ghi", "${att?.totalRecords ?: 0} lượt")
        }
    }
}

@Composable
private fun LeaveCard(summary: ReportsSummaryDto) {
    val leave = summary.leave
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            SectionHeader("Nghỉ phép đã duyệt")
            Spacer(Modifier.height(10.dp))
            MetricRow("Tổng số đơn", "${leave?.totalRequests ?: 0} đơn")
            MetricRow("Tổng ngày nghỉ", formatDays(leave?.totalDays))
            val byType = leave?.byType.orEmpty()
            if (byType.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    text = "Theo loại phép",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(4.dp))
                byType.forEach { type ->
                    MetricRow(
                        label = type.leaveType ?: "Không rõ loại",
                        value = "${type.requests ?: 0} đơn · ${formatDays(type.days)}",
                    )
                }
            }
        }
    }
}

@Composable
private fun PayrollCard(summary: ReportsSummaryDto) {
    val payroll = summary.payroll
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            SectionHeader("Lương")
            Spacer(Modifier.height(10.dp))
            val period = payroll?.period
            if (period == null) {
                EmptyState("Chưa có kỳ lương nào cho tháng này.")
            } else {
                Text(
                    text = "Kỳ lương tháng ${period.month}/${period.year} · " +
                        PayrollPeriodStatus.labelOf(period.status),
                    style = MaterialTheme.typography.bodyMedium,
                    color = InkMuted,
                )
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        text = Format.money(payroll?.totalCost),
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = BrandBlue,
                    )
                }
                Text(
                    text = "Tổng chi phí lương · ${payroll?.employeeCount ?: 0} nhân viên",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                val byDept = payroll?.byDepartment.orEmpty()
                if (byDept.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    byDept.forEach { dept ->
                        MetricRow(
                            label = dept.departmentName ?: "Chưa thuộc phòng ban",
                            value = Format.money(dept.totalCost),
                        )
                    }
                }
            }
        }
    }
}

/** Số ngày phép có thể là số lẻ (0.5) — bỏ phần thập phân thừa. */
private fun formatDays(days: Double?): String {
    if (days == null) return "0 ngày"
    val text = if (days % 1.0 == 0.0) days.toInt().toString() else days.toString()
    return "$text ngày"
}
