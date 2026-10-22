package com.hrmai.app.feature.departments

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.InitialAvatar
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.SkeletonBlock
import com.hrmai.app.core.ui.theme.BrandBlueDark
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.InkMuted

@Composable
fun DepartmentsRoute(container: AppContainer) {
    val vm: DepartmentsViewModel = viewModel(
        factory = DepartmentsViewModel.Factory(
            container.api(DepartmentsApi::class.java),
        ),
    )
    DepartmentsScreen(vm)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DepartmentsScreen(vm: DepartmentsViewModel) {
    val state by vm.state.collectAsState()
    Column(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        Column(modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp)) {
            SectionHeader(title = "Phòng ban")
            Spacer(Modifier.height(4.dp))
            Text(
                when {
                    state.departments.isNotEmpty() ->
                        "${state.departments.size} phòng ban · ${state.totalEmployees} nhân viên"
                    else -> "Cơ cấu phòng ban của công ty"
                },
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
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
                    state.loading && state.departments.isEmpty() -> {
                        items(4) { SkeletonBlock(heightDp = 92) }
                    }
                    state.forbidden && state.departments.isEmpty() -> {
                        item {
                            EmptyState("Tính năng dành cho quản lý/HR.")
                        }
                    }
                    state.error != null && state.departments.isEmpty() -> {
                        item {
                            ErrorState(
                                message = state.error ?: "Không tải được danh sách phòng ban.",
                                onRetry = { vm.load() },
                            )
                        }
                    }
                    state.departments.isEmpty() -> {
                        item { EmptyState("Chưa có phòng ban nào được tạo.") }
                    }
                    else -> {
                        items(state.departments, key = { it.id ?: 0 }) { department ->
                            DepartmentCard(department)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DepartmentCard(department: DepartmentDto) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    department.name ?: "Phòng ban",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    "${department.employeeCount ?: 0} nhân viên",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = BrandBlueDark,
                )
            }
            if (!department.description.isNullOrBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    department.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                InitialAvatar(department.managerName, 30)
                Text(
                    if (department.managerName.isNullOrBlank()) {
                        "Chưa có trưởng phòng"
                    } else {
                        "Trưởng phòng: ${department.managerName}"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }
    }
}
