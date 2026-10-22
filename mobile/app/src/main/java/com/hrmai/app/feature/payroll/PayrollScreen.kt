package com.hrmai.app.feature.payroll

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.LoadingState
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.DangerRed
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.util.Format
import java.util.Locale

@Composable
fun PayrollRoute(container: AppContainer) {
    val vm: PayrollViewModel = viewModel(
        factory = PayrollViewModel.Factory(
            api = container.api(PayrollApi::class.java),
            sessionStore = container.sessionStore,
        ),
    )
    val state by vm.state.collectAsState()
    PayrollScreen(
        state = state,
        onSelectPeriod = vm::selectPeriod,
        onRefresh = vm::refresh,
        onRetry = vm::refresh,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PayrollScreen(
    state: PayrollUiState,
    onSelectPeriod: (Int) -> Unit,
    onRefresh: () -> Unit,
    onRetry: () -> Unit,
) {
    PullToRefreshBox(
        isRefreshing = state.refreshing,
        onRefresh = onRefresh,
        modifier = Modifier.fillMaxSize().background(CanvasGray),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (state.lockedPeriods.isNotEmpty()) {
                Column {
                    SectionHeader(title = "Chọn kỳ lương")
                    Spacer(Modifier.height(8.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(state.lockedPeriods, key = { it.id ?: it.hashCode() }) { period ->
                            val id = period.id ?: return@items
                            FilterChip(
                                selected = state.selectedPeriodId == id,
                                onClick = { onSelectPeriod(id) },
                                label = { Text(periodLabel(period.month, period.year)) },
                            )
                        }
                    }
                }
            }

            when (val slip = state.payslip) {
                is PayslipState.Loading -> HrmCard(modifier = Modifier.fillMaxWidth()) {
                    LoadingState()
                }
                is PayslipState.NotFound -> HrmCard(modifier = Modifier.fillMaxWidth()) {
                    EmptyState(
                        "Chưa có phiếu lương cho kỳ này.\n" +
                            "Phiếu lương chỉ hiển thị sau khi HR đã chốt kỳ lương.",
                    )
                }
                is PayslipState.Failed -> HrmCard(modifier = Modifier.fillMaxWidth()) {
                    ErrorState(message = slip.message, onRetry = onRetry)
                }
                is PayslipState.Content -> PayslipCard(payslip = slip.payslip)
            }

            Text(
                text = "Số liệu đồng bộ với phiếu lương trên bản web.",
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
        }
    }
}

@Composable
private fun PayslipCard(payslip: PayslipDto) {
    val breakdown = payslip.breakdown
    val month = payslip.period?.month
    val year = payslip.period?.year
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Text(
                text = "Phiếu lương ${periodLabel(month, year)}",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            val sub = listOfNotNull(payslip.employeeName, payslip.employeeCode, payslip.departmentName)
                .filter { it.isNotBlank() }
                .joinToString(" · ")
            if (sub.isNotBlank()) {
                Text(
                    text = sub,
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }

            Spacer(Modifier.height(16.dp))
            Text(
                text = "Thực lĩnh",
                style = MaterialTheme.typography.labelMedium,
                color = InkMuted,
            )
            Text(
                text = Format.money(payslip.totalSalary),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = BrandBlue,
            )

            Spacer(Modifier.height(12.dp))
            HorizontalDivider()

            val paidDays = payslip.workdaysPaid ?: breakdown?.paidWorkdays
            val standardDays = breakdown?.standardWorkdays
            if (paidDays != null) {
                PayslipRow(
                    label = "Ngày công được trả",
                    value = if (standardDays != null) {
                        "${formatDays(paidDays)} / ${formatDays(standardDays)} ngày"
                    } else {
                        "${formatDays(paidDays)} ngày"
                    },
                )
            }
            val unpaidDays = breakdown?.unpaidDays
            if (unpaidDays != null && unpaidDays > 0.0) {
                PayslipRow(
                    label = "Ngày nghỉ không lương",
                    value = "${formatDays(unpaidDays)} ngày",
                )
            }

            HorizontalDivider()
            PayslipRow(label = "Lương cơ bản", value = Format.money(payslip.baseSalary))
            val workdaySalary = breakdown?.workdaySalary
            if (workdaySalary != null && workdaySalary != payslip.baseSalary) {
                PayslipRow(label = "Lương theo ngày công", value = Format.money(workdaySalary))
            }
            PayslipRow(label = "Phụ cấp", value = Format.money(payslip.allowance))
            val insuranceRate = breakdown?.insuranceRate
            PayslipRow(
                label = if (insuranceRate != null) {
                    "Khấu trừ bảo hiểm (${formatPercent(insuranceRate)})"
                } else {
                    "Khấu trừ bảo hiểm"
                },
                value = minusMoney(payslip.insuranceDeduction),
                valueColor = DangerRed,
            )
            if ((payslip.otherDeduction ?: 0L) != 0L) {
                PayslipRow(
                    label = "Khấu trừ khác",
                    value = minusMoney(payslip.otherDeduction),
                    valueColor = DangerRed,
                )
            }

            HorizontalDivider()
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "Tổng thực lĩnh",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = Format.money(payslip.totalSalary),
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Bold,
                    color = SuccessGreen,
                )
            }
        }
    }
}

@Composable
private fun PayslipRow(
    label: String,
    value: String,
    valueColor: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurface,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = InkMuted,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = valueColor,
        )
    }
}

private fun periodLabel(month: Int?, year: Int?): String =
    if (month != null && year != null) "Tháng $month/$year" else "kỳ gần nhất"

/** 21.0 -> "21"; 21.5 -> "21,5". */
private fun formatDays(value: Double): String =
    if (value % 1.0 == 0.0) value.toInt().toString()
    else String.format(Locale("vi", "VN"), "%.1f", value)

/** 0.105 -> "10,5%". */
private fun formatPercent(rate: Double): String {
    val pct = rate * 100
    return if (pct % 1.0 == 0.0) "${pct.toInt()}%"
    else "${String.format(Locale("vi", "VN"), "%.1f", pct)}%"
}

private fun minusMoney(value: Long?): String =
    if (value == null || value == 0L) Format.money(value) else "−${Format.money(value)}"
