package com.hrmai.app.feature.kudos

import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.outlined.Cake
import androidx.compose.material.icons.outlined.Celebration
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
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
import com.hrmai.app.core.ui.SectionHeader
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

@Composable
fun KudosRoute(container: AppContainer) {
    val vm: KudosViewModel = viewModel(
        factory = KudosViewModel.Factory(
            container.api(KudosApi::class.java),
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
        KudosScreen(state = state, vm = vm)
        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
        )
    }

    if (state.showEmployeePicker) {
        EmployeePickerDialog(state = state, vm = vm)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun KudosScreen(state: KudosUiState, vm: KudosViewModel) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "Vinh danh",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp),
        )
        Text(
            text = "Ghi nhận đóng góp và lan toả điều tích cực",
            style = MaterialTheme.typography.bodyMedium,
            color = InkMuted,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp),
        )

        when {
            state.loading -> {
                Column(
                    modifier = Modifier.fillMaxSize().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SkeletonBlock(heightDp = 120)
                    SkeletonBlock(heightDp = 160)
                    SkeletonBlock(heightDp = 160)
                }
            }
            state.error != null && state.wall.isEmpty() -> {
                ErrorState(message = state.error, onRetry = { vm.load() })
            }
            else -> {
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
                        item { PointsHeader(state = state) }
                        item { GiveKudoCard(state = state, vm = vm) }
                        item {
                            SectionHeader("Tường vinh danh")
                        }
                        if (state.wall.isEmpty()) {
                            item {
                                EmptyState("Chưa có kudos nào. Hãy tặng kudos đầu tiên cho đồng nghiệp nhé!")
                            }
                        } else {
                            items(state.wall, key = { it.id ?: 0 }) { kudo ->
                                KudoCard(kudo = kudo)
                            }
                        }
                        item { LeaderboardCard(state = state, vm = vm) }
                        val milestones = state.milestones
                        val hasMilestones = milestones != null &&
                            (!milestones.birthdays.isNullOrEmpty() ||
                                !milestones.anniversaries.isNullOrEmpty())
                        if (hasMilestones && milestones != null) {
                            item { MilestonesCard(milestones = milestones) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PointsHeader(state: KudosUiState) {
    HrmCard(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(0.dp),
    ) {
        Column {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(BrandBlueSoft)
                    .padding(16.dp),
            ) {
                Text(
                    text = "Điểm thưởng của tôi",
                    style = MaterialTheme.typography.labelLarge,
                    color = BrandBlueDark,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        text = "${state.points?.balance ?: 0}",
                        style = MaterialTheme.typography.displaySmall,
                        fontWeight = FontWeight.Bold,
                        color = BrandBlue,
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = "điểm",
                        style = MaterialTheme.typography.titleMedium,
                        color = BrandBlueDark,
                        modifier = Modifier.padding(bottom = 6.dp),
                    )
                }
                Text(
                    text = "Đã kiếm ${state.points?.totalEarned ?: 0} · Đã dùng ${state.points?.totalSpent ?: 0}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            if (state.badges.isNotEmpty()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Huy hiệu của tôi",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(10.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(state.badges, key = { it.key ?: it.name ?: "" }) { badge ->
                            BadgeItem(badge = badge)
                        }
                    }
                }
            }
            val recent = state.points?.recent?.take(5).orEmpty()
            if (recent.isNotEmpty()) {
                Column(modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp)) {
                    Text(
                        text = "Biến động điểm gần đây",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(8.dp))
                    recent.forEach { entry ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = entry.note ?: entry.sourceType ?: "Điểm thưởng",
                                    style = MaterialTheme.typography.bodyMedium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = relativeTimeVi(entry.createdAt),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = InkMuted,
                                )
                            }
                            val delta = entry.delta ?: 0
                            Text(
                                text = if (delta >= 0) "+$delta" else "$delta",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = if (delta >= 0) SuccessGreen else DangerRed,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BadgeItem(badge: BadgeDto) {
    val earned = badge.earned == true
    Column(
        modifier = Modifier
            .width(96.dp)
            .clip(RoundedCornerShape(12.dp))
            .border(
                1.dp,
                if (earned) BrandBlue else BorderGray,
                RoundedCornerShape(12.dp),
            )
            .background(if (earned) Color.White else Color(0xFFF2F4F7))
            .padding(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = badge.emoji ?: "🏅",
            style = MaterialTheme.typography.headlineMedium,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = badge.name ?: "",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = if (earned) MaterialTheme.colorScheme.onSurface else InkMuted,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = if (earned) "Đã đạt" else (badge.progressText ?: ""),
            style = MaterialTheme.typography.labelSmall,
            color = if (earned) SuccessGreen else InkMuted,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun GiveKudoCard(state: KudosUiState, vm: KudosViewModel) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.Favorite,
                    contentDescription = null,
                    tint = DangerRed,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = "Tặng kudos",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                if (!state.showGiveForm) {
                    Button(onClick = { vm.openGiveForm() }) { Text("Tặng ngay") }
                }
            }
            AnimatedVisibility(visible = state.showGiveForm) {
                Column(modifier = Modifier.padding(top = 12.dp)) {
                    Text(
                        text = "Người nhận",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(6.dp))
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
                            text = state.selectedEmployee?.fullName ?: "Chọn đồng nghiệp…",
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
                            contentDescription = "Chọn người nhận",
                            tint = InkMuted,
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = "Loại huy hiệu",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(6.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(KudoBadges.options) { (value, label) ->
                            FilterChip(
                                selected = state.badge == value,
                                onClick = { vm.onBadgeChange(value) },
                                label = { Text(label) },
                            )
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = state.message,
                        onValueChange = { vm.onMessageChange(it) },
                        label = { Text("Lời nhắn") },
                        placeholder = { Text("Viết lời cảm ơn / ghi nhận gửi đồng nghiệp…") },
                        minLines = 3,
                        maxLines = 5,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    state.giveError?.let { err ->
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = err,
                            style = MaterialTheme.typography.bodySmall,
                            color = DangerRed,
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        OutlinedButton(
                            onClick = { vm.closeGiveForm() },
                            enabled = !state.giving,
                        ) { Text("Huỷ") }
                        Spacer(Modifier.width(8.dp))
                        Button(
                            onClick = { vm.submitKudo() },
                            enabled = !state.giving,
                        ) {
                            if (state.giving) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    color = Color.White,
                                    strokeWidth = 2.dp,
                                )
                                Spacer(Modifier.width(8.dp))
                            }
                            Text("Gửi kudos")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun KudoCard(kudo: KudoDto) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                InitialAvatar(name = kudo.toName, sizeDp = 42)
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = kudo.toName ?: "Đồng nghiệp",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(Modifier.width(8.dp))
                        StatusChip(
                            text = kudo.badgeLabel ?: KudoBadges.labelOf(kudo.badge),
                            bg = BrandBlueSoft,
                            fg = BrandBlueDark,
                        )
                    }
                    val sub = listOfNotNull(
                        kudo.toCode,
                        kudo.toDepartment,
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
            Spacer(Modifier.height(10.dp))
            Text(
                text = kudo.message ?: "",
                style = MaterialTheme.typography.bodyLarge,
            )
            Spacer(Modifier.height(10.dp))
            val fromPart = kudo.fromName?.let { "Từ $it" }
            val timePart = relativeTimeVi(kudo.createdAt).takeIf { it.isNotBlank() }
            val footer = listOfNotNull(fromPart, timePart).joinToString(" · ")
            if (footer.isNotBlank()) {
                Text(
                    text = footer,
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
        }
    }
}

@Composable
private fun LeaderboardCard(state: KudosUiState, vm: KudosViewModel) {
    HrmCard(modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(0.dp)) {
        Column {
            Column(modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp)) {
                SectionHeader("Bảng xếp hạng")
            }
            TabRow(selectedTabIndex = state.boardTab) {
                Tab(
                    selected = state.boardTab == 0,
                    onClick = { vm.setBoardTab(0) },
                    text = { Text("Kudos tháng này") },
                )
                Tab(
                    selected = state.boardTab == 1,
                    onClick = { vm.setBoardTab(1) },
                    text = { Text("Điểm thưởng") },
                )
            }
            Column(modifier = Modifier.padding(16.dp)) {
                if (state.boardTab == 0) {
                    val received = state.kudosBoard?.topReceived.orEmpty()
                    if (received.isEmpty()) {
                        EmptyState("Chưa có dữ liệu xếp hạng kudos tháng này.")
                    } else {
                        received.forEachIndexed { index, entry ->
                            RankRow(
                                rank = index + 1,
                                name = entry.name,
                                subtitle = entry.department,
                                value = "${entry.count ?: 0} kudos",
                            )
                        }
                    }
                    val givers = state.kudosBoard?.topGivers.orEmpty()
                    if (givers.isNotEmpty()) {
                        Spacer(Modifier.height(14.dp))
                        Text(
                            text = "Người tặng nhiều nhất",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(Modifier.height(6.dp))
                        givers.forEachIndexed { index, entry ->
                            RankRow(
                                rank = index + 1,
                                name = entry.name,
                                subtitle = null,
                                value = "${entry.count ?: 0} kudos",
                                highlightTop3 = false,
                            )
                        }
                    }
                } else {
                    if (state.pointsBoard.isEmpty()) {
                        EmptyState("Chưa có dữ liệu xếp hạng điểm.")
                    } else {
                        state.pointsBoard.forEachIndexed { index, item ->
                            RankRow(
                                rank = index + 1,
                                name = item.employee?.fullName,
                                subtitle = item.department ?: item.employee?.departmentName,
                                value = "${item.totalEarned ?: 0} điểm",
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RankRow(
    rank: Int,
    name: String?,
    subtitle: String?,
    value: String,
    highlightTop3: Boolean = true,
) {
    val rankBg = when {
        !highlightTop3 -> Color(0xFFF2F4F7)
        rank == 1 -> Color(0xFFFDB022)
        rank == 2 -> Color(0xFFD0D5DD)
        rank == 3 -> Color(0xFFF79009)
        else -> Color(0xFFF2F4F7)
    }
    val rankFg = if (highlightTop3 && rank <= 3) Color.White else InkMuted
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size(28.dp).clip(CircleShape).background(rankBg),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "$rank",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
                color = rankFg,
            )
        }
        Spacer(Modifier.width(10.dp))
        InitialAvatar(name = name, sizeDp = 36)
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = name ?: "—",
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = if (highlightTop3 && rank <= 3) {
                    FontWeight.SemiBold
                } else {
                    FontWeight.Normal
                },
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Text(
            text = value,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = BrandBlue,
        )
    }
}

@Composable
private fun MilestonesCard(milestones: MilestonesDto) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            SectionHeader("Cột mốc tháng này")
            Spacer(Modifier.height(10.dp))
            milestones.birthdays.orEmpty().forEach { item ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Outlined.Cake,
                        contentDescription = null,
                        tint = WarningAmber,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = item.name ?: "—",
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Medium,
                        )
                        Text(
                            text = listOfNotNull(
                                item.department,
                                item.day?.let { "ngày $it" },
                            ).joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                    item.turningAge?.let { age ->
                        StatusChip(
                            text = "Sinh nhật · $age tuổi",
                            bg = Color(0xFFFEF0C7),
                            fg = WarningAmber,
                        )
                    }
                }
            }
            milestones.anniversaries.orEmpty().forEach { item ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Outlined.Celebration,
                        contentDescription = null,
                        tint = BrandBlue,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = item.name ?: "—",
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Medium,
                        )
                        Text(
                            text = listOfNotNull(
                                item.department,
                                item.day?.let { "ngày $it" },
                            ).joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                    item.years?.let { years ->
                        StatusChip(
                            text = "$years năm gắn bó",
                            bg = BrandBlueSoft,
                            fg = BrandBlueDark,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun EmployeePickerDialog(state: KudosUiState, vm: KudosViewModel) {
    var query by remember { mutableStateOf("") }
    val filtered = remember(state.employees, query) {
        if (query.isBlank()) {
            state.employees
        } else {
            state.employees.filter { emp ->
                (emp.fullName ?: "").contains(query, ignoreCase = true) ||
                    (emp.code ?: "").contains(query, ignoreCase = true) ||
                    (emp.departmentName ?: "").contains(query, ignoreCase = true)
            }
        }
    }
    AlertDialog(
        onDismissRequest = { vm.closeEmployeePicker() },
        title = { Text("Chọn người nhận") },
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
