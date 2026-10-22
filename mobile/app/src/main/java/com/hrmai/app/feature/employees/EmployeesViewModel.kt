package com.hrmai.app.feature.employees

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class EmployeesUiState(
    val query: String = "",
    val employees: List<EmployeeDto> = emptyList(),
    val totalItems: Int = 0,
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    /** true khi server trả 403 — hiện thông điệp thân thiện thay vì lỗi. */
    val forbidden: Boolean = false,
)

class EmployeesViewModel(
    private val api: EmployeesApi,
) : ViewModel() {

    private val _state = MutableStateFlow(EmployeesUiState())
    val state: StateFlow<EmployeesUiState> = _state

    private var searchJob: Job? = null

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

    /** Gõ tới đâu tìm tới đó (trễ 350ms để đỡ spam API). */
    fun onQueryChange(text: String) {
        _state.update { it.copy(query = text) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(350)
            _state.update { it.copy(loading = true, error = null, forbidden = false) }
            fetch()
        }
    }

    private suspend fun fetch() {
        val search = _state.value.query.trim().ifBlank { null }
        runCatching {
            // Tải tối đa 100 người/trang và nối tiếp các trang còn lại để
            // danh sách luôn đầy đủ (server kẹp limit <= 100).
            val all = mutableListOf<EmployeeDto>()
            var page = 1
            var totalPages = 1
            var total = 0
            do {
                val resp = api.getEmployees(
                    search = search,
                    departmentId = null,
                    status = null,
                    page = page,
                    limit = PAGE_LIMIT,
                )
                all += resp.data ?: emptyList()
                total = resp.meta?.totalItems ?: all.size
                totalPages = resp.meta?.totalPages ?: 1
                page++
            } while (page <= totalPages)
            all to total
        }.onSuccess { (items, total) ->
            _state.update {
                it.copy(
                    employees = items,
                    totalItems = total,
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
        private val api: EmployeesApi,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            EmployeesViewModel(api) as T
    }

    companion object {
        private const val PAGE_LIMIT = 100
    }
}

data class EmployeeDetailUiState(
    val employee: EmployeeDto? = null,
    val loading: Boolean = true,
    val error: String? = null,
    val forbidden: Boolean = false,
)

class EmployeeDetailViewModel(
    private val api: EmployeesApi,
    private val employeeId: Int,
) : ViewModel() {

    private val _state = MutableStateFlow(EmployeeDetailUiState())
    val state: StateFlow<EmployeeDetailUiState> = _state

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null, forbidden = false) }
            runCatching { api.getEmployee(employeeId) }
                .onSuccess { resp ->
                    _state.update {
                        it.copy(employee = resp.data, loading = false, error = null)
                    }
                }
                .onFailure { e ->
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
    }

    class Factory(
        private val api: EmployeesApi,
        private val employeeId: Int,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            EmployeeDetailViewModel(api, employeeId) as T
    }
}
