package com.hrmai.app.feature.attendance

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import com.hrmai.app.core.util.Format
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.YearMonth

data class AttendanceUiState(
    val today: AttendanceTodayDto? = null,
    val todayLoading: Boolean = true,
    val todayError: String? = null,
    /** Đang gọi check-in/check-out (khoá nút chấm công). */
    val acting: Boolean = false,
    /** Vừa chấm công thành công — UI chạy animation dấu tích + haptic. */
    val showSuccess: Boolean = false,
    val month: YearMonth = YearMonth.from(Format.today()),
    val records: List<AttendanceRecordDto> = emptyList(),
    val summary: AttendanceSummaryDto? = null,
    val monthLoading: Boolean = true,
    val monthError: String? = null,
    val refreshing: Boolean = false,
    /** Thông điệp một lần cho Snackbar (lỗi thao tác…). */
    val message: String? = null,
)

class AttendanceViewModel(
    private val api: AttendanceApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(AttendanceUiState())
    val state: StateFlow<AttendanceUiState> = _state

    init {
        viewModelScope.launch {
            fetchToday()
            fetchMonth()
        }
    }

    private suspend fun fetchToday() {
        runCatching { api.getToday() }
            .onSuccess { dto ->
                _state.update { it.copy(today = dto, todayLoading = false, todayError = null) }
            }
            .onFailure { e ->
                _state.update {
                    it.copy(todayLoading = false, todayError = e.toApiException().message)
                }
            }
    }

    private suspend fun fetchMonth() {
        val month = _state.value.month
        runCatching { api.getMonthly(month = month.toString(), mine = 1) }
            .onSuccess { dto ->
                val sorted = (dto.data ?: emptyList())
                    .sortedByDescending { it.workDate ?: "" }
                _state.update {
                    it.copy(
                        records = sorted,
                        summary = dto.summary,
                        monthLoading = false,
                        monthError = null,
                    )
                }
            }
            .onFailure { e ->
                _state.update {
                    it.copy(monthLoading = false, monthError = e.toApiException().message)
                }
            }
    }

    fun retryToday() {
        _state.update { it.copy(todayLoading = true, todayError = null) }
        viewModelScope.launch { fetchToday() }
    }

    fun retryMonth() {
        _state.update { it.copy(monthLoading = true, monthError = null) }
        viewModelScope.launch { fetchMonth() }
    }

    fun refresh() {
        if (_state.value.refreshing) return
        viewModelScope.launch {
            _state.update { it.copy(refreshing = true) }
            fetchToday()
            fetchMonth()
            _state.update { it.copy(refreshing = false) }
        }
    }

    fun shiftMonth(delta: Long) {
        val target = _state.value.month.plusMonths(delta)
        if (target > YearMonth.from(Format.today())) return
        _state.update { it.copy(month = target, monthLoading = true, monthError = null) }
        viewModelScope.launch { fetchMonth() }
    }

    /** Nút chấm công chính: chưa vào -> check-in, đã vào chưa ra -> check-out. */
    fun onMainAction() {
        val s = _state.value
        val today = s.today ?: return
        if (s.acting) return
        val hasIn = today.hasCheckedIn == true
        val hasOut = today.hasCheckedOut == true
        if (hasOut) return
        if (today.data?.status == "on_leave") return
        _state.update { it.copy(acting = true) }
        viewModelScope.launch {
            runCatching {
                if (hasIn) api.checkOut() else api.checkIn()
            }.onSuccess {
                _state.update { it.copy(acting = false, showSuccess = true) }
                fetchToday()
                fetchMonth()
            }.onFailure { e ->
                _state.update {
                    it.copy(acting = false, message = e.toApiException().message)
                }
            }
        }
    }

    fun consumeSuccess() = _state.update { it.copy(showSuccess = false) }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    class Factory(
        private val api: AttendanceApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            AttendanceViewModel(api, sessionStore) as T
    }
}
