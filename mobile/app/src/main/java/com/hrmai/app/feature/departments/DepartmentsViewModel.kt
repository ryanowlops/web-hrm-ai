package com.hrmai.app.feature.departments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class DepartmentsUiState(
    val departments: List<DepartmentDto> = emptyList(),
    val totalEmployees: Int = 0,
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val forbidden: Boolean = false,
)

class DepartmentsViewModel(
    private val api: DepartmentsApi,
) : ViewModel() {

    private val _state = MutableStateFlow(DepartmentsUiState())
    val state: StateFlow<DepartmentsUiState> = _state

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null, forbidden = false) }
            fetch()
        }
    }

    fun refresh() {
        if (_state.value.refreshing) return
        viewModelScope.launch {
            _state.update { it.copy(refreshing = true) }
            fetch()
            _state.update { it.copy(refreshing = false) }
        }
    }

    private suspend fun fetch() {
        runCatching {
            val all = mutableListOf<DepartmentDto>()
            var page = 1
            var totalPages = 1
            do {
                val resp = api.getDepartments(page = page, limit = PAGE_LIMIT)
                all += resp.data ?: emptyList()
                totalPages = resp.meta?.totalPages ?: 1
                page++
            } while (page <= totalPages)
            all
        }.onSuccess { items ->
            _state.update {
                it.copy(
                    departments = items,
                    totalEmployees = items.sumOf { dept -> dept.employeeCount ?: 0 },
                    loading = false,
                    error = null,
                    forbidden = false,
                )
            }
        }.onFailure { e ->
            val apiError = e.toApiException()
            _state.update {
                it.copy(
                    loading = false,
                    error = apiError.message,
                    forbidden = apiError.httpStatus == 403,
                )
            }
        }
    }

    class Factory(
        private val api: DepartmentsApi,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            DepartmentsViewModel(api) as T
    }

    companion object {
        private const val PAGE_LIMIT = 100
    }
}
