package com.hrmai.app.feature.rewards

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
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
fun RewardsRoute(container: AppContainer) {
    val vm: RewardsViewModel = viewModel(
        factory = RewardsViewModel.Factory(
            container.api(RewardsApi::class.java),
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
        RewardsScreen(state = state, vm = vm)
        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
        )
    }

    state.confirmReward?.let { reward ->
        RedeemConfirmDialog(reward = reward, vm = vm)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RewardsScreen(state: RewardsUiState, vm: RewardsViewModel) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "Đổi thưởng",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp),
        )
        Text(
            text = "Dùng điểm thưởng tích luỹ để đổi quà của công ty",
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
                    SkeletonBlock(heightDp = 110)
                    SkeletonBlock(heightDp = 96)
                    SkeletonBlock(heightDp = 96)
                }
            }
            state.error != null && state.rewards.isEmpty() -> {
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
                        item { PointsBalanceCard(state = state) }
                        item { SectionHeader("Cửa hàng quà") }
                        if (state.rewards.isEmpty()) {
                            item {
                                EmptyState("Chưa có quà nào đang mở đổi. Quay lại sau nhé!")
                            }
                        } else {
                            items(state.rewards, key = { it.id ?: 0 }) { reward ->
                                RewardCard(
                                    reward = reward,
                                    redeeming = state.redeemingId == reward.id,
                                    anyRedeeming = state.redeemingId != null,
                                    onRedeem = { vm.askRedeem(reward) },
                                )
                            }
                        }
                        item {
                            Spacer(Modifier.height(4.dp))
                            SectionHeader("Lịch sử đổi quà của tôi")
                        }
                        if (state.redemptions.isEmpty()) {
                            item {
                                EmptyState("Bạn chưa đổi quà lần nào.")
                            }
                        } else {
                            items(state.redemptions, key = { it.id ?: 0 }) { item ->
                                RedemptionRow(item = item)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PointsBalanceCard(state: RewardsUiState) {
    HrmCard(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(0.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(BrandBlueSoft)
                .padding(16.dp),
        ) {
            Text(
                text = "Số điểm hiện có",
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
            Spacer(Modifier.height(6.dp))
            Text(
                text = "Điểm chỉ bị trừ khi HR duyệt yêu cầu đổi quà của bạn.",
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
        }
    }
}

@Composable
private fun RewardCard(
    reward: RewardDto,
    redeeming: Boolean,
    anyRedeeming: Boolean,
    onRedeem: () -> Unit,
) {
    val outOfStock = reward.inStock == false
    val affordable = reward.affordable != false
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = reward.imageEmoji ?: "🎁",
                style = MaterialTheme.typography.displaySmall,
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = reward.name ?: "Quà tặng",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (!reward.description.isNullOrBlank()) {
                    Text(
                        text = reward.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    StatusChip(
                        text = "${reward.pointsCost ?: 0} điểm",
                        bg = BrandBlueSoft,
                        fg = BrandBlueDark,
                    )
                    Spacer(Modifier.width(8.dp))
                    when {
                        outOfStock -> StatusChip(
                            text = "Hết hàng",
                            bg = Color(0xFFFEE4E2),
                            fg = DangerRed,
                        )
                        reward.stock != null -> Text(
                            text = "Còn ${reward.stock} phần",
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                }
                if (!outOfStock && !affordable) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Chưa đủ điểm để đổi quà này",
                        style = MaterialTheme.typography.bodySmall,
                        color = WarningAmber,
                    )
                }
            }
            Spacer(Modifier.width(12.dp))
            Button(
                onClick = onRedeem,
                enabled = !outOfStock && affordable && !anyRedeeming,
            ) {
                if (redeeming) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        color = Color.White,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text("Đổi")
                }
            }
        }
    }
}

@Composable
private fun RedemptionRow(item: RedemptionDto) {
    val (chipBg, chipFg) = when (item.status) {
        RedemptionStatus.APPROVED -> Color(0xFFD1FADF) to SuccessGreen
        RedemptionStatus.REJECTED -> Color(0xFFFEE4E2) to DangerRed
        else -> Color(0xFFFEF0C7) to WarningAmber
    }
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = item.reward?.imageEmoji ?: "🎁",
                style = MaterialTheme.typography.headlineMedium,
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.reward?.name ?: "Quà tặng",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "Gửi lúc ${Format.dateTime(item.createdAt)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                if (!item.note.isNullOrBlank()) {
                    Text(
                        text = "Ghi chú: ${item.note}",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = "-${item.pointsCost ?: 0} điểm",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = BrandBlue,
                )
                Spacer(Modifier.height(4.dp))
                StatusChip(
                    text = RedemptionStatus.labelOf(item.status),
                    bg = chipBg,
                    fg = chipFg,
                )
            }
        }
    }
}

@Composable
private fun RedeemConfirmDialog(reward: RewardDto, vm: RewardsViewModel) {
    AlertDialog(
        onDismissRequest = { vm.cancelRedeem() },
        title = { Text("Xác nhận đổi quà") },
        text = {
            Text(
                "Bạn muốn đổi “${reward.name ?: "quà"}” với giá " +
                    "${reward.pointsCost ?: 0} điểm?\n\n" +
                    "Yêu cầu sẽ ở trạng thái chờ HR duyệt. Điểm chỉ bị trừ " +
                    "sau khi được duyệt, nên bạn cứ yên tâm gửi nhé.",
            )
        },
        confirmButton = {
            Button(onClick = { vm.confirmRedeem() }) { Text("Gửi yêu cầu") }
        },
        dismissButton = {
            OutlinedButton(onClick = { vm.cancelRedeem() }) { Text("Huỷ") }
        },
    )
}
