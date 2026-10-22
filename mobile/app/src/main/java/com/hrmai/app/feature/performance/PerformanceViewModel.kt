package com.hrmai.app.feature.performance

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PerformanceUiState(
    val myEmployeeId: Int? = null,
    val cycles: List<PerfCycleDto> = emptyList(),
    /** Kỳ đang xem; null = kỳ mới nhất có dữ liệu. */
    val selectedCycleId: Int? = null,
    val objectives: List<ObjectiveDto> = emptyList(),
    val objectivesLoading: Boolean = true,
    val objectivesError: String? = null,
    val reviews: List<PerfReviewDto> = emptyList(),
    val reviewsLoading: Boolean = true,
    val reviewsError: String? = null,
    val refreshing: Boolean = false,
    /** Id Key Result đang gửi check-in (khoá nút của riêng KR đó). */
    val checkingInId: Int? = null,
    /** Thông điệp một lần cho Snackbar. */
    val message: String? = null,
)

class PerformanceViewModel(
    private val api: PerformanceApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(PerformanceUiState())
    val state: StateFlow<PerformanceUiState> = _state

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                val employeeId = session?.user?.employeeId
                if (employeeId != null && _state.value.myEmployeeId != employeeId) {
                    _state.update { it.copy(myEmployeeId = employeeId) }
                    loadAll()
                }
            }
        }
    }

    fun loadAll() {
        loadCycles()
        loadObjectives()
        loadReviews()
    }

    fun refresh() {
        if (_state.value.refreshing) return
        viewModelScope.launch {
            _state.update { it.copy(refreshing = true) }
            loadCycles()
            loadObjectives()
            loadReviews()
            _state.update { it.copy(refreshing = false) }
        }
    }

    private fun loadCycles() {
        viewModelScope.launch {
            runCatching { api.getCycles() }
                .onSuccess { resp ->
                    _state.update { it.copy(cycles = resp.data ?: emptyList()) }
                }
                .onFailure { /* Không có kỳ vẫn xem được mục tiêu/đánh giá. */ }
        }
    }

    fun selectCycle(cycleId: Int?) {
        if (_state.value.selectedCycleId == cycleId) return
        _state.update { it.copy(selectedCycleId = cycleId) }
        loadObjectives()
        loadReviews()
    }

    fun loadObjectives() {
        val employeeId = _state.value.myEmployeeId ?: return
        viewModelScope.launch {
            _state.update { it.copy(objectivesLoading = true, objectivesError = null) }
            runCatching {
                api.getObjectives(
                    employeeId = employeeId,
                    cycleId = _state.value.selectedCycleId,
                )
            }.onSuccess { resp ->
                _state.update {
                    it.copy(objectives = resp.data ?: emptyList(), objectivesLoading = false)
                }
            }.onFailure { e ->
                _state.update {
                    it.copy(
                        objectivesLoading = false,
                        objectivesError = e.toApiException().message,
                    )
                }
            }
        }
    }

    fun loadReviews() {
        val employeeId = _state.value.myEmployeeId ?: return
        viewModelScope.launch {
            _state.update { it.copy(reviewsLoading = true, reviewsError = null) }
            runCatching {
                api.getReviews(
                    employeeId = employeeId,
                    cycleId = _state.value.selectedCycleId,
                )
            }.onSuccess { resp ->
                _state.update {
                    it.copy(reviews = resp.data ?: emptyList(), reviewsLoading = false)
                }
            }.onFailure { e ->
                _state.update {
                    it.copy(
                        reviewsLoading = false,
                        reviewsError = e.toApiException().message,
                    )
                }
            }
        }
    }

    /** Cập nhật tiến độ 1 Key Result: POST check-in { new_value, note }. */
    fun checkIn(keyResult: KeyResultDto, newValue: Double, note: String) {
        val krId = keyResult.id ?: return
        if (_state.value.checkingInId != null) return
        _state.update { it.copy(checkingInId = krId) }
        viewModelScope.launch {
            runCatching {
                api.checkIn(
                    krId,
                    CheckinBody(
                        newValue = newValue,
                        note = note.trim().ifBlank { null },
                    ),
                )
            }.onSuccess { resp ->
                val percent = resp.keyResult?.progressPercent
                _state.update {
                    it.copy(
                        checkingInId = null,
                        message = if (percent != null) {
                            "Đã cập nhật tiến độ: đạt ${formatPercent(percent)}."
                        } else {
                            "Đã cập nhật tiến độ thành công."
                        },
                    )
                }
                loadObjectives()
            }.onFailure { e ->
                _state.update {
                    it.copy(checkingInId = null, message = e.toApiException().message)
                }
            }
        }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    class Factory(
        private val api: PerformanceApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            PerformanceViewModel(api, sessionStore) as T
    }
}

/** 75.0 -> "75%", 75.5 -> "75,5%" (kiểu thập phân tiếng Việt). */
internal fun formatPercent(value: Double): String {
    val rounded = if (value % 1.0 == 0.0) {
        value.toInt().toString()
    } else {
        String.format("%.1f", value).replace('.', ',')
    }
    return "$rounded%"
}

/** 120.0 -> "120", 2.5 -> "2,5" — số đo của Key Result. */
internal fun formatNumber(value: Double?): String {
    if (value == null) return "0"
    return if (value % 1.0 == 0.0) {
        value.toLong().toString()
    } else {
        value.toString().replace('.', ',')
    }
}
