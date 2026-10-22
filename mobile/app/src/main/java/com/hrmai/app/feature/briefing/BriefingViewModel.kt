package com.hrmai.app.feature.briefing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class BriefingUiState(
    val role: String? = null,
    /** Đã biết role từ session hay chưa (tránh nháy màn "không có quyền"). */
    val roleKnown: Boolean = false,
    /** Chỉ admin/hr mới xem được báo cáo điều hành. */
    val canView: Boolean = false,
    /** Kỳ đang chọn: "week" | "month". */
    val period: String = "month",
    /** Báo cáo đang xem: mới nhất của kỳ, vừa tạo, hoặc chọn từ lịch sử. */
    val current: BriefingDto? = null,
    val loading: Boolean = true,
    /** Lỗi tải báo cáo mới nhất (404 = kỳ chưa có báo cáo, KHÔNG phải lỗi). */
    val error: String? = null,
    /** Đang tạo báo cáo mới — tách riêng vì có thể mất tới một phút. */
    val generating: Boolean = false,
    val history: List<BriefingDto> = emptyList(),
    val historyLoading: Boolean = false,
    /** Thông điệp một lần cho Snackbar. */
    val message: String? = null,
)

class BriefingViewModel(
    private val api: BriefingApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(BriefingUiState())
    val state: StateFlow<BriefingUiState> = _state

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                val role = session?.user?.role ?: return@collect
                if (_state.value.roleKnown) return@collect
                val canView = role in BRIEFING_ROLES
                _state.update {
                    it.copy(role = role, roleKnown = true, canView = canView, loading = canView)
                }
                if (canView) loadPeriod(_state.value.period)
            }
        }
    }

    // ------------------------------------------------------------------
    // Tải dữ liệu theo kỳ
    // ------------------------------------------------------------------
    fun selectPeriod(period: String) {
        if (period == _state.value.period || !_state.value.canView) return
        _state.update {
            it.copy(period = period, current = null, error = null, history = emptyList())
        }
        loadPeriod(period)
    }

    fun retry() {
        if (!_state.value.canView) return
        loadPeriod(_state.value.period)
    }

    private fun loadPeriod(period: String) {
        loadLatest(period)
        loadHistory(period)
    }

    private fun loadLatest(period: String) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            runCatching { api.getLatest(period) }
                .onSuccess { resp ->
                    if (_state.value.period != period) return@onSuccess
                    _state.update { it.copy(current = resp.data, loading = false) }
                }
                .onFailure { e ->
                    if (_state.value.period != period) return@onFailure
                    val ex = e.toApiException()
                    if (ex.httpStatus == 404) {
                        // Kỳ chưa có báo cáo nào — trạng thái rỗng, không phải lỗi.
                        _state.update { it.copy(current = null, loading = false, error = null) }
                    } else {
                        _state.update { it.copy(loading = false, error = ex.message) }
                    }
                }
        }
    }

    private fun loadHistory(period: String) {
        viewModelScope.launch {
            _state.update { it.copy(historyLoading = true) }
            runCatching { api.getHistory(period = period, limit = HISTORY_LIMIT) }
                .onSuccess { resp ->
                    if (_state.value.period != period) return@onSuccess
                    _state.update {
                        it.copy(history = resp.data ?: emptyList(), historyLoading = false)
                    }
                }
                .onFailure {
                    if (_state.value.period != period) return@onFailure
                    // Lịch sử lỗi thì lặng lẽ để trống — phần chính vẫn dùng được.
                    _state.update { it.copy(historyLoading = false) }
                }
        }
    }

    // ------------------------------------------------------------------
    // Tạo báo cáo + chọn lại từ lịch sử
    // ------------------------------------------------------------------
    fun generate() {
        val s = _state.value
        if (s.generating || !s.canView) return
        val period = s.period
        _state.update { it.copy(generating = true) }
        viewModelScope.launch {
            runCatching { api.generate(GenerateBriefingBody(period = period)) }
                .onSuccess { resp ->
                    _state.update {
                        it.copy(
                            generating = false,
                            current = resp.data ?: it.current,
                            loading = false,
                            error = null,
                            message = "Đã tạo báo cáo mới.",
                        )
                    }
                    loadHistory(period)
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(generating = false, message = e.toApiException().message)
                    }
                }
        }
    }

    /** Xem lại một báo cáo cũ trong lịch sử (dữ liệu đã có sẵn ở client). */
    fun selectBriefing(item: BriefingDto) {
        _state.update { it.copy(current = item, error = null) }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    class Factory(
        private val api: BriefingApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            BriefingViewModel(api, sessionStore) as T
    }

    companion object {
        private val BRIEFING_ROLES = setOf("admin", "hr")
        private const val HISTORY_LIMIT = 20
    }
}
