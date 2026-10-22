package com.hrmai.app.feature.payrolladmin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Hành động HR đang chạy trên một kỳ (khoá nút + hiện vòng xoay đúng chỗ). */
enum class PeriodAction { CALCULATE, LOCK }

data class PayrollAdminUiState(
    val periods: List<AdminPeriodDto> = emptyList(),
    val periodsLoading: Boolean = true,
    val periodsError: String? = null,
    /** 403 ở danh sách kỳ: toàn bộ tính năng dành cho HR/quản lý. */
    val forbidden: Boolean = false,
    val selectedPeriodId: Int? = null,
    val items: List<AdminPayrollItemDto> = emptyList(),
    val itemsLoading: Boolean = false,
    val itemsError: String? = null,
    val refreshing: Boolean = false,
    /** Hành động đang chạy + kỳ của nó (null = không có). */
    val acting: PeriodAction? = null,
    val actingPeriodId: Int? = null,
    /** Kết quả tính lương để hiện hộp thoại tổng kết (null = đóng). */
    val calcResult: CalculateSummaryDto? = null,
    /** Thông điệp một lần cho Snackbar. */
    val message: String? = null,
)

class PayrollAdminViewModel(
    private val api: PayrollAdminApi,
    @Suppress("unused") private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(PayrollAdminUiState())
    val state: StateFlow<PayrollAdminUiState> = _state

    private val selectedPeriod: AdminPeriodDto?
        get() = _state.value.periods.firstOrNull { it.id == _state.value.selectedPeriodId }

    init {
        loadPeriods()
    }

    fun loadPeriods() {
        viewModelScope.launch {
            _state.update { it.copy(periodsLoading = true, periodsError = null, forbidden = false) }
            fetchPeriods()
        }
    }

    fun refresh() {
        if (_state.value.refreshing) return
        viewModelScope.launch {
            _state.update { it.copy(refreshing = true) }
            fetchPeriods()
            _state.update { it.copy(refreshing = false) }
        }
    }

    private suspend fun fetchPeriods() {
        runCatching { api.periods() }
            .onSuccess { resp ->
                val periods = resp.data ?: emptyList()
                val keep = _state.value.selectedPeriodId
                    ?.takeIf { id -> periods.any { it.id == id } }
                val selected = keep ?: periods.firstOrNull()?.id
                _state.update {
                    it.copy(
                        periods = periods,
                        periodsLoading = false,
                        periodsError = null,
                        forbidden = false,
                        selectedPeriodId = selected,
                    )
                }
                if (selected != null) fetchItems(selected) else {
                    _state.update { it.copy(items = emptyList(), itemsLoading = false) }
                }
            }
            .onFailure { e ->
                val apiErr = e.toApiException()
                _state.update {
                    it.copy(
                        periodsLoading = false,
                        forbidden = apiErr.httpStatus == 403,
                        periodsError = if (apiErr.httpStatus == 403) null else apiErr.message,
                    )
                }
            }
    }

    fun selectPeriod(periodId: Int) {
        if (periodId == _state.value.selectedPeriodId && _state.value.items.isNotEmpty()) return
        _state.update { it.copy(selectedPeriodId = periodId, itemsError = null) }
        viewModelScope.launch { fetchItems(periodId) }
    }

    private suspend fun fetchItems(periodId: Int) {
        _state.update { it.copy(itemsLoading = true, itemsError = null) }
        runCatching { api.periodItems(periodId) }
            .onSuccess { resp ->
                // Chỉ nhận kết quả nếu người dùng vẫn đang xem đúng kỳ đó.
                if (_state.value.selectedPeriodId == periodId) {
                    _state.update {
                        it.copy(items = resp.data ?: emptyList(), itemsLoading = false)
                    }
                }
            }
            .onFailure { e ->
                if (_state.value.selectedPeriodId == periodId) {
                    _state.update {
                        it.copy(itemsLoading = false, itemsError = e.toApiException().message)
                    }
                }
            }
    }

    fun reloadItems() {
        val id = _state.value.selectedPeriodId ?: return
        viewModelScope.launch { fetchItems(id) }
    }

    /** Tính (lại) lương cho kỳ — đã qua hộp thoại xác nhận ở tầng UI. */
    fun calculate(period: AdminPeriodDto) {
        val id = period.id ?: return
        if (_state.value.acting != null) return
        _state.update { it.copy(acting = PeriodAction.CALCULATE, actingPeriodId = id) }
        viewModelScope.launch {
            runCatching { api.calculate(id).data }
                .onSuccess { summary ->
                    _state.update {
                        it.copy(acting = null, actingPeriodId = null, calcResult = summary)
                    }
                    fetchPeriods()
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            acting = null,
                            actingPeriodId = null,
                            message = e.toApiException().message,
                        )
                    }
                }
        }
    }

    /** Chốt kỳ lương — đã qua hộp thoại xác nhận ở tầng UI. */
    fun lock(period: AdminPeriodDto) {
        val id = period.id ?: return
        if (_state.value.acting != null) return
        _state.update { it.copy(acting = PeriodAction.LOCK, actingPeriodId = id) }
        viewModelScope.launch {
            runCatching { api.lock(id).data }
                .onSuccess {
                    _state.update {
                        it.copy(
                            acting = null,
                            actingPeriodId = null,
                            message = "Đã chốt kỳ lương tháng ${period.month}/${period.year}. " +
                                "Nhân viên đã xem được phiếu lương của mình.",
                        )
                    }
                    fetchPeriods()
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            acting = null,
                            actingPeriodId = null,
                            message = e.toApiException().message,
                        )
                    }
                }
        }
    }

    fun dismissCalcResult() = _state.update { it.copy(calcResult = null) }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    class Factory(
        private val api: PayrollAdminApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            PayrollAdminViewModel(api, sessionStore) as T
    }
}
