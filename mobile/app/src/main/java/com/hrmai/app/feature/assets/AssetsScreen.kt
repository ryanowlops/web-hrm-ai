package com.hrmai.app.feature.assets

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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.BrandBlueDark
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.DangerRed
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format

@Composable
fun AssetsRoute(container: AppContainer) {
    val vm: AssetsViewModel = viewModel(
        factory = AssetsViewModel.Factory(
            container.api(AssetsApi::class.java),
            container.sessionStore,
        ),
    )
    AssetsScreen(vm)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AssetsScreen(vm: AssetsViewModel) {
    val state by vm.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    var assignTarget by remember { mutableStateOf<AssetDto?>(null) }
    var returnTarget by remember { mutableStateOf<AssetDto?>(null) }

    LaunchedEffect(state.message) {
        val msg = state.message ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(msg)
        vm.consumeMessage()
    }

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        Column(modifier = Modifier.fillMaxSize()) {
            if (state.canViewAll) {
                val tabs = listOf("Của tôi", "Toàn bộ")
                TabRow(selectedTabIndex = state.tab.coerceAtMost(1)) {
                    tabs.forEachIndexed { index, label ->
                        Tab(
                            selected = state.tab == index,
                            onClick = { vm.selectTab(index) },
                            text = { Text(label) },
                        )
                    }
                }
            }
            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                if (state.tab == 1 && state.canViewAll) {
                    AllAssetsTab(
                        state = state,
                        onRefresh = { vm.refreshAll() },
                        onRetry = { vm.loadAll() },
                        onAssign = { assignTarget = it },
                        onReturn = { returnTarget = it },
                    )
                } else {
                    MyAssetsTab(state, vm)
                }
            }
        }
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
        )
    }

    assignTarget?.let { asset ->
        AssignDialog(
            asset = asset,
            employees = state.employees,
            acting = state.actingId == asset.id,
            onDismiss = { assignTarget = null },
            onConfirm = { employeeId, note ->
                vm.assign(asset, employeeId, note)
                assignTarget = null
            },
        )
    }

    returnTarget?.let { asset ->
        ReturnDialog(
            asset = asset,
            acting = state.actingId == asset.id,
            onDismiss = { returnTarget = null },
            onConfirm = { note ->
                vm.returnAsset(asset, note)
                returnTarget = null
            },
        )
    }
}

// ----------------------------------------------------------------------
// Tab: Tài sản của tôi
// ----------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MyAssetsTab(state: AssetsUiState, vm: AssetsViewModel) {
    PullToRefreshBox(
        isRefreshing = state.myRefreshing,
        onRefresh = { vm.refreshMine() },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            when {
                state.myLoading && state.myAssets.isEmpty() -> {
                    items(3) { SkeletonBlock(heightDp = 96) }
                }
                state.myError != null && state.myAssets.isEmpty() -> {
                    item {
                        ErrorState(
                            message = state.myError ?: "Không tải được tài sản của bạn.",
                            onRetry = { vm.loadMine() },
                        )
                    }
                }
                state.myAssets.isEmpty() -> {
                    item { EmptyState("Bạn chưa được cấp phát tài sản nào.") }
                }
                else -> {
                    items(state.myAssets, key = { it.assignmentId ?: it.id ?: 0 }) { item ->
                        MyAssetCard(item)
                    }
                }
            }
        }
    }
}

@Composable
private fun MyAssetCard(item: MyAssetDto) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    item.name ?: "Tài sản",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                AssetStatusChip(item.status)
            }
            Text(
                listOfNotNull(
                    item.code?.let { "Mã: $it" },
                    item.category,
                    item.serial?.let { "Serial: $it" },
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "Được cấp ngày ${Format.date(item.assignedAt)}",
                style = MaterialTheme.typography.bodyMedium,
            )
            if (!item.assignmentNote.isNullOrBlank()) {
                Text(
                    "Ghi chú: ${item.assignmentNote}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
        }
    }
}

// ----------------------------------------------------------------------
// Tab: Toàn bộ tài sản (admin/hr/manager)
// ----------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AllAssetsTab(
    state: AssetsUiState,
    onRefresh: () -> Unit,
    onRetry: () -> Unit,
    onAssign: (AssetDto) -> Unit,
    onReturn: (AssetDto) -> Unit,
) {
    PullToRefreshBox(
        isRefreshing = state.allRefreshing,
        onRefresh = onRefresh,
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            when {
                state.allLoading && state.allAssets.isEmpty() -> {
                    items(4) { SkeletonBlock(heightDp = 96) }
                }
                state.allError != null && state.allAssets.isEmpty() -> {
                    item {
                        ErrorState(
                            message = state.allError ?: "Không tải được danh mục tài sản.",
                            onRetry = onRetry,
                        )
                    }
                }
                state.allAssets.isEmpty() -> {
                    item { EmptyState("Chưa có tài sản nào trong danh mục.") }
                }
                else -> {
                    items(state.allAssets, key = { it.id ?: 0 }) { asset ->
                        AssetCard(
                            asset = asset,
                            canManage = state.canManage,
                            acting = state.actingId == asset.id,
                            onAssign = { onAssign(asset) },
                            onReturn = { onReturn(asset) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AssetCard(
    asset: AssetDto,
    canManage: Boolean,
    acting: Boolean,
    onAssign: () -> Unit,
    onReturn: () -> Unit,
) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    asset.name ?: "Tài sản",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                AssetStatusChip(asset.status)
            }
            Text(
                listOfNotNull(
                    asset.code?.let { "Mã: $it" },
                    asset.category,
                    asset.serial?.let { "Serial: $it" },
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
            val holder = asset.holder
            if (holder != null) {
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    InitialAvatar(holder.employeeName, 32)
                    Text(
                        "Đang giữ: ${holder.employeeName ?: "—"}" +
                            " · từ ${Format.date(holder.assignedAt)}",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }
            if (canManage) {
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (asset.status == "available") {
                        TextButton(onClick = onAssign, enabled = !acting) {
                            if (acting) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp,
                                    color = BrandBlue,
                                )
                            } else {
                                Text("Cấp phát", color = BrandBlue)
                            }
                        }
                    }
                    if (holder != null) {
                        TextButton(onClick = onReturn, enabled = !acting) {
                            Text("Thu hồi", color = DangerRed)
                        }
                    }
                }
            }
        }
    }
}

// ----------------------------------------------------------------------
// Hộp thoại cấp phát / thu hồi
// ----------------------------------------------------------------------

@Composable
private fun AssignDialog(
    asset: AssetDto,
    employees: List<EmployeeOptionDto>,
    acting: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (Int, String) -> Unit,
) {
    var selectedId by remember(asset.id) { mutableStateOf<Int?>(null) }
    var note by remember(asset.id) { mutableStateOf("") }
    var error by remember(asset.id) { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Cấp phát tài sản") },
        text = {
            Column {
                Text(
                    "${asset.name ?: "Tài sản"}${asset.code?.let { " · $it" } ?: ""}",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    "Chọn người nhận:",
                    style = MaterialTheme.typography.labelLarge,
                )
                if (employees.isEmpty()) {
                    EmptyState("Đang tải danh sách nhân viên…")
                } else {
                    LazyColumn(modifier = Modifier.heightIn(max = 260.dp)) {
                        items(employees, key = { it.id ?: 0 }) { emp ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        selectedId = emp.id
                                        error = null
                                    }
                                    .padding(vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                InitialAvatar(emp.fullName, 36)
                                Column(modifier = Modifier.padding(start = 10.dp)) {
                                    Text(
                                        emp.fullName ?: "Nhân viên",
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = if (selectedId == emp.id) {
                                            FontWeight.Bold
                                        } else {
                                            FontWeight.Normal
                                        },
                                    )
                                    Text(
                                        listOfNotNull(emp.code, emp.departmentName)
                                            .joinToString(" · "),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = InkMuted,
                                    )
                                }
                                if (selectedId == emp.id) {
                                    Text(
                                        "Đã chọn",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = BrandBlue,
                                        modifier = Modifier.padding(start = 8.dp),
                                    )
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Ghi chú (tuỳ chọn)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (error != null) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        error ?: "",
                        style = MaterialTheme.typography.bodySmall,
                        color = DangerRed,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !acting,
                onClick = {
                    val id = selectedId
                    if (id == null) {
                        error = "Chọn người nhận tài sản giúp em nhé."
                    } else {
                        onConfirm(id, note)
                    }
                },
            ) { Text("Cấp phát", color = BrandBlue) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Đóng") }
        },
    )
}

@Composable
private fun ReturnDialog(
    asset: AssetDto,
    acting: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var note by remember(asset.id) { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Thu hồi tài sản") },
        text = {
            Column {
                Text(
                    "${asset.name ?: "Tài sản"}${asset.code?.let { " · $it" } ?: ""}" +
                        " đang do ${asset.holder?.employeeName ?: "nhân viên"} giữ " +
                        "sẽ được thu hồi về kho.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Ghi chú thu hồi (tuỳ chọn)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = !acting,
                onClick = { onConfirm(note) },
            ) { Text("Thu hồi", color = DangerRed) }
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
fun AssetStatusChip(status: String?) {
    val (label, bg, fg) = when (status) {
        "available" -> Triple("Sẵn sàng", Color(0xFFECFDF3), SuccessGreen)
        "assigned" -> Triple("Đang cấp phát", BrandBlueSoft, BrandBlueDark)
        "maintenance" -> Triple("Bảo trì", Color(0xFFFFFAEB), WarningAmber)
        "retired" -> Triple("Đã thanh lý", Color(0xFFF2F4F7), InkMuted)
        null -> Triple("—", Color(0xFFF2F4F7), InkMuted)
        else -> Triple(status, Color(0xFFF2F4F7), InkMuted)
    }
    StatusChip(label, bg, fg)
}
