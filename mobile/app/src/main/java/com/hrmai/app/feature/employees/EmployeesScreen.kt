package com.hrmai.app.feature.employees

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import com.hrmai.app.core.ui.InitialAvatar
import com.hrmai.app.core.ui.LoadingState
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.SkeletonBlock
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.DangerRed
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format

@Composable
fun EmployeesRoute(container: AppContainer, onOpenEmployee: (Int) -> Unit) {
    val vm: EmployeesViewModel = viewModel(
        factory = EmployeesViewModel.Factory(
            container.api(EmployeesApi::class.java),
        ),
    )
    EmployeesScreen(vm, onOpenEmployee)
}

@Composable
fun EmployeeDetailRoute(container: AppContainer, employeeId: Int, onBack: () -> Unit) {
    val vm: EmployeeDetailViewModel = viewModel(
        key = "employee-detail-$employeeId",
        factory = EmployeeDetailViewModel.Factory(
            container.api(EmployeesApi::class.java),
            employeeId,
        ),
    )
    EmployeeDetailScreen(vm, onBack)
}

// ----------------------------------------------------------------------
// Danh sách nhân viên
// ----------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EmployeesScreen(vm: EmployeesViewModel, onOpenEmployee: (Int) -> Unit) {
    val state by vm.state.collectAsState()
    Column(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        Column(modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp)) {
            SectionHeader(title = "Danh sách nhân viên")
            Spacer(Modifier.height(4.dp))
            Text(
                if (state.totalItems > 0) {
                    "${state.totalItems} nhân viên trong phạm vi bạn được xem"
                } else {
                    "Phạm vi dữ liệu do hệ thống phân quyền theo vai trò"
                },
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = state.query,
                onValueChange = { vm.onQueryChange(it) },
                placeholder = { Text("Tìm theo tên, mã NV, email, SĐT…") },
                leadingIcon = {
                    Icon(Icons.Filled.Search, contentDescription = "Tìm kiếm", tint = InkMuted)
                },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        PullToRefreshBox(
            isRefreshing = state.refreshing,
            onRefresh = { vm.refresh() },
            modifier = Modifier.weight(1f).fillMaxWidth(),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                when {
                    state.loading && state.employees.isEmpty() -> {
                        items(5) { SkeletonBlock(heightDp = 76) }
                    }
                    state.forbidden && state.employees.isEmpty() -> {
                        item {
                            EmptyState("Tính năng dành cho quản lý/HR. Tài khoản của bạn chỉ xem được thông tin của chính mình.")
                        }
                    }
                    state.error != null && state.employees.isEmpty() -> {
                        item {
                            ErrorState(
                                message = state.error ?: "Không tải được danh sách nhân viên.",
                                onRetry = { vm.load() },
                            )
                        }
                    }
                    state.employees.isEmpty() -> {
                        item {
                            EmptyState(
                                if (state.query.isBlank()) {
                                    "Chưa có nhân viên nào trong phạm vi của bạn."
                                } else {
                                    "Không tìm thấy nhân viên khớp \"${state.query}\"."
                                },
                            )
                        }
                    }
                    else -> {
                        items(state.employees, key = { it.id ?: 0 }) { employee ->
                            EmployeeCard(
                                employee = employee,
                                onClick = { employee.id?.let(onOpenEmployee) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EmployeeCard(employee: EmployeeDto, onClick: () -> Unit) {
    HrmCard(
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
        contentPadding = PaddingValues(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            InitialAvatar(employee.fullName, 46)
            Column(modifier = Modifier.padding(start = 12.dp).weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        employee.fullName ?: "Nhân viên",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (!employee.code.isNullOrBlank()) {
                        Text(
                            " · ${employee.code}",
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                }
                Text(
                    listOfNotNull(employee.positionTitle, employee.departmentName)
                        .joinToString(" · ")
                        .ifBlank { "Chưa gán chức vụ/phòng ban" },
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                if (!employee.email.isNullOrBlank()) {
                    Text(
                        employee.email,
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
            }
            EmployeeStatusChip(employee.status)
        }
    }
}

// ----------------------------------------------------------------------
// Chi tiết nhân viên
// ----------------------------------------------------------------------

@Composable
private fun EmployeeDetailScreen(vm: EmployeeDetailViewModel, onBack: () -> Unit) {
    val state by vm.state.collectAsState()
    Column(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Quay lại",
                )
            }
            Text(
                "Chi tiết nhân viên",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
        when {
            state.loading && state.employee == null -> LoadingState()
            state.forbidden && state.employee == null -> {
                EmptyState("Tính năng dành cho quản lý/HR. Bạn chỉ xem được hồ sơ của chính mình.")
            }
            state.error != null && state.employee == null -> {
                ErrorState(
                    message = state.error ?: "Không tải được hồ sơ nhân viên.",
                    onRetry = { vm.load() },
                )
            }
            state.employee == null -> {
                EmptyState("Không tìm thấy nhân viên này.")
            }
            else -> EmployeeDetailContent(state.employee)
        }
    }
}

@Composable
private fun EmployeeDetailContent(employee: EmployeeDto) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            HrmCard(modifier = Modifier.fillMaxWidth()) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    InitialAvatar(employee.fullName, 72)
                    Spacer(Modifier.height(10.dp))
                    Text(
                        employee.fullName ?: "Nhân viên",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (!employee.code.isNullOrBlank()) {
                        Text(
                            "Mã NV: ${employee.code}",
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    EmployeeStatusChip(employee.status)
                }
            }
        }
        item {
            HrmCard(modifier = Modifier.fillMaxWidth()) {
                Column {
                    SectionHeader(title = "Thông tin công việc")
                    Spacer(Modifier.height(10.dp))
                    DetailRow("Chức vụ", employee.positionTitle)
                    DetailRow("Phòng ban", employee.departmentName)
                    DetailRow("Quản lý trực tiếp", employee.managerName)
                    DetailRow("Ngày vào làm", Format.date(employee.startDate))
                }
            }
        }
        item {
            HrmCard(modifier = Modifier.fillMaxWidth()) {
                Column {
                    SectionHeader(title = "Thông tin liên hệ & cá nhân")
                    Spacer(Modifier.height(10.dp))
                    DetailRow("Email", employee.email)
                    DetailRow("Số điện thoại", employee.phone)
                    DetailRow("Ngày sinh", Format.date(employee.dateOfBirth))
                    DetailRow("Giới tính", genderLabel(employee.gender))
                    DetailRow("Địa chỉ", employee.address)
                }
            }
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String?) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = InkMuted,
            modifier = Modifier.weight(1f),
        )
        Text(
            value?.takeIf { it.isNotBlank() } ?: "—",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1.4f),
        )
    }
}

// ----------------------------------------------------------------------
// Tiện ích hiển thị
// ----------------------------------------------------------------------

@Composable
fun EmployeeStatusChip(status: String?) {
    val (label, bg, fg) = when (status) {
        "working" -> Triple("Đang làm việc", Color(0xFFECFDF3), SuccessGreen)
        "on_leave" -> Triple("Đang nghỉ phép", Color(0xFFFFFAEB), WarningAmber)
        "resigned" -> Triple("Đã nghỉ việc", Color(0xFFFEF3F2), DangerRed)
        null -> Triple("—", Color(0xFFF2F4F7), InkMuted)
        else -> Triple(status, Color(0xFFF2F4F7), InkMuted)
    }
    StatusChip(label, bg, fg)
}

/** Server lưu giới tính dạng male/female/other (hoặc tiếng Việt tuỳ dữ liệu seed). */
private fun genderLabel(gender: String?): String? = when (gender?.lowercase()) {
    "male", "nam", "m" -> "Nam"
    "female", "nữ", "nu", "f" -> "Nữ"
    "other", "khác" -> "Khác"
    else -> gender
}
