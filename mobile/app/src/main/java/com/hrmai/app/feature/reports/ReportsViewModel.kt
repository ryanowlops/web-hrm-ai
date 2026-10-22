package com.hrmai.app.feature.reports

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

data class ReportsUiState(
    val role: String? = null,
    /** Chỉ admin/hr/manager xem được báo cáo (server cũng chặn 403). */
    val canView: Boolean = false,
    val month: Int = Format.today().monthValue,
    val year: Int = Format.today().year,
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val summary: ReportsSummaryDto? = null,
    val toast: String? = null,
)

class ReportsViewModel(
    private val api: ReportsApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(ReportsUiState())
    val state: StateFlow<ReportsUiState> = _state

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                val role = session?.user?.role
                if (_state.value.role != role) {
                    val canView = role in REPORT_ROLES
                    _state.update { it.copy(role = role, canView = canView) }
                    if (canView) load()
                    else _state.update { it.copy(loading = false) }
                }
            }
        }
    }

    fun load() {
        val s = _state.value
        if (!s.canView) return
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch { fetch() }
    }

    fun refresh() {
        if (_state.value.refreshing || !_state.value.canView) return
        _state.update { it.copy(refreshing = true) }
        viewModelScope.launch { fetch() }
    }

    private suspend fun fetch() {
        val s = _state.value
        runCatching { api.getSummary(month = s.month, year = s.year) }
            .onSuccess { summary ->
                _state.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        error = null,
                        summary = summary,
                    )
                }
            }
            .onFailure { e ->
                _state.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        error = e.toApiException().message,
                    )
                }
            }
    }

    /** Chuyển tháng xem báo cáo (không cho vượt quá tháng hiện tại). */
    fun changeMonth(delta: Int) {
        val s = _state.value
        val target = YearMonth.of(s.year, s.month).plusMonths(delta.toLong())
        if (target.isAfter(YearMonth.from(Format.today()))) return
        _state.update { it.copy(month = target.monthValue, year = target.year) }
        load()
    }

    fun consumeToast() = _state.update { it.copy(toast = null) }

    class Factory(
        private val api: ReportsApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            ReportsViewModel(api, sessionStore) as T
    }

    companion object {
        private val REPORT_ROLES = setOf("admin", "hr", "manager")
    }
}
