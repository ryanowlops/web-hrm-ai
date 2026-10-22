package com.hrmai.app.feature.rewards

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.network.toApiException
import com.hrmai.app.feature.kudos.MyPointsDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RewardsUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val points: MyPointsDto? = null,
    val rewards: List<RewardDto> = emptyList(),
    val redemptions: List<RedemptionDto> = emptyList(),
    /** Quà đang chờ người dùng xác nhận đổi (mở hộp thoại). */
    val confirmReward: RewardDto? = null,
    /** Id quà đang gửi yêu cầu đổi (khoá nút trong lúc chờ server). */
    val redeemingId: Int? = null,
    /** Thông điệp một lần cho Snackbar (kể cả lỗi từ server như thiếu điểm). */
    val toast: String? = null,
)

class RewardsViewModel(
    private val api: RewardsApi,
) : ViewModel() {

    private val _state = MutableStateFlow(RewardsUiState())
    val state: StateFlow<RewardsUiState> = _state

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val rewardsResult = runCatching { api.getRewards() }
            // Điểm và lịch sử đổi là dữ liệu phụ: lỗi riêng lẻ (vd. tài khoản
            // chưa gắn hồ sơ nhân viên) chỉ ẩn mục đó, không chặn cả trang.
            val points = runCatching { api.getMyPoints().data }.getOrNull()
            val history = runCatching { api.getMyRedemptions().data }.getOrNull()
            rewardsResult
                .onSuccess { resp ->
                    _state.update {
                        it.copy(
                            loading = false,
                            rewards = resp.data ?: emptyList(),
                            points = points ?: it.points,
                            redemptions = history ?: it.redemptions,
                            error = null,
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            loading = false,
                            points = points ?: it.points,
                            redemptions = history ?: it.redemptions,
                            error = e.toApiException().message,
                        )
                    }
                }
        }
    }

    fun refresh() {
        if (_state.value.refreshing) return
        _state.update { it.copy(refreshing = true) }
        viewModelScope.launch {
            val rewards = runCatching { api.getRewards().data }.getOrNull()
            val points = runCatching { api.getMyPoints().data }.getOrNull()
            val history = runCatching { api.getMyRedemptions().data }.getOrNull()
            _state.update { st ->
                st.copy(
                    refreshing = false,
                    rewards = rewards ?: st.rewards,
                    points = points ?: st.points,
                    redemptions = history ?: st.redemptions,
                )
            }
        }
    }

    fun askRedeem(reward: RewardDto) {
        _state.update { it.copy(confirmReward = reward) }
    }

    fun cancelRedeem() {
        _state.update { it.copy(confirmReward = null) }
    }

    /**
     * Gửi yêu cầu đổi quà. Server tạo yêu cầu ở trạng thái chờ duyệt và
     * CHƯA trừ điểm (điểm chỉ trừ khi HR/Admin duyệt), nên số dư hiển thị
     * không đổi ngay. Lỗi 400/409 (thiếu điểm, hết hàng...) hiển thị
     * nguyên thông điệp thân thiện của server qua toApiException().
     */
    fun confirmRedeem() {
        val reward = _state.value.confirmReward ?: return
        val rewardId = reward.id ?: return
        if (_state.value.redeemingId != null) return
        _state.update { it.copy(redeemingId = rewardId, confirmReward = null) }
        viewModelScope.launch {
            runCatching {
                api.createRedemption(CreateRedemptionRequest(rewardId = rewardId))
            }.onSuccess { resp ->
                val created = resp.data
                _state.update { st ->
                    st.copy(
                        redeemingId = null,
                        redemptions = if (created != null) {
                            listOf(created) + st.redemptions
                        } else {
                            st.redemptions
                        },
                        toast = "Đã gửi yêu cầu đổi “${reward.name ?: "quà"}”. " +
                            "Điểm sẽ được trừ khi HR duyệt nhé.",
                    )
                }
                // Đồng bộ lại lịch sử + trạng thái affordable của catalog.
                refresh()
            }.onFailure { e ->
                _state.update {
                    it.copy(redeemingId = null, toast = e.toApiException().message)
                }
            }
        }
    }

    fun consumeToast() = _state.update { it.copy(toast = null) }

    class Factory(
        private val api: RewardsApi,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            RewardsViewModel(api) as T
    }
}
