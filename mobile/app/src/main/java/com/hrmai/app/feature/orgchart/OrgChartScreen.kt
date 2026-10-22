package com.hrmai.app.feature.orgchart

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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.InitialAvatar
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.SkeletonBlock
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BrandBlueDark
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.InkMuted

@Composable
fun OrgChartRoute(container: AppContainer) {
    val vm: OrgChartViewModel = viewModel(
        factory = OrgChartViewModel.Factory(
            container.api(OrgChartApi::class.java),
        ),
    )
    OrgChartScreen(vm)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OrgChartScreen(vm: OrgChartViewModel) {
    val state by vm.state.collectAsState()
    Column(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        Column(modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp)) {
            SectionHeader(title = "Sơ đồ tổ chức")
            Spacer(Modifier.height(4.dp))
            Text(
                if (state.totalEmployees > 0) {
                    "Cây báo cáo theo phòng ban · ${state.totalEmployees} nhân viên trong phạm vi của bạn"
                } else {
                    "Cây báo cáo theo phòng ban và quản lý trực tiếp"
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
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                when {
                    state.loading && state.blocks.isEmpty() -> {
                        items(4) { SkeletonBlock(heightDp = 120) }
                    }
                    state.forbidden && state.blocks.isEmpty() -> {
                        item {
                            EmptyState("Tính năng dành cho quản lý/HR. Tài khoản nhân viên chỉ xem được sơ đồ trong phạm vi phòng của mình nếu được cấp quyền.")
                        }
                    }
                    state.error != null && state.blocks.isEmpty() -> {
                        item {
                            ErrorState(
                                message = state.error ?: "Không tải được sơ đồ tổ chức.",
                                onRetry = { vm.load() },
                            )
                        }
                    }
                    state.blocks.isEmpty() -> {
                        item { EmptyState("Chưa có dữ liệu tổ chức để hiển thị.") }
                    }
                    else -> {
                        state.blocks.forEach { block ->
                            item(key = "dept-${block.department?.id ?: "none"}") {
                                SectionHeader(
                                    title = block.department?.name ?: "Chưa thuộc phòng ban",
                                )
                            }
                            items(
                                block.nodes,
                                key = { node -> "emp-${node.employee.id ?: 0}" },
                            ) { node ->
                                OrgNodeRow(node)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun OrgNodeRow(node: OrgNode) {
    val employee = node.employee
    // Thụt cấp bằng lề trái + vạch dọc mảnh ở mỗi cấp.
    Row(modifier = Modifier.fillMaxWidth()) {
        repeat(node.depth.coerceAtMost(6)) {
            Box(
                modifier = Modifier
                    .width(14.dp)
                    .height(56.dp)
                    .padding(end = 13.dp)
                    .background(Color(0xFFD0D5DD)),
            )
        }
        Row(
            modifier = Modifier
                .weight(1f)
                .clip(RoundedCornerShape(12.dp))
                .background(Color.White)
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            InitialAvatar(employee.fullName, 38)
            Column(modifier = Modifier.padding(start = 10.dp).weight(1f)) {
                Text(
                    employee.fullName ?: "Nhân viên",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = if (node.isDepartmentHead) {
                        FontWeight.Bold
                    } else {
                        FontWeight.SemiBold
                    },
                )
                Text(
                    employee.positionTitle ?: "Chưa gán chức vụ",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            if (node.isDepartmentHead) {
                StatusChip("Trưởng phòng", BrandBlueSoft, BrandBlueDark)
            }
        }
    }
}
