package com.hrmai.app.feature.payroll

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Trạng thái phiếu lương: tách riêng "chưa có phiếu" (404) khỏi lỗi thật. */
sealed interface PayslipState {
    data object Loading : PayslipState
    data class Content(val payslip: PayslipDto) : PayslipState
    data object NotFound : PayslipState
    data class Failed(val message: String) : PayslipState
}

data class PayrollUiState(
    /** Các kỳ đã chốt chọn được; rỗng khi API kỳ bị giới hạn quyền (employee). */
    val lockedPeriods: List<PayrollPeriodDto> = emptyList(),
    val selectedPeriodId: Int? = null,
    val periodsKnown: Boolean = false,
    val payslip: PayslipState = PayslipState.Loading,
    val refreshing: Boolean = false,
)

class PayrollViewModel(
    private val api: PayrollApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(PayrollUiState())
    val state: StateFlow<PayrollUiState> = _state

    init {
        loadPeriodsThenPayslip()
    }

    fun refresh() {
        if (_state.value.refreshing) return
        _state.update { it.copy(refreshing = true) }
        loadPeriodsThenPayslip { _state.update { s -> s.copy(refreshing = false) } }
    }

    fun selectPeriod(periodId: Int) {
        if (periodId == _state.value.selectedPeriodId &&
            _state.value.payslip is PayslipState.Content
        ) return
        _state.update { it.copy(selectedPeriodId = periodId) }
        loadPayslip(periodId)
    }

    /**
     * Giống bản web (MyPayslipView): thử lấy danh sách kỳ đã chốt để chọn;
     * API kỳ bị giới hạn quyền thì vẫn xem được phiếu kỳ đã chốt mới nhất.
     */
    private fun loadPeriodsThenPayslip(onDone: () -> Unit = {}) {
        viewModelScope.launch {
            val locked = runCatching { api.periods().data ?: emptyList() }
                .getOrDefault(emptyList())
                .filter { it.status == "locked" && it.id != null }
            val keepSelection = _state.value.selectedPeriodId
                ?.takeIf { id -> locked.any { it.id == id } }
            val selected = keepSelection ?: locked.firstOrNull()?.id
            _state.update {
                it.copy(
                    lockedPeriods = locked,
                    selectedPeriodId = selected,
                    periodsKnown = true,
                )
            }
            loadPayslip(selected)
            onDone()
        }
    }

    private fun loadPayslip(periodId: Int?) {
        _state.update { it.copy(payslip = PayslipState.Loading) }
        viewModelScope.launch {
            runCatching { api.myPayslip(periodId).data }
                .onSuccess { slip ->
                    _state.update {
                        it.copy(
                            payslip = if (slip == null) {
                                PayslipState.NotFound
                            } else {
                                PayslipState.Content(slip)
                            },
                        )
                    }
                }
                .onFailure { e ->
                    val apiErr = e.toApiException()
                    _state.update {
                        it.copy(
                            payslip = if (apiErr.httpStatus == 404) {
                                // Kỳ chưa chốt / chưa có phiếu lương cho kỳ này.
                                PayslipState.NotFound
                            } else {
                                PayslipState.Failed(apiErr.message)
                            },
                        )
                    }
                }
        }
    }

    class Factory(
        private val api: PayrollApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            PayrollViewModel(api, sessionStore) as T
    }
}
